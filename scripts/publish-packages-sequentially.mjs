import { readdir, readFile } from 'node:fs/promises'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { spawn } from 'node:child_process'
import { orderManifestsForPublication } from './publish-order.mjs'

const root = join(dirname(fileURLToPath(import.meta.url)), '..')
const packagesRoot = join(root, 'packages')
const publishSpacingMs = 3_500
const rateLimitBackoffMs = 65_000

const sleep = (milliseconds) => new Promise((resolve) => setTimeout(resolve, milliseconds))

function run(command, args, options = {}) {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, {
      cwd: options.cwd ?? root,
      env: process.env,
      stdio: ['ignore', 'pipe', 'pipe'],
    })
    let stdout = ''
    let stderr = ''
    child.stdout.on('data', (chunk) => {
      stdout += chunk
    })
    child.stderr.on('data', (chunk) => {
      stderr += chunk
    })
    child.on('error', reject)
    child.on('close', (code) => resolve({ code: code ?? 1, stdout, stderr }))
  })
}

async function isPublished(name, version) {
  const result = await run('npm', ['view', `${name}@${version}`, 'version', '--json'])
  if (result.code === 0) return true
  const output = `${result.stdout}\n${result.stderr}`
  if (output.includes('E404')) return false
  throw new Error(`Unable to inspect ${name}@${version}:\n${output.trim()}`)
}

async function publish(directory, name, version) {
  for (let attempt = 1; attempt <= 5; attempt += 1) {
    const result = await run(
      'pnpm',
      ['publish', '--access', 'public', '--tag', 'latest', '--no-git-checks', '--json'],
      { cwd: directory },
    )
    const output = `${result.stdout}\n${result.stderr}`.trim()
    if (result.code === 0) {
      process.stdout.write(`${output}\n`)
      return
    }
    if (output.includes('cannot publish over the previously published version')) {
      process.stdout.write(`${name}@${version} is already published.\n`)
      return
    }
    if (output.includes('E429') && attempt < 5) {
      process.stderr.write(`${name}@${version} was rate limited; retrying in 65 seconds.\n`)
      await sleep(rateLimitBackoffMs)
      continue
    }
    throw new Error(`Failed to publish ${name}@${version}:\n${output}`)
  }
}

const manifests = []
for (const entry of await readdir(packagesRoot, { withFileTypes: true })) {
  if (!entry.isDirectory()) continue
  const directory = join(packagesRoot, entry.name)
  const manifest = JSON.parse(await readFile(join(directory, 'package.json'), 'utf8'))
  if (manifest.private || manifest.publishConfig?.access !== 'public') continue
  manifests.push({ directory, name: manifest.name, version: manifest.version })
}

const orderedManifests = orderManifestsForPublication(manifests)

let lastPublishAt = 0
for (const manifest of orderedManifests) {
  if (await isPublished(manifest.name, manifest.version)) {
    process.stdout.write(`Skipping published ${manifest.name}@${manifest.version}.\n`)
    continue
  }
  const remainingSpacing = publishSpacingMs - (Date.now() - lastPublishAt)
  if (remainingSpacing > 0) await sleep(remainingSpacing)
  process.stdout.write(`Publishing ${manifest.name}@${manifest.version}.\n`)
  await publish(manifest.directory, manifest.name, manifest.version)
  lastPublishAt = Date.now()
}
