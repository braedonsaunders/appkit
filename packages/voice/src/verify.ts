// Live key verification — the app calls these before sealing a credential,
// mirroring @braedonsaunders/appkit-ai's ping-before-save doctrine.
//
// A check must ask for exactly the permission the product will use, and no
// more. Providers issue scoped keys, and an operator who follows least
// privilege must not be told their working key is invalid because the check
// reached for an account-wide endpoint the key was never meant to touch.

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
    // The voice catalog, which is what the product reads from this account —
    // NOT /v1/user, which needs the account-wide `user_read` permission a
    // voices-and-speech key is right not to carry.
    const response = await fetch('https://api.elevenlabs.io/v2/voices?page_size=1', {
      headers: { 'xi-api-key': apiKey },
      signal: AbortSignal.timeout(10_000),
    })
    if (response.ok) return { ok: true }
    if (response.status === 401 || response.status === 403) {
      return {
        ok: false,
        message:
          'ElevenLabs would not accept this key for reading voices. Check that it is current and that its permissions include voices and text to speech.',
      }
    }
    return { ok: false, message: `ElevenLabs rejected the key (${response.status}).` }
  } catch (error) {
    return { ok: false, message: error instanceof Error ? error.message : String(error) }
  }
}
