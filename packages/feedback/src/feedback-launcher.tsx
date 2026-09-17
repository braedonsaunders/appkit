'use client'

import * as React from 'react'
import { CircleDot } from 'lucide-react'
import { mergeFeedbackLabels, type FeedbackLabels } from './labels'
import { FeedbackDialog } from './feedback-dialog'
import type { FeedbackClient, FeedbackContext } from './types'

export type FeedbackLauncherProps = {
  client: FeedbackClient
  context: FeedbackContext
  labels?: Partial<FeedbackLabels>
  enabled?: boolean
  unavailableMessage?: string
  walkthrough?: string
}

export function FeedbackLauncher({
  client,
  context,
  labels: labelOverrides,
  enabled = true,
  unavailableMessage,
  walkthrough = 'report-issue',
}: FeedbackLauncherProps) {
  const labels = mergeFeedbackLabels(labelOverrides)
  const [open, setOpen] = React.useState(false)

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        aria-label={labels.launcherAria}
        data-walkthrough={walkthrough}
        className="grid size-8 shrink-0 place-items-center rounded-md text-fg-muted transition-colors hover:bg-surface-hover hover:text-fg"
      >
        <CircleDot size={17} />
      </button>
      <FeedbackDialog
        open={open}
        onClose={() => setOpen(false)}
        client={client}
        context={context}
        labels={labels}
        enabled={enabled}
        unavailableMessage={unavailableMessage}
      />
    </>
  )
}
