/** Framework-neutral schema discovery contracts used by the visual query builder. */
export type DataColumnKind = 'text' | 'number' | 'date' | 'timestamp' | 'boolean' | 'enum' | 'uuid'

export type DiscoveredColumn = {
  key: string
  label: string
  kind: DataColumnKind
  nullable?: boolean
  description?: string
}

export type DiscoveredEntity = {
  key: string
  label: string
  category: string
  description?: string
  columns: DiscoveredColumn[]
}

export type RichSemanticType =
  | 'dimension' | 'category' | 'entity-name' | 'measure' | 'temporal'
  | 'pk' | 'fk' | 'uuid' | 'currency' | 'percentage' | 'lat' | 'lng'

export type SemanticOverlay = {
  semanticType?: RichSemanticType
  enumOptions?: { value: string; label: string }[]
  foreignEntity?: string
  arrayUnnest?: 'array' | 'json'
}

export type AnalyticsRelation = {
  via: string
  target: string
  foreignColumn: string
  label: string
}

export type SemanticColumn = DiscoveredColumn & {
  semanticType: RichSemanticType
  enumOptions?: { value: string; label: string }[]
  foreignEntity?: string
  arrayUnnest?: 'array' | 'json'
  canDimension: boolean
  canMeasure: boolean
  canBinTemporal: boolean
  canBinNumeric: boolean
}

export type SemanticEntity = Omit<DiscoveredEntity, 'columns'> & {
  columns: SemanticColumn[]
  featured?: boolean
  relations?: AnalyticsRelation[]
}

export function deriveSemanticType(column: DiscoveredColumn): RichSemanticType {
  if (column.kind === 'uuid') {
    if (column.key === 'id') return 'pk'
    if (column.key.endsWith('_id')) return 'fk'
    return 'uuid'
  }
  if (column.kind === 'date' || column.kind === 'timestamp') return 'temporal'
  if (column.kind === 'number') return 'measure'
  if (column.kind === 'enum') return 'category'
  if (column.kind === 'text' && /(^|_)(name|title|first_name|last_name)($|_)/.test(column.key)) {
    return 'entity-name'
  }
  return 'dimension'
}

export function decorateSemanticColumn(
  column: DiscoveredColumn,
  overlay: SemanticOverlay = {},
): SemanticColumn {
  const semanticType = overlay.semanticType ?? deriveSemanticType(column)
  const numeric = column.kind === 'number'
  const temporal = column.kind === 'date' || column.kind === 'timestamp'
  return {
    ...column,
    ...overlay,
    semanticType,
    canDimension: semanticType !== 'pk' && !overlay.arrayUnnest,
    canMeasure: numeric,
    canBinTemporal: temporal,
    canBinNumeric: numeric && semanticType !== 'percentage',
  }
}

export function buildSemanticEntities(
  entities: DiscoveredEntity[],
  overlays: Partial<Record<string, Record<string, SemanticOverlay>>> = {},
  relations: Partial<Record<string, AnalyticsRelation[]>> = {},
): SemanticEntity[] {
  return entities.map((entity) => ({
    ...entity,
    columns: entity.columns.map((column) => decorateSemanticColumn(column, overlays[entity.key]?.[column.key])),
    relations: relations[entity.key],
  }))
}

export function semanticEntity(entities: SemanticEntity[], key: string): SemanticEntity | null {
  return entities.find((entity) => entity.key === key) ?? null
}

export function semanticColumn(entity: SemanticEntity, key: string): SemanticColumn | null {
  return entity.columns.find((column) => column.key === key) ?? null
}
