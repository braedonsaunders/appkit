import type {
  MutableListViewStore,
  SavedListView,
} from './list-runtime'
import { assertListViewWriteAllowed, normalizeSavedListViewInput } from './list-runtime'
import type { CustomizationRegistry } from './registry'

export interface MemoryListViewStoreOptions {
  registry: CustomizationRegistry
  views?: SavedListView[]
  preferences?: Iterable<readonly [string, string | null]>
  createId?: () => string
}

/**
 * Complete in-memory saved-view repository for database-free deployments,
 * tests, and local-first applications. Its authorization and default rules
 * match the Drizzle repository.
 */
export function createMemoryListViewStore(options: MemoryListViewStoreOptions): MutableListViewStore {
  let views = structuredClone(options.views ?? [])
  const preferences = new Map(options.preferences ?? [])
  const createId = options.createId ?? (() => crypto.randomUUID())

  return {
    async list(recordType, userId) {
      return cloneViews(views.filter((view) => view.recordType === recordType
        && view.isActive
        && (view.scope === 'organization' || view.ownerId === userId)))
    },
    async preferred(recordType, userId) {
      return preferences.get(preferenceKey(recordType, userId)) ?? null
    },
    async setPreferred(recordType, userId, viewId) {
      if (viewId && !views.some((view) => view.id === viewId
        && view.recordType === recordType
        && view.isActive
        && (view.scope === 'organization' || view.ownerId === userId))) {
        throw new Error('List view not found')
      }
      preferences.set(preferenceKey(recordType, userId), viewId)
    },
    async save(input) {
      const validated = normalizeSavedListViewInput(input, options.registry)
      const existing = input.id ? views.find((view) => view.id === input.id) : undefined
      assertListViewWriteAllowed(existing ?? validated, input.actor)
      if (existing && (existing.recordType !== input.recordType || existing.scope !== input.scope)) {
        throw new Error('A saved view cannot change record type or scope')
      }
      if (views.some((view) => view.id !== input.id
        && view.recordType === input.recordType
        && view.scope === input.scope
        && view.name.toLocaleLowerCase() === validated.name.toLocaleLowerCase())) {
        throw new Error('A view with that name already exists')
      }
      if (validated.isDefault) {
        views = views.map((view) => sameDefaultGroup(view, validated)
          ? { ...view, isDefault: false }
          : view)
      }
      const saved: SavedListView = { ...validated, id: existing?.id ?? createId() }
      views = existing
        ? views.map((view) => view.id === existing.id ? saved : view)
        : [...views, saved]
      return structuredClone(saved)
    },
    async remove(id, actor) {
      const existing = views.find((view) => view.id === id)
      if (!existing) throw new Error('List view not found')
      assertListViewWriteAllowed(existing, actor)
      views = views.filter((view) => view.id !== id)
      for (const [key, viewId] of preferences) if (viewId === id) preferences.set(key, null)
    },
  }
}

function sameDefaultGroup(left: SavedListView, right: Omit<SavedListView, 'id'>): boolean {
  return left.recordType === right.recordType
    && left.scope === right.scope
    && (left.scope === 'organization' || left.ownerId === right.ownerId)
}

function preferenceKey(recordType: string, userId: string): string {
  return `${userId}\u0000${recordType}`
}

function cloneViews(rows: SavedListView[]): SavedListView[] {
  return structuredClone(rows)
}
