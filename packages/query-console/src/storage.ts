import type {
  QueryConsoleStorage,
  QueryConsoleStoredState,
  QueryHistoryItem,
  SavedQuerySnippet,
} from './types'

export interface StorageLike {
  getItem(key: string): string | null
  setItem(key: string, value: string): void
}

function parseHistory(value: string | null): QueryHistoryItem[] {
  if (!value) return []
  try {
    const parsed: unknown = JSON.parse(value)
    if (!Array.isArray(parsed)) return []
    return parsed.filter((item): item is QueryHistoryItem => (
      Boolean(item)
      && typeof item === 'object'
      && typeof item.sql === 'string'
      && typeof item.at === 'number'
      && typeof item.durationMs === 'number'
      && typeof item.rowCount === 'number'
      && typeof item.ok === 'boolean'
    )).slice(0, 30)
  } catch {
    return []
  }
}

function parseSnippets(value: string | null): SavedQuerySnippet[] {
  if (!value) return []
  try {
    const parsed: unknown = JSON.parse(value)
    if (!Array.isArray(parsed)) return []
    return parsed.filter((item): item is SavedQuerySnippet => (
      Boolean(item)
      && typeof item === 'object'
      && typeof item.id === 'string'
      && typeof item.name === 'string'
      && typeof item.sql === 'string'
      && typeof item.at === 'number'
    )).slice(0, 100)
  } catch {
    return []
  }
}

export function createLocalQueryConsoleStorage(
  namespace: string,
  storage?: StorageLike,
): QueryConsoleStorage {
  const normalized = namespace.trim()
  if (!normalized) throw new Error('Query console storage namespace is required')

  const resolveStorage = (): StorageLike => {
    const target = storage ?? globalThis.localStorage
    if (!target) throw new Error('Query console local storage is unavailable')
    return target
  }
  const draftKey = `${normalized}.draft.v1`
  const historyKey = `${normalized}.history.v1`
  const snippetsKey = `${normalized}.snippets.v1`

  return {
    load(): QueryConsoleStoredState {
      const target = resolveStorage()
      return {
        draft: target.getItem(draftKey) ?? undefined,
        history: parseHistory(target.getItem(historyKey)),
        snippets: parseSnippets(target.getItem(snippetsKey)),
      }
    },
    saveDraft(sql) {
      resolveStorage().setItem(draftKey, sql)
    },
    saveHistory(history) {
      resolveStorage().setItem(historyKey, JSON.stringify(history.slice(0, 30)))
    },
    saveSnippets(snippets) {
      resolveStorage().setItem(snippetsKey, JSON.stringify(snippets.slice(0, 100)))
    },
  }
}

export function createMemoryQueryConsoleStorage(
  initial: Partial<QueryConsoleStoredState> = {},
): QueryConsoleStorage & { snapshot(): QueryConsoleStoredState } {
  let state: QueryConsoleStoredState = {
    draft: initial.draft,
    history: [...(initial.history ?? [])],
    snippets: [...(initial.snippets ?? [])],
  }
  return {
    load: () => structuredClone(state),
    saveDraft: (draft) => {
      state = { ...state, draft }
    },
    saveHistory: (history) => {
      state = { ...state, history: structuredClone(history.slice(0, 30)) }
    },
    saveSnippets: (snippets) => {
      state = { ...state, snippets: structuredClone(snippets.slice(0, 100)) }
    },
    snapshot: () => structuredClone(state),
  }
}
