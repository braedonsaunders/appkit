'use client'

import * as React from 'react'
import { Columns3, GripVertical, Plus } from 'lucide-react'
import {
  createCustomizationRegistry,
  defaultFormLayout,
  defaultListView,
  extendRecordType,
  lintFormLayout,
  lintListView,
  type CustomFieldDefinition,
  type RecordTypeMeta,
} from '@appkit/customization'
import {
  Badge,
  Button,
  Card,
  CardContent,
  Input,
  Label,
  SettingsRow,
  SettingsSection,
  SettingsShell,
} from '@appkit/ui'

const project: RecordTypeMeta = {
  key: 'project',
  label: 'Project',
  pluralLabel: 'Projects',
  headerFields: [
    { key: 'number', label: 'Project number', kind: 'text', level: 'header', required: true, width: 3 },
    { key: 'name', label: 'Project name', kind: 'text', level: 'header', required: true, width: 6 },
    {
      key: 'status',
      label: 'Status',
      kind: 'select',
      level: 'header',
      required: true,
      width: 3,
      options: [
        { value: 'bidding', label: 'Bidding' },
        { value: 'active', label: 'Active' },
      ],
    },
    { key: 'manager', label: 'Project manager', kind: 'reference', level: 'header', width: 6 },
    { key: 'contract_value', label: 'Contract value', kind: 'currency', level: 'header', width: 6 },
  ],
  columns: [
    { key: 'number', label: 'Project #', kind: 'text', defaultVisible: true },
    { key: 'name', label: 'Project', kind: 'text', defaultVisible: true },
    { key: 'status', label: 'Status', kind: 'status', defaultVisible: true },
    { key: 'contract_value', label: 'Contract value', kind: 'amount', defaultVisible: true },
  ],
  filters: [
    {
      key: 'status',
      label: 'Status',
      kind: 'select',
      operators: ['in', 'not_in'],
      options: [
        { value: 'bidding', label: 'Bidding' },
        { value: 'active', label: 'Active' },
      ],
    },
  ],
  defaultSort: { key: 'name', direction: 'asc' },
}

type SectionKey = 'fields' | 'form' | 'list'

export function CustomizationWorkbench() {
  const [active, setActive] = React.useState<SectionKey>('fields')
  const [customFields, setCustomFields] = React.useState<CustomFieldDefinition[]>([
    {
      key: 'bid_stage',
      label: 'Bid stage',
      recordType: 'project',
      level: 'header',
      kind: 'select',
      options: [
        { value: 'estimating', label: 'Estimating' },
        { value: 'submitted', label: 'Submitted' },
      ],
    },
  ])
  const extended = extendRecordType(project, customFields)
  const registry = createCustomizationRegistry([extended])
  const form = defaultFormLayout('project', registry)
  const list = defaultListView('project', registry)
  const formIssues = lintFormLayout(form, registry)
  const listIssues = lintListView(list, registry)

  return (
    <SettingsShell
      title="Project screens"
      description="Fields, forms, lists, filters, and sorting"
      nav={[
        {
          items: [
            { key: 'fields', label: 'Fields', icon: <Plus /> },
            { key: 'form', label: 'Form layout', icon: <Columns3 /> },
            { key: 'list', label: 'List view', icon: <GripVertical /> },
          ],
        },
      ]}
      activeKey={active}
      onSelect={(key) => setActive(key as SectionKey)}
    >
      {active === 'fields' ? (
        <SettingsSection
          title="Custom fields"
          description="A field definition is available to forms, lists, filters, reports, and API records."
          footer={
            <Button
              variant="outline"
              size="sm"
              onClick={() =>
                setCustomFields((current) => [
                  ...current,
                  {
                    key: `custom_${current.length + 1}`,
                    label: `Custom field ${current.length + 1}`,
                    recordType: 'project',
                    level: 'header',
                    kind: 'text',
                  },
                ])
              }
            >
              <Plus className="size-4" />
              Add field
            </Button>
          }
        >
          {customFields.map((field, index) => (
            <SettingsRow
              key={field.key}
              title={field.label}
              description={`${field.kind} · ${field.level}`}
              control={
                <Input
                  aria-label={`${field.label} label`}
                  value={field.label}
                  onChange={(event) =>
                    setCustomFields((current) =>
                      current.map((item, itemIndex) =>
                        itemIndex === index ? { ...item, label: event.target.value } : item,
                      ),
                    )
                  }
                  className="w-48"
                />
              }
            />
          ))}
        </SettingsSection>
      ) : null}

      {active === 'form' ? (
        <Card>
          <CardContent className="p-4">
            <div className="mb-3 flex items-center justify-between">
              <div>
                <h2 className="font-semibold text-fg">Project form</h2>
                <p className="text-sm text-fg-muted">Two-column details section</p>
              </div>
              <Badge variant={formIssues.length ? 'warning' : 'success'}>
                {formIssues.length ? 'Issues' : 'Valid'}
              </Badge>
            </div>
            <div className="grid grid-cols-12 gap-2 rounded-md border border-border bg-bg-subtle p-3">
              {form.groups[0]!.fields.map((placement) => {
                const field = extended.headerFields.find((item) => item.key === placement.field)!
                return (
                  <div
                    key={placement.field}
                    className="col-span-12 rounded border border-border bg-surface p-3 sm:col-span-6"
                  >
                    <Label>{field.label}</Label>
                    <div className="mt-1 h-9 rounded border border-border bg-bg" />
                  </div>
                )
              })}
            </div>
          </CardContent>
        </Card>
      ) : null}

      {active === 'list' ? (
        <Card>
          <CardContent className="p-4">
            <div className="mb-3 flex items-center justify-between">
              <div>
                <h2 className="font-semibold text-fg">Project list</h2>
                <p className="text-sm text-fg-muted">Visible columns and default name sort</p>
              </div>
              <Badge variant={listIssues.length ? 'warning' : 'success'}>
                {listIssues.length ? 'Issues' : 'Valid'}
              </Badge>
            </div>
            <div className="overflow-hidden rounded-md border border-border">
              <div className="grid grid-cols-4 bg-bg-subtle text-xs font-semibold text-fg-muted">
                {list.columns.map((placement) => (
                  <span key={placement.column} className="border-r border-border px-3 py-2 last:border-0">
                    {extended.columns.find((item) => item.key === placement.column)?.label}
                  </span>
                ))}
              </div>
              <div className="grid grid-cols-4 text-sm text-fg">
                <span className="px-3 py-3">P-1048</span>
                <span className="px-3 py-3">North Tower</span>
                <span className="px-3 py-3">Active</span>
                <span className="px-3 py-3 text-right tabular-nums">$1,840,000</span>
              </div>
            </div>
          </CardContent>
        </Card>
      ) : null}
    </SettingsShell>
  )
}
