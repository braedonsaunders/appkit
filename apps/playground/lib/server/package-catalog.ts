import ai from '../../../../packages/ai/package.json'
import analytics from '../../../../packages/analytics/package.json'
import api from '../../../../packages/api/package.json'
import apps from '../../../../packages/apps/package.json'
import auth from '../../../../packages/auth/package.json'
import createAppkit from '../../../../packages/create-appkit/package.json'
import crypto from '../../../../packages/crypto/package.json'
import customization from '../../../../packages/customization/package.json'
import dashboard from '../../../../packages/dashboard/package.json'
import db from '../../../../packages/db/package.json'
import designStudio from '../../../../packages/design-studio/package.json'
import editor from '../../../../packages/editor/package.json'
import emailRender from '../../../../packages/email-render/package.json'
import emails from '../../../../packages/emails/package.json'
import endpoints from '../../../../packages/endpoints/package.json'
import events from '../../../../packages/events/package.json'
import forms from '../../../../packages/forms/package.json'
import formsCore from '../../../../packages/forms-core/package.json'
import formsDocuments from '../../../../packages/forms-documents/package.json'
import formsPdf from '../../../../packages/forms-pdf/package.json'
import i18n from '../../../../packages/i18n/package.json'
import iam from '../../../../packages/iam/package.json'
import integrations from '../../../../packages/integrations/package.json'
import jobs from '../../../../packages/jobs/package.json'
import notifications from '../../../../packages/notifications/package.json'
import pdf from '../../../../packages/pdf/package.json'
import reports from '../../../../packages/reports/package.json'
import sandbox from '../../../../packages/sandbox/package.json'
import scripts from '../../../../packages/scripts/package.json'
import sms from '../../../../packages/sms/package.json'
import storage from '../../../../packages/storage/package.json'
import sync from '../../../../packages/sync/package.json'
import tenant from '../../../../packages/tenant/package.json'
import tokens from '../../../../packages/tokens/package.json'
import ui from '../../../../packages/ui/package.json'
import workflows from '../../../../packages/workflows/package.json'

type ManifestValue = string | boolean | number | null | ManifestValue[] | { [key: string]: ManifestValue }

interface WorkspacePackageManifest {
  name: string
  version: string
  description?: string
  license?: string
  keywords?: string[]
  homepage?: string
  repository?: string | { type?: string; url?: string; directory?: string }
  engines?: Record<string, string>
  exports?: string | Record<string, ManifestValue>
  dependencies?: Record<string, string>
  peerDependencies?: Record<string, string>
  peerDependenciesMeta?: Record<string, { optional?: boolean }>
}

export interface PackageCatalogItem {
  name: string
  slug: string
  version: string
  description: string
  license?: string
  keywords: string[]
  homepage?: string
  repositoryUrl?: string
  repositoryDirectory?: string
  engines: Record<string, string>
  exports: { path: string; target: string }[]
  dependencies: Record<string, string>
  peerDependencies: Record<string, string>
  optionalPeers: string[]
  category: PackageCategoryKey
  demoHref?: string
}

export type PackageCategoryKey = 'foundation' | 'product' | 'platform' | 'extensions'

export const PACKAGE_CATEGORIES: readonly {
  key: PackageCategoryKey
  label: string
  description: string
  names: readonly string[]
}[] = [
  {
    key: 'foundation',
    label: 'Foundation',
    description: 'Scaffolding, tokens, interface primitives, localization, and rich text.',
    names: ['create-appkit', '@appkit/tokens', '@appkit/ui', '@appkit/i18n', '@appkit/editor'],
  },
  {
    key: 'product',
    label: 'Product building',
    description: 'Dashboards, records, forms, documents, reports, and design tools.',
    names: [
      '@appkit/analytics', '@appkit/dashboard', '@appkit/customization', '@appkit/forms-core',
      '@appkit/forms', '@appkit/forms-documents', '@appkit/forms-pdf', '@appkit/reports',
      '@appkit/pdf', '@appkit/design-studio',
    ],
  },
  {
    key: 'platform',
    label: 'Application platform',
    description: 'Data, identity, authorization, events, jobs, storage, and communications.',
    names: [
      '@appkit/db', '@appkit/tenant', '@appkit/auth', '@appkit/iam', '@appkit/api',
      '@appkit/events', '@appkit/jobs', '@appkit/notifications', '@appkit/storage',
      '@appkit/crypto', '@appkit/email-render', '@appkit/emails', '@appkit/sms',
    ],
  },
  {
    key: 'extensions',
    label: 'Automation and extensions',
    description: 'AI, governed code, installable apps, workflows, integrations, and sync.',
    names: [
      '@appkit/ai', '@appkit/sandbox', '@appkit/endpoints', '@appkit/scripts', '@appkit/apps',
      '@appkit/workflows', '@appkit/integrations', '@appkit/sync',
    ],
  },
]

const MANIFESTS: WorkspacePackageManifest[] = [
  ai,
  analytics,
  api,
  apps,
  auth,
  createAppkit,
  crypto,
  customization,
  dashboard,
  db,
  designStudio,
  editor,
  emailRender,
  emails,
  endpoints,
  events,
  forms,
  formsCore,
  formsDocuments,
  formsPdf,
  i18n,
  iam,
  integrations,
  jobs,
  notifications,
  pdf,
  reports,
  sandbox,
  scripts,
  sms,
  storage,
  sync,
  tenant,
  tokens,
  ui,
  workflows,
]

const DEMO_ROUTES: Record<string, string> = {
  'create-appkit': '/dashboard/platform',
  '@appkit/tokens': '/components',
  '@appkit/ui': '/components',
  '@appkit/analytics': '/insights',
  '@appkit/dashboard': '/dashboard',
  '@appkit/customization': '/customization',
  '@appkit/forms-core': '/forms/core',
  '@appkit/forms': '/forms',
  '@appkit/forms-pdf': '/forms',
  '@appkit/reports': '/reports',
  '@appkit/pdf': '/reports',
  '@appkit/design-studio': '/design-studio',
  '@appkit/iam': '/admin/roles',
  '@appkit/api': '/api-docs',
  '@appkit/events': '/admin/audit',
  '@appkit/notifications': '/notifications',
  '@appkit/storage': '/attachments',
  '@appkit/apps': '/admin/apps',
  '@appkit/scripts': '/admin/scripts',
  '@appkit/workflows': '/workflows',
  '@appkit/integrations': '/admin/integrations',
  '@appkit/sync': '/admin/integrations',
}

const categoryByName = new Map(
  PACKAGE_CATEGORIES.flatMap((category) => category.names.map((name) => [name, category.key] as const)),
)

export const PACKAGE_CATALOG: readonly PackageCatalogItem[] = MANIFESTS.map((manifest) => {
  const category = categoryByName.get(manifest.name)
  if (!category) throw new Error(`Package category missing for ${manifest.name}`)
  return {
    name: manifest.name,
    slug: manifest.name.replace(/^@appkit\//, ''),
    version: manifest.version,
    description: manifest.description ?? 'No package description is defined.',
    license: manifest.license,
    keywords: manifest.keywords ?? [],
    homepage: manifest.homepage,
    repositoryUrl: repositoryUrl(manifest.repository),
    repositoryDirectory: typeof manifest.repository === 'object' ? manifest.repository.directory : undefined,
    engines: manifest.engines ?? {},
    exports: normalizeExports(manifest.exports),
    dependencies: manifest.dependencies ?? {},
    peerDependencies: manifest.peerDependencies ?? {},
    optionalPeers: Object.entries(manifest.peerDependenciesMeta ?? {})
      .filter(([, meta]) => meta.optional)
      .map(([name]) => name),
    category,
    demoHref: DEMO_ROUTES[manifest.name],
  }
}).sort((left, right) => {
  const categoryOrder = PACKAGE_CATEGORIES.findIndex((category) => category.key === left.category)
    - PACKAGE_CATEGORIES.findIndex((category) => category.key === right.category)
  return categoryOrder || left.name.localeCompare(right.name)
})

export function getPackage(slug: string): PackageCatalogItem | undefined {
  return PACKAGE_CATALOG.find((item) => item.slug === slug)
}

function normalizeExports(exportsValue: WorkspacePackageManifest['exports']): { path: string; target: string }[] {
  if (!exportsValue) return []
  if (typeof exportsValue === 'string') return [{ path: '.', target: exportsValue }]
  return Object.entries(exportsValue).map(([path, target]) => ({
    path,
    target: typeof target === 'string' ? target : summarizeExportTarget(target),
  }))
}

function summarizeExportTarget(target: ManifestValue): string {
  if (typeof target === 'string') return target
  if (!target || typeof target !== 'object' || Array.isArray(target)) return 'conditional export'
  const preferred = ['import', 'default', 'types']
    .map((key) => target[key])
    .find((value): value is string => typeof value === 'string')
  return preferred ?? 'conditional export'
}

function repositoryUrl(repository: WorkspacePackageManifest['repository']): string | undefined {
  const raw = typeof repository === 'string' ? repository : repository?.url
  return raw?.replace(/^git\+/, '').replace(/\.git$/, '')
}
