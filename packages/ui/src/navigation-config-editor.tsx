'use client'

import * as React from 'react'
import { ChevronDown, ChevronUp, GripVertical, LockKeyhole } from 'lucide-react'
import { Reorder, useDragControls } from 'framer-motion'
import { Button } from './button'
import { SettingsSection } from './settings-layout'
import { NavIcon } from './sidebar-nav'
import { Switch } from './switch'
import {
  reconcileNavigationConfig,
  stampKnownNavigationItems,
  type NavigationItemConfig,
  type NavigationRegistryItem,
  type TenantNavigationConfig,
} from './navigation-config'

export type NavigationConfigEditorLabels = {
  title?: string
  description?: string
  visible?: string
  hidden?: string
  required?: string
  moveUp?: (label: string) => string
  moveDown?: (label: string) => string
  drag?: (label: string) => string
}

export type NavigationConfigEditorProps = {
  registry: readonly NavigationRegistryItem[]
  value?: TenantNavigationConfig | null
  onChange: (config: TenantNavigationConfig) => void
  disabled?: boolean
  labels?: NavigationConfigEditorLabels
  className?: string
}

const DEFAULT_LABELS: Required<NavigationConfigEditorLabels> = {
  title: 'Main navigation',
  description: 'Choose which destinations appear and drag them into the order your team uses.',
  visible: 'Visible',
  hidden: 'Hidden',
  required: 'Required',
  moveUp: (label) => `Move ${label} up`,
  moveDown: (label) => `Move ${label} down`,
  drag: (label) => `Drag to reorder ${label}`,
}

/**
 * Controlled tenant navigation editor.
 * Persistence and authorization stay application-owned.
 */
export function NavigationConfigEditor({
  registry,
  value,
  onChange,
  disabled = false,
  labels,
  className,
}: NavigationConfigEditorProps) {
  const text = { ...DEFAULT_LABELS, ...labels }
  const config = React.useMemo(
    () => reconcileNavigationConfig(value, registry),
    [registry, value],
  )
  const registryByKey = React.useMemo(
    () => new Map(registry.map((item) => [item.key, item])),
    [registry],
  )

  const emit = React.useCallback(
    (items: NavigationItemConfig[]) => {
      onChange(stampKnownNavigationItems({ version: 1, items }, registry))
    },
    [onChange, registry],
  )

  const move = React.useCallback(
    (index: number, direction: -1 | 1) => {
      const target = index + direction
      if (target < 0 || target >= config.items.length) return
      const items = [...config.items]
      const [item] = items.splice(index, 1)
      if (!item) return
      items.splice(target, 0, item)
      emit(items)
    },
    [config.items, emit],
  )

  return (
    <SettingsSection
      title={text.title}
      description={text.description}
      className={className}
    >
      <Reorder.Group
        axis="y"
        values={config.items}
        onReorder={emit}
        as="div"
        className="divide-y divide-border"
      >
        {config.items.map((item, index) => {
          const registryItem = registryByKey.get(item.key)
          if (!registryItem) return null
          return (
            <NavigationConfigRow
              key={item.key}
              item={item}
              registryItem={registryItem}
              first={index === 0}
              last={index === config.items.length - 1}
              disabled={disabled}
              labels={text}
              onMoveUp={() => move(index, -1)}
              onMoveDown={() => move(index, 1)}
              onVisibilityChange={(visible) =>
                emit(
                  config.items.map((candidate) =>
                    candidate.key === item.key
                      ? { key: candidate.key, ...(visible ? {} : { hidden: true }) }
                      : candidate,
                  ),
                )
              }
            />
          )
        })}
      </Reorder.Group>
    </SettingsSection>
  )
}

function NavigationConfigRow({
  item,
  registryItem,
  first,
  last,
  disabled,
  labels,
  onMoveUp,
  onMoveDown,
  onVisibilityChange,
}: {
  item: NavigationItemConfig
  registryItem: NavigationRegistryItem
  first: boolean
  last: boolean
  disabled: boolean
  labels: Required<NavigationConfigEditorLabels>
  onMoveUp: () => void
  onMoveDown: () => void
  onVisibilityChange: (visible: boolean) => void
}) {
  const dragControls = useDragControls()
  const visible = registryItem.required || !item.hidden

  return (
    <Reorder.Item
      value={item}
      dragListener={false}
      dragControls={dragControls}
      as="div"
      className="flex items-center gap-3 bg-surface px-4 py-3"
    >
      <button
        type="button"
        disabled={disabled}
        aria-label={labels.drag(registryItem.label)}
        onPointerDown={(event) => dragControls.start(event)}
        className="cursor-grab touch-none rounded-md p-1 text-fg-subtle transition-colors hover:bg-surface-hover hover:text-fg disabled:cursor-not-allowed disabled:opacity-40 active:cursor-grabbing"
      >
        <GripVertical className="size-4" aria-hidden />
      </button>

      <span className="grid size-8 shrink-0 place-items-center rounded-lg bg-bg-subtle text-fg-muted">
        <NavIcon iconKey={registryItem.iconKey} />
      </span>

      <div className="min-w-0 flex-1">
        <div className="truncate text-sm font-medium text-fg">{registryItem.label}</div>
        {registryItem.description ? (
          <div className="truncate text-xs text-fg-muted">{registryItem.description}</div>
        ) : null}
      </div>

      <div className="flex shrink-0 items-center gap-1">
        <Button
          type="button"
          variant="ghost"
          size="icon"
          disabled={disabled || first}
          aria-label={labels.moveUp(registryItem.label)}
          onClick={onMoveUp}
        >
          <ChevronUp className="size-4" aria-hidden />
        </Button>
        <Button
          type="button"
          variant="ghost"
          size="icon"
          disabled={disabled || last}
          aria-label={labels.moveDown(registryItem.label)}
          onClick={onMoveDown}
        >
          <ChevronDown className="size-4" aria-hidden />
        </Button>
      </div>

      {registryItem.required ? (
        <span
          className="flex min-w-20 items-center justify-end gap-1 text-xs font-medium text-fg-muted"
          title={labels.required}
        >
          <LockKeyhole className="size-3.5" aria-hidden />
          {labels.required}
        </span>
      ) : (
        <label className="flex min-w-20 items-center justify-end gap-2 text-xs font-medium text-fg-muted">
          <span>{visible ? labels.visible : labels.hidden}</span>
          <Switch
            checked={visible}
            disabled={disabled}
            aria-label={`${registryItem.label}: ${visible ? labels.visible : labels.hidden}`}
            onChange={(event) => onVisibilityChange(event.target.checked)}
          />
        </label>
      )}
    </Reorder.Item>
  )
}
