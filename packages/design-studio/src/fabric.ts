/**
 * Load Fabric only in the interactive editor. The document schema, HTML
 * renderer, and PDF pipeline stay server-safe and do not eagerly import a
 * browser canvas runtime.
 *
 * Extracted unchanged in behavior from BeaconHS design-studio.
 */
export async function loadFabric(): Promise<typeof import('fabric')> {
  return import('fabric')
}
