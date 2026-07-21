import type { AutomationGraph } from '@appkit/forms-core/safety-automation'

export type RecordConfig = {
  editingMode?: 'guided_fill' | 'inline_record' | 'both'
  locking?: {
    enabled?: boolean
    trigger?: 'manual' | 'on_finalize' | 'on_signoff'
    lockRoles?: string[]
    unlockRoles?: string[]
    autoLockOnFinalize?: boolean
  }
  tabs?: {
    review?: boolean
    comments?: boolean
    audit?: boolean
  }
  list?: ListConfig
}

export type ListColumnConfig = {
  key: string
  source: 'builtin' | 'field'
  label?: string
}

export type ListConfig = {
  columns?: ListColumnConfig[]
  defaultSort?: {
    key: 'submitted_at' | 'created_at' | 'status'
    dir: 'asc' | 'desc'
  }
  defaultStatus?: string
}

export type RecordActionFlow = {
  id: string
  name: string
  enabled: boolean
  graph: AutomationGraph
}

export type RecordActionFlowAdapter = {
  create(name: string, graph: AutomationGraph): Promise<RecordActionFlow>
  update(id: string, graph: AutomationGraph): Promise<void>
  setEnabled(id: string, enabled: boolean): Promise<void>
  remove(id: string): Promise<void>
  open?(id: string): void
}
