'use client'

/**
 * The schedule toolbar: view switch, timeline controls, health filter,
 * baselines, and the overflow actions.
 *
 * Everything lives in popover menus rather than a row of buttons, because a
 * schedule toolbar with every control exposed wraps into three lines on a
 * laptop and pushes the plan off screen. The health filter carries live counts
 * so the user can see WHERE the trouble is before opening anything.
 */

import { createContext, useContext, useState, type ReactNode } from 'react'
import {
  Calendar,
  Check,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  Download,
  Eye,
  EyeOff,
  Filter,
  GitBranch,
  LayoutGrid,
  List,
  Minus,
  MoreHorizontal,
  Plus,
  Save,
  Scale,
  Settings2,
  SlidersHorizontal,
  Trash2,
  Upload,
} from 'lucide-react'
import { Badge, Button, Popover, cn } from '@appkitjs/ui'
import { parseDate } from '../dates'
import type {
  ScheduleBaseline,
  ScheduleInsights,
  ScheduleQuickFilter,
  ZoomLevel,
} from '../types'
import { useScheduleFormatters, useSchedulingLabels } from './context'

export type ScheduleView = 'gantt' | 'list' | 'board'

export interface ScheduleToolbarProps {
  view: ScheduleView
  onViewChange: (v: ScheduleView) => void
  zoomLevel: ZoomLevel
  onZoomChange: (z: ZoomLevel) => void
  onZoomIn: () => void
  onZoomOut: () => void
  canZoomIn: boolean
  canZoomOut: boolean
  onScrollPrev: () => void
  onScrollToday: () => void
  onScrollNext: () => void
  onAddTask: () => void
  onToggleFilters: () => void
  filtersActive: boolean
  insights: ScheduleInsights
  quickFilter: ScheduleQuickFilter
  onQuickFilterChange: (filter: ScheduleQuickFilter) => void
  showCriticalPath: boolean
  onToggleCriticalPath: () => void
  showBaseline: boolean
  onToggleBaseline: () => void
  hasBaseline: boolean
  onSaveBaseline: () => void
  onClearBaseline: () => void
  baselines: ScheduleBaseline[]
  activeBaselineId: string
  onActiveBaselineChange: (baselineId: string) => void
  onOpenManage: () => void
  calendarCount: number
  resourceCount: number
  dateStart: string | null
  dateEnd: string | null
  /** Optional host capabilities — the menu entry is hidden when omitted. */
  onOpenImport?: () => void
  onExportPdf?: () => void
  onOpenLeveling?: () => void
}

const QUICK_FILTERS: ScheduleQuickFilter[] = [
  'all',
  'lookahead_14',
  'critical',
  'overdue',
  'variance',
  'issues',
]

const ZOOM_LEVELS: ZoomLevel[] = ['day', 'week', 'month']

export function ScheduleToolbar({
  view,
  onViewChange,
  zoomLevel,
  onZoomChange,
  onZoomIn,
  onZoomOut,
  canZoomIn,
  canZoomOut,
  onScrollPrev,
  onScrollToday,
  onScrollNext,
  onAddTask,
  onToggleFilters,
  filtersActive,
  insights,
  quickFilter,
  onQuickFilterChange,
  showCriticalPath,
  onToggleCriticalPath,
  showBaseline,
  onToggleBaseline,
  hasBaseline,
  onSaveBaseline,
  onClearBaseline,
  baselines,
  activeBaselineId,
  onActiveBaselineChange,
  onOpenManage,
  calendarCount,
  resourceCount,
  dateStart,
  dateEnd,
  onOpenImport,
  onExportPdf,
  onOpenLeveling,
}: ScheduleToolbarProps) {
  const labels = useSchedulingLabels()
  const formatters = useScheduleFormatters()

  const parsedStart = parseDate(dateStart)
  const parsedEnd = parseDate(dateEnd)
  const activeBaseline =
    baselines.find((baseline) => baseline.id === activeBaselineId) ??
    baselines.find((baseline) => baseline.isPrimary) ??
    baselines[0] ??
    null

  const formatCompactDate = (date: Date | null) => (date ? formatters.shortDate(date) : labels.menu.tbd)
  const compactDateRange = `${formatCompactDate(parsedStart)}–${formatCompactDate(parsedEnd)}`

  const healthCounts: Record<ScheduleQuickFilter, number> = {
    all: insights.totalTasks,
    lookahead_14: insights.lookahead14TaskIds.size,
    lookahead_28: insights.lookahead28TaskIds.size,
    critical: insights.criticalTaskIds.size,
    overdue: insights.overdueTaskIds.size,
    variance: insights.behindBaselineTaskIds.size,
    issues: insights.attentionTaskIds.size,
  }

  const viewIcon = { gantt: Calendar, list: List, board: LayoutGrid } as const

  return (
    <div
      className="rounded-t-lg rounded-b-none border border-border bg-surface shadow-sm"
      data-testid="schedule-toolbar"
    >
      <div className="flex w-full min-w-0 flex-wrap items-center gap-1.5 px-2 py-1.5">
        <ScheduleMenu
          label={labels.view[view]}
          icon={viewIcon[view]}
          testId="schedule-view-menu"
          title={labels.menu.viewTitle}
        >
          {(['gantt', 'list', 'board'] as const).map((value) => (
            <ScheduleMenuItem
              key={value}
              icon={viewIcon[value]}
              label={labels.view[value]}
              selected={view === value}
              onClick={() => onViewChange(value)}
              testId={`schedule-view-${value}`}
            />
          ))}
        </ScheduleMenu>

        {view === 'gantt' ? (
          <ScheduleMenu
            label={labels.zoom[zoomLevel]}
            icon={SlidersHorizontal}
            testId="schedule-timeline-menu"
            title={labels.menu.timelineTitle}
          >
            <MenuSectionLabel>{labels.menu.moveTimeline}</MenuSectionLabel>
            <div className="grid grid-cols-3 gap-1">
              <ScheduleMenuIconButton
                icon={ChevronLeft}
                label={labels.menu.earlier}
                onClick={onScrollPrev}
                testId="schedule-scroll-prev"
              />
              <ScheduleMenuIconButton
                icon={Calendar}
                label={labels.toolbar.today}
                onClick={onScrollToday}
                testId="schedule-scroll-today"
              />
              <ScheduleMenuIconButton
                icon={ChevronRight}
                label={labels.menu.later}
                onClick={onScrollNext}
                testId="schedule-scroll-next"
              />
            </div>
            <MenuSeparator />
            <MenuSectionLabel>{labels.menu.zoom}</MenuSectionLabel>
            <div className="grid grid-cols-[28px_1fr_28px] gap-1">
              <ScheduleMenuIconButton
                icon={Minus}
                label={labels.toolbar.zoomOut}
                onClick={onZoomOut}
                disabled={!canZoomOut}
                testId="schedule-zoom-out"
              />
              <div className="grid grid-cols-3 gap-1">
                {ZOOM_LEVELS.map((level) => (
                  <ScheduleMenuPill
                    key={level}
                    label={labels.zoom[level]}
                    selected={zoomLevel === level}
                    onClick={() => onZoomChange(level)}
                    testId={`schedule-zoom-${level}`}
                  />
                ))}
              </div>
              <ScheduleMenuIconButton
                icon={Plus}
                label={labels.toolbar.zoomIn}
                onClick={onZoomIn}
                disabled={!canZoomIn}
                testId="schedule-zoom-in"
              />
            </div>
            <MenuSeparator />
            <ScheduleMenuItem
              icon={GitBranch}
              label={labels.toolbar.criticalPath}
              selected={showCriticalPath}
              onClick={onToggleCriticalPath}
              testId="schedule-toggle-critical"
            />
          </ScheduleMenu>
        ) : null}

        <ScheduleMenu
          label={`${labels.quickFilterShort[quickFilter]} ${healthCounts[quickFilter]}`}
          icon={Filter}
          active={quickFilter !== 'all'}
          testId="schedule-health-menu"
          title={labels.menu.healthTitle}
        >
          {QUICK_FILTERS.map((value) => (
            <ScheduleMenuItem
              key={value}
              icon={Filter}
              label={labels.quickFilter[value]}
              detail={labels.format.taskCount(healthCounts[value])}
              selected={quickFilter === value}
              // Baseline slip is meaningless without a baseline to slip from.
              disabled={value === 'variance' && !hasBaseline}
              onClick={() => onQuickFilterChange(value)}
              testId={`schedule-health-${value}`}
            />
          ))}
        </ScheduleMenu>

        <div className="hidden min-w-0 items-center gap-1 rounded-md bg-bg-subtle p-0.5 md:flex">
          <Badge
            variant={insights.deadlineMissTaskIds.size > 0 ? 'destructive' : 'secondary'}
            className="h-6 justify-center px-1.5 py-0 text-[10px]"
            title={`${insights.deadlineMissTaskIds.size} ${labels.menu.deadlineMisses}`}
          >
            D {insights.deadlineMissTaskIds.size}
          </Badge>
          <Badge
            variant={insights.resourceConflictTaskIds.size > 0 ? 'warning' : 'secondary'}
            className="h-6 justify-center px-1.5 py-0 text-[10px]"
            title={`${insights.resourceConflictTaskIds.size} ${labels.menu.resourceConflicts}`}
          >
            R {insights.resourceConflictTaskIds.size}
          </Badge>
          <Badge
            variant={insights.constraintViolationTaskIds.size > 0 ? 'warning' : 'secondary'}
            className="h-6 justify-center px-1.5 py-0 text-[10px]"
            title={`${insights.constraintViolationTaskIds.size} ${labels.menu.constraintViolations}`}
          >
            C {insights.constraintViolationTaskIds.size}
          </Badge>
          <div className="min-w-0 rounded-md bg-surface px-2 py-1 text-[10px] leading-tight font-medium text-fg-muted">
            <span className="block truncate">{compactDateRange}</span>
            <span className="block truncate" title={labels.menu.calendarsResources}>
              {calendarCount}C / {resourceCount}R
            </span>
          </div>
        </div>

        <div className="min-w-0 flex-1" />

        <Button
          variant="secondary"
          size="sm"
          title={labels.toolbar.addTask}
          aria-label={labels.toolbar.addTask}
          onClick={onAddTask}
          data-testid="schedule-add-task"
          className="h-7 shrink-0 rounded-md px-2 text-[11px]"
        >
          <Plus className="h-3.5 w-3.5 shrink-0" />
          <span className="truncate">{labels.columns.name}</span>
        </Button>

        <ScheduleMenu
          label={labels.toolbar.baseline}
          icon={Save}
          active={showBaseline}
          align="end"
          testId="schedule-baseline-menu"
          title={`${labels.menu.baselineTitle}: ${activeBaseline?.name ?? labels.common.none}`}
        >
          <MenuSectionLabel>{labels.menu.activeBaseline}</MenuSectionLabel>
          {baselines.length === 0 ? (
            <div className="rounded-md px-2 py-2 text-[11px] text-fg-subtle">
              {labels.menu.noBaselines}
            </div>
          ) : (
            baselines.map((baseline) => (
              <ScheduleMenuItem
                key={baseline.id}
                icon={Save}
                label={baseline.name}
                detail={baseline.isPrimary ? labels.menu.primary : labels.menu.snapshot}
                selected={baseline.id === activeBaseline?.id}
                onClick={() => onActiveBaselineChange(baseline.id)}
              />
            ))
          )}
          <MenuSeparator />
          <ScheduleMenuItem
            icon={Save}
            label={labels.menu.saveBaseline}
            onClick={onSaveBaseline}
            testId="schedule-save-baseline"
          />
          <ScheduleMenuItem
            icon={showBaseline ? EyeOff : Eye}
            label={showBaseline ? labels.menu.hideBaseline : labels.menu.showBaseline}
            disabled={!hasBaseline}
            selected={showBaseline}
            onClick={onToggleBaseline}
            testId="schedule-toggle-baseline"
          />
          <ScheduleMenuItem
            icon={Trash2}
            label={labels.menu.clearBaseline}
            disabled={!hasBaseline}
            onClick={onClearBaseline}
            testId="schedule-clear-baseline"
          />
          {onExportPdf ? (
            <ScheduleMenuItem icon={Download} label={labels.menu.exportPdf} onClick={onExportPdf} />
          ) : null}
        </ScheduleMenu>

        <ScheduleMenu
          label={labels.menu.more}
          icon={MoreHorizontal}
          align="end"
          testId="schedule-actions-menu"
          title={labels.menu.actionsTitle}
        >
          {onOpenLeveling ? (
            <ScheduleMenuItem
              icon={Scale}
              label={labels.toolbar.levelResources}
              onClick={onOpenLeveling}
              testId="schedule-level-resources"
            />
          ) : null}
          {onOpenImport ? (
            <ScheduleMenuItem icon={Upload} label={labels.menu.importSchedule} onClick={onOpenImport} />
          ) : null}
          <ScheduleMenuItem
            icon={Filter}
            label={filtersActive ? labels.menu.hideFilters : labels.menu.showFilters}
            selected={filtersActive}
            onClick={onToggleFilters}
          />
          <ScheduleMenuItem
            icon={Settings2}
            label={labels.toolbar.manageSchedule}
            onClick={onOpenManage}
            testId="schedule-manage"
          />
        </ScheduleMenu>
      </div>
    </div>
  )
}

type ToolbarIcon = typeof Calendar

/**
 * Menu shell. Items call `close()` through context so a selection dismisses
 * the popover without every call site having to thread state.
 */
const MenuCloseContext = createContext<() => void>(() => {})

function ScheduleMenu({
  label,
  icon: Icon,
  active = false,
  align = 'start',
  testId,
  title,
  children,
}: {
  label: string
  icon: ToolbarIcon
  active?: boolean
  align?: 'start' | 'end'
  testId?: string
  title?: string
  children: ReactNode
}) {
  const [open, setOpen] = useState(false)
  return (
    <Popover
      open={open}
      onOpenChange={setOpen}
      align={align}
      className="w-56 p-1.5"
      trigger={
        <Button
          variant={active ? 'secondary' : 'ghost'}
          size="sm"
          data-testid={testId}
          title={title ?? label}
          aria-label={title ?? label}
          className="h-7 min-w-0 shrink-0 gap-1.5 rounded-md px-2 text-[11px]"
          onClick={() => setOpen((current) => !current)}
        >
          <Icon className="h-3.5 w-3.5 shrink-0" />
          <span className="max-w-28 truncate">{label}</span>
          <ChevronDown className="h-3 w-3 text-fg-subtle" />
        </Button>
      }
    >
      <MenuCloseContext.Provider value={() => setOpen(false)}>{children}</MenuCloseContext.Provider>
    </Popover>
  )
}

function useMenuClose() {
  return useContext(MenuCloseContext)
}

function ScheduleMenuItem({
  icon: Icon,
  label,
  detail,
  selected = false,
  disabled = false,
  onClick,
  testId,
}: {
  icon: ToolbarIcon
  label: string
  detail?: string
  selected?: boolean
  disabled?: boolean
  onClick?: () => void
  testId?: string
}) {
  const close = useMenuClose()
  return (
    <button
      type="button"
      onClick={() => {
        onClick?.()
        close()
      }}
      disabled={disabled}
      data-testid={testId}
      className={cn(
        'flex h-8 w-full items-center gap-2 rounded-md px-2 text-left text-[11px] transition-colors disabled:pointer-events-none disabled:opacity-35',
        selected ? 'bg-primary-subtle text-primary' : 'text-fg-muted hover:bg-bg-subtle hover:text-fg',
      )}
    >
      <Icon className="h-3.5 w-3.5 shrink-0" />
      <span className="min-w-0 flex-1 truncate font-medium">{label}</span>
      {detail ? <span className="shrink-0 text-[10px] text-fg-subtle">{detail}</span> : null}
      {selected ? <Check className="h-3 w-3 shrink-0" /> : null}
    </button>
  )
}

function ScheduleMenuIconButton({
  icon: Icon,
  label,
  disabled = false,
  onClick,
  testId,
}: {
  icon: ToolbarIcon
  label: string
  disabled?: boolean
  onClick: () => void
  testId?: string
}) {
  const close = useMenuClose()
  return (
    <button
      type="button"
      title={label}
      aria-label={label}
      disabled={disabled}
      onClick={() => {
        onClick()
        close()
      }}
      data-testid={testId}
      className="flex h-7 items-center justify-center rounded-md text-fg-muted transition-colors hover:bg-bg-subtle hover:text-fg disabled:pointer-events-none disabled:opacity-35"
    >
      <Icon className="h-3.5 w-3.5" />
    </button>
  )
}

function ScheduleMenuPill({
  label,
  selected,
  onClick,
  testId,
}: {
  label: string
  selected: boolean
  onClick: () => void
  testId?: string
}) {
  const close = useMenuClose()
  return (
    <button
      type="button"
      onClick={() => {
        onClick()
        close()
      }}
      data-testid={testId}
      className={cn(
        'h-7 rounded-md px-1 text-[10px] font-semibold uppercase transition-colors',
        selected ? 'bg-primary-subtle text-primary' : 'text-fg-muted hover:bg-bg-subtle hover:text-fg',
      )}
    >
      {label}
    </button>
  )
}

function MenuSectionLabel({ children }: { children: ReactNode }) {
  return (
    <p className="px-2 py-1 text-[10px] font-semibold tracking-[0.14em] text-fg-subtle uppercase">
      {children}
    </p>
  )
}

function MenuSeparator() {
  return <div className="my-1 h-px bg-border" />
}
