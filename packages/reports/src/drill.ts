export type ReportDrillCodec<T> = {
  encode(target: T): string
  parse(raw: string | null): T | null
}

/**
 * URL drill state is untrusted input. This factory preserves the source
 * implementation's bounded, fail-closed contract while allowing each app to
 * validate its own target vocabulary.
 */
export function createReportDrillCodec<T>(
  validate: (value: unknown) => T | null,
  options: { maxLength?: number } = {},
): ReportDrillCodec<T> {
  const maxLength = Math.max(256, Math.min(64_000, Math.trunc(options.maxLength ?? 8_000)))
  return {
    encode(target) {
      const encoded = JSON.stringify(target)
      if (encoded.length > maxLength) throw new Error('Report drill target is too large')
      return encoded
    },
    parse(raw) {
      if (!raw || raw.length > maxLength) return null
      try {
        return validate(JSON.parse(raw))
      } catch {
        return null
      }
    },
  }
}
