export const SUPPORTED_LOCALES = [
  // The original three stay first so normalized locale lists keep their order.
  'en',
  'fr',
  'es',
  'cs',
  'da',
  'de',
  'fi',
  'it',
  'ja',
  'ko',
  'nb',
  'nl',
  'pl',
  'pt-BR',
  'ru',
  'sv',
  'tr',
  'uk',
  'zh-CN',
  'zh-TW',
] as const

export type AppLocale = (typeof SUPPORTED_LOCALES)[number]

export const DEFAULT_LOCALE: AppLocale = 'en'

/** Every supported locale with its English name and its name in its own language. */
export const LOCALE_OPTIONS = [
  { value: 'en', label: 'English', nativeLabel: 'English' },
  { value: 'fr', label: 'French', nativeLabel: 'Français' },
  { value: 'es', label: 'Spanish', nativeLabel: 'Español' },
  { value: 'cs', label: 'Czech', nativeLabel: 'Čeština' },
  { value: 'da', label: 'Danish', nativeLabel: 'Dansk' },
  { value: 'de', label: 'German', nativeLabel: 'Deutsch' },
  { value: 'fi', label: 'Finnish', nativeLabel: 'Suomi' },
  { value: 'it', label: 'Italian', nativeLabel: 'Italiano' },
  { value: 'ja', label: 'Japanese', nativeLabel: '日本語' },
  { value: 'ko', label: 'Korean', nativeLabel: '한국어' },
  { value: 'nb', label: 'Norwegian', nativeLabel: 'Norsk bokmål' },
  { value: 'nl', label: 'Dutch', nativeLabel: 'Nederlands' },
  { value: 'pl', label: 'Polish', nativeLabel: 'Polski' },
  { value: 'pt-BR', label: 'Portuguese (Brazil)', nativeLabel: 'Português (Brasil)' },
  { value: 'ru', label: 'Russian', nativeLabel: 'Русский' },
  { value: 'sv', label: 'Swedish', nativeLabel: 'Svenska' },
  { value: 'tr', label: 'Turkish', nativeLabel: 'Türkçe' },
  { value: 'uk', label: 'Ukrainian', nativeLabel: 'Українська' },
  { value: 'zh-CN', label: 'Chinese (Simplified)', nativeLabel: '简体中文' },
  { value: 'zh-TW', label: 'Chinese (Traditional)', nativeLabel: '繁體中文' },
] as const satisfies readonly {
  value: AppLocale
  label: string
  nativeLabel: string
}[]

const LOCALE_BY_TAG = new Map<string, AppLocale>(
  SUPPORTED_LOCALES.map((locale) => [locale.toLowerCase(), locale]),
)

/** Language, region, and script tags that belong on a supported locale. */
const LOCALE_ALIASES: Readonly<Record<string, AppLocale>> = {
  pt: 'pt-BR',
  no: 'nb',
  nn: 'nb',
  zh: 'zh-CN',
  'zh-hans': 'zh-CN',
  'zh-sg': 'zh-CN',
  'zh-hant': 'zh-TW',
  'zh-hk': 'zh-TW',
  'zh-mo': 'zh-TW',
}

export function isAppLocale(value: unknown): value is AppLocale {
  return typeof value === 'string' && (SUPPORTED_LOCALES as readonly string[]).includes(value)
}

export function parseAppLocale(value: unknown): AppLocale | null {
  return isAppLocale(value) ? value : null
}

/**
 * Map one BCP 47 tag onto a supported locale, most specific subtags first:
 * `de-AT` → `de`, `pt-PT` → `pt-BR`, `zh-Hant-HK` → `zh-TW`.
 */
export function matchLocale(tag: string): AppLocale | null {
  const parts = tag.trim().toLowerCase().replace(/_/g, '-').split('-')
  for (let length = parts.length; length > 0; length -= 1) {
    const candidate = parts.slice(0, length).join('-')
    const match = LOCALE_BY_TAG.get(candidate) ?? LOCALE_ALIASES[candidate]
    if (match) return match
  }
  return null
}

/** The first supported locale in a preference list such as `navigator.languages`. */
export function negotiateLocale(requested: readonly string[]): AppLocale {
  for (const tag of requested) {
    const locale = matchLocale(tag)
    if (locale) return locale
  }
  return DEFAULT_LOCALE
}

/** Best-effort locale negotiation for unauthenticated/public requests. */
export function localeFromAcceptLanguage(header: string | null | undefined): AppLocale {
  if (!header) return DEFAULT_LOCALE
  const requested = header
    .split(',')
    .map((part) => {
      const [tag = '', ...parameters] = part.trim().split(';')
      const quality = parameters
        .map((parameter) => parameter.trim())
        .find((parameter) => parameter.startsWith('q='))
      const parsedQuality = quality ? Number(quality.slice(2)) : 1
      return {
        locale: matchLocale(tag),
        quality: Number.isFinite(parsedQuality) ? Math.max(0, Math.min(1, parsedQuality)) : 0,
      }
    })
    .filter(
      (entry): entry is { locale: AppLocale; quality: number } =>
        entry.locale !== null && entry.quality > 0,
    )
    .sort((a, b) => b.quality - a.quality)
  return requested[0]?.locale ?? DEFAULT_LOCALE
}

/**
 * Return a stable, de-duplicated supported-locale list. Unknown persisted values
 * are deliberately discarded so stale configuration can never reach Intl or a
 * message-catalogue import.
 */
export function normalizeEnabledLocales(values: readonly unknown[]): AppLocale[] {
  const selected = new Set(values.filter(isAppLocale))
  return SUPPORTED_LOCALES.filter((locale) => selected.has(locale))
}

export function normalizeLocalePolicy(args: {
  defaultLocale: unknown
  enabledLocales: readonly unknown[]
}): { defaultLocale: AppLocale; enabledLocales: AppLocale[] } {
  const requestedDefault = parseAppLocale(args.defaultLocale) ?? DEFAULT_LOCALE
  const enabledLocales = normalizeEnabledLocales([...args.enabledLocales, requestedDefault])
  return { defaultLocale: requestedDefault, enabledLocales }
}

/** Resolve `tenant-user override -> tenant default -> platform default`. */
export function resolveLocale(args: {
  defaultLocale: unknown
  enabledLocales: readonly unknown[]
  userLocale?: unknown
}): AppLocale {
  const policy = normalizeLocalePolicy(args)
  const userLocale = parseAppLocale(args.userLocale)
  return userLocale && policy.enabledLocales.includes(userLocale)
    ? userLocale
    : policy.defaultLocale
}

/** Canonical locale state stored on request and worker contexts. */
export function resolveLocalePreferences(args: {
  defaultLocale: unknown
  enabledLocales: readonly unknown[]
  userLocale?: unknown
}): {
  locale: AppLocale
  defaultLocale: AppLocale
  enabledLocales: AppLocale[]
  localeOverride: AppLocale | null
} {
  const policy = normalizeLocalePolicy(args)
  const requestedOverride = parseAppLocale(args.userLocale)
  const localeOverride =
    requestedOverride && policy.enabledLocales.includes(requestedOverride)
      ? requestedOverride
      : null
  return {
    ...policy,
    locale: localeOverride ?? policy.defaultLocale,
    localeOverride,
  }
}

export type LocalizedText = Readonly<Partial<Record<AppLocale, string>>> &
  Readonly<Record<string, string | undefined>>

/**
 * Resolve tenant-authored multilingual content without losing older English
 * content. The tenant default is preferred after the user's effective locale,
 * followed by English and finally the first non-empty supported translation.
 */
export function localizeText(
  value: LocalizedText | string | null | undefined,
  locale: AppLocale,
  fallback: string,
  tenantDefault: AppLocale = DEFAULT_LOCALE,
): string {
  if (typeof value === 'string') return value.trim() || fallback
  if (!value) return fallback

  const candidates = [locale, tenantDefault, DEFAULT_LOCALE, ...SUPPORTED_LOCALES]
  for (const candidate of candidates) {
    const translated = value[candidate]
    if (typeof translated === 'string' && translated.trim()) return translated
  }
  return fallback
}

export {
  createSystemTranslator,
  formatMessage,
  messageProblems,
  messagePlaceholders,
  type MessageCatalog,
  type MessageValues,
  type PluralMessage,
  type SystemTranslator,
} from './messages'
export { systemMessageKey } from './system-key'
