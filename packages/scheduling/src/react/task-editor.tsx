'use client'

/**
 * The task editor: everything about one activity, with a health sidebar that
 * explains why the schedule is unhappy with it.
 *
 * Two rules run through the whole form:
 *  - A task with children is a SUMMARY. Its type, status, dates and progress
 *    are derived, so those inputs lock rather than silently losing the value
 *    the next rollup overwrites.
 *  - A MILESTONE has one date. The finish input writes the start, duration
 *    saves as 0, and progress saves as 0.
 */

import { useEffect, useMemo, useState } from 'react'
import { Plus, Trash2 } from 'lucide-react'
import { Badge, Button, Dialog, Input, Label, Select, Slider, Tabs, Textarea } from '@braedonsaunders/appkit-ui'
import { diffDays, parseDate } from '../dates'
import { buildTaskHierarchyInfo, getTaskDescendantIds, sortTasksByOrder } from '../hierarchy'
import { getTaskVariance, normalizeScheduleProgress } from '../insights'
import { wouldCreateDependencyCycle } from '../network'
import type {
  DependencyType,
  SchedulePhase,
  ScheduleCalendar,
  ScheduleConstraintType,
  ScheduleDependency,
  ScheduleDependencyInput,
  ScheduleInsights,
  ScheduleResource,
  ScheduleTask,
  ScheduleTaskAssignment,
  ScheduleTaskPatchInput,
  ScheduleTaskStatus,
  ScheduleTaskType,
} from '../types'
import { useSchedulingLabels } from './context'

export interface TaskEditorProps {
  task: ScheduleTask
  phases: SchedulePhase[]
  allTasks: ScheduleTask[]
  dependencies: ScheduleDependency[]
  insights: ScheduleInsights
  calendars: ScheduleCalendar[]
  resources: ScheduleResource[]
  taskAssignments: ScheduleTaskAssignment[]
  onSave: (taskId: string, patch: ScheduleTaskPatchInput) => Promise<boolean>
  onDelete: (taskId: string) => Promise<boolean>
  onCreateDependency: (input: ScheduleDependencyInput) => Promise<boolean>
  onDeleteDependency: (depId: string) => Promise<boolean>
  onClose: () => void
}

const NONE = '__none__'
const MAX_OUTLINE_LEVEL = 12

export function TaskEditor({
  task,
  phases,
  allTasks,
  dependencies,
  insights,
  calendars,
  resources,
  taskAssignments,
  onSave,
  onDelete,
  onCreateDependency,
  onDeleteDependency,
  onClose,
}: TaskEditorProps) {
  const labels = useSchedulingLabels()
  const [activeTab, setActiveTab] = useState('task')
  const [name, setName] = useState(task.name)
  const [description, setDescription] = useState(task.description)
  const [taskType, setTaskType] = useState<ScheduleTaskType>(task.taskType)
  const [status, setStatus] = useState<ScheduleTaskStatus>(task.status)
  const [startDate, setStartDate] = useState(task.startDate?.slice(0, 10) ?? '')
  const [endDate, setEndDate] = useState(task.endDate?.slice(0, 10) ?? '')
  const [progress, setProgress] = useState(normalizeScheduleProgress(task.progress))
  const [assignee, setAssignee] = useState(task.assignee)
  const [phaseId, setPhaseId] = useState(task.phaseId ?? '')
  const [calendarId, setCalendarId] = useState(task.calendarId ?? '')
  const [parentTaskId, setParentTaskId] = useState(task.parentTaskId ?? '')
  const [constraintType, setConstraintType] = useState<ScheduleConstraintType>(task.constraintType)
  const [constraintDate, setConstraintDate] = useState(task.constraintDate?.slice(0, 10) ?? '')
  const [deadlineDate, setDeadlineDate] = useState(task.deadlineDate?.slice(0, 10) ?? '')
  const [actualStart, setActualStart] = useState(task.actualStart?.slice(0, 10) ?? '')
  const [actualEnd, setActualEnd] = useState(task.actualEnd?.slice(0, 10) ?? '')
  const [resourceAssignments, setResourceAssignments] = useState(
    taskAssignments.map((a) => ({ resourceId: a.resourceId, units: String(a.units), role: a.role ?? '' })),
  )
  const [selectedPredecessorId, setSelectedPredecessorId] = useState('')
  const [dependencyType, setDependencyType] = useState<DependencyType>('FS')
  const [dependencyLagDays, setDependencyLagDays] = useState('0')
  const [formError, setFormError] = useState<string | null>(null)
  const [dependencyError, setDependencyError] = useState<string | null>(null)

  // Re-seed every field when the editor is pointed at a different task.
  useEffect(() => {
    setActiveTab('task')
    setName(task.name)
    setDescription(task.description)
    setTaskType(task.taskType)
    setStatus(task.status)
    setStartDate(task.startDate?.slice(0, 10) ?? '')
    setEndDate(task.endDate?.slice(0, 10) ?? '')
    setProgress(normalizeScheduleProgress(task.progress))
    setAssignee(task.assignee)
    setPhaseId(task.phaseId ?? '')
    setCalendarId(task.calendarId ?? '')
    setParentTaskId(task.parentTaskId ?? '')
    setConstraintType(task.constraintType)
    setConstraintDate(task.constraintDate?.slice(0, 10) ?? '')
    setDeadlineDate(task.deadlineDate?.slice(0, 10) ?? '')
    setActualStart(task.actualStart?.slice(0, 10) ?? '')
    setActualEnd(task.actualEnd?.slice(0, 10) ?? '')
    setResourceAssignments(
      taskAssignments.map((a) => ({ resourceId: a.resourceId, units: String(a.units), role: a.role ?? '' })),
    )
    setSelectedPredecessorId('')
    setDependencyType('FS')
    setDependencyLagDays('0')
    setFormError(null)
    setDependencyError(null)
  }, [task, taskAssignments])

  const taskNameById = useMemo(
    () => new Map(allTasks.map((item) => [item.id, item.name || labels.badges.untitled])),
    [allTasks, labels.badges.untitled],
  )
  const predecessorDependencies = useMemo(
    () => dependencies.filter((d) => d.successorId === task.id),
    [dependencies, task.id],
  )
  const successorDependencies = useMemo(
    () => dependencies.filter((d) => d.predecessorId === task.id),
    [dependencies, task.id],
  )
  const variance = useMemo(() => getTaskVariance(task), [task])
  const totalFloat = insights.totalFloatByTask.get(task.id)

  const currentPhaseTasks = useMemo(
    () => sortTasksByOrder(allTasks.filter((item) => (item.phaseId ?? '') === phaseId)),
    [allTasks, phaseId],
  )
  const currentPhaseHierarchy = useMemo(
    () => buildTaskHierarchyInfo(currentPhaseTasks),
    [currentPhaseTasks],
  )
  const hasChildren =
    (currentPhaseHierarchy.get(task.id)?.hasChildren ?? false) ||
    allTasks.some((item) => item.parentTaskId === task.id)
  const effectiveTaskType: ScheduleTaskType = hasChildren ? 'summary' : taskType
  const isMilestoneTask = effectiveTaskType === 'milestone'
  const isRollupLocked = hasChildren

  const descendantIds = useMemo(
    () => new Set(getTaskDescendantIds(allTasks, task.id)),
    [allTasks, task.id],
  )
  const availableParentTasks = useMemo(
    () => currentPhaseTasks.filter((item) => item.id !== task.id && !descendantIds.has(item.id)),
    [currentPhaseTasks, descendantIds, task.id],
  )
  // Only offer links that cannot close a loop — the cycle check runs here, not
  // after the user has already committed to a bad dependency.
  const availablePredecessors = useMemo(() => {
    const existingIds = new Set(predecessorDependencies.map((d) => d.predecessorId))
    return allTasks
      .filter(
        (item) =>
          item.id !== task.id &&
          !existingIds.has(item.id) &&
          !wouldCreateDependencyCycle(dependencies, item.id, task.id),
      )
      .sort((a, b) => a.name.localeCompare(b.name))
  }, [allTasks, dependencies, predecessorDependencies, task.id])

  const parentTask = parentTaskId ? (allTasks.find((item) => item.id === parentTaskId) ?? null) : null
  const outlineLevel = parentTask ? Math.min(MAX_OUTLINE_LEVEL, (parentTask.outlineLevel ?? 0) + 1) : 0
  const wbsPath = useMemo(() => {
    const segments: string[] = []
    let current = parentTask
    let safety = 0
    while (current && safety < MAX_OUTLINE_LEVEL) {
      segments.unshift(current.name || labels.badges.untitled)
      const nextId: string | null = current.parentTaskId
      current = nextId ? (allTasks.find((item) => item.id === nextId) ?? null) : null
      safety += 1
    }
    return segments
  }, [allTasks, labels.badges.untitled, parentTask])

  // Switching phase can strand the chosen parent in another phase.
  useEffect(() => {
    if (!parentTaskId) return
    if (!availableParentTasks.some((item) => item.id === parentTaskId)) setParentTaskId('')
  }, [availableParentTasks, parentTaskId])

  const handleSave = async () => {
    const normalizedStartDate = startDate || null
    const normalizedEndDate = isMilestoneTask ? startDate || null : endDate || null
    const parsedStartDate = parseDate(normalizedStartDate)
    const parsedEndDate = parseDate(normalizedEndDate)

    if (
      !isMilestoneTask &&
      parsedStartDate &&
      parsedEndDate &&
      parsedEndDate.getTime() < parsedStartDate.getTime()
    ) {
      setFormError(labels.editor.endBeforeStart)
      setActiveTab('dates')
      return
    }

    const duration = isMilestoneTask
      ? 0
      : parsedStartDate && parsedEndDate
        ? Math.max(0, diffDays(parsedEndDate, parsedStartDate))
        : task.duration

    setFormError(null)
    const didSave = await onSave(task.id, {
      name,
      description,
      taskType: effectiveTaskType,
      status,
      startDate: normalizedStartDate,
      endDate: normalizedEndDate,
      duration,
      progress: isMilestoneTask ? 0 : progress,
      assignee,
      phaseId: phaseId || null,
      calendarId: calendarId || null,
      parentTaskId: parentTaskId || null,
      outlineLevel,
      constraintType,
      constraintDate: constraintDate || null,
      deadlineDate: deadlineDate || null,
      actualStart: actualStart || null,
      actualEnd: actualEnd || null,
      resourceAssignments: resourceAssignments
        .filter((a) => a.resourceId)
        .map((a) => ({
          resourceId: a.resourceId,
          units: Number.parseFloat(a.units || '1') || 1,
          role: a.role || '',
        })),
    })

    if (didSave) onClose()
  }

  const handleAddDependency = async () => {
    if (!selectedPredecessorId) {
      setDependencyError(labels.editor.choosePredecessor)
      return
    }
    if (wouldCreateDependencyCycle(dependencies, selectedPredecessorId, task.id)) {
      setDependencyError(labels.editor.cycleRejected)
      return
    }

    const didCreate = await onCreateDependency({
      predecessorId: selectedPredecessorId,
      successorId: task.id,
      type: dependencyType,
      lagDays: Number.parseInt(dependencyLagDays || '0', 10) || 0,
    })

    if (didCreate) {
      setSelectedPredecessorId('')
      setDependencyType('FS')
      setDependencyLagDays('0')
      setDependencyError(null)
    }
  }

  const handleRemoveDependency = async (dependencyId: string) => {
    const didDelete = await onDeleteDependency(dependencyId)
    if (!didDelete) setDependencyError(labels.editor.removeDependencyFailed)
  }

  const setAssignmentAt = (index: number, patch: Partial<{ resourceId: string; units: string; role: string }>) =>
    setResourceAssignments((current) =>
      current.map((entry, entryIndex) => (entryIndex === index ? { ...entry, ...patch } : entry)),
    )

  return (
    <Dialog
      open
      onClose={onClose}
      size="xl"
      fullHeight
      closeLabel={labels.editor.cancel}
      footer={
        <>
          <Button
            variant="destructive"
            size="sm"
            className="mr-auto"
            onClick={async () => {
              if (await onDelete(task.id)) onClose()
            }}
          >
            <Trash2 className="h-3.5 w-3.5" />
            {labels.editor.delete}
          </Button>
          <Button variant="ghost" size="sm" onClick={onClose}>
            {labels.editor.cancel}
          </Button>
          <Button size="sm" onClick={() => void handleSave()} data-testid="task-save">
            {labels.editor.save}
          </Button>
        </>
      }
      title={task.name || labels.badges.untitled}
      description={
        <span className="flex flex-wrap items-center gap-1.5">
          <Badge variant="secondary">{labels.status[status]}</Badge>
          <Badge variant="secondary">{labels.taskType[effectiveTaskType]}</Badge>
          <Badge variant="secondary">
            {labels.list.wbs} L{outlineLevel}
          </Badge>
          {phaseId ? (
            <Badge variant="secondary">
              {phases.find((phase) => phase.id === phaseId)?.name ?? labels.columns.phase}
            </Badge>
          ) : null}
        </span>
      }
    >
      <div data-testid="task-editor-panel" className="contents">
        <div className="mt-4 grid min-h-0 flex-1 gap-0 border-t border-border lg:grid-cols-[minmax(0,1fr)_320px]">
          <div className="flex min-h-0 flex-col px-5 py-4">
            <Tabs
              className="mb-4"
              value={activeTab}
              onValueChange={setActiveTab}
              tabs={[
                { value: 'task', label: labels.editor.title },
                { value: 'dates', label: labels.editor.dates },
                { value: 'resources', label: labels.editor.resources },
                { value: 'logic', label: labels.editor.logic },
              ]}
            />

            <div className="sched-scroll min-h-0 flex-1 overflow-y-auto pr-1">
              {activeTab === 'task' ? (
                <div className="space-y-4">
                  <Field label={labels.columns.name}>
                    <Input value={name} onChange={(event) => setName(event.target.value)} />
                  </Field>

                  <div className="grid gap-3 md:grid-cols-2">
                    <Field label={labels.columns.taskType}>
                      <Select
                        value={effectiveTaskType}
                        onChange={(event) => setTaskType(event.target.value as ScheduleTaskType)}
                        disabled={hasChildren}
                        aria-label={labels.taskType.task}
                      >
                        <option value="task">{labels.taskType.task}</option>
                        <option value="milestone">{labels.taskType.milestone}</option>
                        <option value="summary">{labels.taskType.summary}</option>
                      </Select>
                      {hasChildren ? <Hint>{labels.editor.summaryAuto}</Hint> : null}
                    </Field>
                    <Field label={labels.columns.status}>
                      <Select
                        value={status}
                        onChange={(event) => setStatus(event.target.value as ScheduleTaskStatus)}
                        disabled={isRollupLocked}
                        aria-label={labels.columns.status}
                      >
                        {(Object.keys(labels.status) as ScheduleTaskStatus[]).map((key) => (
                          <option key={key} value={key}>
                            {labels.status[key]}
                          </option>
                        ))}
                      </Select>
                    </Field>
                  </div>

                  <div className="grid gap-3 md:grid-cols-2">
                    <Field label={labels.columns.assignee}>
                      <Input value={assignee} onChange={(event) => setAssignee(event.target.value)} />
                    </Field>
                    <Field label={labels.columns.calendar}>
                      <Select
                        value={calendarId || NONE}
                        onChange={(event) =>
                          setCalendarId(event.target.value === NONE ? '' : event.target.value)
                        }
                        aria-label={labels.columns.calendar}
                      >
                        <option value={NONE}>{labels.editor.defaultCalendar}</option>
                        {calendars.map((calendar) => (
                          <option key={calendar.id} value={calendar.id}>
                            {calendar.name}
                          </option>
                        ))}
                      </Select>
                    </Field>
                  </div>

                  <div className="grid gap-3 md:grid-cols-2">
                    <Field label={labels.columns.phase}>
                      <Select
                        value={phaseId || NONE}
                        onChange={(event) =>
                          setPhaseId(event.target.value === NONE ? '' : event.target.value)
                        }
                        aria-label={labels.columns.phase}
                      >
                        <option value={NONE}>{labels.common.noPhase}</option>
                        {phases.map((phase) => (
                          <option key={phase.id} value={phase.id}>
                            {phase.number ? `${phase.number}. ` : ''}
                            {phase.name}
                          </option>
                        ))}
                      </Select>
                    </Field>
                    <Field label={labels.editor.parentTask}>
                      <Select
                        value={parentTaskId || NONE}
                        onChange={(event) =>
                          setParentTaskId(event.target.value === NONE ? '' : event.target.value)
                        }
                        aria-label={labels.editor.parentTask}
                      >
                        <option value={NONE}>{labels.editor.topLevel}</option>
                        {availableParentTasks.map((item) => {
                          const depth =
                            currentPhaseHierarchy.get(item.id)?.depth ?? item.outlineLevel ?? 0
                          return (
                            <option key={item.id} value={item.id}>
                              {'  '.repeat(depth)}
                              {item.name || labels.badges.untitled}
                            </option>
                          )
                        })}
                      </Select>
                    </Field>
                  </div>

                  <Field label={labels.editor.description}>
                    <Textarea
                      value={description}
                      onChange={(event) => setDescription(event.target.value)}
                      rows={6}
                    />
                  </Field>
                </div>
              ) : null}

              {activeTab === 'dates' ? (
                <div className="space-y-4">
                  <div className="grid gap-3 md:grid-cols-2">
                    <Field label={labels.columns.start}>
                      <Input
                        type="date"
                        value={startDate}
                        onChange={(event) => setStartDate(event.target.value)}
                        disabled={isRollupLocked}
                      />
                    </Field>
                    <Field label={isMilestoneTask ? labels.taskType.milestone : labels.columns.finish}>
                      <Input
                        type="date"
                        value={isMilestoneTask ? startDate : endDate}
                        onChange={(event) =>
                          isMilestoneTask ? setStartDate(event.target.value) : setEndDate(event.target.value)
                        }
                        disabled={isRollupLocked}
                      />
                    </Field>
                  </div>

                  <div className="grid gap-3 md:grid-cols-2">
                    <Field label={labels.columns.constraint}>
                      <Select
                        value={constraintType}
                        onChange={(event) =>
                          setConstraintType(event.target.value as ScheduleConstraintType)
                        }
                        aria-label={labels.columns.constraint}
                      >
                        {(Object.keys(labels.constraintType) as ScheduleConstraintType[]).map((key) => (
                          <option key={key} value={key}>
                            {labels.constraintType[key]}
                          </option>
                        ))}
                      </Select>
                    </Field>
                    <Field label={labels.editor.constraintDate}>
                      <Input
                        data-testid="task-constraint-date"
                        type="date"
                        value={constraintDate}
                        onChange={(event) => setConstraintDate(event.target.value)}
                      />
                    </Field>
                  </div>

                  <div className="grid gap-3 md:grid-cols-2">
                    <Field label={labels.columns.deadline}>
                      <Input
                        data-testid="task-deadline-date"
                        type="date"
                        value={deadlineDate}
                        onChange={(event) => setDeadlineDate(event.target.value)}
                      />
                    </Field>
                    <Field
                      label={`${labels.columns.progress} (${Math.round((isMilestoneTask ? 0 : progress) * 100)}%)`}
                    >
                      <Slider
                        min={0}
                        max={1}
                        step={0.05}
                        value={isMilestoneTask ? 0 : progress}
                        onChange={(event) => setProgress(Number.parseFloat(event.target.value))}
                        disabled={isMilestoneTask || isRollupLocked}
                        aria-label={labels.columns.progress}
                      />
                    </Field>
                  </div>

                  <div className="grid gap-3 md:grid-cols-2">
                    <Field label={labels.columns.actualStart}>
                      <Input
                        type="date"
                        value={actualStart}
                        onChange={(event) => setActualStart(event.target.value)}
                        disabled={isRollupLocked}
                      />
                    </Field>
                    <Field label={labels.columns.actualFinish}>
                      <Input
                        type="date"
                        value={actualEnd}
                        onChange={(event) => setActualEnd(event.target.value)}
                        disabled={isRollupLocked}
                      />
                    </Field>
                  </div>

                  {isRollupLocked ? <Note>{labels.editor.rollupLocked}</Note> : null}
                </div>
              ) : null}

              {activeTab === 'resources' ? (
                <div className="space-y-3 rounded-xl border border-border bg-bg-subtle p-4">
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <h4 className="text-sm font-semibold text-fg">{labels.editor.resources}</h4>
                      <p className="mt-1 text-xs text-fg-muted">{labels.editor.resourcesHint}</p>
                    </div>
                    <Button
                      variant="secondary"
                      size="sm"
                      data-testid="task-add-resource"
                      onClick={() =>
                        setResourceAssignments((current) => [
                          ...current,
                          { resourceId: '', units: '1', role: '' },
                        ])
                      }
                    >
                      <Plus className="h-3.5 w-3.5" />
                    </Button>
                  </div>

                  {resourceAssignments.length === 0 ? (
                    <p className="text-xs text-fg-subtle">{labels.editor.noResources}</p>
                  ) : (
                    <div className="space-y-2">
                      {resourceAssignments.map((assignment, index) => (
                        <div
                          key={`${assignment.resourceId}-${index}`}
                          className="grid gap-2 rounded-lg border border-border bg-surface px-3 py-3 md:grid-cols-[minmax(0,1fr)_92px_minmax(0,1fr)_36px]"
                        >
                          <Select
                            data-testid={`task-resource-${index}`}
                            value={assignment.resourceId || NONE}
                            onChange={(event) =>
                              setAssignmentAt(index, {
                                resourceId: event.target.value === NONE ? '' : event.target.value,
                              })
                            }
                            aria-label={labels.editor.resources}
                          >
                            <option value={NONE}>{labels.common.none}</option>
                            {resources.map((resource) => (
                              <option key={resource.id} value={resource.id}>
                                {resource.name}
                              </option>
                            ))}
                          </Select>
                          <Input
                            data-testid={`task-resource-units-${index}`}
                            type="number"
                            step="0.25"
                            value={assignment.units}
                            aria-label={labels.editor.units}
                            onChange={(event) => setAssignmentAt(index, { units: event.target.value })}
                          />
                          <Input
                            data-testid={`task-resource-role-${index}`}
                            value={assignment.role}
                            placeholder={labels.editor.role}
                            aria-label={labels.editor.role}
                            onChange={(event) => setAssignmentAt(index, { role: event.target.value })}
                          />
                          <button
                            type="button"
                            aria-label={labels.editor.delete}
                            onClick={() =>
                              setResourceAssignments((current) =>
                                current.filter((_, entryIndex) => entryIndex !== index),
                              )
                            }
                            className="text-fg-subtle transition-colors hover:text-danger"
                          >
                            <Trash2 className="h-3.5 w-3.5" />
                          </button>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              ) : null}

              {activeTab === 'logic' ? (
                <div className="space-y-4">
                  <DependencyList
                    heading={labels.columns.predecessors}
                    empty={labels.editor.noPredecessors}
                    dependencies={predecessorDependencies}
                    nameOf={(dep) => taskNameById.get(dep.predecessorId) ?? labels.badges.untitled}
                    onRemove={(id) => void handleRemoveDependency(id)}
                    removeLabel={labels.editor.removePredecessor}
                    typeLabel={(type) => labels.dependencyTypeLong[type]}
                    lagLabel={(days) => `${labels.editor.lag}: ${days}`}
                  />

                  <div className="space-y-2 rounded-xl border border-dashed border-border p-4">
                    <Label>{labels.editor.addPredecessor}</Label>
                    <Select
                      value={selectedPredecessorId || NONE}
                      onChange={(event) =>
                        setSelectedPredecessorId(event.target.value === NONE ? '' : event.target.value)
                      }
                      aria-label={labels.editor.addPredecessor}
                    >
                      <option value={NONE}>{labels.common.none}</option>
                      {availablePredecessors.map((item) => (
                        <option key={item.id} value={item.id}>
                          {item.name || labels.badges.untitled}
                        </option>
                      ))}
                    </Select>
                    <div className="grid gap-2 md:grid-cols-[minmax(0,1fr)_88px]">
                      <Select
                        value={dependencyType}
                        onChange={(event) => setDependencyType(event.target.value as DependencyType)}
                        aria-label={labels.columns.predecessors}
                      >
                        {(Object.keys(labels.dependencyTypeLong) as DependencyType[]).map((key) => (
                          <option key={key} value={key}>
                            {labels.dependencyTypeLong[key]}
                          </option>
                        ))}
                      </Select>
                      <Input
                        type="number"
                        value={dependencyLagDays}
                        aria-label={labels.editor.lag}
                        onChange={(event) => setDependencyLagDays(event.target.value)}
                      />
                    </div>
                    {dependencyError && <p className="text-[11px] text-danger">{dependencyError}</p>}
                    <Button
                      variant="secondary"
                      size="sm"
                      onClick={() => void handleAddDependency()}
                      disabled={availablePredecessors.length === 0}
                    >
                      <Plus className="h-3.5 w-3.5" />
                      {labels.editor.addPredecessor}
                    </Button>
                  </div>

                  <DependencyList
                    heading={labels.editor.successors}
                    empty={labels.editor.noSuccessors}
                    dependencies={successorDependencies}
                    nameOf={(dep) => taskNameById.get(dep.successorId) ?? labels.badges.untitled}
                    onRemove={(id) => void handleRemoveDependency(id)}
                    removeLabel={labels.editor.removePredecessor}
                    typeLabel={(type) => labels.dependencyTypeLong[type]}
                    lagLabel={(days) => `${labels.editor.lag}: ${days}`}
                  />
                </div>
              ) : null}

              {formError && <p className="mt-4 text-xs text-danger">{formError}</p>}
            </div>

          </div>

          <aside className="sched-scroll min-h-0 overflow-y-auto border-l border-border bg-bg-subtle px-5 py-4">
            <div className="space-y-4">
              <Card title={labels.insights.heading}>
                <div className="grid grid-cols-2 gap-2 text-xs text-fg-muted">
                  <Metric label={labels.columns.float}>
                    {typeof totalFloat === 'number' && Number.isFinite(totalFloat)
                      ? labels.format.days(Math.round(totalFloat))
                      : '—'}
                  </Metric>
                  <Metric label={labels.list.variance}>
                    {variance.finishDays === null
                      ? '—'
                      : `${variance.finishDays > 0 ? '+' : ''}${variance.finishDays}d`}
                  </Metric>
                </div>
                <div className="flex flex-wrap gap-1">
                  {insights.criticalTaskIds.has(task.id) && (
                    <Badge>{labels.insights.critical}</Badge>
                  )}
                  {insights.overdueTaskIds.has(task.id) && (
                    <Badge variant="destructive">{labels.insights.overdue}</Badge>
                  )}
                  {variance.isBehind && <Badge variant="warning">{labels.insights.behindBaseline}</Badge>}
                  {insights.violatingTaskIds.has(task.id) && (
                    <Badge variant="warning">{labels.insights.dependencyViolation}</Badge>
                  )}
                  {insights.deadlineMissTaskIds.has(task.id) && (
                    <Badge variant="destructive">{labels.insights.deadlineMissed}</Badge>
                  )}
                  {insights.constraintViolationTaskIds.has(task.id) && (
                    <Badge variant="warning">{labels.insights.constraintViolation}</Badge>
                  )}
                  {insights.actualDateGapTaskIds.has(task.id) && (
                    <Badge variant="warning">{labels.insights.actualDateGap}</Badge>
                  )}
                  {insights.resourceConflictTaskIds.has(task.id) && (
                    <Badge variant="warning">{labels.insights.resourceConflict}</Badge>
                  )}
                </div>
              </Card>

              <Card title={labels.list.wbs}>
                <Row label={labels.list.wbs}>{outlineLevel}</Row>
                <Row label={labels.editor.parentTask}>{parentTask?.name ?? labels.editor.topLevel}</Row>
                <Row label={labels.editor.children}>
                  {currentPhaseHierarchy.get(task.id)?.childCount ?? 0}
                </Row>
                <div className="rounded-lg bg-bg-subtle px-3 py-2 text-[11px] text-fg-muted">
                  {wbsPath.length > 0 ? wbsPath.join(' / ') : labels.editor.topLevel}
                </div>
              </Card>

              <Card title={labels.editor.dates}>
                <Row label={labels.columns.start}>{startDate || labels.menu.tbd}</Row>
                <Row label={labels.columns.finish}>
                  {(isMilestoneTask ? startDate : endDate) || labels.menu.tbd}
                </Row>
                <Row label={labels.columns.resources}>
                  {resourceAssignments.filter((a) => a.resourceId).length}
                </Row>
              </Card>
            </div>
          </aside>
        </div>
      </div>
    </Dialog>
  )
}

function DependencyList({
  heading,
  empty,
  dependencies,
  nameOf,
  onRemove,
  removeLabel,
  typeLabel,
  lagLabel,
}: {
  heading: string
  empty: string
  dependencies: ScheduleDependency[]
  nameOf: (dep: ScheduleDependency) => string
  onRemove: (id: string) => void
  removeLabel: string
  typeLabel: (type: DependencyType) => string
  lagLabel: (days: number) => string
}) {
  return (
    <div className="space-y-2">
      <Label>{heading}</Label>
      {dependencies.length === 0 ? (
        <p className="text-xs text-fg-subtle">{empty}</p>
      ) : (
        <div className="space-y-2">
          {dependencies.map((dependency) => (
            <div
              key={dependency.id}
              className="flex items-center gap-2 rounded-lg border border-border bg-surface px-3 py-2"
            >
              <div className="min-w-0 flex-1">
                <p className="truncate text-xs text-fg">{nameOf(dependency)}</p>
                <p className="text-[11px] text-fg-subtle">
                  {typeLabel(dependency.type)}
                  {dependency.lagDays ? ` · ${lagLabel(dependency.lagDays)}` : ''}
                </p>
              </div>
              <button
                type="button"
                onClick={() => onRemove(dependency.id)}
                aria-label={removeLabel}
                title={removeLabel}
                className="text-fg-subtle transition-colors hover:text-danger"
              >
                <Trash2 className="h-3.5 w-3.5" />
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="space-y-1.5">
      <Label>{label}</Label>
      {children}
    </div>
  )
}

function Hint({ children }: { children: React.ReactNode }) {
  return <p className="text-[11px] text-fg-subtle">{children}</p>
}

function Note({ children }: { children: React.ReactNode }) {
  return (
    <div className="rounded-xl border border-border bg-bg-subtle px-4 py-3 text-xs text-fg-muted">
      {children}
    </div>
  )
}

function Card({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="space-y-2 rounded-xl border border-border bg-surface px-4 py-4">
      <h4 className="text-xs font-semibold tracking-[0.16em] text-fg-subtle uppercase">{title}</h4>
      {children}
    </div>
  )
}

function Metric({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="rounded-lg border border-border bg-bg-subtle px-3 py-2">
      <p className="text-[10px] tracking-wide text-fg-subtle uppercase">{label}</p>
      <p className="mt-1 font-medium text-fg">{children}</p>
    </div>
  )
}

function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex items-center justify-between gap-3 text-xs">
      <span className="text-fg-subtle">{label}</span>
      <span className="truncate text-right font-medium text-fg">{children}</span>
    </div>
  )
}

