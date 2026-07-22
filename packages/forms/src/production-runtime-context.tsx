'use client'

import * as React from 'react'
import { DEFAULT_LOCALE, type AppLocale } from '@appkit/i18n'
import type { ProductionFormRuntimeAdapter } from './production-runtime-adapter'
import {
  GeneratedCopyProvider,
  type GeneratedCopyTranslator,
} from './generated-copy'

export type ProductionRuntimeLabels = {
  lookingUp: string
  searchRecords: (input: { field: string }) => string
}

const DEFAULT_LABELS: ProductionRuntimeLabels = {
  lookingUp: 'Looking up…',
  searchRecords: ({ field }) => `Search ${field}…`,
}

type ProductionRuntimeContextValue = {
  adapter: ProductionFormRuntimeAdapter
  locale: AppLocale
  labels: ProductionRuntimeLabels
}

const ProductionRuntimeContext = React.createContext<ProductionRuntimeContextValue | null>(null)

export function ProductionFormRuntimeProvider({
  adapter,
  locale = DEFAULT_LOCALE,
  labels,
  translateGenerated,
  children,
}: {
  adapter: ProductionFormRuntimeAdapter
  locale?: AppLocale
  labels?: Partial<ProductionRuntimeLabels>
  translateGenerated?: GeneratedCopyTranslator
  children: React.ReactNode
}) {
  const value = React.useMemo<ProductionRuntimeContextValue>(() => ({
    adapter,
    locale,
    labels: { ...DEFAULT_LABELS, ...labels },
  }), [adapter, labels, locale])
  return (
    <ProductionRuntimeContext.Provider value={value}>
      <GeneratedCopyProvider translate={translateGenerated}>{children}</GeneratedCopyProvider>
    </ProductionRuntimeContext.Provider>
  )
}

export function useProductionFormRuntime(): ProductionRuntimeContextValue {
  const value = React.useContext(ProductionRuntimeContext)
  if (!value) {
    throw new Error('Production form runtime requires ProductionFormRuntimeProvider.')
  }
  return value
}

export function useProductionLocale(): AppLocale {
  return useProductionFormRuntime().locale
}

export function useProductionTranslations(_namespace?: string): (key: 'lookingUp' | 'searchRecords', values?: { field?: string }) => string {
  const { labels } = useProductionFormRuntime()
  return (key, values) => key === 'lookingUp'
    ? labels.lookingUp
    : labels.searchRecords({ field: values?.field ?? 'records' })
}
