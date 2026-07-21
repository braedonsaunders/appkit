import type { FieldDefinition, IntegrationEvent, IntegrationItem, TriggerDefinition } from './types'

export type TriggerCatalog = ReturnType<typeof createTriggerCatalog>

export function createTriggerCatalog(definitions: readonly TriggerDefinition[]) {
  const map = new Map<string, TriggerDefinition>()
  for (const definition of definitions) {
    if (!definition.key.trim()) throw new Error('Integration triggers require a key')
    if (map.has(definition.key)) throw new Error(`Duplicate integration trigger: ${definition.key}`)
    map.set(definition.key, definition)
  }
  return {
    list: () => [...map.values()],
    get: (key: string | null | undefined) => key ? map.get(key) : undefined,
    require(key: string) {
      const trigger = map.get(key)
      if (!trigger) throw new Error(`Unknown integration trigger: ${key}`)
      return trigger
    },
    sampleItem(key: string): IntegrationItem {
      const item: IntegrationItem = {}
      for (const field of this.require(key).fields) {
        item[field.key] = field.sample ?? (field.type === 'number' ? 0 : field.type === 'boolean' ? false : '')
      }
      return item
    },
    event(input: { key: string; tenantId: string; subjectId: string; items: IntegrationItem[] }): IntegrationEvent {
      const trigger = this.require(input.key)
      if (trigger.itemScope === 'single' && input.items.length !== 1) {
        throw new Error(`${trigger.label} requires exactly one integration item`)
      }
      return { type: trigger.key, tenantId: input.tenantId, subjectId: input.subjectId, items: input.items }
    },
  }
}

export function field(
  key: string,
  label: string,
  type: FieldDefinition['type'],
  options: Pick<FieldDefinition, 'sample' | 'note'> = {},
): FieldDefinition {
  return { key, label, type, ...options }
}
