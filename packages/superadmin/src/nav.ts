/**
 * Installation-operator console catalog. Apps compose a /platform workspace
 * from these modules instead of hard-coding a sidebar and hub in every product.
 * Framework-agnostic: pass the current pathname in; do not import a router.
 */

export const PLATFORM_MODULE_IDS = [
  'overview',
  'tenants',
  'createTenant',
  'users',
  'email',
  'sms',
  'ai',
  'feedback',
  'emailLog',
  'smsLog',
  'database',
] as const

export type PlatformModuleId = (typeof PLATFORM_MODULE_IDS)[number]

export type PlatformNavItem = {
  href: string
  label: string
  iconKey: string
  exact?: boolean
}

export type PlatformNavGroup = {
  id: string
  label: string
  iconKey: string
  groupHref?: string
  items: PlatformNavItem[]
}

export type PlatformHubTile = {
  id: string
  href: string
  title: string
  description: string
  iconKey: string
  stat?: string
  detail?: string
}

export type PlatformModuleDefinition = {
  id: string
  href: string
  label: string
  description: string
  iconKey: string
  exact?: boolean
  /** When false, the module is in the sidebar but omitted from the hub. */
  hub?: boolean
}

type CatalogEntry = Omit<PlatformModuleDefinition, 'href'> & { path: string }

export const DEFAULT_PLATFORM_MODULE_CATALOG: Record<PlatformModuleId, CatalogEntry> = {
  overview: {
    id: 'overview',
    path: '',
    label: 'Overview',
    description: 'Deployment-wide tools that sit above every workspace.',
    iconKey: 'grid',
    exact: true,
    hub: false,
  },
  tenants: {
    id: 'tenants',
    path: '/tenants',
    label: 'Tenants',
    description: 'List, provision, and open every workspace.',
    iconKey: 'building',
    exact: true,
  },
  createTenant: {
    id: 'createTenant',
    path: '/tenants/new',
    label: 'Create tenant',
    description: 'Provision a new workspace.',
    iconKey: 'plus',
  },
  users: {
    id: 'users',
    path: '/users',
    label: 'Users',
    description: 'Global identities and cross-workspace membership.',
    iconKey: 'users',
  },
  email: {
    id: 'email',
    path: '/email',
    label: 'Platform email',
    description: 'Global default provider and tenant policy.',
    iconKey: 'mail',
  },
  sms: {
    id: 'sms',
    path: '/sms',
    label: 'SMS provider',
    description: 'Global default provider and tenant policy.',
    iconKey: 'message',
  },
  ai: {
    id: 'ai',
    path: '/ai',
    label: 'AI provider',
    description: 'Global default provider and tenant policy.',
    iconKey: 'sparkles',
  },
  feedback: {
    id: 'feedback',
    path: '/feedback',
    label: 'Issue reporting',
    description: 'In-app product reports to the tracker.',
    iconKey: 'circle-dot',
  },
  emailLog: {
    id: 'emailLog',
    path: '/email-log',
    label: 'Email log',
    description: 'Every email dispatched, across all workspaces.',
    iconKey: 'scroll',
  },
  smsLog: {
    id: 'smsLog',
    path: '/sms-log',
    label: 'SMS log',
    description: 'Every text dispatched, across all workspaces.',
    iconKey: 'scroll',
  },
  database: {
    id: 'database',
    path: '/database',
    label: 'Database maintenance',
    description: 'Retention windows and planner upkeep.',
    iconKey: 'database',
  },
}

export type CreatePlatformNavOptions = {
  basePath?: string
  modules?: Array<PlatformModuleId | PlatformModuleDefinition>
  extras?: PlatformModuleDefinition[]
  labels?: Partial<Record<PlatformModuleId | 'group' | 'workspace', string>>
  descriptions?: Partial<Record<PlatformModuleId, string>>
  groupLabel?: string
  workspaceHref?: string
  workspaceLabel?: string
}

export type PlatformNavResult = {
  basePath: string
  modules: PlatformModuleDefinition[]
  groups: PlatformNavGroup[]
  tiles: PlatformHubTile[]
}

function hrefFor(basePath: string, path: string): string {
  if (!path) return basePath
  return `${basePath.replace(/\/$/, '')}${path}`
}

function resolveModule(
  item: PlatformModuleId | PlatformModuleDefinition,
  options: CreatePlatformNavOptions,
  basePath: string,
): PlatformModuleDefinition {
  if (typeof item !== 'string') return item
  const catalog = DEFAULT_PLATFORM_MODULE_CATALOG[item]
  return {
    ...catalog,
    href: hrefFor(basePath, catalog.path),
    label: options.labels?.[item] ?? catalog.label,
    description: options.descriptions?.[item] ?? catalog.description,
  }
}

/** Build the operator sidebar and hub tiles from an explicit module list. */
export function createPlatformNav(options: CreatePlatformNavOptions = {}): PlatformNavResult {
  const basePath = options.basePath ?? '/platform'
  const requested = options.modules ?? [...PLATFORM_MODULE_IDS]
  const modules = [
    ...requested.map((item) => resolveModule(item, options, basePath)),
    ...(options.extras ?? []),
  ]
  const items: PlatformNavItem[] = modules.map((module) => ({
    href: module.href,
    label: module.label,
    iconKey: module.iconKey,
    exact: module.exact,
  }))
  if (options.workspaceHref) {
    items.push({
      href: options.workspaceHref,
      label: options.workspaceLabel ?? options.labels?.workspace ?? 'Workspace',
      iconKey: 'chevron-right',
      exact: true,
    })
  }
  const groups: PlatformNavGroup[] = [
    {
      id: 'platform',
      label: options.groupLabel ?? options.labels?.group ?? 'Platform',
      iconKey: 'shield',
      groupHref: basePath,
      items,
    },
  ]
  const tiles: PlatformHubTile[] = modules
    .filter((module) => module.hub !== false && module.id !== 'overview')
    .map((module) => ({
      id: module.id,
      href: module.href,
      title: module.label,
      description: module.description,
      iconKey: module.iconKey,
    }))
  return { basePath, modules, groups, tiles }
}

export function isPlatformPath(pathname: string, basePath = '/platform'): boolean {
  const root = basePath.replace(/\/$/, '') || '/platform'
  return pathname === root || pathname.startsWith(`${root}/`)
}

/** Replace tenant nav with the operator console while the path is under /platform. */
export function selectPlatformNav<T>(
  pathname: string,
  tenantGroups: T[],
  platformGroups: T[],
  basePath = '/platform',
): T[] {
  return isPlatformPath(pathname, basePath) ? platformGroups : tenantGroups
}
