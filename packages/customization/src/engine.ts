import {
  createCustomizationRegistry,
  type CustomizationRegistry,
} from './registry'
import {
  defaultFormLayout,
  defaultListView,
  lintFormLayout,
  lintListView,
  mergeRegisteredFieldsIntoLayout,
  parseFormLayout,
  parseListView,
  refreshDefaultFormLayout,
  type LintIssue,
  type ParseResult,
} from './schema'
import type { FormLayoutConfig, ListViewConfig, RecordTypeMeta } from './types'

/**
 * Catalogue-bound API for application cutovers. Configure record metadata once,
 * then retain the source-shaped record-type-key calls at every use site.
 */
export interface CustomizationEngine {
  readonly registry: CustomizationRegistry
  getRecordType(recordType: string): RecordTypeMeta | undefined
  defaultFormLayout(recordType: string): FormLayoutConfig
  defaultListView(recordType: string): ListViewConfig
  mergeRegisteredFieldsIntoLayout(layout: FormLayoutConfig): FormLayoutConfig
  refreshDefaultFormLayout(layout: FormLayoutConfig): FormLayoutConfig
  lintFormLayout(layout: FormLayoutConfig): LintIssue[]
  lintListView(view: ListViewConfig): LintIssue[]
  parseFormLayout(input: unknown): ParseResult<FormLayoutConfig>
  parseListView(input: unknown): ParseResult<ListViewConfig>
}

export function createCustomizationEngine(
  recordTypes: readonly RecordTypeMeta[],
): CustomizationEngine {
  const registry = createCustomizationRegistry(recordTypes)
  const requireRecordType = (recordType: string): RecordTypeMeta => {
    const meta = registry.getRecordType(recordType)
    if (!meta) throw new Error(`unknown record type: ${recordType}`)
    return meta
  }

  const engine: CustomizationEngine = {
    registry,
    getRecordType: registry.getRecordType,
    defaultFormLayout(recordType) {
      return defaultFormLayout(requireRecordType(recordType))
    },
    defaultListView(recordType) {
      return defaultListView(requireRecordType(recordType))
    },
    mergeRegisteredFieldsIntoLayout(layout) {
      return mergeRegisteredFieldsIntoLayout(layout, requireRecordType(layout.recordType))
    },
    refreshDefaultFormLayout(layout) {
      return refreshDefaultFormLayout(layout, requireRecordType(layout.recordType))
    },
    lintFormLayout(layout) {
      return lintFormLayout(layout, registry)
    },
    lintListView(view) {
      return lintListView(view, registry)
    },
    parseFormLayout(input) {
      return parseFormLayout(input, registry)
    },
    parseListView(input) {
      return parseListView(input, registry)
    },
  }
  return Object.freeze(engine)
}
