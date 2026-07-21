'use client'

import { MapPin, Plus, Trash2 } from 'lucide-react'
import type { FormField, TableColumn, TableConfig } from '@appkit/forms-core'
import { Button, Checkbox, Input } from '@appkit/ui'
import { SignaturePad } from '@appkit/ui'
import { RiskMatrixField, RiskMatrixProvider, type RiskMatrixConfig } from './risk-matrix'
import { SketchPad, type SketchScene } from './sketch-pad'

export function GpsField({ value, onChange, disabled }: ControlProps) {
  const location = isRecord(value) && typeof value.lat === 'number' && typeof value.lng === 'number'
    ? value as { lat: number; lng: number; accuracy?: number }
    : null
  return <div className="space-y-1.5"><Button type="button" variant="outline" size="sm" disabled={disabled} onClick={() => navigator.geolocation?.getCurrentPosition((position) => onChange({ lat: position.coords.latitude, lng: position.coords.longitude, accuracy: position.coords.accuracy, capturedAt: new Date().toISOString() }), undefined, { enableHighAccuracy: true, timeout: 10_000 })}><MapPin size={14} />{location ? 'Update location' : 'Capture location'}</Button>{location ? <p className="text-xs text-fg-muted">{location.lat.toFixed(5)}, {location.lng.toFixed(5)}{location.accuracy ? ` · ±${Math.round(location.accuracy)} m` : ''}</p> : null}</div>
}

export function MatrixField({ field, value, onChange, disabled }: ControlProps) {
  const config = (field.config ?? {}) as { rows?: { key: string; label: string }[]; scale?: { value: string; label: string }[] }
  const rows = config.rows ?? []
  const scale = config.scale ?? []
  const current = isRecord(value) ? value : {}
  return <div className="overflow-x-auto rounded-md border border-border"><table className="w-full border-collapse text-sm"><thead><tr className="bg-surface-subtle"><th className="p-2" />{scale.map((item) => <th key={item.value} className="p-2 text-center text-xs font-medium text-fg-muted">{item.label}</th>)}</tr></thead><tbody>{rows.map((row) => <tr key={row.key} className="border-t border-border"><td className="px-2 py-2 font-medium text-fg">{row.label}</td>{scale.map((item) => <td key={item.value} className="p-2 text-center"><input type="radio" name={`${field.id}_${row.key}`} disabled={disabled} checked={current[row.key] === item.value} onChange={() => onChange({ ...current, [row.key]: item.value })} aria-label={`${row.label}: ${item.label}`} /></td>)}</tr>)}</tbody></table></div>
}

export function TableField({ field, value, onChange, disabled }: ControlProps) {
  const config = (field.config ?? {}) as Partial<TableConfig>
  const columns = (config.columns ?? []) as TableColumn[]
  const fixed = config.rowMode === 'fixed'
  const stored = Array.isArray(value) ? value.filter(isRecord) : []
  const rows = fixed ? (config.rows ?? []).map((_, index) => stored[index] ?? {}) : stored
  const minRows = config.minRows ?? 0
  function setCell(rowIndex: number, key: string, next: unknown) { onChange(rows.map((row, index) => index === rowIndex ? { ...row, [key]: next } : row)) }
  function addRow() { if (config.maxRows == null || rows.length < config.maxRows) onChange([...rows, {}]) }
  function removeRow(rowIndex: number) { if (rows.length > minRows) onChange(rows.filter((_, index) => index !== rowIndex)) }
  return <div className="space-y-2"><div className="overflow-x-auto rounded-md border border-border"><table className="w-full border-collapse text-sm"><thead><tr className="bg-surface-subtle">{fixed ? <th className="border-b border-border p-2" /> : null}{columns.map((column) => <th key={column.key} className="border-b border-border p-2 text-left text-xs font-semibold text-fg-muted">{column.label}</th>)}{!fixed ? <th className="w-10 border-b border-border" /> : null}</tr></thead><tbody>{rows.length === 0 ? <tr><td colSpan={columns.length + 1} className="p-4 text-center text-xs text-fg-muted">No rows yet.</td></tr> : rows.map((row, rowIndex) => <tr key={rowIndex} className="border-b border-border last:border-b-0">{fixed ? <td className="p-2 text-xs font-medium text-fg">{config.rows?.[rowIndex]?.label}</td> : null}{columns.map((column) => <td key={column.key} className="min-w-32 p-1.5"><TableCell column={column} value={row[column.key]} disabled={disabled} onChange={(next) => setCell(rowIndex, column.key, next)} /></td>)}{!fixed ? <td className="p-1"><Button type="button" variant="ghost" size="icon" disabled={disabled || rows.length <= minRows} aria-label={`Remove row ${rowIndex + 1}`} onClick={() => removeRow(rowIndex)}><Trash2 size={14} /></Button></td> : null}</tr>)}</tbody></table></div>{!fixed ? <Button type="button" variant="outline" size="sm" disabled={disabled || (config.maxRows != null && rows.length >= config.maxRows)} onClick={addRow}><Plus size={14} />Add row</Button> : null}</div>
}

function TableCell({ column, value, disabled, onChange }: { column: TableColumn; value: unknown; disabled?: boolean; onChange: (value: unknown) => void }) {
  if (column.type === 'checkbox') return <Checkbox checked={value === true} disabled={disabled} onChange={(event) => onChange(event.currentTarget.checked)} aria-label={column.label} />
  if (column.type === 'select') return <select className="h-9 w-full rounded-md border border-border bg-surface px-2 text-sm text-fg" value={typeof value === 'string' ? value : ''} disabled={disabled} onChange={(event) => onChange(event.currentTarget.value || undefined)}><option value="">Select…</option>{column.options?.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}</select>
  return <Input className="h-9" type={column.type === 'number' ? 'number' : column.type === 'date' ? 'date' : 'text'} value={column.type === 'number' ? typeof value === 'number' ? value : '' : typeof value === 'string' ? value : ''} disabled={disabled} onChange={(event) => onChange(column.type === 'number' ? event.currentTarget.value === '' ? undefined : Number(event.currentTarget.value) : event.currentTarget.value)} />
}

export function AddressField({ value, onChange, disabled }: ControlProps) {
  const current = isRecord(value) ? value : {}
  const set = (patch: Record<string, string>) => onChange({ ...current, ...patch })
  return <div className="grid gap-2 sm:grid-cols-2"><Input className="sm:col-span-2" value={stringValue(current.line1)} placeholder="Street address" disabled={disabled} onChange={(event) => set({ line1: event.currentTarget.value })} /><Input value={stringValue(current.city)} placeholder="City" disabled={disabled} onChange={(event) => set({ city: event.currentTarget.value })} /><Input value={stringValue(current.region)} placeholder="State / province" disabled={disabled} onChange={(event) => set({ region: event.currentTarget.value })} /><Input value={stringValue(current.postal)} placeholder="Postal code" disabled={disabled} onChange={(event) => set({ postal: event.currentTarget.value })} /><Input value={stringValue(current.country)} placeholder="Country" disabled={disabled} onChange={(event) => set({ country: event.currentTarget.value })} /></div>
}

export function SignatureField({ value, onChange, disabled }: ControlProps) {
  const stored = typeof value === 'string' ? value : isRecord(value) && typeof value.url === 'string' ? value.url : null
  return <SignaturePad value={stored} onChange={onChange} disabled={disabled} />
}

export function SketchField({ value, onChange, disabled }: ControlProps) {
  const stored = isRecord(value) ? value as { dataUrl?: string | null; scene?: SketchScene } : {}
  return <SketchPad initialScene={stored.scene ?? null} readOnly={disabled} onChange={(dataUrl, scene) => onChange(dataUrl ? { dataUrl, scene } : null)} />
}

export function RiskField({ field, value, onChange, disabled, matrix }: ControlProps & { matrix?: RiskMatrixConfig }) {
  const current = isRecord(value) ? value : {}
  return <RiskMatrixProvider matrix={matrix}><RiskMatrixField label={typeof field.label === 'string' ? field.label : 'Risk'} likelihoodName={`${field.id}.likelihood`} severityName={`${field.id}.severity`} defaultLikelihood={typeof current.likelihood === 'number' ? current.likelihood : undefined} defaultSeverity={typeof current.severity === 'number' ? current.severity : undefined} disabled={disabled} onChange={(next) => onChange(next.likelihood == null || next.severity == null || next.score == null ? {} : next)} /></RiskMatrixProvider>
}

type ControlProps = { field: FormField; value: unknown; onChange: (value: unknown) => void; disabled?: boolean }
function isRecord(value: unknown): value is Record<string, unknown> { return typeof value === 'object' && value !== null && !Array.isArray(value) }
function stringValue(value: unknown): string { return typeof value === 'string' ? value : '' }
