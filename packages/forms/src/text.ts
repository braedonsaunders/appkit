import { DEFAULT_LOCALE, localizeText, type AppLocale } from '@braedonsaunders/i18n'
import type { I18nString } from '@braedonsaunders/forms-core'

export function readText(
  value: I18nString | undefined,
  locale: AppLocale = DEFAULT_LOCALE,
  fallback = '',
): string {
  return localizeText(value, locale, fallback)
}

export function writeText(
  previous: I18nString | undefined,
  value: string,
  locale: AppLocale,
): I18nString {
  return typeof previous === 'string' || previous === undefined
    ? value
    : { ...previous, [locale]: value }
}
