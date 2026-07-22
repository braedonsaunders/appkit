import { betterAuth } from 'better-auth'
import { magicLink } from 'better-auth/plugins'
import type { AuthEmailRenderer, AuthEmailSender } from './mail'
import { renderMagicLinkEmail, renderPasswordResetEmail } from './mail'
import type { InviteService } from './invites'

type BetterAuthOptions = Parameters<typeof betterAuth>[0]

export type AppkitAuthOptions = {
  database: NonNullable<BetterAuthOptions['database']>
  baseURL: string
  secret: string
  appName: string
  sendEmail: AuthEmailSender
  renderEmail?: AuthEmailRenderer
  inviteService?: InviteService
  onInviteAcceptanceError?: (error: unknown) => void
  trustedOrigins?: BetterAuthOptions['trustedOrigins']
  session?: {
    expiresIn?: number
    updateAge?: number
    cookieCacheMaxAge?: number
  }
  password?: {
    disableSignUp?: boolean
    requireEmailVerification?: boolean
    minLength?: number
    resetTokenExpiresIn?: number
  }
  magicLink?: {
    expiresIn?: number
    disableSignUp?: boolean
  }
  /** Additional upstream options such as social providers and database hooks. */
  extend?: Omit<
    BetterAuthOptions,
    | 'database'
    | 'baseURL'
    | 'secret'
    | 'appName'
    | 'trustedOrigins'
    | 'user'
    | 'session'
    | 'account'
    | 'verification'
    | 'emailAndPassword'
    | 'plugins'
    | 'hooks'
    | 'advanced'
  >
}

/**
 * Complete persisted authentication runtime extracted from the production
 * reference: password sign-in/reset, hashed one-time magic links, invitation
 * activation, durable sessions/accounts/verifications, client-compatible APIs,
 * and optional social-provider extension. Product delivery and domain effects
 * are injected.
 */
export function createAppkitAuth(options: AppkitAuthOptions) {
  const baseURL = normalizeBaseURL(options.baseURL)
  const appName = options.appName.trim()
  if (!appName) throw new Error('Authentication appName is required.')
  if (options.secret.length < 32) {
    throw new Error('Authentication secret must contain at least 32 characters.')
  }
  const inviteTTL = options.inviteService?.ttlSeconds
  const magicTTL = options.magicLink?.expiresIn ?? inviteTTL ?? 15 * 60
  if (inviteTTL && magicTTL !== inviteTTL) {
    throw new Error('Magic-link and invitation grant expiration must match.')
  }

  return betterAuth({
    ...options.extend,
    database: options.database,
    baseURL,
    secret: options.secret,
    appName,
    user: {
      modelName: 'users',
      fields: {
        emailVerified: 'email_verified',
        createdAt: 'created_at',
        updatedAt: 'updated_at',
      },
      additionalFields: {
        timezone: {
          type: 'string',
          fieldName: 'timezone',
          required: true,
          defaultValue: 'UTC',
        },
        isActive: {
          type: 'boolean',
          fieldName: 'is_active',
          required: true,
          defaultValue: true,
          input: false,
        },
        isSuperAdmin: {
          type: 'boolean',
          fieldName: 'is_super_admin',
          required: true,
          defaultValue: false,
          input: false,
        },
      },
    },
    session: {
      modelName: 'sessions',
      fields: {
        userId: 'user_id',
        expiresAt: 'expires_at',
        ipAddress: 'ip_address',
        userAgent: 'user_agent',
        createdAt: 'created_at',
        updatedAt: 'updated_at',
      },
      additionalFields: {
        activeTenantId: { type: 'string', fieldName: 'active_tenant_id', required: false, input: false },
        impersonatingUserId: { type: 'string', fieldName: 'impersonating_user_id', required: false, input: false },
        impersonationTenantId: { type: 'string', fieldName: 'impersonation_tenant_id', required: false, input: false },
        impersonationStartedAt: { type: 'date', fieldName: 'impersonation_started_at', required: false, input: false },
        impersonationExpiresAt: { type: 'date', fieldName: 'impersonation_expires_at', required: false, input: false },
        impersonationReason: { type: 'string', fieldName: 'impersonation_reason', required: false, input: false },
      },
      expiresIn: options.session?.expiresIn ?? 60 * 60 * 24 * 30,
      updateAge: options.session?.updateAge ?? 60 * 60 * 24,
      cookieCache: {
        enabled: true,
        maxAge: options.session?.cookieCacheMaxAge ?? 60 * 5,
      },
    },
    account: {
      modelName: 'accounts',
      fields: {
        userId: 'user_id',
        accountId: 'account_id',
        providerId: 'provider_id',
        accessToken: 'access_token',
        refreshToken: 'refresh_token',
        idToken: 'id_token',
        accessTokenExpiresAt: 'access_token_expires_at',
        refreshTokenExpiresAt: 'refresh_token_expires_at',
        createdAt: 'created_at',
        updatedAt: 'updated_at',
      },
      encryptOAuthTokens: true,
    },
    verification: {
      modelName: 'verifications',
      fields: {
        expiresAt: 'expires_at',
        createdAt: 'created_at',
        updatedAt: 'updated_at',
      },
    },
    advanced: {
      database: { generateId: 'uuid' },
    },
    emailAndPassword: {
      enabled: true,
      disableSignUp: options.password?.disableSignUp ?? true,
      requireEmailVerification: options.password?.requireEmailVerification ?? false,
      minPasswordLength: options.password?.minLength ?? 8,
      autoSignIn: true,
      resetPasswordTokenExpiresIn: options.password?.resetTokenExpiresIn ?? 60 * 60,
      revokeSessionsOnPasswordReset: true,
      sendResetPassword: async ({ user, url }) => {
        const rendered = (options.renderEmail?.passwordReset ?? renderPasswordResetEmail)({
          appName,
          email: user.email,
          url,
        })
        await options.sendEmail({ kind: 'password-reset', to: user.email, ...rendered })
      },
    },
    plugins: [
      magicLink({
        disableSignUp: options.magicLink?.disableSignUp ?? true,
        expiresIn: magicTTL,
        storeToken: 'hashed',
        sendMagicLink: async ({ email, url, metadata }) => {
          const invitation = metadata?.flow === 'invite'
          const tenantName =
            typeof metadata?.tenantName === 'string' && metadata.tenantName.trim()
              ? metadata.tenantName.trim()
              : null
          const rendered = (options.renderEmail?.magicLink ?? renderMagicLinkEmail)({
            appName,
            email,
            url,
            invitation,
            tenantName,
          })
          await options.sendEmail({
            kind: invitation ? 'invitation' : 'magic-link',
            to: email,
            ...rendered,
          })
        },
      }),
    ],
    hooks: {
      after: async (rawContext) => {
        const context = rawContext as unknown as {
          path?: string
          query?: { callbackURL?: unknown }
          context: { newSession?: { user: { id: string } } | null }
        }
        if (context.path !== '/magic-link/verify' || !options.inviteService) return {}
        const sessionUserId = context.context.newSession?.user.id
        if (!sessionUserId) return {}
        const grant = options.inviteService.inviteGrantFromCallbackURL(
          context.query?.callbackURL,
          baseURL,
        )
        if (!grant) return {}
        // Preserve the valid session/callback if a downstream domain hook fails;
        // the membership remains unchanged and the callback can show recovery.
        await options.inviteService.acceptInviteAfterMagicLink(grant, sessionUserId).catch((error) => {
          if (options.onInviteAcceptanceError) options.onInviteAcceptanceError(error)
          else console.error('[appkit/auth] invitation acceptance failed', error)
        })
        return {}
      },
    },
    trustedOrigins: options.trustedOrigins ?? [baseURL],
  })
}

export type AppkitAuth = ReturnType<typeof createAppkitAuth>

/** Lazy singleton pattern used by server runtimes that must import safely at build time. */
export function createLazyAuth(factory: () => AppkitAuth): () => AppkitAuth {
  let instance: AppkitAuth | undefined
  return () => (instance ??= factory())
}

function normalizeBaseURL(value: string): string {
  const url = new URL(value)
  if (url.username || url.password || url.search || url.hash) {
    throw new Error('Authentication baseURL must be an origin without credentials, query, or hash.')
  }
  return url.origin
}
