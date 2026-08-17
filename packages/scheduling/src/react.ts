/**
 * @braedonsaunders/scheduling/react — the authoring surface.
 *
 * Client components. Wrap them in `SchedulingProvider` to supply your own
 * labels and date formatting; without it they render in English against the
 * runtime locale.
 */

export { SchedulingProvider, useScheduling, useSchedulingLabels, useScheduleFormatters } from './react/context'
export { GanttView, type GanttViewProps } from './react/gantt-view'
export { GanttBar, type GanttBarProps } from './react/gantt-bar'
export { GanttDependencies, type GanttDependenciesProps } from './react/gantt-dependencies'
export { MilestoneMarker } from './react/milestone-marker'
export { ListView, type ListViewProps } from './react/list-view'
export { BoardView, type BoardViewProps } from './react/board-view'
export { ScheduleToolbar, type ScheduleToolbarProps, type ScheduleView } from './react/schedule-toolbar'
export { ScheduleFiltersBar, type ScheduleFiltersBarProps } from './react/schedule-filters'
export {
  ScheduleContextMenu,
  useScheduleContextMenu,
  type ContextMenuState,
  type ScheduleContextMenuProps,
} from './react/schedule-context-menu'
export { TaskEditor, type TaskEditorProps } from './react/task-editor'
export {
  ScheduleManagementDialog,
  type ScheduleManagementDialogProps,
  type ScheduleBaselineInput,
  type ScheduleCalendarInput,
  type ScheduleResourceInput,
} from './react/schedule-management'
export { LevelingPanel, type LevelingPanelProps } from './react/leveling-panel'
export {
  ScheduleWorkspace,
  type ScheduleWorkspaceProps,
  type ScheduleAdapter,
} from './react/schedule-workspace'
