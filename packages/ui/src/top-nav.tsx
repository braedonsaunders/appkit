'use client'

// Faithful generalized extraction of OpenBooks' NetSuite-style top menu bar.
// The same registry drives the sidebar, mobile drawer, and mobile tabs.

import * as React from 'react'
import { ChevronDown, ChevronRight } from 'lucide-react'
import { visibleTopNavGroupCount } from './nav-overflow'
import { Popover } from './popover'
import {
  findActiveNavHref,
  groupContainsActiveHref,
  NavIcon,
  toBlocks,
  type SidebarNavGroup,
  type SidebarNavItem,
} from './sidebar-nav'
import type { LinkRender } from './settings-layout'
import { cn } from './utils'

const MORE_MENU_INDEX = -1

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

export function TopNav({
  groups,
  pathname,
  linkRender = defaultLink,
  moreLabel = 'More',
  ariaLabel = 'Primary navigation',
  className,
}: {
  groups: SidebarNavGroup[]
  pathname: string
  linkRender?: LinkRender
  moreLabel?: string
  ariaLabel?: string
  className?: string
}) {
  const activeHref = findActiveNavHref(pathname, groups)
  const [openIndex, setOpenIndex] = React.useState<number | null>(null)
  const [visibleCount, setVisibleCount] = React.useState(groups.length)
  const navRef = React.useRef<HTMLElement>(null)
  const measurementRef = React.useRef<HTMLDivElement>(null)
  const closeTimer = React.useRef<number | null>(null)

  React.useLayoutEffect(() => {
    const nav = navRef.current
    const measurement = measurementRef.current
    if (!nav || !measurement) return
    let active = true

    function measure() {
      if (!active) return
      const groupWidths = Array.from(
        measurement!.querySelectorAll<HTMLElement>('[data-top-nav-measure="group"]'),
        (element) => element.getBoundingClientRect().width,
      )
      const moreWidth =
        measurement!
          .querySelector<HTMLElement>('[data-top-nav-measure="more"]')
          ?.getBoundingClientRect().width ?? 0
      const gap = Number.parseFloat(window.getComputedStyle(measurement!).columnGap) || 0
      const next = visibleTopNavGroupCount({
        availableWidth: nav!.clientWidth,
        groupWidths,
        moreWidth,
        gap,
      })
      setVisibleCount((current) => (current === next ? current : next))
    }

    measure()
    const frame = window.requestAnimationFrame(measure)
    const timer = window.setTimeout(measure, 0)
    const observer = new ResizeObserver(measure)
    observer.observe(nav)
    observer.observe(measurement)
    window.addEventListener('resize', measure)
    void document.fonts?.ready.then(measure)
    return () => {
      active = false
      window.cancelAnimationFrame(frame)
      window.clearTimeout(timer)
      window.removeEventListener('resize', measure)
      observer.disconnect()
    }
  }, [groups, moreLabel])

  React.useEffect(() => {
    if (
      openIndex !== null &&
      ((openIndex === MORE_MENU_INDEX && visibleCount === groups.length) || openIndex >= visibleCount)
    ) {
      setOpenIndex(null)
    }
  }, [groups.length, openIndex, visibleCount])

  React.useEffect(
    () => () => {
      if (closeTimer.current) window.clearTimeout(closeTimer.current)
    },
    [],
  )

  function enterMenu(index: number) {
    if (closeTimer.current) {
      window.clearTimeout(closeTimer.current)
      closeTimer.current = null
    }
    setOpenIndex(index)
  }

  function scheduleClose() {
    if (closeTimer.current) window.clearTimeout(closeTimer.current)
    closeTimer.current = window.setTimeout(() => setOpenIndex(null), 150)
  }

  const visibleGroups = groups.slice(0, visibleCount)
  const overflowGroups = groups.slice(visibleCount)
  const moreOpen = openIndex === MORE_MENU_INDEX
  const moreActive = overflowGroups.some((group) => groupContainsActiveHref(group, activeHref))

  return (
    <nav
      ref={navRef}
      aria-label={ariaLabel}
      className={cn('relative hidden min-w-0 flex-1 items-center gap-0.5 overflow-hidden lg:flex', className)}
    >
      <div
        ref={measurementRef}
        aria-hidden
        className="pointer-events-none invisible absolute flex w-max items-center gap-0.5"
      >
        {groups.map((group, index) => (
          <span
            key={`${group.label}-${index}`}
            data-top-nav-measure="group"
            className="flex h-14 shrink-0 items-center gap-1 whitespace-nowrap px-2 text-sm font-medium"
          >
            {group.label}
            <ChevronDown size={12} className="opacity-50" />
          </span>
        ))}
        <span
          data-top-nav-measure="more"
          className="flex h-14 shrink-0 items-center gap-1 whitespace-nowrap px-2 text-sm font-medium"
        >
          {moreLabel}
          <ChevronDown size={12} className="opacity-50" />
        </span>
      </div>

      {visibleGroups.map((group, index) => {
        const open = openIndex === index
        const groupActive = groupContainsActiveHref(group, activeHref)
        return (
          <Popover
            key={group.id ?? `${group.label}-${index}`}
            open={open}
            onOpenChange={(next) => (next ? enterMenu(index) : setOpenIndex(null))}
            align="start"
            className="min-w-[15rem] py-1.5"
            trigger={
              <button
                type="button"
                aria-haspopup="menu"
                aria-expanded={open}
                aria-current={groupActive ? 'true' : undefined}
                onMouseEnter={() => enterMenu(index)}
                onMouseLeave={scheduleClose}
                onClick={() => enterMenu(index)}
                className={cn(
                  'flex h-14 shrink-0 items-center gap-1 whitespace-nowrap px-2 text-sm font-medium transition-colors',
                  groupActive ? 'text-primary' : 'text-fg-muted hover:text-fg',
                )}
              >
                {group.label}
                <ChevronDown size={12} className="opacity-50" />
              </button>
            }
          >
            <GroupMenu
              items={group.items}
              activeHref={activeHref}
              linkRender={linkRender}
              onEnter={() => enterMenu(index)}
              onLeave={scheduleClose}
              onSelect={() => setOpenIndex(null)}
            />
          </Popover>
        )
      })}

      {overflowGroups.length > 0 ? (
        <Popover
          open={moreOpen}
          onOpenChange={(open) => (open ? enterMenu(MORE_MENU_INDEX) : setOpenIndex(null))}
          align="start"
          className="min-w-[15rem] py-1.5"
          trigger={
            <button
              type="button"
              aria-haspopup="menu"
              aria-expanded={moreOpen}
              aria-current={moreActive ? 'true' : undefined}
              onMouseEnter={() => enterMenu(MORE_MENU_INDEX)}
              onMouseLeave={scheduleClose}
              onClick={() => enterMenu(MORE_MENU_INDEX)}
              className={cn(
                'flex h-14 shrink-0 items-center gap-1 whitespace-nowrap px-2 text-sm font-medium transition-colors',
                moreActive ? 'text-primary' : 'text-fg-muted hover:text-fg',
              )}
            >
              {moreLabel}
              <ChevronDown size={12} className="opacity-50" />
            </button>
          }
        >
          <div
            role="menu"
            onMouseEnter={() => enterMenu(MORE_MENU_INDEX)}
            onMouseLeave={scheduleClose}
            onClick={() => setOpenIndex(null)}
          >
            {overflowGroups.map((group, index) => (
              <OverflowGroupRow
                key={group.id ?? `${group.label}-${visibleCount + index}`}
                group={group}
                activeHref={activeHref}
                linkRender={linkRender}
              />
            ))}
          </div>
        </Popover>
      ) : null}
    </nav>
  )
}

function GroupMenu({
  items,
  activeHref,
  linkRender,
  onEnter,
  onLeave,
  onSelect,
}: {
  items: SidebarNavItem[]
  activeHref: string | null
  linkRender: LinkRender
  onEnter?: () => void
  onLeave?: () => void
  onSelect?: () => void
}) {
  const blocks = toBlocks(items)
  const sectioned = blocks.some((block) => block.kind === 'subgroup')
  return (
    <div
      role="menu"
      onMouseEnter={onEnter}
      onMouseLeave={onLeave}
      onClick={onSelect}
      className={cn(sectioned && 'grid w-[32rem] grid-cols-2 gap-x-2 gap-y-1 p-1')}
    >
      {blocks.map((block, blockIndex) =>
        block.kind === 'item' ? (
          <MenuItemLink
            key={block.item.href}
            item={block.item}
            active={activeHref === block.item.href}
            linkRender={linkRender}
          />
        ) : (
          <MenuSection
            key={`sub-${block.label}-${blockIndex}`}
            label={block.label}
            href={block.href}
            iconKey={block.iconKey}
            items={block.items}
            activeHref={activeHref}
            linkRender={linkRender}
          />
        ),
      )}
    </div>
  )
}

function OverflowGroupRow({
  group,
  activeHref,
  linkRender,
}: {
  group: SidebarNavGroup
  activeHref: string | null
  linkRender: LinkRender
}) {
  const [open, setOpen] = React.useState(false)
  const [flip, setFlip] = React.useState(false)
  const rowRef = React.useRef<HTMLDivElement>(null)
  const closeTimer = React.useRef<number | null>(null)
  const active = groupContainsActiveHref(group, activeHref)

  React.useEffect(
    () => () => {
      if (closeTimer.current) window.clearTimeout(closeTimer.current)
    },
    [],
  )

  function openMenu() {
    if (closeTimer.current) {
      window.clearTimeout(closeTimer.current)
      closeTimer.current = null
    }
    const rect = rowRef.current?.getBoundingClientRect()
    const panelWidth = group.items.some((item) => item.subgroup) ? 528 : 248
    setFlip(rect ? rect.right + panelWidth > window.innerWidth : false)
    setOpen(true)
  }

  function scheduleClose() {
    if (closeTimer.current) window.clearTimeout(closeTimer.current)
    closeTimer.current = window.setTimeout(() => setOpen(false), 150)
  }

  return (
    <div ref={rowRef} className="relative" onMouseEnter={openMenu} onMouseLeave={scheduleClose}>
      <button
        type="button"
        role="menuitem"
        aria-haspopup="menu"
        aria-expanded={open}
        onClick={(event) => {
          event.stopPropagation()
          setOpen((current) => !current)
        }}
        className={cn(
          'flex w-full items-center gap-2.5 px-3 py-1.5 text-sm transition-colors',
          active ? 'text-primary' : 'text-fg-muted hover:bg-surface-hover hover:text-fg',
        )}
      >
        <NavIcon
          iconKey={group.iconKey}
          icon={group.icon}
          size={14}
          className="shrink-0 text-fg-subtle"
        />
        <span className="flex-1 truncate text-left">{group.label}</span>
        <ChevronRight size={12} className={cn('shrink-0 opacity-50', flip && open && 'rotate-180')} />
      </button>
      {open ? (
        <div
          role="menu"
          className={cn(
            'absolute top-0 z-10 min-w-[15rem] rounded-md border border-border bg-elevated py-1.5 shadow-lg',
            flip ? 'right-full -mr-1' : 'left-full -ml-1',
          )}
        >
          <GroupMenu items={group.items} activeHref={activeHref} linkRender={linkRender} />
        </div>
      ) : null}
    </div>
  )
}

function MenuItemLink({
  item,
  active,
  linkRender,
}: {
  item: SidebarNavItem
  active: boolean
  linkRender: LinkRender
}) {
  return (
    <React.Fragment>
      {linkRender({
        href: item.href,
        role: 'menuitem',
        ariaCurrent: active ? 'page' : undefined,
        dataWalkthrough: `nav:${item.href}`,
        className: cn(
          'group flex items-center gap-2.5 px-3 py-1.5 text-sm transition-colors',
          active ? 'bg-primary-subtle text-fg' : 'text-fg-muted hover:bg-surface-hover hover:text-fg',
        ),
        children: (
          <>
            <NavIcon
              iconKey={item.iconKey}
              icon={item.icon}
              size={15}
              className={cn(
                'shrink-0 transition-colors',
                active ? 'text-primary' : 'text-fg-subtle group-hover:text-fg',
              )}
            />
            <span className="truncate">{item.label}</span>
          </>
        ),
      })}
    </React.Fragment>
  )
}

function MenuSection({
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
  return (
    <div role="group" aria-label={label} className="min-w-0 rounded-md py-1">
      {href ? (
        <React.Fragment>
          {linkRender({
            href,
            role: 'menuitem',
            ariaCurrent: selfActive ? 'page' : undefined,
            dataWalkthrough: `nav:${href}`,
            className: cn(
              'flex items-center gap-1.5 px-3 pb-1.5 text-[11px] font-semibold tracking-wide uppercase transition-colors',
              selfActive ? 'text-primary' : 'text-fg-subtle hover:text-fg',
            ),
            children: (
              <>
                {iconKey ? <NavIcon iconKey={iconKey} size={13} /> : null}
                {label}
              </>
            ),
          })}
        </React.Fragment>
      ) : (
        <div className="px-3 pb-1.5 text-[11px] font-semibold tracking-wide text-fg-subtle uppercase">
          {label}
        </div>
      )}
      {items.map((item) => (
        <MenuItemLink
          key={item.href}
          item={item}
          active={activeHref === item.href}
          linkRender={linkRender}
        />
      ))}
    </div>
  )
}
