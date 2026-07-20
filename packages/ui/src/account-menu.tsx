'use client'

import * as React from 'react'
import {
  Building2,
  Check,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  Languages,
  LayoutPanelLeft,
  LogOut,
  Palette,
  ShieldAlert,
  type LucideIcon,
} from 'lucide-react'
import { Avatar } from './avatar'
import { Badge, type BadgeProps } from './badge'
import { UiLink } from './link-context'
import { Popover } from './popover'
import { ThemeToggle } from './theme'
import { cn } from './utils'

export type AccountMenuOption = {
  value: string
  label: string
  description?: string
}

export type AccountMenuChoice = {
  label: string
  summary: string
  value: string
  options: AccountMenuOption[]
  onChange: (value: string) => void | Promise<void>
}

export type AccountMenuLabels = {
  menu: string
  account: string
  theme: string
  back: string
  signOut: string
  signingOut: string
}

const DEFAULT_LABELS: AccountMenuLabels = {
  menu: 'Open account menu',
  account: 'Account',
  theme: 'Theme',
  back: 'Back',
  signOut: 'Sign out',
  signingOut: 'Signing out…',
}

type View = 'home' | 'organization' | 'language' | 'theme' | 'navigation'

export type AccountMenuProps = {
  name: string
  email: string
  contextLabel?: string
  contextTone?: 'default' | 'warning'
  roleLabel?: string
  status?: { label: string; variant?: BadgeProps['variant'] }
  organization?: AccountMenuChoice
  language?: AccountMenuChoice
  navigation?: AccountMenuChoice
  showTheme?: boolean
  elevatedAccess?: { label: string; href: string }
  onSignOut?: () => void | Promise<void>
  labels?: Partial<AccountMenuLabels>
}

/**
 * OpenBooks' bounded account launcher generalized into controlled choices.
 * Organization, language, layout persistence and sign-out stay app-owned.
 */
export function AccountMenu({
  name,
  email,
  contextLabel,
  contextTone = 'default',
  roleLabel,
  status,
  organization,
  language,
  navigation,
  showTheme = true,
  elevatedAccess,
  onSignOut,
  labels: labelOverrides,
}: AccountMenuProps) {
  const labels = { ...DEFAULT_LABELS, ...labelOverrides }
  const [open, setOpen] = React.useState(false)
  const [view, setView] = React.useState<View>('home')
  const [saving, setSaving] = React.useState(false)
  const [signingOut, startSignOut] = React.useTransition()
  const displayName = name || email || labels.account

  function close() {
    setOpen(false)
    window.setTimeout(() => setView('home'), 150)
  }

  async function choose(choice: AccountMenuChoice, value: string) {
    setSaving(true)
    try {
      await choice.onChange(value)
      close()
    } finally {
      setSaving(false)
    }
  }

  const title =
    view === 'organization'
      ? organization?.label
      : view === 'language'
        ? language?.label
        : view === 'navigation'
          ? navigation?.label
          : labels.theme

  return (
    <Popover
      open={open}
      onOpenChange={(next) => {
        setOpen(next)
        if (!next) window.setTimeout(() => setView('home'), 150)
      }}
      align="end"
      className="w-72"
      trigger={
        <button
          type="button"
          onClick={() => setOpen((current) => !current)}
          aria-label={labels.menu}
          aria-expanded={open}
          aria-haspopup="menu"
          className="flex shrink-0 items-center gap-2 rounded-md border border-transparent px-1.5 py-1 text-sm text-fg-muted transition-colors hover:bg-surface-hover hover:text-fg"
        >
          <Avatar name={displayName} size={28} />
          <span className="hidden min-w-0 max-w-44 flex-col text-left sm:flex">
            <span className="truncate text-sm leading-tight text-fg">{displayName}</span>
            {contextLabel ? (
              <span className={cn('truncate text-[11px] leading-tight', contextTone === 'warning' ? 'text-warning' : 'text-fg-subtle')}>
                {contextLabel}
              </span>
            ) : null}
          </span>
          <ChevronDown size={14} className="hidden shrink-0 text-fg-subtle sm:inline" />
        </button>
      }
    >
      {view === 'home' ? (
        <div>
          <div className="flex items-center gap-3 px-3 py-3">
            <Avatar name={displayName} size={40} />
            <span className="flex min-w-0 flex-col">
              <span className="truncate text-sm font-medium text-fg">{displayName}</span>
              {email ? <span className="truncate text-xs text-fg-muted">{email}</span> : null}
              <span className="mt-1 flex flex-wrap gap-1">
                {roleLabel ? <Badge variant="secondary" className="text-[10px]">{roleLabel}</Badge> : null}
                {status ? <Badge variant={status.variant ?? 'secondary'} className="text-[10px]">{status.label}</Badge> : null}
              </span>
            </span>
          </div>

          <div className="grid grid-cols-2 gap-2 px-2 pb-2">
            {organization ? <LauncherCard icon={Building2} tone="primary" label={organization.label} summary={organization.summary} onClick={() => setView('organization')} /> : null}
            {language ? <LauncherCard icon={Languages} tone="info" label={language.label} summary={language.summary} onClick={() => setView('language')} /> : null}
            {showTheme ? <LauncherCard icon={Palette} tone="primary" label={labels.theme} onClick={() => setView('theme')} /> : null}
            {navigation ? <LauncherCard icon={LayoutPanelLeft} tone="warning" label={navigation.label} summary={navigation.summary} onClick={() => setView('navigation')} /> : null}
            {elevatedAccess ? (
              <UiLink href={elevatedAccess.href} onClick={close} className="group relative flex flex-col gap-2 rounded-xl border border-border bg-surface p-3 transition-colors hover:border-border-strong hover:bg-surface-hover">
                <span className="grid size-9 place-items-center rounded-lg bg-danger-subtle text-danger"><ShieldAlert size={18} /></span>
                <span className="truncate text-sm font-medium text-fg">{elevatedAccess.label}</span>
              </UiLink>
            ) : null}
          </div>

          {onSignOut ? (
            <div className="border-t border-border-subtle p-1">
              <button
                type="button"
                disabled={signingOut}
                role="menuitem"
                onClick={() => startSignOut(async () => { await onSignOut(); close() })}
                className="flex w-full items-center gap-2.5 rounded-md px-3 py-2 text-sm text-fg-muted transition-colors hover:bg-surface-hover hover:text-fg disabled:opacity-60"
              >
                <LogOut size={15} />
                {signingOut ? labels.signingOut : labels.signOut}
              </button>
            </div>
          ) : null}
        </div>
      ) : (
        <div>
          <div className="flex items-center gap-1.5 border-b border-border-subtle px-2 py-2">
            <button type="button" onClick={() => setView('home')} aria-label={labels.back} className="grid size-7 place-items-center rounded-md text-fg-muted hover:bg-surface-hover hover:text-fg">
              <ChevronLeft size={16} />
            </button>
            <span className="text-sm font-semibold text-fg">{title}</span>
          </div>
          {view === 'theme' ? <div className="p-3"><ThemeToggle /></div> : null}
          {view === 'organization' && organization ? <ChoiceList choice={organization} saving={saving} onChoose={choose} /> : null}
          {view === 'language' && language ? <ChoiceList choice={language} saving={saving} onChoose={choose} /> : null}
          {view === 'navigation' && navigation ? <ChoiceList choice={navigation} saving={saving} onChoose={choose} /> : null}
        </div>
      )}
    </Popover>
  )
}

function LauncherCard({ icon: Icon, tone, label, summary, onClick }: { icon: LucideIcon; tone: 'primary' | 'info' | 'warning'; label: string; summary?: string; onClick: () => void }) {
  return (
    <button type="button" onClick={onClick} className="group relative flex flex-col gap-2 rounded-xl border border-border bg-surface p-3 text-left transition-colors hover:border-border-strong hover:bg-surface-hover">
      <span className={cn('grid size-9 place-items-center rounded-lg', tone === 'info' ? 'bg-info-subtle text-info' : tone === 'warning' ? 'bg-warning-subtle text-warning' : 'bg-primary-subtle text-primary')}><Icon size={18} /></span>
      <span className="min-w-0">
        <span className="block truncate text-sm font-medium text-fg">{label}</span>
        {summary ? <span className="block truncate text-[11px] text-fg-subtle">{summary}</span> : null}
      </span>
      <ChevronRight size={14} className="absolute right-2.5 top-3 text-fg-subtle transition-transform group-hover:translate-x-0.5" />
    </button>
  )
}

function ChoiceList({ choice, saving, onChoose }: { choice: AccountMenuChoice; saving: boolean; onChoose: (choice: AccountMenuChoice, value: string) => Promise<void> }) {
  return (
    <div className="max-h-72 overflow-y-auto p-1">
      {choice.options.map((option) => {
        const active = choice.value === option.value
        return (
          <button key={option.value} type="button" role="menuitemradio" aria-checked={active} disabled={saving} onClick={() => void onChoose(choice, option.value)} className="flex w-full items-start gap-2 rounded-md px-3 py-2 text-left text-sm text-fg-muted hover:bg-surface-hover hover:text-fg disabled:opacity-60">
            <Check size={15} className={cn('mt-0.5 shrink-0', active ? 'text-primary' : 'text-transparent')} />
            <span className="min-w-0"><span className="block truncate">{option.label}</span>{option.description ? <span className="block truncate text-xs text-fg-subtle">{option.description}</span> : null}</span>
          </button>
        )
      })}
    </div>
  )
}
