'use client'

import * as React from 'react'
import { defaultFormLayout, defaultListView } from '@appkit/customization'
import {
  CustomizationStudio,
  type CustomFieldDefinition,
  type CustomizationDesignerAdapter,
  type FormDefinition,
  type ListViewDefinition,
} from '@appkit/customization/react'
import { Spinner } from '@appkit/ui'

const STORAGE_KEY = 'appkit-customization-studio-v2'

const SOURCE_LABELS: Record<string, string> = {
  'customization.recordTypes.vendor_bill': 'Vendor bill',
  'common.labels.vendor': 'Vendor',
  'common.labels.customer': 'Customer',
  'common.labels.date': 'Date',
  'common.labels.dueDate': 'Due date',
  'common.labels.reference': 'Reference',
  'common.labels.memo': 'Memo',
  'common.labels.postingDate': 'Posting date',
  'common.labels.department': 'Department',
  'common.labels.project': 'Project',
  'common.labels.location': 'Location',
  'common.labels.class': 'Class',
  'common.labels.subsidiary': 'Subsidiary',
  'common.labels.internalNotes': 'Internal notes',
  'common.labels.expectedPayDate': 'Expected pay date',
  'common.labels.paymentHold': 'Payment hold',
  'common.labels.account': 'Account',
  'common.labels.item': 'Item',
  'common.labels.description': 'Description',
  'common.labels.quantity': 'Quantity',
  'common.labels.unit': 'Unit',
  'common.labels.unitPrice': 'Unit price',
  'common.labels.tax': 'Tax',
  'common.labels.amount': 'Amount',
  'common.labels.number': 'Number',
  'common.labels.total': 'Total',
  'common.labels.openBalance': 'Open balance',
  'common.labels.status': 'Status',
  'common.labels.actions': 'Actions',
  'ap.drawer.dateLabel': 'Bill date',
  'ap.drawer.dueDate': 'Due date',
  'ap.drawer.reference': 'Vendor ref #',
  'ap.drawer.taxAmountColumn': 'Tax amount',
  'ap.list.columns.bill': 'Bill',
  'ap.list.columns.ref': 'Reference',
  'common.status.draft': 'Draft',
  'common.status.pendingApproval': 'Pending approval',
  'common.status.approved': 'Approved',
  'common.status.posted': 'Posted',
  'common.status.voided': 'Voided',
}

const INITIAL_FORMS: FormDefinition[] = [
  {
    id: 'form-vendor-bill-standard',
    recordType: 'vendor_bill',
    name: 'Standard vendor bill',
    isDefault: true,
    isActive: true,
    layout: defaultFormLayout('vendor_bill'),
  },
]

const INITIAL_VIEWS: ListViewDefinition[] = [
  {
    id: 'view-vendor-bill-open',
    recordType: 'vendor_bill',
    name: 'Open vendor bills',
    scope: 'organization',
    isDefault: true,
    isActive: true,
    config: {
      ...defaultListView('vendor_bill'),
      filters: [{ key: 'status', operator: 'in', value: ['draft', 'pending_approval', 'approved'] }],
    },
  },
]

const INITIAL_FIELDS: CustomFieldDefinition[] = [
  {
    id: 'field-review-owner',
    recordType: 'vendor_bill',
    level: 'header',
    key: 'review_owner',
    label: 'Review owner',
    fieldType: 'text',
    config: { helpText: 'Person accountable for the final review.', showInList: true },
    isRequired: false,
    isActive: true,
    sortOrder: 0,
  },
  {
    id: 'field-cost-category',
    recordType: 'vendor_bill',
    level: 'line',
    key: 'cost_category',
    label: 'Cost category',
    fieldType: 'select',
    config: { options: ['Materials', 'Labour', 'Equipment', 'Other'] },
    isRequired: false,
    isActive: true,
    sortOrder: 1,
  },
]

function upsert<T extends { id?: string }>(items: T[], value: T): T[] {
  const index = items.findIndex((item) => item.id === value.id)
  return index === -1
    ? [...items, value]
    : items.map((item, itemIndex) => (itemIndex === index ? value : item))
}

function ensureId<T extends { id?: string }>(value: T, prefix: string): T & { id: string } {
  return { ...value, id: value.id ?? `${prefix}-${crypto.randomUUID()}` }
}

export function CustomizationWorkbench() {
  const [forms, setForms] = React.useState(INITIAL_FORMS)
  const [views, setViews] = React.useState(INITIAL_VIEWS)
  const [fields, setFields] = React.useState(INITIAL_FIELDS)
  const [hydrated, setHydrated] = React.useState(false)

  React.useEffect(() => {
    try {
      const stored = localStorage.getItem(STORAGE_KEY)
      if (stored) {
        const parsed = JSON.parse(stored) as {
          forms?: FormDefinition[]
          views?: ListViewDefinition[]
          fields?: CustomFieldDefinition[]
        }
        if (parsed.forms) setForms(parsed.forms)
        if (parsed.views) setViews(parsed.views)
        if (parsed.fields) setFields(parsed.fields)
      }
    } catch {
      localStorage.removeItem(STORAGE_KEY)
    } finally {
      setHydrated(true)
    }
  }, [])

  React.useEffect(() => {
    if (!hydrated) return
    localStorage.setItem(STORAGE_KEY, JSON.stringify({ forms, views, fields }))
  }, [fields, forms, hydrated, views])

  const adapter = React.useMemo<CustomizationDesignerAdapter>(
    () => ({
      async saveForm(definition) {
        const saved = ensureId(definition, 'form')
        setForms((current) => upsert(current, saved))
        return saved
      },
      async deleteForm(id) {
        setForms((current) => current.filter((form) => form.id !== id))
      },
      async saveListView(definition) {
        const saved = ensureId(definition, 'view')
        setViews((current) => upsert(current, saved))
        return saved
      },
      async deleteListView(id) {
        setViews((current) => current.filter((view) => view.id !== id))
      },
      async saveField(definition) {
        const saved = ensureId(definition, 'field')
        setFields((current) => upsert(current, saved))
        return saved
      },
      async deleteField(id) {
        setFields((current) => current.filter((field) => field.id !== id))
      },
    }),
    [],
  )

  if (!hydrated) {
    return (
      <div className="flex h-full items-center justify-center bg-bg text-fg-muted">
        <Spinner label="Loading customization studio" />
      </div>
    )
  }

  return (
    <CustomizationStudio
      adapter={adapter}
      forms={forms}
      views={views}
      fields={fields}
      initialRecordType="vendor_bill"
      resolveLabel={(messageKey, fallback) => SOURCE_LABELS[messageKey] ?? fallback}
      roleOptions={[
        { value: 'administrator', label: 'Administrator' },
        { value: 'manager', label: 'Manager' },
        { value: 'member', label: 'Member' },
      ]}
      footer={<p className="text-xs text-fg-subtle">Changes are saved in this browser.</p>}
    />
  )
}
