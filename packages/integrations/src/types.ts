export type Scalar = string | number | boolean | null
export type IntegrationItem = Record<string, Scalar>
export type IntegrationEvent = {
  type: string
  tenantId: string
  subjectId: string
  items: IntegrationItem[]
}
export type FieldDefinition = {
  key: string
  label: string
  type: 'string' | 'number' | 'boolean' | 'date'
  sample?: Scalar
  note?: string
}
export type TriggerDefinition = {
  key: string
  label: string
  description: string
  group: string
  iconKey?: string
  subjectLabel: string
  itemScope: 'single' | 'collection'
  fields: FieldDefinition[]
  dynamicFieldsNote?: string
}
export type ConfigField = {
  key: string
  label: string
  type: 'text' | 'number' | 'select' | 'textarea' | 'boolean'
  options?: { value: string; label: string }[]
  placeholder?: string
  help?: string
  required?: boolean
}
export type SecretField = {
  key: string
  label: string
  required?: boolean
  help?: string
}
export type DeliveryRef = {
  externalRef: string
  detail?: Record<string, unknown>
}
export type DeliveryResult = {
  ok: boolean
  summary?: string
  error?: string
  refs?: DeliveryRef[]
}
export type DestinationTestContext = {
  tenantId: string
  config: Record<string, unknown>
  secrets: Record<string, string>
  signal?: AbortSignal
}
export type DeliveryContext = DestinationTestContext & {
  triggerKey: string
  subjectId: string
  items: IntegrationItem[]
  mapping: Record<string, unknown>
  priorRefs: string[]
  retryRefs: string[]
  oncePerRecord: boolean
  log: (level: 'info' | 'warn' | 'error', message: string) => void
}
export type DestinationDefinition = {
  key: string
  name: string
  description: string
  iconKey?: string
  mappingKind: string
  configFields: ConfigField[]
  secretFields: SecretField[]
  reversible: boolean
  test?(context: DestinationTestContext): Promise<DeliveryResult>
  deliver(context: DeliveryContext): Promise<DeliveryResult>
}
export type Item = IntegrationItem
export type DeliverRef = DeliveryRef
export type DeliverResult = DeliveryResult
export type DeliverContext = DeliveryContext
export type DestinationDef = DestinationDefinition
export type IntegrationResult = DeliveryResult
export type IntegrationDefinition = {
  id: string
  tenantId: string
  name: string
  enabled: boolean
  triggerKey: string
  destinationKey: string
  config: Record<string, unknown>
  sealedSecrets?: Record<string, unknown>
  oncePerRecord?: boolean
}

export function createIntegrationRegistry(options: {
  triggers?: readonly TriggerDefinition[]
  destinations?: readonly DestinationDefinition[]
}) {
  const triggers = new Map(
    options.triggers?.map((entry) => [entry.key, entry]) ?? [],
  )
  const destinations = new Map(
    options.destinations?.map((entry) => [entry.key, entry]) ?? [],
  )
  if (triggers.size !== (options.triggers?.length ?? 0))
    throw new Error('Integration trigger keys must be unique')
  if (destinations.size !== (options.destinations?.length ?? 0))
    throw new Error('Integration destination keys must be unique')
  return {
    triggers: () => [...triggers.values()],
    destinations: () => [...destinations.values()],
    trigger: (key: string) => triggers.get(key),
    destination: (key: string) => destinations.get(key),
    requireDestination(key: string) {
      const destination = destinations.get(key)
      if (!destination)
        throw new Error(`Unknown integration destination: ${key}`)
      return destination
    },
  }
}
