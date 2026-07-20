import type { CustomReportQuery } from './custom-query'
import type { ReportLayout } from './types'

export type CustomReportDefinition = {
  schemaVersion: 1
  id: string
  slug: string
  name: string
  description?: string
  query: CustomReportQuery
  layout: ReportLayout
  state: 'draft' | 'published' | 'archived'
  tags?: string[]
  builtIn?: boolean
}

export type ReportDefinitionRegistry = {
  definitions: CustomReportDefinition[]
  get(idOrSlug: string): CustomReportDefinition | null
  list(options?: { state?: CustomReportDefinition['state']; tags?: string[] }): CustomReportDefinition[]
}

export function createReportDefinitionRegistry(definitions: CustomReportDefinition[]): ReportDefinitionRegistry {
  const ids = new Set<string>()
  for (const definition of definitions) {
    assertCustomReportDefinition(definition)
    if (ids.has(definition.id) || ids.has(definition.slug)) throw new Error(`Duplicate report definition "${definition.id}"`)
    ids.add(definition.id); ids.add(definition.slug)
  }
  return {
    definitions: [...definitions],
    get: (idOrSlug) => definitions.find((definition) => definition.id === idOrSlug || definition.slug === idOrSlug) ?? null,
    list: (options = {}) => definitions.filter((definition) => (!options.state || definition.state === options.state) && (!options.tags?.length || options.tags.every((tag) => definition.tags?.includes(tag)))),
  }
}

export function assertCustomReportDefinition(value: CustomReportDefinition): void {
  if (value.schemaVersion !== 1) throw new Error('Unsupported report definition version')
  if (!value.id.trim() || !value.name.trim()) throw new Error('Report id and name are required')
  if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(value.slug)) throw new Error('Report slug must use kebab case')
  if (!value.query.entity.trim()) throw new Error('Report query entity is required')
  if (value.query.mode === 'rows' && !value.query.columns.length) throw new Error('A row report requires at least one column')
}
