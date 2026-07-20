import type { QueryResult } from '@appkit/analytics'
import { queryResultToReport } from './document'
import { assertReportDefinition, type ReportDefinition, type ReportRunResult } from './types'

export type ReportExecutor = (query: ReportDefinition['query'], options: { signal?: AbortSignal }) => Promise<QueryResult>

export async function runReport(
  definition: ReportDefinition,
  execute: ReportExecutor,
  options: { signal?: AbortSignal; groupBy?: string } = {},
): Promise<ReportRunResult> {
  assertReportDefinition(definition)
  if (definition.state === 'archived') throw new Error('Archived reports cannot be run')
  options.signal?.throwIfAborted()
  const result = await execute(definition.query, { signal: options.signal })
  options.signal?.throwIfAborted()
  return queryResultToReport(result, { title: definition.name, groupBy: options.groupBy })
}
