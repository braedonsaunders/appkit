'use client'

import * as React from 'react'
import { AgentPanel, AgentTypingIndicator } from '@braedonsaunders/appkit-ai/react'
import { Card } from '@braedonsaunders/appkit-ui'

export function AgentConversationDemo() {
  const [secretStatus, setSecretStatus] = React.useState<'pending' | 'stored' | 'expired'>('pending')

  return (
    <div className="space-y-4">
      <Card className="flex items-center gap-3 p-4">
        <span className="text-sm font-medium text-fg">Live response</span>
        <AgentTypingIndicator />
      </Card>
      <Card className="h-[42rem] overflow-hidden">
        <AgentPanel
          key={secretStatus}
          enabled
          dispatchState="running"
          initialMessages={[
            { id: 'user-1', role: 'user', parts: [{ type: 'text', text: 'Reconcile this morning’s delivery exceptions.' }] },
            {
              id: 'assistant-1',
              role: 'assistant',
              parts: [
                { type: 'text', text: 'I can send the carrier update once you connect the delivery provider.' },
                { type: 'secret-request', requestId: 'delivery-provider-demo', providerLabel: 'Delivery provider', credentialLabel: 'API key', purpose: 'Authorize the approved carrier status update.', helpUrl: 'https://example.com/docs/api-keys', status: secretStatus },
              ],
            },
          ]}
          queuedMessages={[
            { id: 'queued-1', text: 'Draft updates for the affected customers', position: 1, status: 'queued', editable: true, removable: true },
            { id: 'queued-2', text: 'Prepare the afternoon operations summary', position: 2, status: 'failed', retryable: true, removable: true },
          ]}
          enqueue={async () => undefined}
          onEditQueuedMessage={() => undefined}
          onRemoveQueuedMessage={() => undefined}
          onRetryQueuedMessage={() => undefined}
          onSubmitSecretRequest={async (_requestId, secret) => {
            if (!secret) throw new Error('A credential is required')
            setSecretStatus('stored')
          }}
          onCancelSecretRequest={async () => setSecretStatus('expired')}
        />
      </Card>
    </div>
  )
}
