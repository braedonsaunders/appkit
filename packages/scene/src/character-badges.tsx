'use client'

import { AnimatePresence, motion } from 'framer-motion'
import { cn } from '@appkitjs/ui'
import type { SceneCharacter } from './config'

/**
 * What a character is doing, and what it is saying.
 *
 * A stage of figures strolling about conveys that the office is populated and
 * nothing whatever about whether anybody is working — which is the only reason
 * to open it. These answer that without being hovered, because you cannot
 * hover eight characters at once.
 *
 * THE RULE THAT SHAPES ALL OF THIS: a label beside a walking figure has almost
 * no horizontal room, so nothing that needs truncating may go in it. The first
 * version put a sentence there and clipped it, and every character ended up
 * wearing the same grey "needs… waiting on a deci…" — unreadable, identical,
 * and worse than nothing. So the split is strict:
 *
 *   - the PILL carries state: one short word from a fixed vocabulary, with a
 *     glyph that animates the KIND of work. Never truncated, because nothing
 *     long is ever put in it.
 *   - the BUBBLE carries specifics, above the head, where there is room for a
 *     sentence and where clamping to three lines looks deliberate.
 *   - the NAME card stays on hover, and the pill crossfades out as it arrives
 *     so the two never stack.
 *
 * The glyphs are drawn here rather than imported so they can move: a rotating
 * arc reads as work in progress at eleven pixels in a way no static icon does.
 */

export type SceneActivity = 'working' | 'reading' | 'searching' | 'talking' | 'writing' | 'waiting' | 'idle'

/**
 * Colour goes on the GLYPH, not the words.
 *
 * The first version tinted the label too, and on a dark canvas a pill full of
 * `text-primary` reads as dim grey — nine different states all looking like the
 * same washed-out smudge. The label is the thing that has to be read, so it
 * gets full contrast; the tone lives in the moving glyph and a hairline ring,
 * which is enough to tell "needs you" from "reading" across a room.
 */
const TONES: Record<NonNullable<SceneCharacter['status']>['tone'], { fg: string; ring: string; glow?: string }> = {
  active: { fg: 'text-success', ring: 'ring-success/45' },
  busy: { fg: 'text-primary', ring: 'ring-primary/40' },
  // The one state that wants somebody to do something, so it is allowed to
  // shout slightly: a warmer surface and a soft halo.
  waiting: { fg: 'text-warning', ring: 'ring-warning/60', glow: 'shadow-[0_0_14px_-2px_var(--color-warning)]' },
  trouble: { fg: 'text-danger', ring: 'ring-danger/60', glow: 'shadow-[0_0_14px_-4px_var(--color-danger)]' },
  idle: { fg: 'text-fg-subtle', ring: 'ring-border/70' },
}

/**
 * The moving part. Each is one 12×12 glyph in `currentColor`, so it inherits
 * the tone and needs no palette of its own.
 */
function ActivityGlyph({ activity, size }: { activity: SceneActivity; size: number }) {
  const box = { width: size, height: size }
  if (activity === 'idle') {
    return <span className="rounded-full bg-current opacity-60" style={{ width: size * 0.42, height: size * 0.42 }} />
  }
  if (activity === 'talking') {
    // An equaliser: three bars breathing out of phase.
    return (
      <span className="flex items-end gap-[1.5px]" style={{ height: size }}>
        {[0, 0.18, 0.36].map((delay, i) => (
          <motion.span
            key={i}
            className="w-[2px] rounded-full bg-current"
            animate={{ height: [size * 0.3, size * 0.85, size * 0.3] }}
            transition={{ duration: 0.9, repeat: Infinity, ease: 'easeInOut', delay }}
          />
        ))}
      </span>
    )
  }
  if (activity === 'writing') {
    // Three dots, the universal "composing".
    return (
      <span className="flex items-center gap-[2px]" style={{ height: size }}>
        {[0, 0.16, 0.32].map((delay, i) => (
          <motion.span
            key={i}
            className="rounded-full bg-current"
            style={{ width: size * 0.22, height: size * 0.22 }}
            animate={{ opacity: [0.25, 1, 0.25], y: [0, -size * 0.16, 0] }}
            transition={{ duration: 1.1, repeat: Infinity, ease: 'easeInOut', delay }}
          />
        ))}
      </span>
    )
  }
  if (activity === 'waiting') {
    // Attention, not activity: a slow ring pushing outward from a solid centre.
    return (
      <span className="relative flex" style={box}>
        <span className="absolute inset-[22%] rounded-full bg-current" />
        <motion.span
          className="absolute inset-0 rounded-full ring-1 ring-current"
          animate={{ opacity: [0.7, 0, 0.7], scale: [0.7, 1.25, 0.7] }}
          transition={{ duration: 1.8, repeat: Infinity, ease: 'easeInOut' }}
        />
      </span>
    )
  }
  if (activity === 'reading') {
    // A page with a line sweeping down it.
    return (
      <span className="relative overflow-hidden rounded-[2px] ring-1 ring-current/50" style={box}>
        <motion.span
          className="absolute left-[18%] right-[18%] h-[1.5px] rounded-full bg-current"
          animate={{ top: ['22%', '70%', '22%'] }}
          transition={{ duration: 1.6, repeat: Infinity, ease: 'easeInOut' }}
        />
      </span>
    )
  }
  if (activity === 'searching') {
    // A magnifier nudging across what it is looking at.
    return (
      <motion.span
        className="relative flex"
        style={box}
        animate={{ x: [-size * 0.12, size * 0.12, -size * 0.12], y: [size * 0.06, -size * 0.06, size * 0.06] }}
        transition={{ duration: 1.9, repeat: Infinity, ease: 'easeInOut' }}
      >
        <span className="absolute inset-y-0 left-0 aspect-square rounded-full ring-[1.5px] ring-current" style={{ width: size * 0.72 }} />
        <span
          className="absolute rounded-full bg-current"
          style={{ width: size * 0.34, height: 1.5, right: 0, bottom: size * 0.16, transform: 'rotate(45deg)' }}
        />
      </motion.span>
    )
  }
  // working — a thin arc going round, the clearest "something is happening".
  return (
    <motion.span
      className="rounded-full border-current"
      style={{ ...box, borderWidth: 1.5, borderTopColor: 'transparent', borderStyle: 'solid' }}
      animate={{ rotate: 360 }}
      transition={{ duration: 1.1, repeat: Infinity, ease: 'linear' }}
    />
  )
}

/**
 * The pill: a moving glyph and one word. Nothing here can overflow, because
 * nothing long is allowed in.
 */
export function CharacterStatus({ status, scale }: { status: NonNullable<SceneCharacter['status']>; scale: number }) {
  const tone = TONES[status.tone] ?? TONES.idle
  const fontSize = Math.max(10, 11 * scale)
  const glyph = Math.round(fontSize * 0.95)
  return (
    <motion.div
      initial={{ opacity: 0, y: 5, scale: 0.9 }}
      animate={{ opacity: 1, y: 0, scale: 1 }}
      exit={{ opacity: 0, y: 5, scale: 0.9 }}
      transition={{ type: 'spring', stiffness: 460, damping: 34 }}
      className={cn(
        'pointer-events-none flex items-center gap-1.5 whitespace-nowrap rounded-full',
        // The same material as the name card it swaps with, so the two read as
        // one family rather than a card and a widget sharing a stage.
        'bg-elevated/95 px-2 py-[3px] shadow-md ring-1 backdrop-blur-md',
        tone.ring,
        tone.glow,
      )}
      style={{ fontSize }}
    >
      <span className={cn('flex shrink-0 items-center justify-center', tone.fg)} style={{ width: glyph, height: glyph }}>
        <ActivityGlyph activity={status.activity ?? 'working'} size={glyph} />
      </span>
      <span className={cn('font-medium', status.tone === 'idle' ? 'text-fg-muted' : 'text-fg')}>{status.label}</span>
    </motion.div>
  )
}

/**
 * The speech bubble: where the specifics go, because up here there is room for
 * them and clamping to three lines looks deliberate rather than clipped.
 */
export function CharacterSpeech({ speech, scale }: { speech: NonNullable<SceneCharacter['speech']>; scale: number }) {
  const fontSize = Math.max(10.5, 12 * scale)
  const thinking = speech.kind === 'think'
  return (
    <motion.div
      initial={{ opacity: 0, y: 10, scale: 0.88 }}
      animate={{ opacity: 1, y: 0, scale: 1 }}
      exit={{ opacity: 0, y: 6, scale: 0.94 }}
      transition={{ type: 'spring', stiffness: 380, damping: 28 }}
      className="pointer-events-none relative flex flex-col items-center"
      style={{ fontSize }}
    >
      <div
        className={cn(
          'max-w-[240px] px-2.5 py-1.5 text-center shadow-lg ring-1 ring-border/60 backdrop-blur-md',
          'bg-elevated/95',
          thinking ? 'rounded-[18px]' : 'rounded-xl',
        )}
      >
        <span className={cn('line-clamp-3 [overflow-wrap:anywhere]', thinking ? 'text-fg-muted italic' : 'text-fg')}>
          {speech.text}
        </span>
      </div>
      {thinking ? (
        <span className="mt-[3px] flex flex-col items-center gap-[2px]">
          <span className="rounded-full bg-elevated/95 ring-1 ring-border/60" style={{ width: 6, height: 6 }} />
          <span className="rounded-full bg-elevated/95 ring-1 ring-border/60" style={{ width: 3.5, height: 3.5 }} />
        </span>
      ) : (
        // A rotated square tucked under the body: two edges continue the ring,
        // the third is hidden behind the bubble.
        <span
          className="-mt-[5px] rotate-45 rounded-[2px] bg-elevated/95 shadow-lg ring-1 ring-border/60"
          style={{ width: 9, height: 9, clipPath: 'polygon(100% 0, 100% 100%, 0 100%)' }}
        />
      )}
    </motion.div>
  )
}

/**
 * Both, placed around the figure. The pill sits exactly where the name card
 * does and fades as that arrives, so hovering swaps one for the other instead
 * of stacking two labels under a walking character.
 */
export function CharacterBadges({
  character,
  scale,
  size,
}: {
  character: SceneCharacter
  scale: number
  /** The figure's rendered box, so the bubble clears the head. */
  size: number
}) {
  return (
    <>
      <div
        className="pointer-events-none absolute left-1/2 flex -translate-x-1/2 justify-center"
        style={{ bottom: size + 8 * scale, zIndex: 1 }}
      >
        <AnimatePresence>
          {character.speech ? <CharacterSpeech key="speech" speech={character.speech} scale={scale} /> : null}
        </AnimatePresence>
      </div>
      <div className="pointer-events-none absolute left-1/2 top-full mt-1 flex -translate-x-1/2 justify-center opacity-100 transition-opacity duration-150 group-hover:opacity-0">
        <AnimatePresence>
          {character.status ? <CharacterStatus key="status" status={character.status} scale={scale} /> : null}
        </AnimatePresence>
      </div>
    </>
  )
}
