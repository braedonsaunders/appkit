import { sql } from 'drizzle-orm'
import { boolean, jsonb, pgTable, text, timestamp, uniqueIndex, uuid } from 'drizzle-orm/pg-core'
import { auditColumns, id, tenantRef } from '../helpers'

/**
 * The canonical multi-tenant identity model. Global tables (tenants, users) are
 * NOT tenant-scoped; the rest are and get RLS via `IDENTITY_TENANT_TABLES`.
 * A role's visibility scope narrows what its holder can see within a tenant.
 */
export type RoleScope =
  | { type: 'tenant' }
  | { type: 'self' }
  | { type: 'sites'; siteIds: string[] }

// --- Global ----------------------------------------------------------------

/** A tenant / organization / workspace. */
export const tenants = pgTable('tenants', {
  id: id(),
  name: text('name').notNull(),
  slug: text('slug').notNull(),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
}, (t) => [uniqueIndex('tenants_slug_key').on(t.slug)])

/** A login identity. May belong to many tenants via memberships. */
export const users = pgTable('users', {
  id: id(),
  email: text('email').notNull(),
  name: text('name').notNull(),
  /** Optional credential hash; auth mechanism is app-provided (see @appkit/auth). */
  passwordHash: text('password_hash'),
  isActive: boolean('is_active').notNull().default(true),
  /** Platform super-admin — reaches every tenant (see withSuperAdmin). */
  isSuperAdmin: boolean('is_super_admin').notNull().default(false),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
}, (t) => [uniqueIndex('users_email_key').on(t.email)])

// --- Tenant-scoped ---------------------------------------------------------

/** A user's membership in a tenant. */
export const memberships = pgTable('tenant_users', {
  id: id(),
  tenantId: tenantRef(),
  userId: uuid('user_id').notNull(),
  displayName: text('display_name').notNull(),
  ...auditColumns,
}, (t) => [uniqueIndex('tenant_users_tenant_user_key').on(t.tenantId, t.userId)])

/** A role: a named bundle of permission keys, scoped to a tenant. */
export const roles = pgTable('roles', {
  id: id(),
  tenantId: tenantRef(),
  key: text('key').notNull(),
  name: text('name').notNull(),
  permissions: jsonb('permissions').$type<string[]>().notNull().default(sql`'[]'::jsonb`),
  ...auditColumns,
}, (t) => [uniqueIndex('roles_tenant_key_key').on(t.tenantId, t.key)])

/** Assigns a role to a membership, with a visibility scope. */
export const roleAssignments = pgTable('role_assignments', {
  id: id(),
  tenantId: tenantRef(),
  membershipId: uuid('tenant_user_id').notNull(),
  roleId: uuid('role_id').notNull(),
  scope: jsonb('scope').$type<RoleScope>().notNull().default(sql`'{"type":"tenant"}'::jsonb`),
})

/** Per-user grant/deny that overrides the union of assigned roles. */
export const userPermissionOverrides = pgTable('user_permission_overrides', {
  id: id(),
  tenantId: tenantRef(),
  membershipId: uuid('tenant_user_id').notNull(),
  permission: text('permission').notNull(),
  effect: text('effect').$type<'grant' | 'deny'>().notNull(),
})

/** Tenant-scoped identity tables that need RLS installed. */
export const IDENTITY_TENANT_TABLES = [
  'tenant_users',
  'roles',
  'role_assignments',
  'user_permission_overrides',
] as const
