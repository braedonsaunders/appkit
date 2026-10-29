import type { AppLocale } from './index'
import { systemMessageKey } from './system-key'

/** CLDR plural forms for one message; `other` is always required. */
export type PluralMessage = Readonly<Partial<Record<Intl.LDMLPluralRule, string>>> & {
  readonly other: string
}

/**
 * One locale's translations of first-party copy, keyed by
 * `systemMessageKey(englishSource)`. Count-dependent messages are keyed by
 * their English `other` form and hold every plural category the locale uses.
 */
export type MessageCatalog = Readonly<Record<string, string | PluralMessage>>

export type MessageValues = Readonly<Record<string, unknown>>

/**
 * Exact-copy translator: the English source string is the message. Calling it
 * returns the catalogue entry, or the English when the catalogue lacks one.
 * It satisfies `UiTextTranslator`, so it can be passed straight to
 * `UiTextProvider`.
 */
export interface SystemTranslator {
  (source: string, values?: MessageValues): string
  readonly locale: AppLocale
  /**
   * Count-dependent copy: `plural(n, '{count} file', '{count} files')`.
   * `{count}` is filled with the locale-formatted number.
   */
  plural(count: number, one: string, other: string, values?: MessageValues): string
}

/** Fill `{name}` placeholders; unknown or nullish values keep their token. */
export function formatMessage(template: string, values?: MessageValues): string {
  if (!values) return template
  return template.replace(/\{(\w+)\}/g, (token, name: string) => {
    const value = values[name]
    return value === null || value === undefined ? token : String(value)
  })
}

export function createSystemTranslator(
  locale: AppLocale,
  catalog: MessageCatalog = {},
): SystemTranslator {
  const rules = new Intl.PluralRules(locale)
  // Source copy is English; its forms apply when a catalogue lacks the entry.
  const sourceRules = new Intl.PluralRules('en')
  const numbers = new Intl.NumberFormat(locale)

  const translate = ((source: string, values?: MessageValues) => {
    const entry = catalog[systemMessageKey(source)]
    const text = typeof entry === 'string' ? entry : entry?.other
    return formatMessage(text || source, values)
  }) as SystemTranslator

  translate.plural = (count, one, other, values) => {
    const entry = catalog[systemMessageKey(other)]
    let text: string | undefined
    if (typeof entry === 'string') text = entry
    else if (entry) text = entry[rules.select(count)] || entry.other
    if (!text) text = sourceRules.select(count) === 'one' ? one : other
    return formatMessage(text, { ...values, count: numbers.format(count) })
  }

  Object.defineProperty(translate, 'locale', { value: locale, enumerable: true })
  return translate
}

export function messagePlaceholders(text: string): Set<string> {
  return new Set(Array.from(text.matchAll(/\{(\w+)\}/g), (match) => match[1] as string))
}

function sameSet(a: ReadonlySet<string>, b: ReadonlySet<string>): boolean {
  return a.size === b.size && [...a].every((item) => b.has(item))
}

/**
 * Why a translation cannot ship, as readable problems (empty when valid).
 * Plain messages must keep exactly the source placeholders. Plural messages
 * (pass the English `one` form) need every category the locale's grammar
 * uses; `other` keeps every placeholder, narrower forms may drop some.
 */
export function messageProblems(args: {
  locale: AppLocale
  source: string
  translation: unknown
  one?: string
}): string[] {
  const { locale, source, translation, one } = args
  const expected = messagePlaceholders(source)
  if (typeof translation === 'string') {
    if (!translation.trim()) return ['empty translation']
    return sameSet(messagePlaceholders(translation), expected)
      ? []
      : ['placeholders differ from the source']
  }
  if (one === undefined) return ['expected a string']
  if (!translation || typeof translation !== 'object' || Array.isArray(translation)) {
    return ['expected a string or plural forms']
  }
  const forms = translation as Record<string, unknown>
  const problems: string[] = []
  for (const category of new Intl.PluralRules(locale).resolvedOptions().pluralCategories) {
    const form = forms[category]
    if (typeof form !== 'string' || !form.trim()) problems.push(`missing plural form "${category}"`)
  }
  for (const [category, form] of Object.entries(forms)) {
    if (typeof form !== 'string') continue
    const found = messagePlaceholders(form)
    const valid =
      category === 'other'
        ? sameSet(found, expected)
        : [...found].every((name) => expected.has(name))
    if (!valid) problems.push(`plural form "${category}" placeholders differ from the source`)
  }
  return problems
}
