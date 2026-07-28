'use client'

import * as React from 'react'
import {
  clampHeadViewport,
  createEmptyComposition,
  placePart,
  removePart,
  type AvatarComposition,
  type AvatarHeadViewport,
  type AvatarPart,
  type AvatarPartCategory,
  type AvatarPartTransform,
} from '../composition'

/**
 * The composer's editing state, ported from OpenStudio's `useCanvasState`
 * reducer — the same action vocabulary (place, remove, select, transform,
 * reorder, recolour, reset, undo, redo) and the same bounded history stack.
 *
 * Two changes come from the composition model: a category holds one part, so
 * "add layer" is "place part in category" and selection is a category id; and
 * the head viewport is part of the edited document, so framing changes undo
 * like everything else.
 */
const MAX_HISTORY = 50

type Action =
  | { type: 'place'; part: AvatarPart; category: AvatarPartCategory }
  | { type: 'remove'; categoryId: string }
  | { type: 'select'; categoryId: string | null }
  | { type: 'transform'; categoryId: string; transform: Partial<AvatarPartTransform>; commit: boolean }
  | { type: 'reorder'; categoryId: string; direction: 'up' | 'down' }
  | { type: 'colorVariant'; categoryId: string; variant: string | null }
  | { type: 'opacity'; categoryId: string; opacity: number; commit: boolean }
  | { type: 'visibility'; categoryId: string; hidden: boolean }
  | { type: 'headViewport'; viewport: AvatarHeadViewport; commit: boolean }
  | { type: 'load'; composition: AvatarComposition }
  | { type: 'reset' }
  | { type: 'undo' }
  | { type: 'redo' }

type State = {
  composition: AvatarComposition
  selectedCategoryId: string | null
  history: AvatarComposition[]
  historyIndex: number
}

function commit(state: State, composition: AvatarComposition, selectedCategoryId?: string | null): State {
  const history = state.history.slice(0, state.historyIndex + 1)
  history.push(composition)
  if (history.length > MAX_HISTORY) history.shift()
  return {
    composition,
    selectedCategoryId:
      selectedCategoryId === undefined ? state.selectedCategoryId : selectedCategoryId,
    history,
    historyIndex: history.length - 1,
  }
}

/** Change the document without pushing history — for the frames of a drag. */
function draft(state: State, composition: AvatarComposition): State {
  return { ...state, composition }
}

/**
 * Effective layer order for every placed category, ascending. Reordering
 * rewrites these as explicit overrides so the result survives a category's
 * default order changing later.
 */
function orderedCategoryIds(composition: AvatarComposition, categories: readonly AvatarPartCategory[]): string[] {
  const byId = new Map(categories.map((c) => [c.id, c]))
  return Object.keys(composition.parts).sort((a, b) => {
    const orderA = composition.parts[a]!.layerOrder ?? byId.get(a)?.layerOrder ?? 0
    const orderB = composition.parts[b]!.layerOrder ?? byId.get(b)?.layerOrder ?? 0
    return orderA - orderB || a.localeCompare(b)
  })
}

function reducerFor(categories: readonly AvatarPartCategory[]) {
  return function reducer(state: State, action: Action): State {
    switch (action.type) {
      case 'place':
        return commit(state, placePart(state.composition, action.part, action.category), action.category.id)

      case 'remove': {
        const next = removePart(state.composition, action.categoryId)
        return commit(
          state,
          next,
          state.selectedCategoryId === action.categoryId ? null : state.selectedCategoryId,
        )
      }

      case 'select':
        return { ...state, selectedCategoryId: action.categoryId }

      case 'transform': {
        const placement = state.composition.parts[action.categoryId]
        if (!placement) return state
        const next: AvatarComposition = {
          ...state.composition,
          parts: {
            ...state.composition.parts,
            [action.categoryId]: {
              ...placement,
              transform: { ...placement.transform, ...action.transform },
            },
          },
        }
        return action.commit ? commit(state, next) : draft(state, next)
      }

      case 'reorder': {
        const order = orderedCategoryIds(state.composition, categories)
        const index = order.indexOf(action.categoryId)
        const target = action.direction === 'up' ? index + 1 : index - 1
        if (index < 0 || target < 0 || target >= order.length) return state
        order.splice(target, 0, order.splice(index, 1)[0]!)
        const parts = { ...state.composition.parts }
        order.forEach((categoryId, position) => {
          parts[categoryId] = { ...parts[categoryId]!, layerOrder: position }
        })
        return commit(state, { ...state.composition, parts })
      }

      case 'colorVariant': {
        const placement = state.composition.parts[action.categoryId]
        if (!placement) return state
        const nextPlacement = { ...placement }
        if (action.variant === null) delete nextPlacement.colorVariant
        else nextPlacement.colorVariant = action.variant
        return commit(state, {
          ...state.composition,
          parts: { ...state.composition.parts, [action.categoryId]: nextPlacement },
        })
      }

      case 'opacity': {
        const placement = state.composition.parts[action.categoryId]
        if (!placement) return state
        const next: AvatarComposition = {
          ...state.composition,
          parts: {
            ...state.composition.parts,
            [action.categoryId]: { ...placement, opacity: action.opacity },
          },
        }
        return action.commit ? commit(state, next) : draft(state, next)
      }

      case 'visibility': {
        const placement = state.composition.parts[action.categoryId]
        if (!placement) return state
        return commit(state, {
          ...state.composition,
          parts: {
            ...state.composition.parts,
            [action.categoryId]: { ...placement, hidden: action.hidden },
          },
        })
      }

      case 'headViewport': {
        const next: AvatarComposition = {
          ...state.composition,
          headViewport: clampHeadViewport(action.viewport),
        }
        return action.commit ? commit(state, next) : draft(state, next)
      }

      case 'load':
        return {
          composition: action.composition,
          selectedCategoryId: null,
          history: [action.composition],
          historyIndex: 0,
        }

      case 'reset': {
        const empty = createEmptyComposition()
        return commit({ ...state, selectedCategoryId: null }, empty, null)
      }

      case 'undo': {
        if (state.historyIndex <= 0) return state
        const index = state.historyIndex - 1
        return { ...state, composition: state.history[index]!, historyIndex: index, selectedCategoryId: null }
      }

      case 'redo': {
        if (state.historyIndex >= state.history.length - 1) return state
        const index = state.historyIndex + 1
        return { ...state, composition: state.history[index]!, historyIndex: index, selectedCategoryId: null }
      }
    }
  }
}

export function useCompositionState(
  initial: AvatarComposition,
  categories: readonly AvatarPartCategory[],
) {
  const reducer = React.useMemo(() => reducerFor(categories), [categories])
  const [state, dispatch] = React.useReducer(reducer, {
    composition: initial,
    selectedCategoryId: null,
    history: [initial],
    historyIndex: 0,
  })

  const actions = React.useMemo(
    () => ({
      place: (part: AvatarPart, category: AvatarPartCategory) =>
        dispatch({ type: 'place', part, category }),
      remove: (categoryId: string) => dispatch({ type: 'remove', categoryId }),
      select: (categoryId: string | null) => dispatch({ type: 'select', categoryId }),
      transform: (categoryId: string, transform: Partial<AvatarPartTransform>, commitChange = true) =>
        dispatch({ type: 'transform', categoryId, transform, commit: commitChange }),
      reorder: (categoryId: string, direction: 'up' | 'down') =>
        dispatch({ type: 'reorder', categoryId, direction }),
      setColorVariant: (categoryId: string, variant: string | null) =>
        dispatch({ type: 'colorVariant', categoryId, variant }),
      setOpacity: (categoryId: string, opacity: number, commitChange = true) =>
        dispatch({ type: 'opacity', categoryId, opacity, commit: commitChange }),
      setHidden: (categoryId: string, hidden: boolean) =>
        dispatch({ type: 'visibility', categoryId, hidden }),
      setHeadViewport: (viewport: AvatarHeadViewport, commitChange = true) =>
        dispatch({ type: 'headViewport', viewport, commit: commitChange }),
      load: (composition: AvatarComposition) => dispatch({ type: 'load', composition }),
      reset: () => dispatch({ type: 'reset' }),
      undo: () => dispatch({ type: 'undo' }),
      redo: () => dispatch({ type: 'redo' }),
    }),
    [],
  )

  return {
    composition: state.composition,
    selectedCategoryId: state.selectedCategoryId,
    canUndo: state.historyIndex > 0,
    canRedo: state.historyIndex < state.history.length - 1,
    orderedCategoryIds: orderedCategoryIds(state.composition, categories),
    ...actions,
  }
}
