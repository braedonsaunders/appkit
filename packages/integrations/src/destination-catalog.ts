import type { DestinationDef } from './types'

export type DestinationSummary = Pick<DestinationDef, 'key' | 'name' | 'description' | 'iconKey' | 'mappingKind' | 'reversible'>

export const HTTP_DESTINATION_SUMMARY = { key: 'http', name: 'HTTP / REST request', description: 'POST, PUT or PATCH a token-templated body to a public HTTPS URL with custom headers and an optional bearer/API-key. Use for REST APIs, webhooks and automation hooks.', iconKey: 'webhook', mappingKind: 'http', reversible: false } as const satisfies DestinationSummary
export const CHAT_DESTINATION_SUMMARY = { key: 'slack', name: 'Slack / Teams message', description: 'Post a formatted message to a Slack or Microsoft Teams channel via a public HTTPS incoming-webhook URL. Combine a multi-item trigger into one message or send one each.', iconKey: 'message-square', mappingKind: 'slack', reversible: false } as const satisfies DestinationSummary
export const SHEETS_DESTINATION_SUMMARY = { key: 'sheets', name: 'Google Sheets', description: 'Append a row per item to a Google Sheet. Authenticates with a service-account key (no interactive sign-in) — share the sheet with the service account as an Editor.', iconKey: 'sheet', mappingKind: 'sheets', reversible: false } as const satisfies DestinationSummary
export const EMAIL_DESTINATION_SUMMARY = { key: 'email', name: 'Email', description: 'Send a bounded, sanitized, token-templated email through an app-provided transport.', iconKey: 'mail', mappingKind: 'email', reversible: false } as const satisfies DestinationSummary
export const SQL_DESTINATION_SUMMARY = { key: 'sql', name: 'External SQL database', description: 'Insert mapped rows into PostgreSQL, MySQL, MariaDB, or SQL Server over verified TLS. Supports weekly fan-out, required-field filtering, value maps, and identity-based reversal before retry.', iconKey: 'database', mappingKind: 'sql', reversible: true } as const satisfies DestinationSummary

export const INTEGRATION_DESTINATION_CATALOG = [HTTP_DESTINATION_SUMMARY, CHAT_DESTINATION_SUMMARY, SHEETS_DESTINATION_SUMMARY, EMAIL_DESTINATION_SUMMARY, SQL_DESTINATION_SUMMARY] as const satisfies readonly DestinationSummary[]
