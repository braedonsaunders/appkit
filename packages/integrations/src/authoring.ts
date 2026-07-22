import type { DestinationDefinition } from './types'

export type DestinationAuthoringDefinition = Pick<
  DestinationDefinition,
  | 'key'
  | 'name'
  | 'description'
  | 'iconKey'
  | 'mappingKind'
  | 'configFields'
  | 'secretFields'
  | 'reversible'
>

export type IntegrationEditorInitial = {
  name: string
  enabled: boolean
  oncePerRecord: boolean
  triggerKey: string
  destinationKey: string
  config: Record<string, unknown>
  secretsPresent: Record<string, boolean>
  mapping: Record<string, unknown>
}

export type IntegrationEditorSubmission = {
  id: string
  name: string | null
  enabled: boolean
  ready: boolean
  triggerKey: string | null
  destinationKey: string
  config: Record<string, unknown>
  /** Plaintext replacements only. Applications seal these before persistence. */
  secretReplacements: Record<string, string>
}

function coerceLiteral(value: string): string | number | boolean | null {
  const trimmed = value.trim()
  if (trimmed === '') return ''
  if (trimmed === 'null') return null
  if (trimmed === 'true') return true
  if (trimmed === 'false') return false
  if (/^-?\d+(\.\d+)?$/.test(trimmed)) return Number(trimmed)
  return value
}

function zipPairs(
  keys: FormDataEntryValue[],
  values: FormDataEntryValue[],
): [string, string][] {
  const pairs: [string, string][] = []
  for (let index = 0; index < keys.length; index++) {
    const key = String(keys[index] ?? '').trim()
    if (key) pairs.push([key, String(values[index] ?? '')])
  }
  return pairs
}

export function readDestinationMapping(
  destination: DestinationAuthoringDefinition,
  formData: FormData,
): Record<string, unknown> {
  switch (destination.mappingKind) {
    case 'sql': {
      const columns: Record<string, unknown> = {}
      for (const [key, value] of zipPairs(
        formData.getAll('col-name'),
        formData.getAll('col-val'),
      ))
        columns[key] = coerceLiteral(value)
      return {
        table: String(formData.get('map-table') ?? '').trim(),
        idColumn: String(formData.get('map-idColumn') ?? '').trim(),
        mode: formData.get('map-mode') === 'weekly' ? 'weekly' : 'row',
        departmentMap: String(formData.get('map-departmentMap') ?? ''),
        requireField: String(formData.get('map-requireField') ?? '').trim(),
        columns,
      }
    }
    case 'http': {
      const headers: Record<string, string> = {}
      for (const [key, value] of zipPairs(
        formData.getAll('hdr-key'),
        formData.getAll('hdr-val'),
      ))
        headers[key] = value
      return { headers, body: String(formData.get('map-body') ?? '') }
    }
    case 'slack':
      return {
        text: String(formData.get('map-text') ?? ''),
        blocks: String(formData.get('map-blocks') ?? ''),
      }
    case 'sheets':
      return {
        values: formData
          .getAll('val-expr')
          .map((value) => coerceLiteral(String(value ?? '')))
          .filter((value) => value !== ''),
      }
    case 'email':
      return { body: String(formData.get('map-body') ?? '') }
    default:
      return {}
  }
}

export function readIntegrationEditorSubmission(options: {
  destination: DestinationAuthoringDefinition
  formData: FormData
  baseConfig?: Record<string, unknown>
}): IntegrationEditorSubmission {
  const { destination, formData } = options
  const config: Record<string, unknown> = { ...(options.baseConfig ?? {}) }
  for (const field of destination.configFields) {
    if (field.type === 'boolean') {
      const raw = formData.get(field.key)
      config[field.key] = raw === 'on' || raw === 'true'
      continue
    }
    const raw = formData.get(field.key)
    if (raw == null) continue
    if (field.type === 'number') {
      const value = String(raw).trim()
      if (!value) delete config[field.key]
      else if (!Number.isNaN(Number(value))) config[field.key] = Number(value)
    } else {
      const value = String(raw).trim()
      if (!value) delete config[field.key]
      else config[field.key] = value
    }
  }
  const oncePerRecord =
    formData.get('oncePerRecord') === 'on' ||
    formData.get('oncePerRecord') === 'true'
  config.oncePerRecord = oncePerRecord
  config.mapping = readDestinationMapping(destination, formData)

  const secretReplacements: Record<string, string> = {}
  for (const field of destination.secretFields) {
    const value = String(formData.get(field.key) ?? '').trim()
    if (value) secretReplacements[field.key] = value
  }
  const triggerKey = String(formData.get('triggerKey') ?? '').trim() || null
  const destinationKey = String(
    formData.get('destinationKey') ?? destination.key,
  ).trim()
  const enabled =
    formData.get('enabled') === 'on' || formData.get('enabled') === 'true'
  return {
    id: String(formData.get('id') ?? '').trim(),
    name: String(formData.get('name') ?? '').trim() || null,
    enabled,
    ready: enabled && Boolean(triggerKey && destinationKey),
    triggerKey,
    destinationKey,
    config,
    secretReplacements,
  }
}
