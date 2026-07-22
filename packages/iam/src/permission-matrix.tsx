'use client'

import * as React from 'react'
import { Checkbox, cn } from '@appkit/ui'
import type { PermissionGroup } from './types'

export type PermissionMatrixProps = {
  groups: PermissionGroup[]
  value: string[]
  onChange?: (permissions: string[]) => void
  name?: string
  readOnly?: boolean
  labels?: Partial<{
    selected: (selected: number, total: number) => React.ReactNode
    selectAll: string
    clearAll: string
    partial: string
  }>
}

/** Faithful grouped permission picker with global and per-group bulk controls. */
export function PermissionMatrix({
  groups,
  value,
  onChange,
  name,
  readOnly = false,
  labels,
}: PermissionMatrixProps) {
  const selected = React.useMemo(() => new Set(value), [value])
  const allKeys = React.useMemo(
    () => groups.flatMap((group) => group.permissions.map((permission) => permission.key)),
    [groups],
  )
  const allOn = allKeys.length > 0 && allKeys.every((key) => selected.has(key))

  function setMany(keys: string[], enabled: boolean) {
    if (readOnly || !onChange) return
    const next = new Set(selected)
    for (const key of keys) enabled ? next.add(key) : next.delete(key)
    onChange(allKeys.filter((key) => next.has(key)))
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-4">
        <span className="text-sm text-fg-muted">
          {labels?.selected?.(selected.size, allKeys.length) ?? `${selected.size} of ${allKeys.length} selected`}
        </span>
        <button
          type="button"
          onClick={() => setMany(allKeys, !allOn)}
          disabled={readOnly || !onChange}
          className="text-xs font-medium text-primary hover:underline disabled:cursor-not-allowed disabled:text-fg-subtle disabled:no-underline"
        >
          {allOn ? (labels?.clearAll ?? 'Clear all') : (labels?.selectAll ?? 'Select all')}
        </button>
      </div>

      {groups.map((group) => {
        const keys = group.permissions.map((permission) => permission.key)
        const groupOn = keys.length > 0 && keys.every((key) => selected.has(key))
        const groupSome = !groupOn && keys.some((key) => selected.has(key))
        return (
          <section key={group.key} className="overflow-hidden rounded-lg border border-border">
            <div className="flex items-center justify-between gap-4 border-b border-border bg-bg-subtle px-3 py-2">
              <div className="min-w-0">
                <h3 className="text-sm font-semibold text-fg">
                  {group.label}
                  {groupSome ? <span className="ml-1.5 text-xs font-normal text-fg-subtle">{labels?.partial ?? 'Partial'}</span> : null}
                </h3>
                {group.description ? <p className="mt-0.5 text-xs text-fg-muted">{group.description}</p> : null}
              </div>
              <button
                type="button"
                onClick={() => setMany(keys, !groupOn)}
                disabled={readOnly || !onChange}
                className="shrink-0 text-xs font-medium text-primary hover:underline disabled:cursor-not-allowed disabled:text-fg-subtle disabled:no-underline"
              >
                {groupOn ? (labels?.clearAll ?? 'Clear all') : (labels?.selectAll ?? 'Select all')}
              </button>
            </div>
            <ul className="grid gap-x-4 gap-y-1 p-3 sm:grid-cols-2">
              {group.permissions.map((permission) => {
                const checked = selected.has(permission.key)
                return (
                  <li key={permission.key}>
                    <label className={cn(
                      'flex items-start gap-2 rounded-md px-2 py-1.5 text-sm transition-colors',
                      readOnly || !onChange ? 'cursor-default' : 'cursor-pointer hover:bg-surface-hover',
                      checked ? 'text-fg' : 'text-fg-muted',
                    )}>
                      <Checkbox
                        name={name}
                        value={permission.key}
                        checked={checked}
                        onChange={() => setMany([permission.key], !checked)}
                        disabled={readOnly || !onChange}
                        className="mt-0.5 shrink-0"
                      />
                      <span className="min-w-0">
                        <span className="block">{permission.label}</span>
                        {permission.description ? <span className="mt-0.5 block text-xs text-fg-subtle">{permission.description}</span> : null}
                      </span>
                    </label>
                  </li>
                )
              })}
            </ul>
          </section>
        )
      })}
    </div>
  )
}
