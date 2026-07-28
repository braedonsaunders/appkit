// Live key verification — the app calls these before sealing a credential,
// mirroring @appkit/ai's ping-before-save doctrine.

export type VerifyResult = { ok: true } | { ok: false; message: string }

export async function verifyDeepgramKey(apiKey: string): Promise<VerifyResult> {
  try {
    const response = await fetch('https://api.deepgram.com/v1/auth/token', {
      headers: { Authorization: `Token ${apiKey}` },
      signal: AbortSignal.timeout(10_000),
    })
    if (response.ok) return { ok: true }
    return { ok: false, message: `Deepgram rejected the key (${response.status}).` }
  } catch (error) {
    return { ok: false, message: error instanceof Error ? error.message : String(error) }
  }
}

export async function verifyElevenLabsKey(apiKey: string): Promise<VerifyResult> {
  try {
    const response = await fetch('https://api.elevenlabs.io/v1/user', {
      headers: { 'xi-api-key': apiKey },
      signal: AbortSignal.timeout(10_000),
    })
    if (response.ok) return { ok: true }
    return { ok: false, message: `ElevenLabs rejected the key (${response.status}).` }
  } catch (error) {
    return { ok: false, message: error instanceof Error ? error.message : String(error) }
  }
}
