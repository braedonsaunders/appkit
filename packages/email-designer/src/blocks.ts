// Every block the palette offers is authored as real, inline-styled, email-safe
// HTML — tables for layout, no CSS variables, no shorthand a client might drop.
// The designer inserts these verbatim, so what the author sees on the canvas is
// what the compile step ships.

import type {
  EmailBlock,
  EmailCollection,
  EmailDesignerPreset,
  EmailDesignerTheme,
  EmailMergeField,
} from './types'
import { resolveEmailDesignerTheme, safeColor } from './theme'
import { DEFAULT_EMAIL_DESIGNER_THEME } from './theme'

/**
 * Token and collection keys are concatenated into markup, so they are held to a
 * conservative shape: leading alphanumeric, then word characters, dots, and
 * dashes. Anything else yields `null` and the caller skips the block.
 */
const TEMPLATE_KEY = /^[A-Za-z0-9][A-Za-z0-9_.-]{0,127}$/

export function safeTemplateKey(value: string): string | null {
  const key = value.trim()
  return TEMPLATE_KEY.test(key) ? key : null
}

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;')
}

/** Resolve a theme and clamp every color that will land in a style attribute. */
function palette(input?: Partial<EmailDesignerTheme>) {
  const t = resolveEmailDesignerTheme(input)
  const d = DEFAULT_EMAIL_DESIGNER_THEME
  const maxWidth = Number.isFinite(t.maxWidth) ? Math.min(Math.max(t.maxWidth, 280), 1200) : d.maxWidth
  const radius = Number.isFinite(t.radius) ? Math.min(Math.max(t.radius, 0), 40) : d.radius
  return {
    accent: safeColor(t.accent, d.accent),
    ink: safeColor(t.ink, d.ink),
    muted: safeColor(t.muted, d.muted),
    border: safeColor(t.border, d.border),
    background: safeColor(t.background, d.background),
    surface: safeColor(t.surface, d.surface),
    // The font stack is author-supplied text inside a style attribute; escaping
    // the quote characters keeps it from closing the attribute.
    font: escapeHtml(t.fontFamily),
    maxWidth,
    radius,
  }
}

type Palette = ReturnType<typeof palette>

// --- merge fields ------------------------------------------------------------

/** A single token, ready to drag onto the canvas. */
export function mergeFieldBlockHtml(field: EmailMergeField): string | null {
  const key = safeTemplateKey(field.key)
  return key ? `<span>{{${key}}}</span>` : null
}

function tableHeaderStyle(p: Palette): string {
  return `text-align:left;border-bottom:2px solid ${p.border};padding:6px 8px;font-size:11px;color:${p.muted};font-weight:700;text-transform:uppercase`
}

function tableCellStyle(p: Palette): string {
  return `border-bottom:1px solid ${p.border};padding:6px 8px;font-size:13px;color:${p.ink};vertical-align:top`
}

/**
 * One editable repeating-row table. The body row carries `data-each="<key>"`,
 * which compiles to a `{{#each}}` block; the header row stays static. Returns
 * `null` rather than emitting markup when any key is unsafe.
 */
export function collectionTableBlockHtml(
  collection: EmailCollection,
  theme?: Partial<EmailDesignerTheme>,
): string | null {
  const collectionKey = safeTemplateKey(collection.key)
  if (!collectionKey || collection.fields.length === 0) return null

  const p = palette(theme)
  const fields = collection.fields.map((field) => ({
    key: safeTemplateKey(field.key),
    label: escapeHtml(field.label),
  }))
  if (fields.some((field) => field.key === null)) return null

  const head = fields.map((f) => `<th style="${tableHeaderStyle(p)}">${f.label}</th>`).join('')
  const body = fields.map((f) => `<td style="${tableCellStyle(p)}">{{${f.key!}}}</td>`).join('')
  return (
    `<table style="width:100%;border-collapse:collapse;margin:0 0 8px;font-family:${p.font};">` +
    `<tr>${head}</tr><tr data-each="${collectionKey}">${body}</tr></table>`
  )
}

// --- block catalogs ----------------------------------------------------------

/** Layout and content blocks for authoring a whole message. */
export function baseEmailBlocks(theme?: Partial<EmailDesignerTheme>): EmailBlock[] {
  const p = palette(theme)
  const body = `font-size:14px;line-height:1.6;color:${p.ink};font-family:${p.font};`
  return [
    {
      id: 'heading',
      label: 'Heading',
      category: 'Content',
      content: `<h2 style="font-family:${p.font};font-size:18px;font-weight:700;color:${p.ink};margin:16px 0 6px;">Section heading</h2>`,
    },
    {
      id: 'text',
      label: 'Text',
      category: 'Content',
      content: `<p style="${body}margin:0 0 12px;">Your text here.</p>`,
    },
    {
      id: 'button',
      label: 'Button',
      category: 'Content',
      content:
        `<table role="presentation" cellpadding="0" cellspacing="0" style="margin:10px 0;"><tr>` +
        `<td style="background:${p.accent};border-radius:${p.radius}px;">` +
        `<a href="https://example.com" style="display:inline-block;padding:11px 20px;font-family:${p.font};font-size:14px;font-weight:600;color:#ffffff;text-decoration:none;">Open</a>` +
        `</td></tr></table>`,
    },
    {
      id: 'image',
      label: 'Image',
      category: 'Content',
      content:
        '<img src="https://placehold.co/600x180" alt="" style="max-width:100%;display:block;border:0;outline:none;text-decoration:none;margin:8px 0;" />',
    },
    {
      id: 'quote',
      label: 'Quote',
      category: 'Content',
      content: `<blockquote style="${body}margin:12px 0;padding:2px 0 2px 14px;border-left:3px solid ${p.accent};color:${p.muted};font-style:italic;">Quoted text.</blockquote>`,
    },
    {
      id: 'divider',
      label: 'Divider',
      category: 'Layout',
      content: `<hr style="border:none;border-top:1px solid ${p.border};margin:18px 0;" />`,
    },
    {
      id: 'spacer',
      label: 'Spacer',
      category: 'Layout',
      content: '<div style="height:20px;line-height:20px;font-size:0;">&nbsp;</div>',
    },
    {
      id: 'two-col',
      label: '2 columns',
      category: 'Layout',
      content:
        `<table role="presentation" style="width:100%;border-collapse:collapse;margin:8px 0;"><tr>` +
        `<td style="width:50%;vertical-align:top;padding-right:10px;${body}">Column one</td>` +
        `<td style="width:50%;vertical-align:top;padding-left:10px;${body}">Column two</td>` +
        `</tr></table>`,
    },
    {
      id: 'detail-row',
      label: 'Label + value',
      category: 'Layout',
      content:
        `<table role="presentation" style="border-collapse:collapse;margin:0 0 2px;"><tr>` +
        `<td style="padding:4px 12px 4px 0;font-family:${p.font};font-size:12px;color:${p.muted};white-space:nowrap;">Label</td>` +
        `<td style="padding:4px 0;font-family:${p.font};font-size:13px;color:${p.ink};">Value</td>` +
        `</tr></table>`,
    },
    {
      id: 'card',
      label: 'Card',
      category: 'Layout',
      content:
        `<table role="presentation" style="width:100%;border-collapse:separate;margin:12px 0;"><tr>` +
        `<td style="background:${p.surface};border:1px solid ${p.border};border-radius:${p.radius}px;padding:18px 20px;${body}">Card content.</td>` +
        `</tr></table>`,
    },
    {
      id: 'footer-note',
      label: 'Footer note',
      category: 'Layout',
      content: `<p style="font-family:${p.font};font-size:11px;line-height:1.5;color:${p.muted};margin:16px 0 0;">You are receiving this message because of your relationship with us.</p>`,
    },
  ]
}

/**
 * Blocks for authoring a signature. Deliberately table-based and narrow —
 * Outlook renders floats and flex unpredictably inside a quoted reply chain.
 */
export function signatureEmailBlocks(theme?: Partial<EmailDesignerTheme>): EmailBlock[] {
  const p = palette(theme)
  const name = `font-family:${p.font};font-size:15px;font-weight:700;color:${p.ink};`
  const role = `font-family:${p.font};font-size:12px;color:${p.muted};`
  const line = `font-family:${p.font};font-size:12px;line-height:1.5;color:${p.ink};`
  return [
    {
      id: 'sig-identity',
      label: 'Name + title',
      category: 'Signature',
      content:
        `<table role="presentation" cellpadding="0" cellspacing="0" style="border-collapse:collapse;">` +
        `<tr><td style="${name}padding:0 0 2px;">{{agent.name}}</td></tr>` +
        `<tr><td style="${role}padding:0;">{{agent.title}}</td></tr>` +
        `</table>`,
    },
    {
      id: 'sig-lockup',
      label: 'Logo + details',
      category: 'Signature',
      content:
        `<table role="presentation" cellpadding="0" cellspacing="0" style="border-collapse:collapse;"><tr>` +
        `<td style="vertical-align:top;padding:0 14px 0 0;"><img src="https://placehold.co/96x96" width="64" alt="" style="display:block;border:0;border-radius:${p.radius}px;" /></td>` +
        `<td style="vertical-align:top;border-left:2px solid ${p.accent};padding:0 0 0 14px;">` +
        `<div style="${name}padding-bottom:2px;">{{agent.name}}</div>` +
        `<div style="${role}padding-bottom:6px;">{{agent.title}}</div>` +
        `<div style="${line}">{{company.name}}</div>` +
        `</td></tr></table>`,
    },
    {
      id: 'sig-contact',
      label: 'Contact line',
      category: 'Signature',
      content:
        `<table role="presentation" cellpadding="0" cellspacing="0" style="border-collapse:collapse;margin:6px 0 0;"><tr>` +
        `<td style="${role}padding:1px 8px 1px 0;white-space:nowrap;">Phone</td>` +
        `<td style="${line}padding:1px 0;">{{agent.phone}}</td>` +
        `</tr></table>`,
    },
    {
      id: 'sig-links',
      label: 'Links row',
      category: 'Signature',
      content:
        `<p style="${line}margin:8px 0 0;">` +
        `<a href="{{company.website}}" style="color:${p.accent};text-decoration:none;font-weight:600;">Website</a>` +
        `<span style="color:${p.border};padding:0 6px;">|</span>` +
        `<a href="mailto:{{agent.email}}" style="color:${p.accent};text-decoration:none;font-weight:600;">Email</a>` +
        `</p>`,
    },
    {
      id: 'sig-rule',
      label: 'Rule',
      category: 'Signature',
      content: `<hr style="border:none;border-top:1px solid ${p.border};margin:10px 0;width:100%;" />`,
    },
    {
      id: 'sig-accent-bar',
      label: 'Accent bar',
      category: 'Signature',
      content: `<div style="height:3px;line-height:3px;font-size:0;background:${p.accent};width:56px;margin:10px 0;">&nbsp;</div>`,
    },
    {
      id: 'sig-disclaimer',
      label: 'Disclaimer',
      category: 'Signature',
      content: `<p style="font-family:${p.font};font-size:10px;line-height:1.45;color:${p.muted};margin:10px 0 0;">This message and any attachments are confidential and intended solely for the addressee.</p>`,
    },
    {
      id: 'sig-address',
      label: 'Address',
      category: 'Signature',
      content: `<p style="${role}margin:6px 0 0;line-height:1.5;">{{company.address}}</p>`,
    },
  ]
}

/** The palette for a preset: signature blocks stay out of full-message authoring. */
export function blocksForPreset(
  preset: EmailDesignerPreset,
  theme?: Partial<EmailDesignerTheme>,
): EmailBlock[] {
  return preset === 'signature'
    ? signatureEmailBlocks(theme)
    : [...baseEmailBlocks(theme), ...signatureEmailBlocks(theme)]
}

// --- starter documents -------------------------------------------------------

/** Seeded onto the canvas when a design has no saved source yet. */
export function starterHtml(
  preset: EmailDesignerPreset,
  theme?: Partial<EmailDesignerTheme>,
): string {
  const p = palette(theme)
  if (preset === 'signature') {
    return (
      `<table role="presentation" cellpadding="0" cellspacing="0" style="border-collapse:collapse;font-family:${p.font};"><tr>` +
      `<td style="vertical-align:top;border-left:3px solid ${p.accent};padding:2px 0 2px 12px;">` +
      `<div style="font-size:15px;font-weight:700;color:${p.ink};padding-bottom:2px;">{{agent.name}}</div>` +
      `<div style="font-size:12px;color:${p.muted};padding-bottom:6px;">{{agent.title}} · {{company.name}}</div>` +
      `<div style="font-size:12px;line-height:1.6;color:${p.ink};">` +
      `<a href="mailto:{{agent.email}}" style="color:${p.accent};text-decoration:none;">{{agent.email}}</a>` +
      `</div>` +
      `</td></tr></table>`
    )
  }
  return (
    `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:${p.background};padding:24px 12px;"><tr><td align="center">` +
    `<table role="presentation" cellpadding="0" cellspacing="0" style="width:100%;max-width:${p.maxWidth}px;background:${p.surface};border:1px solid ${p.border};border-radius:${p.radius}px;"><tr>` +
    `<td style="padding:28px 32px;font-family:${p.font};">` +
    // No token in the starter: the package cannot know which keys a host
    // defines, and an unresolved one would render as a blank in a real send.
    `<h1 style="font-size:20px;font-weight:700;color:${p.ink};margin:0 0 10px;">Hello there</h1>` +
    `<p style="font-size:14px;line-height:1.65;color:${p.ink};margin:0;">Write your message here. Drag a field from the left to insert a token.</p>` +
    `</td></tr></table>` +
    `</td></tr></table>`
  )
}
