'use client'

import {
  useId,
  useMemo,
  useRef,
  useState,
  useTransition,
  type Dispatch,
  type FocusEvent,
  type ReactNode,
  type SetStateAction,
} from 'react'
import {
  AlertCircle,
  CheckCircle2,
  Loader2,
  Plus,
  Send,
  Trash2,
  Zap,
} from 'lucide-react'
import { Button, Input, Label, Select, Textarea, cn } from '@appkit/ui'
import {
  readIntegrationEditorSubmission,
  type DestinationAuthoringDefinition,
  type IntegrationEditorInitial,
  type IntegrationEditorSubmission,
} from './authoring'
import type {
  ConfigField,
  FieldDefinition,
  TriggerDefinition,
} from './types'

export type IntegrationBuilderResult = { ok: boolean; message: string }

export type IntegrationBuilderCopy = {
  name: string
  namePlaceholder: string
  triggerTitle: string
  triggerSubtitle: string
  triggerPlaceholder: string
  destinationTitle: string
  destinationSubtitle: string
  destinationPlaceholder: string
  configurationTitle: string
  configurationSubtitle: string
  enabled: string
  oncePerRecord: string
  test: string
  testing: string
  save: string
  saving: string
  tokenTitle: string
  tokenHelp: string
  noTrigger: string
}

const DEFAULT_COPY: IntegrationBuilderCopy = {
  name: 'Automation name',
  namePlaceholder: 'e.g. Send approved records to operations',
  triggerTitle: 'Choose a trigger',
  triggerSubtitle: 'Select the application event that starts this automation.',
  triggerPlaceholder: 'Select a trigger…',
  destinationTitle: 'Choose a destination',
  destinationSubtitle: 'Select where the event data should be delivered.',
  destinationPlaceholder: 'Select a destination…',
  configurationTitle: 'Configure and map',
  configurationSubtitle: 'Connect the service and map trigger tokens to destination fields.',
  enabled: 'Enable automation',
  oncePerRecord: 'Send only once per record',
  test: 'Test connection',
  testing: 'Testing…',
  save: 'Save automation',
  saving: 'Saving…',
  tokenTitle: 'Available tokens',
  tokenHelp: 'Focus a mapping field, then choose a token to insert it.',
  noTrigger: 'Choose a trigger to see its available data.',
}

type ActiveElement = HTMLInputElement | HTMLTextAreaElement | null

export function IntegrationBuilder({
  id,
  initial,
  triggers,
  destinations,
  onSave,
  onTest,
  copy: copyOverrides,
}: {
  id: string
  initial: IntegrationEditorInitial
  triggers: readonly TriggerDefinition[]
  destinations: readonly DestinationAuthoringDefinition[]
  onSave: (submission: IntegrationEditorSubmission) => Promise<void | IntegrationBuilderResult>
  onTest?: (submission: IntegrationEditorSubmission) => Promise<IntegrationBuilderResult>
  copy?: Partial<IntegrationBuilderCopy>
}) {
  const copy = { ...DEFAULT_COPY, ...copyOverrides }
  const formRef = useRef<HTMLFormElement>(null)
  const activeElement = useRef<ActiveElement>(null)
  const [triggerKey, setTriggerKey] = useState(initial.triggerKey)
  const [destinationKey, setDestinationKey] = useState(initial.destinationKey)
  const [pending, startTransition] = useTransition()
  const [action, setAction] = useState<'save' | 'test' | null>(null)
  const [result, setResult] = useState<IntegrationBuilderResult | null>(null)
  const trigger = useMemo(
    () => triggers.find((entry) => entry.key === triggerKey),
    [triggerKey, triggers],
  )
  const destination = useMemo(
    () => destinations.find((entry) => entry.key === destinationKey),
    [destinationKey, destinations],
  )

  const register = (
    event: FocusEvent<HTMLInputElement | HTMLTextAreaElement>,
  ) => {
    activeElement.current = event.currentTarget
  }
  const insertToken = (token: string) => {
    const element = activeElement.current
    if (!element) return
    const start = element.selectionStart ?? element.value.length
    const end = element.selectionEnd ?? element.value.length
    const value = `{{${token}}}`
    element.value =
      element.value.slice(0, start) + value + element.value.slice(end)
    const cursor = start + value.length
    element.focus()
    element.setSelectionRange(cursor, cursor)
  }
  const submission = () => {
    const form = formRef.current
    if (!form || !destination) return null
    return readIntegrationEditorSubmission({
      destination,
      formData: new FormData(form),
      baseConfig: initial.config,
    })
  }
  const runTest = () => {
    const value = submission()
    if (!value || !onTest) return
    setResult(null)
    setAction('test')
    startTransition(async () => {
      try {
        setResult(await onTest(value))
      } catch (error) {
        setResult({
          ok: false,
          message: error instanceof Error ? error.message : 'Test failed.',
        })
      } finally {
        setAction(null)
      }
    })
  }

  return (
    <form
      ref={formRef}
      className="space-y-6"
      onSubmit={(event) => {
        event.preventDefault()
        const value = submission()
        if (!value) return
        setResult(null)
        setAction('save')
        startTransition(async () => {
          try {
            const saved = await onSave(value)
            if (saved) setResult(saved)
          } catch (error) {
            setResult({
              ok: false,
              message: error instanceof Error ? error.message : 'Save failed.',
            })
          } finally {
            setAction(null)
          }
        })
      }}
    >
      <input type="hidden" name="id" value={id} />
      <input type="hidden" name="destinationKey" value={destinationKey} />

      <Field label={copy.name}>
        <Input
          name="name"
          defaultValue={initial.name}
          placeholder={copy.namePlaceholder}
          onFocus={register}
        />
      </Field>

      <Section step={1} title={copy.triggerTitle} subtitle={copy.triggerSubtitle}>
        <Select
          name="triggerKey"
          value={triggerKey}
          onChange={(event) => setTriggerKey(event.target.value)}
          aria-label={copy.triggerTitle}
        >
          <option value="">{copy.triggerPlaceholder}</option>
          {triggers.map((entry) => (
            <option key={entry.key} value={entry.key}>
              {entry.label}
            </option>
          ))}
        </Select>
        {trigger ? (
          <p className="text-xs text-fg-muted">{trigger.description}</p>
        ) : null}
      </Section>

      <Section
        step={2}
        title={copy.destinationTitle}
        subtitle={copy.destinationSubtitle}
      >
        <Select
          value={destinationKey}
          onChange={(event) => {
            setDestinationKey(event.target.value)
            setResult(null)
          }}
          aria-label={copy.destinationTitle}
        >
          <option value="">{copy.destinationPlaceholder}</option>
          {destinations.map((entry) => (
            <option key={entry.key} value={entry.key}>
              {entry.name}
            </option>
          ))}
        </Select>
        {destination ? (
          <p className="text-xs text-fg-muted">{destination.description}</p>
        ) : null}
      </Section>

      {destination ? (
        <Section
          step={3}
          title={copy.configurationTitle}
          subtitle={copy.configurationSubtitle}
        >
          <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_220px]">
            <div className="min-w-0 space-y-4">
              {destination.configFields.length ? (
                <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                  {destination.configFields.map((field) => (
                    <FieldInput
                      key={field.key}
                      field={field}
                      value={initial.config[field.key]}
                      onFocus={register}
                    />
                  ))}
                </div>
              ) : null}
              {destination.secretFields.length ? (
                <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                  {destination.secretFields.map((secret) => (
                    <Field
                      key={secret.key}
                      label={secret.label}
                      required={secret.required}
                      help={secret.help}
                    >
                      <Input
                        name={secret.key}
                        type="password"
                        autoComplete="new-password"
                        placeholder={
                          initial.secretsPresent[secret.key]
                            ? 'Leave blank to keep the stored value'
                            : ''
                        }
                      />
                    </Field>
                  ))}
                </div>
              ) : null}
              <MappingEditor
                destination={destination}
                mapping={initial.mapping}
                register={register}
              />
            </div>
            <TokenPanel
              trigger={trigger}
              onInsert={insertToken}
              copy={copy}
            />
          </div>
        </Section>
      ) : null}

      <div className="space-y-3 border-t border-border-subtle pt-4">
        <div className="flex flex-wrap items-center gap-x-6 gap-y-2">
          <Check name="enabled" defaultChecked={initial.enabled} label={copy.enabled} />
          {destination && !destination.reversible ? (
            <Check
              name="oncePerRecord"
              defaultChecked={initial.oncePerRecord}
              label={copy.oncePerRecord}
            />
          ) : null}
        </div>
        {result ? <ResultBanner result={result} /> : null}
        <div className="flex items-center justify-end gap-2">
          {destination && onTest ? (
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={runTest}
              disabled={pending}
            >
              {pending && action === 'test' ? (
                <Loader2 size={14} className="animate-spin" />
              ) : (
                <Send size={14} />
              )}
              {pending && action === 'test' ? copy.testing : copy.test}
            </Button>
          ) : null}
          <Button type="submit" disabled={pending || !destination}>
            {pending && action === 'save' ? (
              <Loader2 size={14} className="animate-spin" />
            ) : (
              <Zap size={14} />
            )}
            {pending && action === 'save' ? copy.saving : copy.save}
          </Button>
        </div>
      </div>
    </form>
  )
}

function ResultBanner({ result }: { result: IntegrationBuilderResult }) {
  return (
    <div
      className={cn(
        'flex items-start gap-2 rounded-lg border px-3 py-2 text-sm',
        result.ok
          ? 'border-success/40 bg-success-subtle text-success'
          : 'border-danger/40 bg-danger-subtle text-danger',
      )}
      role="status"
    >
      {result.ok ? (
        <CheckCircle2 size={15} className="mt-0.5 shrink-0" />
      ) : (
        <AlertCircle size={15} className="mt-0.5 shrink-0" />
      )}
      <span className="break-words">{result.message}</span>
    </div>
  )
}

function MappingEditor({
  destination,
  mapping,
  register,
}: {
  destination: DestinationAuthoringDefinition
  mapping: Record<string, unknown>
  register: (event: FocusEvent<HTMLInputElement | HTMLTextAreaElement>) => void
}) {
  if (destination.mappingKind === 'sql')
    return <SqlMapping mapping={mapping} register={register} />
  if (destination.mappingKind === 'http')
    return <HttpMapping mapping={mapping} register={register} />
  if (destination.mappingKind === 'sheets')
    return <SheetsMapping mapping={mapping} register={register} />
  if (destination.mappingKind === 'slack')
    return (
      <div className="space-y-3">
        <Field
          label="Message template"
          help="The channel message. Insert tokens from the panel."
        >
          <Textarea
            name="map-text"
            rows={4}
            defaultValue={String(mapping.text ?? '')}
            onFocus={register}
            placeholder="Record {{reference}} is ready"
          />
        </Field>
        <Field
          label="Block Kit JSON"
          help="Optional Slack Block Kit array. It overrides plain text and sends one rich message per item."
        >
          <Textarea
            name="map-blocks"
            rows={4}
            className="font-mono text-xs"
            defaultValue={String(mapping.blocks ?? '')}
            onFocus={register}
            placeholder='[{"type":"section","text":{"type":"mrkdwn","text":"{{reference}}"}}]'
          />
        </Field>
      </div>
    )
  return (
    <Field
      label="Email body"
      help="Insert tokens from the panel. Sanitized basic HTML is supported."
    >
      <Textarea
        name="map-body"
        rows={6}
        className="font-mono text-xs"
        defaultValue={String(mapping.body ?? '')}
        onFocus={register}
        placeholder="<p>{{reference}} is ready.</p>"
      />
    </Field>
  )
}

function SqlMapping({
  mapping,
  register,
}: {
  mapping: Record<string, unknown>
  register: (event: FocusEvent<HTMLInputElement | HTMLTextAreaElement>) => void
}) {
  const rows = Object.entries(
    (mapping.columns as Record<string, unknown> | undefined) ?? {},
  ).map(([name, value], index) => ({
    id: `existing-${index}`,
    name,
    value: value == null ? 'null' : String(value),
  }))
  return (
    <div className="space-y-3">
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <Field label="Table" required>
          <Input
            name="map-table"
            defaultValue={String(mapping.table ?? '')}
            placeholder="time_entries"
          />
        </Field>
        <Field
          label="Identity column"
          help="Required so partial retries can remove completed inserts before trying again."
          required
        >
          <Input
            name="map-idColumn"
            defaultValue={String(mapping.idColumn ?? '')}
            placeholder="id"
          />
        </Field>
        <Field label="Row mode">
          <Select
            name="map-mode"
            defaultValue={mapping.mode === 'weekly' ? 'weekly' : 'row'}
          >
            <option value="row">One row per item</option>
            <option value="weekly">One row per item per week</option>
          </Select>
        </Field>
        <Field
          label="Required source field"
          help="Items missing this field are skipped."
        >
          <Input
            name="map-requireField"
            defaultValue={String(mapping.requireField ?? '')}
            placeholder="externalEmployeeId"
            onFocus={register}
          />
        </Field>
      </div>
      <Field
        label="Value map"
        help='One per line: "Source value = external id". The mapped value is available as {{department}}.'
      >
        <Textarea
          name="map-departmentMap"
          rows={2}
          className="font-mono text-xs"
          defaultValue={String(mapping.departmentMap ?? '')}
          placeholder={'Operations = 10\nAdministration = 20'}
        />
      </Field>
      <MappingRows
        initial={rows.length ? rows : [{ id: 'empty-0', name: '', value: '' }]}
        addLabel="Add column"
        render={(row) => (
          <>
            <Input
              name="col-name"
              defaultValue={row.name}
              placeholder="column_name"
              className="sm:w-40"
            />
            <Input
              name="col-val"
              defaultValue={row.value}
              placeholder="{{field}} or a literal"
              onFocus={register}
              className="flex-1"
            />
          </>
        )}
      />
    </div>
  )
}

function HttpMapping({
  mapping,
  register,
}: {
  mapping: Record<string, unknown>
  register: (event: FocusEvent<HTMLInputElement | HTMLTextAreaElement>) => void
}) {
  const rows = Object.entries(
    (mapping.headers as Record<string, string> | undefined) ?? {},
  ).map(([name, value], index) => ({
    id: `existing-${index}`,
    name,
    value: String(value),
  }))
  return (
    <div className="space-y-3">
      <MappingRows
        label="Request headers"
        initial={rows}
        addLabel="Add header"
        render={(row) => (
          <>
            <Input
              name="hdr-key"
              defaultValue={row.name}
              placeholder="X-Record"
              className="sm:w-44"
            />
            <Input
              name="hdr-val"
              defaultValue={row.value}
              placeholder="{{reference}}"
              onFocus={register}
              className="flex-1"
            />
          </>
        )}
      />
      <Field label="Request body" help="The body sent once per item.">
        <Textarea
          name="map-body"
          rows={7}
          className="font-mono text-xs"
          defaultValue={String(mapping.body ?? '')}
          onFocus={register}
          placeholder={'{"reference":"{{reference}}"}'}
        />
      </Field>
    </div>
  )
}

function SheetsMapping({
  mapping,
  register,
}: {
  mapping: Record<string, unknown>
  register: (event: FocusEvent<HTMLInputElement | HTMLTextAreaElement>) => void
}) {
  const rows = (
    Array.isArray(mapping.values) ? (mapping.values as unknown[]) : []
  ).map((value, index) => ({
    id: `existing-${index}`,
    name: '',
    value: value == null ? '' : String(value),
  }))
  return (
    <MappingRows
      label="Row cells"
      help="Add cells in sheet column order. Tokens and typed literals are supported."
      initial={rows.length ? rows : [{ id: 'empty-0', name: '', value: '' }]}
      addLabel="Add cell"
      render={(row) => (
        <Input
          name="val-expr"
          defaultValue={row.value}
          placeholder="{{field}} or a literal"
          onFocus={register}
          className="flex-1"
        />
      )}
    />
  )
}

type MappingRow = { id: string; name: string; value: string }

function MappingRows({
  initial,
  render,
  addLabel,
  label = 'Column mapping',
  help = 'Map each destination field to a trigger token or typed literal.',
}: {
  initial: MappingRow[]
  render: (row: MappingRow) => ReactNode
  addLabel: string
  label?: string
  help?: string
}) {
  const id = useId()
  const sequence = useRef(initial.length)
  const [rows, setRows] = useState(initial)
  return (
    <div className="space-y-2">
      <Label>{label}</Label>
      <p className="text-xs text-fg-muted">{help}</p>
      <RowList
        rows={rows}
        setRows={setRows}
        render={render}
        addLabel={addLabel}
        nextId={() => `${id}-${sequence.current++}`}
      />
    </div>
  )
}

function RowList({
  rows,
  setRows,
  render,
  addLabel,
  nextId,
}: {
  rows: MappingRow[]
  setRows: Dispatch<SetStateAction<MappingRow[]>>
  render: (row: MappingRow) => ReactNode
  addLabel: string
  nextId: () => string
}) {
  return (
    <div className="space-y-2">
      {rows.map((row) => (
        <div key={row.id} className="flex items-center gap-2">
          {render(row)}
          <button
            type="button"
            onClick={() =>
              setRows((current) => current.filter((entry) => entry.id !== row.id))
            }
            className="rounded p-1.5 text-fg-subtle hover:bg-danger-subtle hover:text-danger"
            title="Remove row"
            aria-label="Remove row"
          >
            <Trash2 size={14} />
          </button>
        </div>
      ))}
      <button
        type="button"
        onClick={() =>
          setRows((current) => [
            ...current,
            { id: nextId(), name: '', value: '' },
          ])
        }
        className="inline-flex items-center gap-1 text-sm font-medium text-primary hover:text-primary/80"
      >
        <Plus size={14} /> {addLabel}
      </button>
    </div>
  )
}

function TokenPanel({
  trigger,
  onInsert,
  copy,
}: {
  trigger?: TriggerDefinition
  onInsert: (token: string) => void
  copy: IntegrationBuilderCopy
}) {
  if (!trigger)
    return (
      <aside className="rounded-lg border border-dashed border-border p-3 text-xs text-fg-muted">
        {copy.noTrigger}
      </aside>
    )
  return (
    <aside className="space-y-2 rounded-lg border border-border bg-surface-hover p-3">
      <p className="text-xs font-semibold text-fg">{copy.tokenTitle}</p>
      <p className="text-[11px] text-fg-muted">{copy.tokenHelp}</p>
      <div className="flex flex-wrap gap-1.5">
        {trigger.fields.map((field: FieldDefinition) => (
          <button
            key={field.key}
            type="button"
            onClick={() => onInsert(field.key)}
            title={`{{${field.key}}}`}
            className="rounded-md border border-border bg-surface px-2 py-1 text-[11px] text-fg-muted hover:border-primary/40 hover:text-primary"
          >
            {field.label}
          </button>
        ))}
      </div>
      {trigger.dynamicFieldsNote ? (
        <p className="text-[11px] text-fg-muted">{trigger.dynamicFieldsNote}</p>
      ) : null}
    </aside>
  )
}

function Section({
  step,
  title,
  subtitle,
  children,
}: {
  step: number
  title: string
  subtitle: string
  children: ReactNode
}) {
  return (
    <section className="space-y-3">
      <div className="flex items-center gap-2">
        <span className="grid size-6 place-items-center rounded-full bg-primary text-xs font-semibold text-primary-fg">
          {step}
        </span>
        <div>
          <h3 className="text-sm font-semibold text-fg">{title}</h3>
          <p className="text-xs text-fg-muted">{subtitle}</p>
        </div>
      </div>
      <div className="pl-8">{children}</div>
    </section>
  )
}

function Field({
  label,
  required,
  help,
  children,
}: {
  label: string
  required?: boolean
  help?: string
  children: ReactNode
}) {
  return (
    <div className="space-y-1.5">
      <Label>
        {label}
        {required ? <span className="text-danger"> *</span> : null}
      </Label>
      {children}
      {help ? <p className="text-xs text-fg-muted">{help}</p> : null}
    </div>
  )
}

function FieldInput({
  field,
  value,
  onFocus,
}: {
  field: ConfigField
  value: unknown
  onFocus: (event: FocusEvent<HTMLInputElement | HTMLTextAreaElement>) => void
}) {
  const stringValue = value == null ? '' : String(value)
  return (
    <div className={cn('space-y-1.5', field.type === 'textarea' && 'sm:col-span-2')}>
      <Label htmlFor={field.key}>
        {field.label}
        {field.required ? <span className="text-danger"> *</span> : null}
      </Label>
      {field.type === 'textarea' ? (
        <Textarea
          id={field.key}
          name={field.key}
          rows={4}
          defaultValue={stringValue}
          placeholder={field.placeholder}
          className="font-mono text-xs"
          onFocus={onFocus}
        />
      ) : field.type === 'select' ? (
        <Select id={field.key} name={field.key} defaultValue={stringValue}>
          {(field.options ?? []).map((option) => (
            <option key={option.value} value={option.value}>
              {option.label}
            </option>
          ))}
        </Select>
      ) : field.type === 'boolean' ? (
        <div className="pt-1">
          <input
            type="checkbox"
            name={field.key}
            defaultChecked={value === true || value === 'true'}
            className="size-4 rounded border-border text-primary focus:ring-primary"
          />
        </div>
      ) : (
        <Input
          id={field.key}
          name={field.key}
          type={field.type === 'number' ? 'number' : 'text'}
          defaultValue={stringValue}
          placeholder={field.placeholder}
          onFocus={onFocus}
        />
      )}
      {field.help ? <p className="text-xs text-fg-muted">{field.help}</p> : null}
    </div>
  )
}

function Check({
  name,
  defaultChecked,
  label,
}: {
  name: string
  defaultChecked: boolean
  label: string
}) {
  return (
    <label className="flex items-center gap-2">
      <input
        type="checkbox"
        name={name}
        defaultChecked={defaultChecked}
        className="size-4 rounded border-border text-primary focus:ring-primary"
      />
      <span className="text-sm font-medium text-fg">{label}</span>
    </label>
  )
}
