'use client'

import * as React from 'react'
import {
  Activity,
  AlertTriangle,
  Award,
  BellRing,
  BookOpen,
  Building2,
  CheckCircle2,
  ChevronRight,
  CircleHelp,
  CircleUser,
  ClipboardCheck,
  ClipboardList,
  Code2,
  Construction,
  Database,
  Download,
  FileText,
  Folder,
  Gauge,
  GraduationCap,
  HardHat,
  HeartPulse,
  History,
  KeyRound,
  Layers,
  LayoutGrid,
  LibraryBig,
  Link2,
  ListChecks,
  Mail,
  MapPin,
  MessageSquare,
  NotebookPen,
  Package,
  PanelLeft,
  Plus,
  QrCode,
  Radiation,
  Rss,
  ScrollText,
  Settings,
  ShieldCheck,
  Sparkles,
  Star,
  Tag,
  Target,
  Timer,
  TrendingUp,
  Truck,
  Upload,
  Users,
  Wallet,
  Workflow,
  Wrench,
  type LucideIcon,
} from 'lucide-react'
import { Popover } from './popover'
import type { LinkRender } from './settings-layout'
import { cn } from './utils'

// This is the union of the production OpenBooks and BeaconHS icon registries.
// String keys remain serializable across an RSC boundary; `icon` keeps the
// primitive compatible with callers that already pass a React node.
const ICONS: Record<string, LucideIcon> = {
  activity: Activity,
  alert: AlertTriangle,
  award: Award,
  bell: BellRing,
  book: BookOpen,
  building: Building2,
  check: CheckCircle2,
  'circle-help': CircleHelp,
  'circle-user': CircleUser,
  'clipboard-check': ClipboardCheck,
  clipboard: ClipboardList,
  code: Code2,
  construction: Construction,
  database: Database,
  download: Download,
  file: FileText,
  folder: Folder,
  gauge: Gauge,
  grad: GraduationCap,
  grid: LayoutGrid,
  'hard-hat': HardHat,
  'heart-pulse': HeartPulse,
  history: History,
  journal: NotebookPen,
  key: KeyRound,
  layers: Layers,
  library: LibraryBig,
  link: Link2,
  'list-checks': ListChecks,
  mail: Mail,
  message: MessageSquare,
  package: Package,
  'panel-left': PanelLeft,
  pin: MapPin,
  plus: Plus,
  'qr-code': QrCode,
  radiation: Radiation,
  rss: Rss,
  scroll: ScrollText,
  settings: Settings,
  shield: ShieldCheck,
  sparkles: Sparkles,
  star: Star,
  tag: Tag,
  target: Target,
  timer: Timer,
  'trending-up': TrendingUp,
  truck: Truck,
  upload: Upload,
  users: Users,
  wallet: Wallet,
  workflow: Workflow,
  wrench: Wrench,
}

export type SidebarNavItem = {
  href: string
  label: string
  /** Built-in message key. Omitted for tenant-authored/custom labels. */
  labelKey?: string
  iconKey?: keyof typeof ICONS | string
  icon?: React.ReactNode
  exact?: boolean
  subgroup?: string
  subgroupHref?: string
  subgroupIconKey?: string
  mobile?: boolean
}

export type SidebarNavGroup = {
  /** OpenBooks workspace id. Optional for the BeaconHS grouped-list contract. */
  id?: string
  label: string
  labelKey?: string
  iconKey?: string
  icon?: React.ReactNode
  items: SidebarNavItem[]
}

const EXPANDED_STORAGE_KEY = 'appkit.nav.expanded-workspaces'

export function findActiveNavHref(
  pathname: string | null | undefined,
  groups: SidebarNavGroup[],
): string | null {
  if (!pathname) return null
  let activeHref: string | null = null

  const consider = (href: string, exact?: boolean) => {
    if (!matchesNavPath(pathname, href, exact)) return
    if (!activeHref || href.length > activeHref.length) activeHref = href
  }

  for (const group of groups) {
    for (const item of group.items) {
      consider(item.href, item.exact)
      if (item.subgroupHref) consider(item.subgroupHref)
    }
  }
  return activeHref
}

function matchesNavPath(pathname: string, href: string, exact?: boolean): boolean {
  if (pathname === href) return true
  if (exact || href === '/') return false
  return pathname.startsWith(`${href}/`)
}

const defaultLink: LinkRender = ({
  href,
  children,
  className,
  title,
  ariaCurrent,
  role,
  dataWalkthrough,
}) => (
  <a
    href={href}
    className={className}
    title={title}
    aria-current={ariaCurrent}
    role={role}
    data-walkthrough={dataWalkthrough}
  >
    {children}
  </a>
)

/**
 * The shared OpenBooks/BeaconHS navigation registry rendered as a desktop
 * sidebar. OpenBooks workspace metadata (`id` + group icon) enables its
 * collapsible workspace treatment; the simpler BeaconHS registry retains its
 * labeled sections. Both use the same active-path, icon, and link contracts.
 */
export function SidebarNav({
  groups,
  pathname,
  collapsed = false,
  linkRender = defaultLink,
}: {
  groups: SidebarNavGroup[]
  pathname: string
  collapsed?: boolean
  linkRender?: LinkRender
}) {
  const activeHref = findActiveNavHref(pathname, groups)
  const workspaceMode = groups.some((group) => group.id || group.iconKey || group.icon)
  const activeGroupId = groupKey(
    groups.find((group) => groupContainsActiveHref(group, activeHref)),
    groups,
  )
  const navRef = React.useRef<HTMLElement>(null)
  const [openGroupIds, setOpenGroupIds] = React.useState<Set<string>>(
    () => new Set([groupKey(groups[0], groups), activeGroupId].filter(Boolean)),
  )
  const openGroupKey = React.useMemo(() => [...openGroupIds].sort().join('|'), [openGroupIds])

  React.useEffect(() => {
    if (!workspaceMode) return
    try {
      const raw = localStorage.getItem(EXPANDED_STORAGE_KEY)
      if (raw === null) return
      const saved: unknown = JSON.parse(raw)
      if (!Array.isArray(saved)) return
      const valid = saved.filter(
        (id): id is string =>
          typeof id === 'string' && groups.some((group) => groupKey(group, groups) === id),
      )
      setOpenGroupIds(new Set([...valid, activeGroupId].filter(Boolean)))
    } catch {
      // Storage is an enhancement; Home + active workspace remain open.
    }
  }, [activeGroupId, groups, workspaceMode])

  React.useEffect(() => {
    if (!workspaceMode || !activeGroupId) return
    setOpenGroupIds((current) => {
      if (current.has(activeGroupId)) return current
      const next = new Set(current).add(activeGroupId)
      persistExpandedGroups(next)
      return next
    })
  }, [activeGroupId, workspaceMode])

  React.useEffect(() => {
    if (collapsed) return
    const frame = window.requestAnimationFrame(() => {
      navRef.current?.querySelector<HTMLElement>('[aria-current="page"]')?.scrollIntoView({ block: 'nearest' })
    })
    return () => window.cancelAnimationFrame(frame)
  }, [collapsed, openGroupKey, pathname])

  function toggleGroup(id: string) {
    setOpenGroupIds((current) => {
      const next = new Set(current)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      persistExpandedGroups(next)
      return next
    })
  }

  if (!workspaceMode) {
    return (
      <nav ref={navRef} className="app-scroll flex-1 overflow-y-auto px-2 py-3">
        {groups.map((group, groupIndex) => (
          <div key={`${group.label}-${groupIndex}`} className="mb-3">
            {collapsed ? (
              <div className="mx-2 mb-1 border-t border-border-subtle" aria-hidden />
            ) : (
              <div className="px-2 pb-1 text-[10px] font-semibold tracking-wider text-fg-subtle uppercase">
                {group.label}
              </div>
            )}
            {group.items.map((item) => (
              <NavLink
                key={item.href}
                item={item}
                active={activeHref === item.href}
                collapsed={collapsed}
                linkRender={linkRender}
              />
            ))}
          </div>
        ))}
      </nav>
    )
  }

  return (
    <nav ref={navRef} className={cn('app-scroll flex-1 overflow-y-auto px-2 py-3', collapsed && 'space-y-1')}>
      {collapsed
        ? groups.map((group, groupIndex) => (
            <CollapsedWorkspace
              key={groupKey(group, groups) || groupIndex}
              group={group}
              activeHref={activeHref}
              active={groupKey(group, groups) === activeGroupId}
              linkRender={linkRender}
            />
          ))
        : groups.map((group, groupIndex) => {
            const id = groupKey(group, groups) || String(groupIndex)
            const open = openGroupIds.has(id)
            const active = id === activeGroupId
            const panelId = `nav-workspace-${id.replace(/[^a-zA-Z0-9_-]/g, '-')}`
            return (
              <section key={id} className="mb-1">
                <button
                  type="button"
                  aria-expanded={open}
                  aria-controls={panelId}
                  onClick={() => toggleGroup(id)}
                  className={cn(
                    'group flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-xs font-semibold tracking-wide transition-colors',
                    active
                      ? 'bg-primary-subtle text-primary'
                      : 'text-fg-muted hover:bg-surface-hover hover:text-fg',
                    'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/40',
                  )}
                >
                  <NavIcon iconKey={group.iconKey} icon={group.icon} size={14} className="shrink-0" />
                  <span className="min-w-0 flex-1 truncate text-left uppercase">{group.label}</span>
                  <ChevronRight
                    size={13}
                    className={cn('shrink-0 opacity-60 transition-transform duration-150', open && 'rotate-90')}
                  />
                </button>
                {open ? (
                  <div id={panelId} className="mt-0.5 space-y-0.5">
                    <WorkspaceItems items={group.items} activeHref={activeHref} linkRender={linkRender} />
                  </div>
                ) : null}
              </section>
            )
          })}
    </nav>
  )
}

function groupKey(group: SidebarNavGroup | undefined, groups: SidebarNavGroup[]): string {
  if (!group) return ''
  return group.id || `${group.label}-${groups.indexOf(group)}`
}

export function groupContainsActiveHref(group: SidebarNavGroup, activeHref: string | null): boolean {
  return group.items.some((item) => item.href === activeHref || item.subgroupHref === activeHref)
}

function persistExpandedGroups(ids: Set<string>) {
  try {
    localStorage.setItem(EXPANDED_STORAGE_KEY, JSON.stringify([...ids]))
  } catch {
    // Navigation remains functional when storage is unavailable.
  }
}

function WorkspaceItems({
  items,
  activeHref,
  linkRender,
}: {
  items: SidebarNavItem[]
  activeHref: string | null
  linkRender: LinkRender
}) {
  return toBlocks(items).map((block, blockIndex) =>
    block.kind === 'item' ? (
      <NavLink
        key={block.item.href}
        item={block.item}
        active={activeHref === block.item.href}
        linkRender={linkRender}
      />
    ) : (
      <SubgroupSection
        key={`sub-${block.label}-${blockIndex}`}
        label={block.label}
        href={block.href}
        iconKey={block.iconKey}
        items={block.items}
        activeHref={activeHref}
        linkRender={linkRender}
      />
    ),
  )
}

function CollapsedWorkspace({
  group,
  activeHref,
  active,
  linkRender,
}: {
  group: SidebarNavGroup
  activeHref: string | null
  active: boolean
  linkRender: LinkRender
}) {
  const [open, setOpen] = React.useState(false)
  return (
    <Popover
      open={open}
      onOpenChange={setOpen}
      side="right"
      align="start"
      className="max-h-[min(36rem,calc(100vh-2rem))] w-64 overflow-y-auto py-1.5"
      trigger={
        <button
          type="button"
          aria-label={group.label}
          aria-expanded={open}
          title={group.label}
          onClick={() => setOpen((value) => !value)}
          className={cn(
            'relative grid h-9 w-full place-items-center rounded-md transition-colors',
            'before:absolute before:top-1/2 before:left-0 before:h-5 before:w-[2px] before:-translate-y-1/2 before:rounded-full',
            active
              ? 'bg-primary-subtle text-primary before:bg-primary'
              : 'text-fg-muted before:bg-transparent hover:bg-surface-hover hover:text-fg',
            'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/40',
          )}
        >
          <NavIcon iconKey={group.iconKey} icon={group.icon} size={17} />
        </button>
      }
    >
      <div
        onClick={(event) => {
          if ((event.target as HTMLElement).closest('a')) setOpen(false)
        }}
      >
        <div className="border-b border-border-subtle px-3 py-2 text-xs font-semibold tracking-wide text-fg-muted uppercase">
          {group.label}
        </div>
        <div className="py-1">
          <WorkspaceItems items={group.items} activeHref={activeHref} linkRender={linkRender} />
        </div>
      </div>
    </Popover>
  )
}

export type NavBlock =
  | { kind: 'item'; item: SidebarNavItem }
  | { kind: 'subgroup'; label: string; href?: string; iconKey?: string; items: SidebarNavItem[] }

export function toBlocks(items: SidebarNavItem[]): NavBlock[] {
  const blocks: NavBlock[] = []
  for (const item of items) {
    if (item.subgroup) {
      const existing = blocks.find(
        (block): block is Extract<NavBlock, { kind: 'subgroup' }> =>
          block.kind === 'subgroup' && block.label === item.subgroup,
      )
      if (existing) {
        existing.items.push(item)
        if (!existing.href) existing.href = item.subgroupHref
        if (!existing.iconKey) existing.iconKey = item.subgroupIconKey
      } else {
        blocks.push({
          kind: 'subgroup',
          label: item.subgroup,
          href: item.subgroupHref,
          iconKey: item.subgroupIconKey,
          items: [item],
        })
      }
    } else {
      blocks.push({ kind: 'item', item })
    }
  }
  return blocks
}

function NavLink({
  item,
  active,
  nested = false,
  collapsed = false,
  linkRender,
}: {
  item: SidebarNavItem
  active: boolean
  nested?: boolean
  collapsed?: boolean
  linkRender: LinkRender
}) {
  return (
    <React.Fragment>
      {linkRender({
        href: item.href,
        title: collapsed ? item.label : undefined,
        ariaCurrent: active ? 'page' : undefined,
        dataWalkthrough: `nav:${item.href}`,
        className: cn(
          'group relative flex items-center rounded-md py-1.5 text-sm transition-colors duration-150 ease-out',
          collapsed ? 'justify-center px-2' : nested ? 'gap-2.5 pr-2 pl-8' : 'gap-2.5 px-2',
          'before:absolute before:top-1/2 before:left-0 before:h-5 before:w-[2px] before:-translate-y-1/2 before:rounded-full',
          'before:transition-all before:duration-150 before:ease-out',
          active
            ? 'bg-primary-subtle text-fg before:h-6 before:bg-primary'
            : 'text-fg-muted before:bg-transparent hover:bg-surface-hover hover:text-fg hover:before:bg-border-strong',
          'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/40',
        ),
        children: (
          <>
            <NavIcon
              iconKey={item.iconKey}
              icon={item.icon}
              size={15}
              className={cn(
                'shrink-0 transition-colors duration-150',
                active ? 'text-primary' : 'text-fg-subtle group-hover:text-fg',
              )}
            />
            {collapsed ? null : <span className="truncate">{item.label}</span>}
          </>
        ),
      })}
    </React.Fragment>
  )
}

function SubgroupSection({
  label,
  href,
  iconKey,
  items,
  activeHref,
  linkRender,
}: {
  label: string
  href?: string
  iconKey?: string
  items: SidebarNavItem[]
  activeHref: string | null
  linkRender: LinkRender
}) {
  const selfActive = href != null && activeHref === href
  const hasActiveChild = items.some((item) => item.href === activeHref) || selfActive
  const [open, setOpen] = React.useState(hasActiveChild)

  React.useEffect(() => {
    if (hasActiveChild) setOpen(true)
  }, [hasActiveChild])

  const headerClass = cn(
    'group flex w-full items-center gap-2.5 rounded-md px-2 py-1.5 text-sm transition-colors duration-150 ease-out',
    selfActive
      ? 'bg-primary-subtle text-fg'
      : hasActiveChild && !open
        ? 'text-primary'
        : 'text-fg-muted hover:bg-surface-hover hover:text-fg',
    'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/40',
  )
  const chevron = (
    <ChevronRight
      size={15}
      className={cn('shrink-0 text-fg-subtle transition-transform duration-150', open && 'rotate-90')}
    />
  )

  return (
    <div>
      {href ? (
        <div className={cn(headerClass, 'p-0')}>
          <button
            type="button"
            aria-expanded={open}
            aria-label={label}
            onClick={() => setOpen((current) => !current)}
            className="grid shrink-0 place-items-center self-stretch rounded-l-md pl-2 hover:bg-surface-active"
          >
            {chevron}
          </button>
          {linkRender({
            href,
            ariaCurrent: selfActive ? 'page' : undefined,
            dataWalkthrough: `nav:${href}`,
            className: 'flex flex-1 items-center gap-2.5 rounded-r-md py-1.5 pr-2',
            children: (
              <>
                {iconKey ? <NavIcon iconKey={iconKey} className="shrink-0 text-fg-muted" /> : null}
                {label}
              </>
            ),
          })}
        </div>
      ) : (
        <button type="button" onClick={() => setOpen((current) => !current)} aria-expanded={open} className={headerClass}>
          {chevron}
          {iconKey ? <NavIcon iconKey={iconKey} className="shrink-0 text-fg-muted" /> : null}
          <span>{label}</span>
        </button>
      )}
      {open ? (
        <div className="mt-0.5 space-y-0.5">
          {items.map((item) => (
            <NavLink
              key={item.href}
              item={item}
              active={activeHref === item.href}
              nested
              linkRender={linkRender}
            />
          ))}
        </div>
      ) : null}
    </div>
  )
}

export const ICON_KEYS = Object.keys(ICONS).sort()

export function NavIcon({
  iconKey,
  icon,
  size = 15,
  className,
}: {
  iconKey?: string
  icon?: React.ReactNode
  size?: number
  className?: string
}) {
  if (icon) {
    return (
      <span
        className={cn('inline-flex shrink-0 items-center justify-center [&_svg]:size-[var(--nav-icon-size)]', className)}
        style={{ ['--nav-icon-size' as string]: `${size}px` }}
      >
        {icon}
      </span>
    )
  }
  const Icon = (iconKey && ICONS[iconKey]) || Gauge
  return <Icon size={size} className={className} />
}

/** OpenBooks mobile shortcut selection: tenant-pinned entries, then registry order. */
export function selectMobileTabs(groups: SidebarNavGroup[], count = 4): SidebarNavItem[] {
  const unique = groups
    .flatMap((group) => group.items)
    .filter((item, index, items) => items.findIndex((candidate) => candidate.href === item.href) === index)
  return [...unique.filter((item) => item.mobile), ...unique.filter((item) => !item.mobile)].slice(0, count)
}
