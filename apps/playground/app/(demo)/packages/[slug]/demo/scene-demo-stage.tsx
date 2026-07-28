'use client'

import { CharacterScene, SceneArt, sceneGround, type SceneCharacter } from '@appkit/scene'
import { useTheme } from '@appkit/ui'

const CHARACTERS: SceneCharacter[] = [
  { id: 'aria', name: 'Aria', idleAnimation: 'sway', status: { label: 'Reviewing', tone: 'active' } },
  { id: 'marcus', name: 'Marcus', walkSpeed: 0.85, idleAnimation: 'bounce', status: { label: 'Planning', tone: 'busy' } },
  { id: 'nora', name: 'Nora', walkSpeed: 1.15, idleAnimation: 'dance', status: { label: 'Available', tone: 'idle' } },
]

export function SceneDemoStage() {
  const { resolvedTheme } = useTheme()
  const isDark = resolvedTheme === 'dark'

  return (
    <CharacterScene
      characters={CHARACTERS}
      ground={sceneGround('beach', isDark)}
      art={<SceneArt kind="beach" isDark={isDark} />}
      height={420}
      contentZone={{ minX: 30, maxX: 70, minY: 38, maxY: 70 }}
    >
      <div className="mx-auto mt-8 w-fit max-w-80 rounded-xl border border-border bg-surface/90 px-5 py-4 text-center shadow-md backdrop-blur">
        <p className="text-sm font-semibold text-fg">Shared team lobby</p>
        <p className="mt-1 text-xs leading-5 text-fg-muted">Characters route around this protected content zone.</p>
      </div>
    </CharacterScene>
  )
}
