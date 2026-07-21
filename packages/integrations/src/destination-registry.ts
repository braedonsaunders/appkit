import { slackDestination } from './chat'
import { createEmailDestination, type IntegrationEmailSender } from './email'
import { httpDestination } from './http'
import { sheetsDestination } from './sheets'
import { sqlDestination } from './sql'
import type { DestinationDefinition } from './types'

export function createDestinationCatalog(
  destinations: readonly DestinationDefinition[],
) {
  const map = new Map<string, DestinationDefinition>()
  for (const destination of destinations) {
    if (map.has(destination.key)) throw new Error(`Duplicate integration destination: ${destination.key}`)
    map.set(destination.key, destination)
  }
  return {
    list: () => [...map.values()],
    get: (key: string | null | undefined) => key ? map.get(key) : undefined,
    require(key: string) {
      const destination = map.get(key)
      if (!destination) throw new Error(`Unknown integration destination: ${key}`)
      return destination
    },
  }
}

export function createDefaultDestinationCatalog(options: {
  sendEmail?: IntegrationEmailSender
} = {}) {
  return createDestinationCatalog([
    httpDestination,
    sqlDestination,
    slackDestination,
    sheetsDestination,
    ...(options.sendEmail ? [createEmailDestination(options.sendEmail)] : []),
  ])
}
