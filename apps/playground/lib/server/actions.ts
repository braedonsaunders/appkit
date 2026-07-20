'use server'

import { cookies } from 'next/headers'
import { redirect } from 'next/navigation'
import { revalidatePath } from 'next/cache'
import { memberships, roleAssignments, roles, users } from '@appkit/db'
import { audit } from '@appkit/events'
import { assertCan } from '@appkit/tenant'
import { and, eq, sql } from 'drizzle-orm'
import { platform } from './platform'
import { getSession } from './session'

const secure = process.env.NODE_ENV === 'production'

export async function loginAction(
  _prev: { error: string | null },
  formData: FormData,
): Promise<{ error: string | null }> {
  const { appkit, auth } = platform()
  const email = String(formData.get('email') ?? '').trim()
  const password = String(formData.get('password') ?? '')
  if (!email || !password) return { error: 'Enter your email and password.' }

  const user = await appkit.withSuperAdmin((sdb) => auth.authenticate(sdb as never, email, password))
  if (!user) return { error: 'Invalid email or password.' }

  const jar = await cookies()
  const opts = auth.sessionCookieOptions({ secure })
  jar.set(opts.name, auth.makeSessionToken(user.id), opts)
  redirect('/dashboard')
}

export async function logoutAction(): Promise<void> {
  const { auth } = platform()
  const jar = await cookies()
  jar.delete(auth.cookieName)
  redirect('/login')
}

export async function inviteMemberAction(
  _prev: { error: string | null; ok: boolean },
  formData: FormData,
): Promise<{ error: string | null; ok: boolean }> {
  const session = await getSession()
  if (!session) redirect('/login')
  const { ctx, tenant } = session
  assertCan(ctx, 'team.manage')

  const name = String(formData.get('name') ?? '').trim()
  const email = String(formData.get('email') ?? '')
    .trim()
    .toLowerCase()
  if (!name || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    return { error: 'Enter a name and a valid email.', ok: false }
  }

  try {
    await ctx.db(async (db) => {
      // users is a global table; membership + role rows are tenant-scoped (RLS).
      const [existing] = await db
        .select({ id: users.id })
        .from(users)
        .where(sql`lower(${users.email}) = ${email}`)
        .limit(1)
      const userId =
        existing?.id ??
        (await db.insert(users).values({ email, name }).returning({ id: users.id }))[0]!.id

      const [dupe] = await db
        .select({ id: memberships.id })
        .from(memberships)
        .where(and(eq(memberships.tenantId, tenant.id), eq(memberships.userId, userId)))
        .limit(1)
      if (dupe) throw new Error('Already a member of this workspace.')

      const [membership] = await db
        .insert(memberships)
        .values({ tenantId: tenant.id, userId, displayName: name })
        .returning({ id: memberships.id })

      const [memberRole] = await db
        .select({ id: roles.id })
        .from(roles)
        .where(and(eq(roles.tenantId, tenant.id), eq(roles.key, 'member')))
        .limit(1)
      if (memberRole) {
        await db.insert(roleAssignments).values({
          tenantId: tenant.id,
          membershipId: membership!.id,
          roleId: memberRole.id,
          scope: { type: 'tenant' },
        })
      }

      await audit(db as never, {
        tenantId: tenant.id,
        actorUserId: ctx.userId,
        entityType: 'membership',
        entityId: membership!.id,
        action: 'invite',
        summary: `Invited ${name} <${email}>`,
        after: { name, email },
      })
    })
  } catch (e) {
    return { error: e instanceof Error ? e.message : 'Invite failed.', ok: false }
  }

  revalidatePath('/dashboard/team')
  return { error: null, ok: true }
}
