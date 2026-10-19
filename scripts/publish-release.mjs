import { orderManifestsForPublication } from './publish-order.mjs'

/** Publish the complete release before waiting for npm's read replicas. */
export async function publishRelease(manifests, options) {
  const {
    isPublished,
    publish,
    loadManifest,
    log = () => {},
    sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms)),
    now = Date.now,
    publishSpacingMs = 3_500,
  } = options
  const published = []
  let lastPublishAt

  for (const manifest of orderManifestsForPublication(manifests)) {
    const request = `${manifest.name}@${manifest.version}`
    if (await isPublished(manifest.name, manifest.version)) {
      log(`Skipping published ${request}.`)
      continue
    }
    if (lastPublishAt !== undefined) {
      const remainingSpacing = publishSpacingMs - (now() - lastPublishAt)
      if (remainingSpacing > 0) await sleep(remainingSpacing)
    }
    log(`Publishing ${request}.`)
    await publish(manifest.directory, manifest.name, manifest.version)
    lastPublishAt = now()
    published.push(manifest)
  }

  // Earlier writes can propagate while later packages publish. Bound npm child
  // processes, and settle every verification before returning or throwing so a
  // failed read cannot leave background checks running after the release exits.
  let next = 0
  const failures = []
  await Promise.all(Array.from({ length: Math.min(4, published.length) }, async () => {
    while (next < published.length) {
      const manifest = published[next++]
      const request = `${manifest.name}@${manifest.version}`
      log(`Waiting for ${request} to appear on the registry.`)
      try {
        const visible = await loadManifest(manifest.name, manifest.version)
        if (visible?.name !== manifest.name || visible?.version !== manifest.version) {
          throw new Error(`Registry returned an unexpected manifest for ${request}.`)
        }
        log(`${request} is visible on the registry.`)
      } catch (error) {
        failures.push(new Error(`Unable to verify ${request}.`, { cause: error }))
      }
    }
  }))
  if (failures.length > 0) {
    throw new AggregateError(failures, 'Published package verification failed.')
  }
  return published
}
