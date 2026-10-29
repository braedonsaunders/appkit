'use client'

import * as React from 'react'
import {
  LOCALE_OPTIONS,
  createSystemTranslator,
  systemMessageKey,
  type AppLocale,
  type MessageCatalog,
} from '@braedonsaunders/appkit-i18n'
import { Badge, Label, Select, UiTextProvider, useUiText } from '@braedonsaunders/appkit-ui'

/** A few demo catalogues; every other locale falls back to the English source. */
function catalogue(entries: Record<string, MessageCatalog[string]>): MessageCatalog {
  return Object.fromEntries(
    Object.entries(entries).map(([source, value]) => [systemMessageKey(source), value]),
  )
}

const CATALOGUES: Partial<Record<AppLocale, MessageCatalog>> = {
  fr: catalogue({
    'Invoice ready': 'Facture prête',
    'Sent to {name}': 'Envoyée à {name}',
    '{count} attachments': {
      one: '{count} pièce jointe',
      many: '{count} de pièces jointes',
      other: '{count} pièces jointes',
    },
  }),
  de: catalogue({
    'Invoice ready': 'Rechnung bereit',
    'Sent to {name}': 'An {name} gesendet',
    '{count} attachments': { one: '{count} Anhang', other: '{count} Anhänge' },
  }),
  pl: catalogue({
    'Invoice ready': 'Faktura gotowa',
    'Sent to {name}': 'Wysłano do: {name}',
    '{count} attachments': {
      one: '{count} załącznik',
      few: '{count} załączniki',
      many: '{count} załączników',
      other: '{count} załącznika',
    },
  }),
  ja: catalogue({
    'Invoice ready': '請求書の準備ができました',
    'Sent to {name}': '{name} に送信しました',
    '{count} attachments': { other: '添付ファイル {count} 件' },
  }),
}

function Preview() {
  const t = useUiText()
  return (
    <div className="space-y-1">
      <p className="font-medium text-fg">{t('Invoice ready')}</p>
      <p className="text-sm text-fg-muted">{t('Sent to {name}', { name: 'Ada Lovelace' })}</p>
    </div>
  )
}

export function LocalizationDemo() {
  const [locale, setLocale] = React.useState<AppLocale>('fr')
  const t = React.useMemo(() => createSystemTranslator(locale, CATALOGUES[locale]), [locale])
  return (
    <div className="grid gap-5 sm:grid-cols-[16rem_1fr]">
      <div className="space-y-2">
        <Label htmlFor="demo-locale">Language</Label>
        <Select
          id="demo-locale"
          value={locale}
          onChange={(event) => setLocale(event.target.value as AppLocale)}
        >
          {LOCALE_OPTIONS.map((option) => (
            <option key={option.value} value={option.value}>
              {option.nativeLabel}
            </option>
          ))}
        </Select>
        <p className="text-xs text-fg-subtle">
          {CATALOGUES[locale]
            ? 'Demo catalogue loaded.'
            : 'No demo catalogue: English source copy is shown.'}
        </p>
      </div>
      <div className="space-y-3 rounded-lg border border-border bg-surface p-4">
        <UiTextProvider translate={t}>
          <Preview />
        </UiTextProvider>
        <div className="flex flex-wrap gap-2">
          {[1, 3, 22].map((n) => (
            <Badge key={n} variant="secondary">
              {t.plural(n, '{count} attachment', '{count} attachments')}
            </Badge>
          ))}
        </div>
      </div>
    </div>
  )
}
