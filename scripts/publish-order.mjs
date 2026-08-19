/**
 * Packages needed by the active application cutover. npm limits how many new
 * package names a young account can create in one rolling window, so these
 * must be attempted before optional packages. Already-published versions are
 * inspected and skipped by the publisher without consuming a publish slot.
 *
 * Keep version updates first: they do not consume a new-name slot, and Desk's
 * lifecycle fix is required by the host currently running the application.
 */
export const releasePriorityPackageNames = Object.freeze([
  '@braedonsaunders/appkit-egress-proxy',
  '@braedonsaunders/appkit-ai',
  '@braedonsaunders/appkit-desk',
  '@braedonsaunders/appkit-sync',
  '@braedonsaunders/appkit-workflows',
  '@braedonsaunders/appkit-remote-sessions',
  '@braedonsaunders/appkit-tokens',
  '@braedonsaunders/appkit-ui',
  '@braedonsaunders/appkit-voice',
  '@braedonsaunders/appkit-tenant',
  '@braedonsaunders/appkit-sandbox',
  '@braedonsaunders/appkit-process-sandbox',
  '@braedonsaunders/appkit-iam',
  '@braedonsaunders/appkit-jobs',
  '@braedonsaunders/appkit-mailbox',
  '@braedonsaunders/appkit-notifications',
  '@braedonsaunders/appkit-oauth',
  '@braedonsaunders/appkit-office',
  '@braedonsaunders/appkit-pdf',
  '@braedonsaunders/appkit-scene',
  '@braedonsaunders/appkit-scripts',
  '@braedonsaunders/appkit-sms',
  '@braedonsaunders/appkit-storage',
  '@braedonsaunders/appkit-superadmin',
  '@braedonsaunders/appkit-telephony',
])

const priorityByName = new Map(
  releasePriorityPackageNames.map((name, index) => [name, index]),
)

export function orderManifestsForPublication(manifests) {
  return [...manifests].sort((left, right) => {
    const leftPriority = priorityByName.get(left.name)
    const rightPriority = priorityByName.get(right.name)
    if (leftPriority !== undefined || rightPriority !== undefined) {
      if (leftPriority === undefined) return 1
      if (rightPriority === undefined) return -1
      return leftPriority - rightPriority
    }
    return left.name.localeCompare(right.name)
  })
}
