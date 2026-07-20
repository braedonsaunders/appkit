import {
  stepCountIs,
  streamText,
  type LanguageModel,
  type ModelMessage,
  type ToolSet,
  type UIMessage,
} from 'ai'

export type AgentModelTier = 'fast' | 'smart'

export class AgentDisabledError extends Error {
  constructor(message = 'The AI agent is not configured.') {
    super(message)
    this.name = 'AgentDisabledError'
  }
}

export type AgentTurnResult = {
  parts: UIMessage['parts']
  aborted: boolean
  finishReason: string
  usage: { inputTokens: number; outputTokens: number }
}

export type RunAgentTurnArgs = {
  model: LanguageModel | null | undefined
  messages: ModelMessage[]
  system: string
  tools: ToolSet
  maxSteps?: number
  temperature?: number
  abortSignal?: AbortSignal
  onComplete?: (result: AgentTurnResult) => void | Promise<void>
  errorMessage?: string
}

export const DEFAULT_AGENT_MAX_STEPS = 12

export function normalizeAgentMaxSteps(value = DEFAULT_AGENT_MAX_STEPS): number {
  if (!Number.isFinite(value)) return DEFAULT_AGENT_MAX_STEPS
  return Math.max(2, Math.min(32, Math.trunc(value)))
}

/**
 * One tenant-agnostic, multi-step tool-using turn. The consuming app resolves
 * the model and closes every tool over its own RequestContext/RBAC boundary.
 */
export function runAgentTurn(args: RunAgentTurnArgs): Response {
  if (!args.model) throw new AgentDisabledError()
  const result = streamText({
    model: args.model,
    system: args.system,
    messages: args.messages,
    tools: args.tools,
    stopWhen: stepCountIs(normalizeAgentMaxSteps(args.maxSteps)),
    temperature: args.temperature ?? 0.3,
    abortSignal: args.abortSignal,
  })

  return result.toUIMessageStreamResponse({
    sendReasoning: false,
    onError: () => args.errorMessage ?? 'The assistant hit an error completing that step. Please try again.',
    onFinish: async ({ responseMessage, isAborted, finishReason }) => {
      if (!args.onComplete) return
      let usage = { inputTokens: 0, outputTokens: 0 }
      try {
        const total = await result.totalUsage
        usage = { inputTokens: total.inputTokens ?? 0, outputTokens: total.outputTokens ?? 0 }
      } catch {
        // Provider usage metadata is optional; completion content still lands.
      }
      await args.onComplete({
        parts: responseMessage.parts,
        aborted: isAborted,
        finishReason: finishReason ?? (isAborted ? 'abort' : 'stop'),
        usage,
      })
    },
  })
}
