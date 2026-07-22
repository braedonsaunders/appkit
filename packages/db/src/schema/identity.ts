import { sql } from 'drizzle-orm'
import {
  boolean,
  foreignKey,
  index,
  jsonb,
  pgEnum,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from 'drizzle-orm/pg-core'
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
  | { type: 'team'; departmentIds: string[]; groupIds: string[] }
  | { type: 'people'; personIds: string[] }
  | { type: 'crews'; crewIds: string[] }

// --- Global ----------------------------------------------------------------

/** A tenant / organization / workspace. */
export const tenantStatus = pgEnum('tenant_status', ['active', 'suspended', 'archived'])

export const tenants = pgTable(
  'tenants',
  {
    id: id(),
    name: text('name').notNull(),
    slug: text('slug').notNull(),
    status: tenantStatus('status').notNull().default('active'),
    defaultLocale: text('default_locale').notNull().default('en'),
    enabledLocales: jsonb('enabled_locales').$type<string[]>().notNull().default(sql`'["en"]'::jsonb`),
    settings: jsonb('settings').$type<Record<string, unknown>>().notNull().default(sql`'{}'::jsonb`),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [uniqueIndex('tenants_slug_key').on(t.slug)],
)

/** A login identity. May belong to many tenants via memberships. */
export const users = pgTable('users', {
  id: id(),
  email: text('email').notNull(),
  name: text('name').notNull(),
  emailVerified: boolean('email_verified').notNull().default(false),
  image: text('image'),
  timezone: text('timezone').notNull().default('UTC'),
  /** Optional credential hash; auth mechanism is app-provided (see @appkit/auth). */
  passwordHash: text('password_hash'),
  isActive: boolean('is_active').notNull().default(true),
  /** Platform super-admin — reaches every tenant (see withSuperAdmin). */
  isSuperAdmin: boolean('is_super_admin').notNull().default(false),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
}, (t) => [uniqueIndex('users_email_key').on(t.email)])

// --- Tenant-scoped ---------------------------------------------------------

/** A user's membership in a tenant. */
export const membershipStatus = pgEnum('tenant_user_status', ['active', 'invited', 'suspended'])

export const memberships = pgTable(
  'tenant_users',
  {
    id: id(),
    tenantId: tenantRef(),
    userId: uuid('user_id').notNull(),
    displayName: text('display_name').notNull(),
    localeOverride: text('locale_override'),
    status: membershipStatus('status').notNull().default('active'),
    invitedAt: timestamp('invited_at', { withTimezone: true }),
    invitedBy: uuid('invited_by'),
    joinedAt: timestamp('joined_at', { withTimezone: true }),
    ...auditColumns,
  },
  (t) => [
    uniqueIndex('tenant_users_tenant_user_key').on(t.tenantId, t.userId),
    uniqueIndex('tenant_users_tenant_id_id_key').on(t.tenantId, t.id),
    index('tenant_users_tenant_idx').on(t.tenantId),
    index('tenant_users_user_idx').on(t.userId),
  ],
)

/** A role: a named bundle of permission keys, scoped to a tenant. */
export const roles = pgTable(
  'roles',
  {
    id: id(),
    tenantId: tenantRef(),
    key: text('key').notNull(),
    name: text('name').notNull(),
    description: text('description'),
    isBuiltIn: boolean('is_built_in').notNull().default(false),
    permissions: jsonb('permissions').$type<string[]>().notNull().default(sql`'[]'::jsonb`),
    ...auditColumns,
  },
  (t) => [
    uniqueIndex('roles_tenant_key_key').on(t.tenantId, t.key),
    uniqueIndex('roles_tenant_id_id_key').on(t.tenantId, t.id),
    index('roles_tenant_idx').on(t.tenantId),
  ],
)

/** Assigns a role to a membership, with a visibility scope. */
export const roleAssignments = pgTable(
  'role_assignments',
  {
    id: id(),
    tenantId: tenantRef(),
    membershipId: uuid('tenant_user_id').notNull(),
    roleId: uuid('role_id').notNull(),
    scope: jsonb('scope').$type<RoleScope>().notNull().default(sql`'{"type":"tenant"}'::jsonb`),
    ...auditColumns,
  },
  (t) => [
    uniqueIndex('role_assignments_tenant_member_role_key').on(
      t.tenantId,
      t.membershipId,
      t.roleId,
    ),
    index('role_assignments_tenant_idx').on(t.tenantId),
    index('role_assignments_member_idx').on(t.membershipId),
    index('role_assignments_role_idx').on(t.roleId),
    foreignKey({
      name: 'role_assignments_tenant_member_fk',
      columns: [t.tenantId, t.membershipId],
      foreignColumns: [memberships.tenantId, memberships.id],
    }).onDelete('cascade'),
    foreignKey({
      name: 'role_assignments_tenant_role_fk',
      columns: [t.tenantId, t.roleId],
      foreignColumns: [roles.tenantId, roles.id],
    }).onDelete('cascade'),
  ],
)

/** Per-user grant/deny that overrides the union of assigned roles. */
export const permissionOverrideEffect = pgEnum('permission_override_effect', ['grant', 'deny'])

export const userPermissionOverrides = pgTable(
  'user_permission_overrides',
  {
    id: id(),
    tenantId: tenantRef(),
    membershipId: uuid('tenant_user_id').notNull(),
    permission: text('permission').notNull(),
    effect: permissionOverrideEffect('effect').notNull(),
    ...auditColumns,
  },
  (t) => [
    uniqueIndex('user_permission_overrides_member_permission_key').on(
      t.membershipId,
      t.permission,
    ),
    index('user_permission_overrides_tenant_idx').on(t.tenantId),
    index('user_permission_overrides_member_idx').on(t.membershipId),
    foreignKey({
      name: 'user_permission_overrides_tenant_member_fk',
      columns: [t.tenantId, t.membershipId],
      foreignColumns: [memberships.tenantId, memberships.id],
    }).onDelete('cascade'),
  ],
)

/** Tenant-scoped identity tables that need RLS installed. */
export const IDENTITY_TENANT_TABLES = [
  'tenant_users',
  'roles',
  'role_assignments',
  'user_permission_overrides',
] as const
