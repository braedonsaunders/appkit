import { AgentPanel } from '@appkit/ai/react'

export const metadata = { title: 'AI assistant — appkit' }

export default function AssistantPage() {
  return (
    <AgentPanel
      enabled={false}
      labels={{
        title: 'appkit agent',
        disabledDescription:
          'The multi-step agent runtime and streaming assistant UI are active, but this public demo intentionally has no AI provider credentials.',
      }}
    />
  )
}
