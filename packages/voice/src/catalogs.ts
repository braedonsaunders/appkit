import type { VoiceCatalogItem } from './types'

// Static catalogs for providers whose options are documented constants;
// live catalogs (ElevenLabs voices) are fetched with the tenant's own key.

export const DEEPGRAM_STT_MODELS: VoiceCatalogItem[] = [
  { id: 'nova-3', name: 'Nova 3', hint: 'best accuracy, multilingual' },
  { id: 'nova-2', name: 'Nova 2', hint: 'fast, proven' },
  { id: 'nova-2-phonecall', name: 'Nova 2 Phonecall', hint: 'tuned for 8kHz telephony' },
]

export const ELEVENLABS_TTS_MODELS: VoiceCatalogItem[] = [
  { id: 'eleven_flash_v2_5', name: 'Flash v2.5', hint: 'lowest latency (~75ms)' },
  { id: 'eleven_turbo_v2_5', name: 'Turbo v2.5', hint: 'low latency, high quality' },
  { id: 'eleven_multilingual_v2', name: 'Multilingual v2', hint: 'best quality, 29 languages' },
]

export const OPENAI_REALTIME_MODELS: VoiceCatalogItem[] = [
  { id: 'gpt-realtime', name: 'GPT Realtime', hint: 'flagship speech-to-speech' },
  { id: 'gpt-realtime-mini', name: 'GPT Realtime Mini', hint: 'cheaper, faster' },
]

export const OPENAI_REALTIME_VOICES: VoiceCatalogItem[] = [
  { id: 'alloy', name: 'Alloy' },
  { id: 'ash', name: 'Ash' },
  { id: 'ballad', name: 'Ballad' },
  { id: 'cedar', name: 'Cedar' },
  { id: 'coral', name: 'Coral' },
  { id: 'echo', name: 'Echo' },
  { id: 'marin', name: 'Marin' },
  { id: 'sage', name: 'Sage' },
  { id: 'shimmer', name: 'Shimmer' },
  { id: 'verse', name: 'Verse' },
]

export const GEMINI_LIVE_MODELS: VoiceCatalogItem[] = [
  { id: 'gemini-2.5-flash-native-audio-preview-09-2025', name: 'Gemini 2.5 Flash Native Audio' },
  { id: 'gemini-live-2.5-flash-preview', name: 'Gemini Live 2.5 Flash' },
]

export const GEMINI_LIVE_VOICES: VoiceCatalogItem[] = [
  { id: 'Puck', name: 'Puck' },
  { id: 'Charon', name: 'Charon' },
  { id: 'Kore', name: 'Kore' },
  { id: 'Fenrir', name: 'Fenrir' },
  { id: 'Aoede', name: 'Aoede' },
  { id: 'Leda', name: 'Leda' },
  { id: 'Orus', name: 'Orus' },
  { id: 'Zephyr', name: 'Zephyr' },
]

/** Live voice catalog from the tenant's own ElevenLabs account (incl. clones). */
export async function listElevenLabsVoices(apiKey: string): Promise<VoiceCatalogItem[]> {
  const response = await fetch('https://api.elevenlabs.io/v2/voices?page_size=100', {
    headers: { 'xi-api-key': apiKey },
    signal: AbortSignal.timeout(15_000),
  })
  if (!response.ok) throw new Error(`ElevenLabs voices fetch failed: ${response.status} ${await response.text()}`)
  const json = (await response.json()) as {
    voices?: { voice_id: string; name: string; category?: string; labels?: Record<string, string> }[]
  }
  return (json.voices ?? []).map((voice) => ({
    id: voice.voice_id,
    name: voice.name,
    ...(voice.category ? { hint: voice.category } : {}),
  }))
}
