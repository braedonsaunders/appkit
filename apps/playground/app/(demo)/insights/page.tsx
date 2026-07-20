import { loadInsightCards } from '../../../lib/server/dashboard'
import { DEMO_ANALYTICS_CATALOG } from '../../../lib/server/analytics'
import { InsightLibrary } from './_insight-library'
import { isDatabaseConfigured } from '../../../lib/server/platform'

export const dynamic = 'force-dynamic'
export const metadata = { title: 'Insight cards — appkit' }

export default async function InsightsPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const params = await searchParams
  return <InsightLibrary
    cards={await loadInsightCards()}
    catalog={DEMO_ANALYTICS_CATALOG}
    selectedId={typeof params.card === 'string' ? params.card : null}
    createNew={params.new === '1'}
    browserPersistence={!isDatabaseConfigured()}
  />
}
