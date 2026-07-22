import type { EntityAttrsByField } from '@appkit/forms-core'
import type {
  FinalizeUploadAction,
  RequestUploadAction,
} from '@appkit/ui'

export type ProductionDataColumn = {
  key: string
  label: string
  type: 'text' | 'number' | 'date' | 'boolean'
}

export type ProductionDataRow = Record<string, unknown>

export type ProductionDataQuery = {
  sourceKey: string
  where?: { column: string; value: unknown }[]
  filterColumn?: string
  filterValue?: unknown
  search?: string
  page?: number
  pageSize?: number
  valueColumn?: string
  selectedValue?: unknown
}

export type ProductionDataQueryResult = {
  columns: ProductionDataColumn[]
  rows: ProductionDataRow[]
  total: number
  page: number
  pageSize: number
  selectedRow: ProductionDataRow | null
}

export type ProductionDataAggregate = {
  sourceKey: string
  fn: 'count' | 'sum' | 'avg' | 'min' | 'max'
  column?: string
  groupBy?: string
  where?: { column: string; value: unknown }[]
  filterColumn?: string
  filterValue?: unknown
  groupLimit?: number
}

export type ProductionDataAggregateResult = {
  value: number | null
  groups?: { key: string; value: number }[]
  total: number
}

export type ProductionPhotoAnalysis = {
  overallRisk: 'none' | 'low' | 'medium' | 'high' | 'critical'
  summary?: string
  ppe: {
    item: string
    status: 'present' | 'missing' | 'incorrect'
    detail: string | null
  }[]
  hazards: { type: string; severity: 'low' | 'medium' | 'high' | 'critical'; detail: string }[]
}

export type ProductionFormRuntimeAdapter = {
  createDraft(input: {
    templateId: string
    obligationId?: string | null
  }): Promise<{ ok: true; responseId: string } | { ok: false; error: string }>
  saveDraft(input: {
    responseId: string
    values: Record<string, unknown>
    rows: Record<string, Array<Record<string, unknown>>>
    stepIndex: number
    clientSessionId: string
    clientSequence: number
    baseRevision: number
  }): Promise<
    | { ok: true; savedAt: string; revision: number; sequence: number }
    | { ok: false; error: string }
  >
  submit(input: {
    templateId: string
    data: Record<string, unknown>
    siteId?: string | null
    obligationId?: string | null
    responseId?: string | null
    returnTo?: string | null
  }): Promise<{
    ok: boolean
    responseId?: string
    errors?: { fieldId: string; message: string }[]
  }>
  updateField(input: {
    responseId: string
    fieldId: string
    value: unknown
  }): Promise<{ ok: true } | { ok: false; error: string }>
  fetchEntityAttributes(input: {
    templateId: string
    fieldId: string
    entityId: string
  }): Promise<
    | { ok: true; attrs: Record<string, unknown> }
    | { ok: false; error: string }
  >
  listHierarchyOptions(level: string): Promise<
    { id: string; name: string; code: string | null }[]
  >
  queryData(input: ProductionDataQuery): Promise<ProductionDataQueryResult>
  aggregateData(input: ProductionDataAggregate): Promise<ProductionDataAggregateResult>
  analyzePhotos?(input: {
    attachmentIds: string[]
  }): Promise<
    | { ok: true; analysis: ProductionPhotoAnalysis }
    | { ok: false; error: string }
  >
  requestUpload?: RequestUploadAction
  finalizeUpload?: FinalizeUploadAction
  /** Optional endpoint used by the source save-on-unload protocol. */
  draftBeaconUrl?: string
}

export type ProductionFormRuntimeInput = {
  templateId: string
  templateName: string
  version: number
  schema: import('@appkit/forms-core').FormSchemaV1 & {
    workflow: NonNullable<import('@appkit/forms-core').FormSchemaV1['workflow']>
  }
  sites: { id: string; name: string }[]
  people: {
    id: string
    firstName: string
    lastName: string
    employeeNo?: string | null
  }[]
  entitiesByField: EntityAttrsByField
  currentUser: { personId: string | null; name: string | null }
  initialResponseId?: string | null
  initialValues?: Record<string, unknown>
  initialRows?: Record<string, Array<Record<string, unknown>>>
  initialStepIndex?: number
  initialDraftRevision?: number
  isResumed?: boolean
  returnTo?: string | null
  recordsHref: string
  readOnly?: boolean
  responseStatus?: string | null
  reviewHref?: string | null
  complianceObligationId?: string | null
  inlineAutosave?: boolean
}
