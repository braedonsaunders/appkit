'use client'

import * as React from 'react'
import { AgentPanel, AgentTypingIndicator } from '@braedonsaunders/appkit-ai/react'
import { Card } from '@braedonsaunders/appkit-ui'

export function AgentConversationDemo() {
  const [secretStatus, setSecretStatus] = React.useState<'pending' | 'stored' | 'expired'>('pending')
  const [approvalStatus, setApprovalStatus] = React.useState<'pending' | 'approved' | 'rejected'>('pending')
  const [olderLoaded, setOlderLoaded] = React.useState(false)

  return (
    <div className="space-y-4">
      <Card className="flex items-center gap-3 p-4">
        <span className="text-sm font-medium text-fg">Live response</span>
        <AgentTypingIndicator />
      </Card>
      <Card className="flex h-[42rem] overflow-hidden">
        <AgentPanel
          key={`${secretStatus}:${approvalStatus}`}
          enabled
          assistantAvatar={<span role="img" aria-label="Avery Morgan" className="flex size-full items-center justify-center bg-primary-subtle text-[10px] font-semibold text-primary">AM</span>}
          dispatchState="running"
          initialMessages={[
            ...(olderLoaded ? [
              { id: 'user-older', role: 'user' as const, parts: [{ type: 'text', text: 'Use this reference: https://example.com/a-very-long-unbroken-reference-that-must-stay-inside-the-chat-panel-without-horizontal-scrolling' }] },
              { id: 'assistant-older', role: 'assistant' as const, createdAt: '2026-09-14T13:30:00.000Z', parts: [{ type: 'text', text: '| Exception | Resolution |\n| --- | --- |\n| an_unbroken_delivery_identifier_that_must_wrap | Keep it within this conversation width |' }] },
            ] : []),
            { id: 'user-1', role: 'user', parts: [{ type: 'text', text: 'Reconcile this morning’s delivery exceptions.' }] },
            {
              id: 'assistant-1',
              role: 'assistant',
              createdAt: '2026-09-14T13:42:00.000Z',
              parts: [
                { type: 'text', text: 'I can send the carrier update once you connect the delivery provider.' },
                { type: 'secret-request', requestId: 'delivery-provider-demo', providerLabel: 'Delivery provider', credentialLabel: 'API key', purpose: 'Authorize the approved carrier status update.', helpUrl: 'https://example.com/docs/api-keys', status: secretStatus },
              ],
            },
            { id: 'user-2', role: 'user', parts: [{ type: 'text', text: 'Go ahead and prepare the customer update.' }] },
            {
              id: 'assistant-2',
              role: 'assistant',
              createdAt: '2026-09-14T14:08:00.000Z',
              parts: [
                { type: 'text', text: 'It’s ready for your approval. Once you approve it, I’ll continue automatically.' },
                {
                  type: 'approval-request',
                  approvalId: 'customer-update-demo',
                  categoryLabel: 'External email',
                  description: 'Send the prepared delivery update to the affected customers.',
                  details: [
                    { label: 'Audience', value: '12 affected customers' },
                    { label: 'Subject', value: 'Update on today’s delivery' },
                  ],
                  status: approvalStatus,
                },
              ],
            },
          ]}
          hasOlderMessages={!olderLoaded}
          onLoadOlderMessages={async () => setOlderLoaded(true)}
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
          onDecideApprovalRequest={async (_approvalId, decision) => setApprovalStatus(decision)}
        />
      </Card>
    </div>
  )
}
