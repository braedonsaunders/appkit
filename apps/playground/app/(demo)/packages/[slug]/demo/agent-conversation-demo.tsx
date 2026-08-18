'use client'

import { AgentPanel } from '@braedonsaunders/appkit-ai/react'
import { Card } from '@braedonsaunders/appkit-ui'

export function AgentConversationDemo() {
  return (
    <Card className="h-[42rem] overflow-hidden">
      <AgentPanel
        enabled
        dispatchState="running"
        initialMessages={[
          { id: 'user-1', role: 'user', parts: [{ type: 'text', text: 'Reconcile this morning’s delivery exceptions.' }] },
          { id: 'assistant-1', role: 'assistant', parts: [{ type: 'text', text: 'I’m checking the delivery ledger and the exception procedure now.' }] },
        ]}
        queuedMessages={[
          { id: 'queued-1', text: 'Draft updates for the affected customers', position: 1, status: 'queued', editable: true, removable: true },
          { id: 'queued-2', text: 'Prepare the afternoon operations summary', position: 2, status: 'failed', retryable: true, removable: true },
        ]}
        enqueue={async () => undefined}
        onEditQueuedMessage={() => undefined}
        onRemoveQueuedMessage={() => undefined}
        onRetryQueuedMessage={() => undefined}
      />
    </Card>
  )
}
