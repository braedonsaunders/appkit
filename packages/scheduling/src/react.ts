/**
 * @braedonsaunders/appkit-scheduling/react — the authoring surface.
 *
 * Client components. Wrap them in `SchedulingProvider` to supply your own
 * labels, date formatting and date control; without it they render in English
 * against the runtime locale with native date inputs.
 */

export {
  SchedulingProvider,
  useScheduling,
  useSchedulingLabels,
  useScheduleFormatters,
  useScheduleComponents,
  type SchedulingComponents,
  type SchedulingContextValue,
  type ScheduleDateInputComponent,
  type ScheduleDateInputProps,
} from './react/context'
export { ScheduleDateInput, NativeScheduleDateInput } from './react/date-input'
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
