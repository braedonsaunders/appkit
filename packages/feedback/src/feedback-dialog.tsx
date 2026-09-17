'use client'

import * as React from 'react'
import { Badge, Button, Dialog, Textarea } from '@braedonsaunders/appkit-ui'
import { DEFAULT_FEEDBACK_LABELS, mergeFeedbackLabels, workingStatusForTool, type FeedbackLabels } from './labels'
import { sanitizePathname } from './redact'
import type { FeedbackClient, FeedbackContext, FeedbackQuestion, FeedbackTurnResult } from './types'

type View =
  | { kind: 'compose' }
  | { kind: 'working'; status: string }
  | { kind: 'guidance'; result: Extract<FeedbackTurnResult, { kind: 'guidance' }> }
  | { kind: 'questions'; result: Extract<FeedbackTurnResult, { kind: 'questions' }> }
  | { kind: 'filed'; result: Extract<FeedbackTurnResult, { kind: 'filed' }> }
  | { kind: 'unavailable'; message: string }

export type FeedbackDialogProps = {
  open: boolean
  onClose: () => void
  client: FeedbackClient
  context: FeedbackContext
  labels?: Partial<FeedbackLabels>
  enabled?: boolean
  unavailableMessage?: string
}

export function FeedbackDialog({
  open,
  onClose,
  client,
  context,
  labels: labelOverrides,
  enabled = true,
  unavailableMessage,
}: FeedbackDialogProps) {
  const labels = mergeFeedbackLabels(labelOverrides)
  const [text, setText] = React.useState('')
  const [includePage, setIncludePage] = React.useState(true)
  const [answers, setAnswers] = React.useState<Record<string, string>>({})
  const [view, setView] = React.useState<View>({ kind: 'compose' })
  const busy = view.kind === 'working'

  React.useEffect(() => {
    if (open) return
    setText('')
    setIncludePage(true)
    setAnswers({})
    setView({ kind: 'compose' })
  }, [open])

  const pageLabel = includePage ? sanitizePathname(context.pathname).pathname : null

  async function submit(next: { forceFile?: boolean; answers?: Record<string, string> }) {
    const report = text.trim()
    if (!report || busy) return
    setView({ kind: 'working', status: workingStatusForTool(undefined, labels) })
    try {
      const result = await client.send({
        text: report,
        context: includePage ? context : { ...context, pathname: '/', pageTitle: undefined },
        answers: next.answers ?? answers,
        forceFile: next.forceFile,
      })
      setView(viewFromResult(result, unavailableMessage ?? labels.unavailableTitle))
    } catch {
      setView({ kind: 'unavailable', message: unavailableMessage ?? DEFAULT_FEEDBACK_LABELS.unavailableTitle })
    }
  }

  return (
    <Dialog
      open={open}
      onClose={busy ? () => undefined : onClose}
      title={titleFor(view, labels)}
      description={view.kind === 'compose' ? labels.description : undefined}
      closeLabel={labels.close}
      hideClose={busy}
      size="md"
      footer={
        view.kind === 'compose' ? (
          <Button type="button" onClick={() => void submit({})} disabled={!text.trim() || !enabled}>
            {labels.send}
          </Button>
        ) : view.kind === 'working' ? (
          <Button type="button" disabled>{labels.sending}</Button>
        ) : view.kind === 'guidance' ? (
          <>
            <Button type="button" variant="outline" onClick={onClose}>{labels.thatHelped}</Button>
            <Button type="button" onClick={() => void submit({ forceFile: true })}>{labels.stillABug}</Button>
          </>
        ) : view.kind === 'questions' ? (
          <Button type="button" onClick={() => void submit({ answers })} disabled={!hasAnswers(view.result.questions, answers)}>
            {labels.continue}
          </Button>
        ) : (
          <Button type="button" onClick={onClose}>{labels.close}</Button>
        )
      }
    >
      {view.kind === 'compose' || view.kind === 'working' ? (
        <div className="space-y-3">
          <Textarea
            value={text}
            onChange={(event) => setText(event.target.value)}
            placeholder={labels.placeholder}
            rows={5}
            disabled={busy || !enabled}
            autoFocus
          />
          {pageLabel ? (
            <div className="flex flex-wrap items-center gap-2">
              <Badge variant="secondary">{labels.pageChip}: {pageLabel}</Badge>
              <button
                type="button"
                onClick={() => setIncludePage(false)}
                disabled={busy}
                className="text-xs font-medium text-fg-muted hover:text-fg"
              >
                {labels.removePage}
              </button>
            </div>
          ) : null}
          {view.kind === 'working' ? (
            <p className="text-sm text-fg-muted" role="status">{view.status}</p>
          ) : null}
          {!enabled ? <p className="text-sm text-fg-muted">{unavailableMessage ?? labels.unavailableTitle}</p> : null}
        </div>
      ) : null}

      {view.kind === 'guidance' ? (
        <div className="space-y-3">
          <p>{view.result.explanation}</p>
          {view.result.help.length > 0 ? (
            <ul className="space-y-2">
              {view.result.help.map((item) => (
                <li key={item.id}>
                  <a href={item.url} className="text-sm font-medium text-primary hover:underline">
                    {item.title}
                  </a>
                  {item.excerpt ? <p className="text-xs text-fg-muted">{item.excerpt}</p> : null}
                </li>
              ))}
            </ul>
          ) : null}
        </div>
      ) : null}

      {view.kind === 'questions' ? (
        <div className="space-y-4">
          {view.result.questions.map((question) => (
            <fieldset key={question.id} className="space-y-2">
              <legend className="text-sm font-medium text-fg">{question.prompt}</legend>
              {question.choices?.length ? (
                <div className="flex flex-wrap gap-2">
                  {question.choices.map((choice) => {
                    const selected = answers[question.id] === choice
                    return (
                      <button
                        key={choice}
                        type="button"
                        onClick={() => setAnswers((current) => ({ ...current, [question.id]: choice }))}
                        className={selected
                          ? 'rounded-full border border-primary bg-primary-subtle px-3 py-1.5 text-sm text-primary'
                          : 'rounded-full border border-border px-3 py-1.5 text-sm text-fg-muted hover:border-border-strong hover:text-fg'}
                      >
                        {choice}
                      </button>
                    )
                  })}
                </div>
              ) : (
                <Textarea
                  value={answers[question.id] ?? ''}
                  onChange={(event) => setAnswers((current) => ({ ...current, [question.id]: event.target.value }))}
                  rows={2}
                />
              )}
            </fieldset>
          ))}
        </div>
      ) : null}

      {view.kind === 'filed' ? (
        <div className="space-y-3">
          <p>{labels.filedBody}</p>
          <p className="text-sm font-medium text-fg">#{view.result.issue.number} · {view.result.issue.title}</p>
          <a href={view.result.issue.url} className="text-sm font-medium text-primary hover:underline" target="_blank" rel="noreferrer">
            {labels.openIssue}
          </a>
          {view.result.stripped.length > 0 ? (
            <div>
              <p className="text-xs font-medium text-fg-muted">{labels.strippedHeading}</p>
              <p className="text-xs text-fg-muted">{view.result.stripped.join(', ')}</p>
            </div>
          ) : null}
        </div>
      ) : null}

      {view.kind === 'unavailable' ? <p>{view.message}</p> : null}
    </Dialog>
  )
}

function titleFor(view: View, labels: FeedbackLabels): string {
  if (view.kind === 'guidance') return view.result.title
  if (view.kind === 'filed') return labels.filedTitle
  if (view.kind === 'unavailable') return labels.unavailableTitle
  return labels.title
}

function viewFromResult(result: FeedbackTurnResult, unavailable: string): View {
  if (result.kind === 'guidance') return { kind: 'guidance', result }
  if (result.kind === 'questions') return { kind: 'questions', result }
  if (result.kind === 'filed') return { kind: 'filed', result }
  return { kind: 'unavailable', message: result.message || unavailable }
}

function hasAnswers(questions: FeedbackQuestion[], answers: Record<string, string>): boolean {
  return questions.every((question) => Boolean(answers[question.id]?.trim()))
}
