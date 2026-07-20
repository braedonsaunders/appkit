import Link from 'next/link'
import { ArrowRight, Boxes, Braces, CheckCircle2, Workflow, XCircle } from 'lucide-react'
import {
  FIELD_TYPES,
  formSchemaV1Schema,
  validateResponse,
  type FieldTypeMeta,
} from '@appkit/forms-core'
import {
  Badge,
  Button,
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
  CodeBlock,
  PageContainer,
  PageHeader,
} from '@appkit/ui'
import { SUPPLIER_QUALIFICATION_SCHEMA } from '../../../../lib/forms/example-schema'

export const metadata = { title: 'Form engine — appkit' }

const CATEGORY_LABELS: Record<FieldTypeMeta['category'], string> = {
  standard: 'Standard',
  choice: 'Choice',
  scoring: 'Scoring',
  picker: 'Pickers',
  media: 'Media',
  identity: 'Identity',
  computed: 'Computed',
  data: 'Data',
  display: 'Display',
}

const fieldTypes = Object.values(FIELD_TYPES)
const fieldsByCategory = fieldTypes.reduce<Partial<Record<FieldTypeMeta['category'], FieldTypeMeta[]>>>(
  (groups, field) => {
    const categoryFields = groups[field.category] ?? []
    categoryFields.push(field)
    groups[field.category] = categoryFields
    return groups
  },
  {},
)
const fieldCategories = Object.entries(fieldsByCategory) as [FieldTypeMeta['category'], FieldTypeMeta[]][]

const schemaResult = formSchemaV1Schema.safeParse(SUPPLIER_QUALIFICATION_SCHEMA)
const responseSample = {
  company_name: '',
  contact_email: 'not-an-email',
  expected_spend: -25,
  risk_tier: 'critical',
  unknown_field: true,
}
const responseErrors = validateResponse(SUPPLIER_QUALIFICATION_SCHEMA, responseSample, 'submit')

export default function FormsCorePage() {
  return (
    <PageContainer className="space-y-6">
      <PageHeader
        title="Form engine"
        description="Schemas, field types, validation, scoring, rules, and automation without a UI dependency."
        back={{ href: '/dashboard/platform', label: 'Platform' }}
        actions={
          <Button asChild>
            <Link href="/forms">Open form designer <ArrowRight size={15} /></Link>
          </Button>
        }
      />

      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <Metric label="Field types" value={fieldTypes.length} icon={<Boxes />} />
        <Metric label="Field categories" value={fieldCategories.length} icon={<Braces />} />
        <Metric label="Automation models" value={2} icon={<Workflow />} />
        <Metric label="Shared rule language" value={1} icon={<Workflow />} />
      </div>

      <div className="grid gap-4 xl:grid-cols-2">
        <Card>
          <CardHeader>
            <div className="flex items-start justify-between gap-3">
              <div>
                <CardTitle>Schema validation</CardTitle>
                <CardDescription>The supplier form is parsed by the runtime schema used by the designer and submission flow.</CardDescription>
              </div>
              <Badge variant={schemaResult.success ? 'success' : 'destructive'}>
                {schemaResult.success ? <CheckCircle2 size={12} /> : <XCircle size={12} />}
                {schemaResult.success ? 'Valid schema' : 'Invalid schema'}
              </Badge>
            </div>
          </CardHeader>
          <CardContent>
            <CodeBlock
              className="[&_pre]:max-h-[28rem] [&_pre]:overflow-auto"
              code={JSON.stringify(SUPPLIER_QUALIFICATION_SCHEMA, null, 2)}
            />
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <div className="flex items-start justify-between gap-3">
              <div>
                <CardTitle>Response validation</CardTitle>
                <CardDescription>Required fields, value types, choices, formats, and unknown keys are checked together.</CardDescription>
              </div>
              <Badge variant="warning">{responseErrors.length} issues</Badge>
            </div>
          </CardHeader>
          <CardContent className="space-y-4">
            <CodeBlock code={JSON.stringify(responseSample, null, 2)} />
            <div className="overflow-hidden rounded-lg border border-border">
              {responseErrors.map((error) => (
                <div key={`${error.sectionId ?? ''}:${error.fieldId}:${error.message}`} className="flex items-start gap-3 border-b border-border-subtle px-3 py-2.5 last:border-b-0">
                  <XCircle className="mt-0.5 size-4 shrink-0 text-danger" />
                  <div className="min-w-0">
                    <div className="font-mono text-xs text-fg">{error.fieldId}</div>
                    <div className="text-sm text-fg-muted">{error.message}</div>
                  </div>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <CardTitle>Workflow-ready records</CardTitle>
              <CardDescription>Use the automation model that matches how the record behaves.</CardDescription>
            </div>
            <Button asChild variant="outline" size="sm">
              <Link href="/workflows">Open workflow studio <ArrowRight size={14} /></Link>
            </Button>
          </div>
        </CardHeader>
        <CardContent className="grid gap-5 lg:grid-cols-2">
          <AutomationModel
            title="Form workflows"
            description="For inspections, requests, checklists, assessments, and other submitted forms."
            capabilities={[
              'React to submissions, field rules, status changes, schedules, and missed check-ins.',
              'Notify teams, create follow-up records, update responses, call webhooks, and generate files.',
              'Route human approvals through the same conditions used by the form designer.',
            ]}
            example={['Form submitted', 'Score below threshold', 'Approval', 'Create follow-up and notify']}
          />
          <AutomationModel
            title="Transactional workflows"
            description="For records with controlled lifecycle transitions such as orders, invoices, and journals."
            capabilities={[
              'React before or after creation, editing, submission, posting, voiding, and status changes.',
              'Send messages, update fields and statuses, post records, and enforce persistent record locks.',
              'Pause for approval and resume the correct branch exactly once after a decision.',
            ]}
            example={['Record submitted', 'Amount over limit', 'Approval', 'Post and lock record']}
          />
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Field vocabulary</CardTitle>
          <CardDescription>Every field declares its category, stored value shape, and scoring behavior.</CardDescription>
        </CardHeader>
        <CardContent className="grid gap-5 md:grid-cols-2 xl:grid-cols-3">
          {fieldCategories.map(([category, fields]) => (
            <section key={category}>
              <div className="mb-2 flex items-center justify-between gap-2">
                <h2 className="text-sm font-semibold text-fg">{CATEGORY_LABELS[category]}</h2>
                <Badge variant="secondary">{fields.length}</Badge>
              </div>
              <div className="space-y-1.5">
                {fields.map((field) => (
                  <div key={field.type} className="flex items-center justify-between gap-3 rounded-md border border-border px-3 py-2">
                    <div className="min-w-0">
                      <div className="truncate text-sm font-medium text-fg">{field.label}</div>
                      <div className="truncate text-xs text-fg-muted">{field.description}</div>
                    </div>
                    <Badge variant={field.scoring ? 'warning' : 'secondary'} className="shrink-0 font-mono text-[10px]">
                      {field.valueKind}
                    </Badge>
                  </div>
                ))}
              </div>
            </section>
          ))}
        </CardContent>
      </Card>
    </PageContainer>
  )
}

function Metric({ label, value, icon }: { label: string; value: number; icon: React.ReactNode }) {
  return (
    <Card>
      <CardContent className="flex items-center gap-3 p-4">
        <span className="grid size-9 place-items-center rounded-lg bg-primary-subtle text-primary [&_svg]:size-4">{icon}</span>
        <div>
          <div className="text-2xl font-semibold tabular-nums text-fg">{value}</div>
          <div className="text-xs text-fg-muted">{label}</div>
        </div>
      </CardContent>
    </Card>
  )
}

function AutomationModel({
  title,
  description,
  capabilities,
  example,
}: {
  title: string
  description: string
  capabilities: readonly string[]
  example: readonly string[]
}) {
  return (
    <section className="flex flex-col rounded-lg border border-border bg-surface p-4">
      <div>
        <h2 className="font-semibold text-fg">{title}</h2>
        <p className="mt-1 text-sm text-fg-muted">{description}</p>
      </div>
      <ul className="mt-4 space-y-2">
        {capabilities.map((capability) => (
          <li key={capability} className="flex gap-2 text-sm text-fg-muted">
            <CheckCircle2 className="mt-0.5 size-4 shrink-0 text-success" />
            <span>{capability}</span>
          </li>
        ))}
      </ul>
      <div className="mt-5 border-t border-border-subtle pt-4">
        <div className="mb-2 text-xs font-medium tracking-wide text-fg-muted uppercase">Example</div>
        <div className="flex flex-wrap items-center gap-1.5">
          {example.map((step, index) => (
            <div key={step} className="flex items-center gap-1.5">
              <Badge variant={index === 2 ? 'warning' : 'secondary'}>{step}</Badge>
              {index < example.length - 1 ? <ArrowRight className="size-3.5 text-fg-subtle" /> : null}
            </div>
          ))}
        </div>
      </div>
    </section>
  )
}
