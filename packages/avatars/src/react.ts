// Client entry — the composition surface.
//
// Kept separate from the package root so that importing a renderer never pulls
// the AI SDK provider factories (and their server credentials path) into a
// browser bundle. Pure composition types and helpers live at
// `@braedonsaunders/appkit-avatars/composition`, which both entries share.

export {
  ComposedAvatar,
  type ComposedAvatarProps,
  type ComposedAvatarVariant,
  type ComposedAvatarAnimation,
} from './react/composed-avatar'
export { AvatarComposer } from './react/avatar-composer'
export { ComposerStage, type StageMode } from './react/composer-stage'
export { PartLibraryPanel } from './react/part-library-panel'
export { LayerPanel } from './react/layer-panel'
export { TransformControls } from './react/transform-controls'
export { useCompositionState } from './react/use-composition-state'
export { GeneratePanel, type PartGenerator } from './react/generate-panel'
