import type { FieldKind, FormLayoutConfig, ListViewConfig } from './types'

export interface CustomFieldDefinition {
  id: string
  recordType: string
  level: 'header' | 'line'
  key: string
  label: string
  fieldType: FieldKind
  config: {
    options?: string[]
    helpText?: string
    placeholder?: string
    defaultValue?: string
    min?: number
    max?: number
    showInList?: boolean
    displayMode?: 'always' | 'create_only' | 'edit_only'
    allowedRoles?: string[]
  }
  isRequired: boolean
  isActive: boolean
  sortOrder: number
}

export type CustomFieldInput = Omit<CustomFieldDefinition, 'id'> & { id?: string }

export interface FormDefinition {
  id?: string
  recordType: string
  name: string
  isDefault: boolean
  isActive: boolean
  layout: FormLayoutConfig
}

export interface ListViewDefinition {
  id?: string
  recordType: string
  name: string
  scope: 'organization' | 'user'
  isDefault: boolean
  isActive: boolean
  config: ListViewConfig
}

export interface CustomizationDesignerAdapter {
  saveForm(definition: FormDefinition): Promise<FormDefinition>
  deleteForm?(id: string): Promise<void>
  saveListView(definition: ListViewDefinition): Promise<ListViewDefinition>
  deleteListView?(id: string): Promise<void>
  saveField(definition: CustomFieldInput): Promise<CustomFieldDefinition>
  deleteField?(id: string): Promise<void>
}

export type CustomizationLabelResolver = (messageKey: string, fallback: string) => string
