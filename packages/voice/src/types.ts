/**
 * The voice seam. Applications resolve tenant-sealed credentials and pass
 * them in per call — this package never reads env for provider keys.
 *
 * Two shapes per agent (see the consuming app's voice design):
 * - 'cascade': streaming STT → the agent's own governed text model → TTS.
 *   Model-agnostic and policy-faithful; the doctrinal default.
 * - 'realtime': native speech-to-speech (OpenAI Realtime, Gemini Live) when
 *   latency matters more than provider freedom.
 */
export type VoiceMode = 'cascade' | 'realtime'

export type SttProvider = 'deepgram'
export type TtsProvider = 'elevenlabs'
export type RealtimeProvider = 'openai' | 'google'

/** Per-agent voice configuration — HR profile data, stored by the app. */
export type AgentVoiceConfig = {
  mode: VoiceMode
  /** BCP-47 language the agent listens/speaks in. */
  language?: string
  /** Free-text speaking style hint fed to the speech layer's prompt. */
  style?: string
  cascade?: {
    sttProvider: SttProvider
    sttModel: string
    ttsProvider: TtsProvider
    ttsVoiceId: string
    ttsModel: string
  }
  realtime?: {
    provider: RealtimeProvider
    model: string
    voice: string
  }
}

/** An unsealed speech-provider credential, resolved by the application. */
export type SpeechProviderCredential =
  | { provider: 'deepgram'; apiKey: string }
  | { provider: 'elevenlabs'; apiKey: string }

export type VoiceCatalogItem = { id: string; name: string; hint?: string }
