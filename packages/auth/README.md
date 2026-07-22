# @appkit/auth

Production authentication extracted from the complete reference runtime and generalized around explicit application inputs.

## What ships

- persisted Better Auth sessions, password accounts, OAuth accounts, and single-use verification records;
- password sign-in, reset requests, reset completion, session refresh/revocation, and encrypted OAuth tokens;
- hashed one-time magic links with framework-neutral email delivery;
- membership-targeted invitation grants that cannot activate a different user, tenant, membership, or resend generation;
- atomic Postgres invitation acceptance and audit through `@appkit/auth/drizzle`;
- deterministic memory invitation storage for tests and database-free applications;
- React sign-in, forgot-password, reset-password, and auth-screen compositions;
- Better Auth React client and Next.js route bindings as optional entry points.

## Server

```ts
import { createAppkitAuth, createLazyAuth } from '@appkit/auth/server'

export const getAuth = createLazyAuth(() => createAppkitAuth({
  database: pool,
  baseURL: process.env.APP_URL!,
  secret: process.env.BETTER_AUTH_SECRET!,
  appName: 'My app',
  sendEmail: (message) => emailQueue.enqueue(message),
}))
```

Mount `toNextJsHandler(getAuth())` from `@appkit/auth/next` in a Next.js catch-all route. Other frameworks can mount `getAuth().handler` directly.

## Invitations

Create one `InviteService` with an explicit signing secret and a memory or Drizzle store. Mint a new grant after atomically advancing `membership.invitedAt`, pass its callback path to `signInMagicLink`, and provide the same service to `createAppkitAuth`. Membership activation then occurs only after Better Auth successfully consumes the matching one-time magic link.

Applications own branding, transactional email transport, route authorization, tenant selection cookies, and optional post-acceptance domain effects. The package owns the security state machine and complete UI/runtime boundary.
