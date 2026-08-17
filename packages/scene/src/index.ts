export { CharacterScene, type CharacterSceneProps } from './character-scene'
export { WalkingCharacter, type WalkingCharacterProps } from './walking-character'
export { CharacterBadges, CharacterSpeech, CharacterStatus, type SceneActivity } from './character-badges'
export { useSceneAnimationFrame } from './use-animation-frame'
// Re-exported because a scene is the thing that needs to measure its own box,
// and every consumer of this package already reaches for it here. Dropping it
// would be a silent breaking change for anyone on an older @appkitjs/ui.
export { useElementSize } from '@appkitjs/ui'
export {
  DEFAULT_WALKING_CONFIG,
  IDLE_MOTION,
  LOBBY_GROUND,
  biasedSpawn,
  calculateScale,
  calculateZIndex,
  clampToWalkable,
  isInsideZones,
  pathCrossesZones,
  type IdleAnimation,
  type SceneCharacter,
  type SceneGroundConfig,
  type WalkingConfig,
} from './config'
export {
  OFFICE_SCENE_KINDS,
  SCENE_BACKDROPS,
  SCENE_COMPONENTS,
  SCENE_GROUNDS,
  SCENE_HORIZONS,
  SCENE_ORDER,
  SceneArt,
  sceneGround,
  type SceneKind,
  type SceneProps,
} from './scene-art'
