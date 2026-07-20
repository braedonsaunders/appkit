import {
  EMAIL_RENDER_LIMITS,
  htmlToPlainText,
  normalizeEmailSubject,
  renderTemplate,
  sanitizeTokenizedEmailFragment,
} from '@appkit/email-render'
import type {
  DeliverContext,
  DeliverResult,
  DestinationDef,
  DestinationTestContext,
  IntegrationResult,
  Item,
} from './types'

export type IntegrationEmail = {
  tenantId: string
  to: string[]
  subject: string
  html: string
  text: string
}
export type IntegrationEmailSender = (
  message: IntegrationEmail,
) => Promise<void>
function recipients(raw: string, item: Item): string[] {
  return renderTemplate(raw, item, { allowRawValues: false })
    .split(/[,;\s]+/)
    .map((value) => value.trim())
    .filter((value) => value.includes('@'))
}
export function createIntegrationEmailBodyRenderer(
  bodyTemplate: string,
): (item: Item) => string {
  const sanitized = sanitizeTokenizedEmailFragment(bodyTemplate)
  if (!sanitized.trim())
    throw new Error('The email body contained no safe content.')
  return (item) =>
    renderTemplate(sanitized, item, {
      escapeHtml: true,
      allowRawValues: false,
    })
}
function subject(template: string, item: Item): string {
  return (
    normalizeEmailSubject(
      renderTemplate(template, item, { allowRawValues: false }),
    ) || 'App notification'
  )
}

export function createEmailDestination(
  sendEmail: IntegrationEmailSender,
): DestinationDef {
  const test = async (
    context: DestinationTestContext,
  ): Promise<IntegrationResult> => {
    const to = String(context.config.to ?? '').trim()
    if (!to) return { ok: false, error: 'At least one recipient is required.' }
    if (!to.includes('@') && !to.includes('{{'))
      return { ok: false, error: `"${to}" is not an email address or token.` }
    return {
      ok: true,
      summary: `Will email ${to} through the configured transport.`,
    }
  }
  const deliver = async (context: DeliverContext): Promise<DeliverResult> => {
    const toTemplate = String(context.config.to ?? '').trim()
    const subjectTemplate =
      String(context.config.subject ?? '').trim() || 'App notification'
    const bodyTemplate = String(context.mapping.body ?? '').trim()
    if (!toTemplate) return { ok: false, error: 'No recipients configured.' }
    if (!bodyTemplate) return { ok: false, error: 'An email body is required.' }
    if (!context.items.length) return { ok: true, summary: 'No items to send.' }
    const combine =
      context.config.combine !== false && context.config.combine !== 'false'
    const renderBody = createIntegrationEmailBodyRenderer(bodyTemplate)
    let sent = 0
    const errors: string[] = []
    const send = async (item: Item, html: string) => {
      const to = recipients(toTemplate, item)
      if (!to.length) {
        errors.push('no valid recipients')
        return
      }
      await sendEmail({
        tenantId: context.tenantId,
        to,
        subject: subject(subjectTemplate, item),
        html,
        text: htmlToPlainText(html),
      })
      sent++
    }
    try {
      if (combine) {
        const first = context.items[0]!
        let html = ''
        for (const item of context.items) {
          const part = renderBody(item)
          const separator = html ? '<hr/>' : ''
          if (
            html.length >
            EMAIL_RENDER_LIMITS.renderOutputChars -
              separator.length -
              part.length
          )
            throw new Error(
              `Rendered output exceeded ${EMAIL_RENDER_LIMITS.renderOutputChars} characters.`,
            )
          html += separator + part
        }
        await send(first, html)
      } else
        for (const item of context.items) await send(item, renderBody(item))
    } catch (error) {
      errors.push(error instanceof Error ? error.message : String(error))
    }
    return errors.length && !sent
      ? { ok: false, error: errors[0] }
      : {
          ok: errors.length === 0,
          summary: `Queued ${sent} email(s)${errors.length ? ` (${errors.length} failed)` : ''}.`,
          refs: sent
            ? [{ externalRef: `email:${context.subjectId}` }]
            : undefined,
        }
  }
  return {
    key: 'email',
    name: 'Email',
    description:
      'Send a bounded, sanitized, token-templated email through an app-provided transport.',
    iconKey: 'mail',
    mappingKind: 'email',
    reversible: false,
    configFields: [
      {
        key: 'to',
        label: 'Recipients',
        type: 'text',
        required: true,
        placeholder: 'ops@example.com, {{ownerEmail}}',
        help: 'Comma-separated; tokens are supported.',
      },
      { key: 'subject', label: 'Subject', type: 'text' },
      { key: 'combine', label: 'Combine collection items', type: 'boolean' },
    ],
    secretFields: [],
    test,
    deliver,
  }
}
