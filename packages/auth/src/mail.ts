export type AuthEmailKind = 'magic-link' | 'invitation' | 'password-reset'

export type AuthEmail = {
  kind: AuthEmailKind
  to: string
  subject: string
  text: string
  html: string
}

export type AuthEmailSender = (email: AuthEmail) => Promise<void>

export type AuthEmailRenderer = {
  magicLink?: (input: {
    appName: string
    email: string
    url: string
    invitation: boolean
    tenantName: string | null
  }) => Omit<AuthEmail, 'kind' | 'to'>
  passwordReset?: (input: {
    appName: string
    email: string
    url: string
  }) => Omit<AuthEmail, 'kind' | 'to'>
}

export function renderMagicLinkEmail(input: {
  appName: string
  email: string
  url: string
  invitation: boolean
  tenantName: string | null
}): Omit<AuthEmail, 'kind' | 'to'> {
  const appName = input.appName.trim()
  const tenantName = input.tenantName?.trim() || 'your workspace'
  if (input.invitation) {
    return {
      subject: `You're invited to ${tenantName} in ${appName}`,
      text: `You've been invited to join ${tenantName} in ${appName}.\n\nAccept the invitation and sign in:\n\n${input.url}\n\nThis one-time link expires soon. If you weren't expecting this invitation, ignore this email.`,
      html: `<p>You've been invited to join <strong>${escapeHtml(tenantName)}</strong> in ${escapeHtml(appName)}.</p><p><a href="${escapeHtml(input.url)}">Accept the invitation and sign in</a></p><p>This one-time link expires soon.</p>`,
    }
  }
  return {
    subject: `Sign in to ${appName}`,
    text: `Click this link to sign in to ${appName}:\n\n${input.url}\n\nThis one-time link expires soon. If you didn't request it, ignore this email.`,
    html: `<p>Click <a href="${escapeHtml(input.url)}">here</a> to sign in to ${escapeHtml(appName)}.</p><p>This one-time link expires soon.</p>`,
  }
}

export function renderPasswordResetEmail(input: {
  appName: string
  email: string
  url: string
}): Omit<AuthEmail, 'kind' | 'to'> {
  return {
    subject: `Reset your ${input.appName.trim()} password`,
    text: `A password reset was requested for your ${input.appName.trim()} account.\n\nSet a new password:\n\n${input.url}\n\nThis link expires soon. If you didn't request it, ignore this email—your password won't change.`,
    html: `<p>A password reset was requested for your ${escapeHtml(input.appName.trim())} account.</p><p><a href="${escapeHtml(input.url)}">Set a new password</a></p><p>This link expires soon. If you didn't request it, ignore this email—your password won't change.</p>`,
  }
}

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;')
}
