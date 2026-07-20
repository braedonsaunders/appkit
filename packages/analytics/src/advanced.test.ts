import assert from 'node:assert/strict'
import test from 'node:test'
import {
  assertVisualizationRenderable,
  buildChartSpec,
  buildSemanticEntities,
  pivotResult,
  resolveConditionalStyle,
  resultShapeOf,
  suggestAdvancedVisualization,
  type FlatAnalyticResult,
} from './index'

const result: FlatAnalyticResult = {
  shape: 'flat',
  columns: [
    { key: 'month', label: 'Month', role: 'dimension', semanticType: 'temporal', dataType: 'date', bin: 'month' },
    { key: 'region', label: 'Region', role: 'dimension', semanticType: 'category', dataType: 'string' },
    { key: 'total', label: 'Total', role: 'measure', semanticType: 'currency', dataType: 'number' },
  ],
  rows: [
    { month: '2026-01-01', region: 'North', total: 12 },
    { month: '2026-01-01', region: 'South', total: 9 },
    { month: '2026-02-01', region: 'North', total: 14 },
    { month: '2026-02-01', region: 'South', total: 11 },
  ],
  rowCount: 4,
  truncated: false,
}

test('schema discovery decorates columns without owning an application catalog', () => {
  const [entity] = buildSemanticEntities([{ key: 'records', label: 'Records', category: 'Operations', columns: [
    { key: 'id', label: 'ID', kind: 'uuid' },
    { key: 'customer_name', label: 'Customer', kind: 'text' },
    { key: 'total', label: 'Total', kind: 'number' },
  ] }], { records: { total: { semanticType: 'currency' } } })
  assert.equal(entity?.columns[0]?.semanticType, 'pk')
  assert.equal(entity?.columns[1]?.semanticType, 'entity-name')
  assert.equal(entity?.columns[2]?.semanticType, 'currency')
  assert.equal(entity?.columns[2]?.canMeasure, true)
})

test('flat results pivot into a typed dense matrix', () => {
  const pivot = pivotResult(result, { rows: ['region'], columns: ['month'], values: ['total'] })
  assert.equal(pivot.shape, 'pivot')
  assert.deepEqual(pivot.rowKeys.map((key) => key.labels[0]), ['North', 'South'])
  assert.deepEqual(pivot.columnKeys.map((key) => key.labels[0]), ['2026-01-01', '2026-02-01'])
  assert.equal(pivot.cells[1]?.[1]?.total, 11)
  assert.equal(resultShapeOf(pivot), 'pivot')
  assert.equal(suggestAdvancedVisualization(pivot), 'pivot')
})

test('chart specs preserve series and combo secondary axes', () => {
  const spec = buildChartSpec(result, 'combo', { showValues: true })
  assert.equal(spec?.kind, 'cartesian')
  assert.equal(spec?.showValues, true)
  assert.deepEqual(spec?.labels, ['2026-01-01', '2026-01-01', '2026-02-01', '2026-02-01'])
})

test('visualizations reject incompatible result shapes', () => {
  assert.throws(() => assertVisualizationRenderable('pivot', result), /pivot/i)
  assert.doesNotThrow(() => assertVisualizationRenderable('line', result))
})

test('conditional formatting resolves tokenized semantic tones', () => {
  assert.deepEqual(resolveConditionalStyle(12, 'total', [{ type: 'threshold', column: 'total', operator: 'gte', value: 10, tone: 'success' }]), { className: 'bg-success-subtle text-success' })
})
