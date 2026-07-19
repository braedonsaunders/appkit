'use client'

import * as React from 'react'
import { Popover } from './popover'
import { cn } from './utils'

const MenuCloseContext = React.createContext<(() => void) | null>(null)

export type DropdownMenuProps = {
  trigger: React.ReactElement<{ onClick?: (e: React.MouseEvent) => void }>
  children: React.ReactNode
  align?: 'start' | 'end'
  side?: 'top' | 'bottom' | 'left' | 'right'
  className?: string
}

/** A menu anchored to a trigger. Items close the menu on select. */
export function DropdownMenu({
  trigger,
  children,
  align = 'end',
  side = 'bottom',
  className,
}: DropdownMenuProps) {
  const [open, setOpen] = React.useState(false)
  const triggerEl = React.cloneElement(trigger, {
    onClick: (e: React.MouseEvent) => {
      trigger.props.onClick?.(e)
      setOpen((o) => !o)
    },
  })
  return (
    <Popover
      open={open}
      onOpenChange={setOpen}
      align={align}
      side={side}
      className={cn('min-w-[11rem] p-1', className)}
      trigger={triggerEl}
    >
      <MenuCloseContext.Provider value={() => setOpen(false)}>
        <div role="menu" className="text-sm">
          {children}
        </div>
      </MenuCloseContext.Provider>
    </Popover>
  )
}

export type DropdownMenuItemProps = {
  icon?: React.ReactNode
  children: React.ReactNode
  onSelect?: () => void
  variant?: 'default' | 'danger'
  disabled?: boolean
}

export function DropdownMenuItem({
  icon,
  children,
  onSelect,
  variant = 'default',
  disabled,
}: DropdownMenuItemProps) {
  const close = React.useContext(MenuCloseContext)
  return (
    <button
      type="button"
      role="menuitem"
      disabled={disabled}
      onClick={() => {
        onSelect?.()
        close?.()
      }}
      className={cn(
        'flex w-full items-center gap-2.5 rounded-sm px-3 py-1.5 text-left transition-colors disabled:pointer-events-none disabled:opacity-50',
        variant === 'danger' ? 'text-danger hover:bg-danger-subtle' : 'text-fg hover:bg-surface-hover',
      )}
    >
      {icon ? <span className="text-fg-muted [&_svg]:size-4">{icon}</span> : null}
      {children}
    </button>
  )
}

export function DropdownMenuSeparator() {
  return <div role="separator" className="my-1 h-px bg-border" />
}

export function DropdownMenuLabel({ children }: { children: React.ReactNode }) {
  return <div className="px-3 py-1.5 text-xs font-medium tracking-wide text-fg-subtle uppercase">{children}</div>
}
