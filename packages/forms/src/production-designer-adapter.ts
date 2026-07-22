import type { ReactNode } from 'react'
import type { AppLocale } from '@appkit/i18n'
import type { FormSchemaV1 } from '@appkit/forms-core'
import type { FormDataSource } from './properties'
import type {
  ListConfig,
  RecordActionFlow,
  RecordActionFlowAdapter,
  RecordConfig,
} from './record-config'

export type ProductionFormKind = 'form' | 'wizard' | 'checklist' | 'register' | 'mini_app'

export type ProductionDesignerOverview = {
  description: string | null
  category: string | null
  iconKey: string | null
  emailOnSubmit: boolean
  surfaceAsTool: boolean
}

export type ProductionDesignerResult = {
  ok: boolean
  error?: string
}

export type ProductionFormDesignerAdapter = {
  publish(input: {
    templateId: string
    schema: FormSchemaV1
    changelog: string
  }): Promise<ProductionDesignerResult & { version?: number }>
  saveOverview(input: {
    templateId: string
    name: string
    description: string
    surfaceAsTool: boolean
  }): Promise<ProductionDesignerResult>
  saveRecordConfig(input: {
    templateId: string
    recordConfig: RecordConfig
  }): Promise<ProductionDesignerResult>
  saveListConfig(input: {
    templateId: string
    listConfig: ListConfig
  }): Promise<ProductionDesignerResult>
  savePermissions(input: {
    templateId: string
    allowedRoles: string[]
  }): Promise<ProductionDesignerResult>
  setPinned?(input: {
    templateId: string
    pinned: boolean
  }): Promise<ProductionDesignerResult>
  navigate?(href: string): void
}

export type ProductionDesignerFlowsInput = {
  templateId: string
  name: string
  schema: FormSchemaV1
  flows: RecordActionFlow[]
}

export type ProductionDesignerAssistantInput = {
  open: boolean
  onClose(): void
  templateId: string
  schema: FormSchemaV1
  apply(schema: FormSchemaV1): void
}

export type ProductionFormDesignerProps = {
  adapter: ProductionFormDesignerAdapter
  templateId: string
  templateName: string
  templateKind?: ProductionFormKind
  initialSchema: FormSchemaV1
  currentVersion: number
  initialSurface?: 'build' | 'flows'
  overview?: ProductionDesignerOverview
  recordConfig?: RecordConfig
  allowedRoles?: string[]
  roles?: { key: string; name: string }[]
  flows?: RecordActionFlow[]
  recordActionAdapter: RecordActionFlowAdapter
  dataSources?: readonly FormDataSource[]
  dataSourcesLoading?: boolean
  onRefreshDataSources?: () => void | Promise<void>
  renderFlows?: (input: ProductionDesignerFlowsInput) => ReactNode
  renderAssistant?: (input: ProductionDesignerAssistantInput) => ReactNode
  backHref: string
  recordsHref: string
  assignmentCreateHref: string
  assignmentsHref: string
  dataSourcesHref?: string
  publishedHref?: string
  canPin?: boolean
  pinned?: boolean
  onSchemaChange?: (schema: FormSchemaV1) => void
  locale: AppLocale
  defaultLocale: AppLocale
  enabledLocales: readonly AppLocale[]
  localeLabels?: Partial<Record<AppLocale, string>>
  className?: string
}
