import { and, asc, desc, eq, or } from 'drizzle-orm'
import type { NodePgDatabase } from 'drizzle-orm/node-postgres'
import {
  assertListViewWriteAllowed,
  normalizeSavedListViewInput,
  type MutableListViewStore,
  type SavedListView,
} from './list-runtime'
import { listViews, userListPreferences } from './persistence-schema'

type Db = NodePgDatabase<Record<string, never>>

export interface DrizzleListViewStoreOptions {
  tenantId: string
}

/**
 * Production saved-view repository. Bind it to an RLS-scoped database handle;
 * explicit tenant and owner predicates remain in every query as defense in
 * depth. Applications keep authorization policy outside the repository and
 * pass the resulting organization-management capability with each mutation.
 */
export function createDrizzleListViewStore(
  db: Db,
  options: DrizzleListViewStoreOptions,
): MutableListViewStore {
  return {
    async list(recordType, userId) {
      const rows = await db.select().from(listViews).where(and(
        eq(listViews.tenantId, options.tenantId),
        eq(listViews.recordType, recordType),
        eq(listViews.isActive, true),
        or(eq(listViews.scope, 'organization'), eq(listViews.ownerId, userId)),
      )).orderBy(asc(listViews.scope), desc(listViews.isDefault), asc(listViews.name))
      return rows.map(toSavedListView)
    },
    async preferred(recordType, userId) {
      const [row] = await db.select({ viewId: userListPreferences.viewId })
        .from(userListPreferences)
        .where(and(
          eq(userListPreferences.tenantId, options.tenantId),
          eq(userListPreferences.userId, userId),
          eq(userListPreferences.recordType, recordType),
        ))
        .limit(1)
      return row?.viewId ?? null
    },
    async setPreferred(recordType, userId, viewId) {
      if (viewId) {
        const [accessible] = await db.select({ id: listViews.id }).from(listViews).where(and(
          eq(listViews.id, viewId),
          eq(listViews.tenantId, options.tenantId),
          eq(listViews.recordType, recordType),
          or(eq(listViews.scope, 'organization'), eq(listViews.ownerId, userId)),
        )).limit(1)
        if (!accessible) throw new Error('List view not found')
      }
      await db.insert(userListPreferences).values({
        tenantId: options.tenantId,
        userId,
        recordType,
        viewId,
        createdBy: userId,
        updatedBy: userId,
      }).onConflictDoUpdate({
        target: [userListPreferences.tenantId, userListPreferences.userId, userListPreferences.recordType],
        set: { viewId, updatedAt: new Date(), updatedBy: userId },
      })
    },
    async save(input) {
      const normalized = normalizeSavedListViewInput(input)
      return db.transaction(async (tx) => {
        const [existing] = input.id
          ? await tx.select().from(listViews).where(and(
            eq(listViews.id, input.id),
            eq(listViews.tenantId, options.tenantId),
          )).limit(1)
          : []
        if (input.id && !existing) throw new Error('List view not found')
        assertListViewWriteAllowed(existing ? toSavedListView(existing) : normalized, input.actor)
        if (existing && (existing.recordType !== input.recordType || existing.scope !== input.scope)) {
          throw new Error('A saved view cannot change record type or scope')
        }
        if (normalized.isDefault) {
          await tx.update(listViews).set({ isDefault: false, updatedAt: new Date(), updatedBy: input.actor.userId }).where(and(
            eq(listViews.tenantId, options.tenantId),
            eq(listViews.recordType, normalized.recordType),
            eq(listViews.scope, normalized.scope),
            eq(listViews.isDefault, true),
            ...(normalized.scope === 'user' ? [eq(listViews.ownerId, input.actor.userId)] : []),
          ))
        }
        if (existing) {
          const [updated] = await tx.update(listViews).set({
            name: normalized.name,
            isDefault: normalized.isDefault,
            isActive: normalized.isActive,
            config: normalized.config,
            updatedAt: new Date(),
            updatedBy: input.actor.userId,
          }).where(and(eq(listViews.id, existing.id), eq(listViews.tenantId, options.tenantId))).returning()
          if (!updated) throw new Error('List view was not visible after update')
          return toSavedListView(updated)
        }
        const [inserted] = await tx.insert(listViews).values({
          tenantId: options.tenantId,
          ...normalized,
          createdBy: input.actor.userId,
          updatedBy: input.actor.userId,
        }).returning()
        if (!inserted) throw new Error('List view was not visible after insertion')
        return toSavedListView(inserted)
      })
    },
    async remove(id, actor) {
      await db.transaction(async (tx) => {
        const [existing] = await tx.select().from(listViews).where(and(
          eq(listViews.id, id),
          eq(listViews.tenantId, options.tenantId),
        )).limit(1)
        if (!existing) throw new Error('List view not found')
        assertListViewWriteAllowed(toSavedListView(existing), actor)
        await tx.update(userListPreferences).set({
          viewId: null,
          updatedAt: new Date(),
          updatedBy: actor.userId,
        }).where(and(
          eq(userListPreferences.tenantId, options.tenantId),
          eq(userListPreferences.viewId, id),
        ))
        await tx.delete(listViews).where(and(eq(listViews.id, id), eq(listViews.tenantId, options.tenantId)))
      })
    },
  }
}

function toSavedListView(row: typeof listViews.$inferSelect): SavedListView {
  return {
    id: row.id,
    recordType: row.recordType,
    name: row.name,
    scope: row.scope,
    ownerId: row.ownerId,
    isDefault: row.isDefault,
    isActive: row.isActive,
    config: row.config,
  }
}

export {
  formLayouts,
  userFormPreferences,
  listViews,
  userListPreferences,
  LIST_VIEW_SCOPES,
  CUSTOMIZATION_TENANT_TABLES,
} from './persistence-schema'
