'use client'

import { AnimatePresence, motion } from 'framer-motion'
import { cn } from '@appkit/ui'
import type { SceneCharacter } from './config'

/**
 * What a character is doing, and what it is saying.
 *
 * A stage of figures wandering about tells you the office is populated and
 * nothing whatever about whether anyone is working. The name card that appears
 * on hover answers "who is that?"; these answer "what is going on?", which is
 * the question somebody actually opens the scene to ask — and they answer it
 * without being hovered, because you cannot hover eight characters at once.
 *
 * Both are built to be READ AT A GLANCE and to stay out of the way:
 *
 *   - they scale with the character, so someone at the back of the room does
 *     not shout over someone at the front;
 *   - they never take pointer events, so the figure underneath stays clickable;
 *   - text is clamped rather than allowed to grow across the scene. A speech
 *     bubble is a glance, not a transcript.
 */

/** The palette per tone, kept next to the shapes it colours. */
const TONES: Record<
  NonNullable<SceneCharacter['status']>['tone'],
  { dot: string; ring: string; text: string }
> = {
  active: { dot: 'bg-success', ring: 'ring-success/25', text: 'text-fg' },
  busy: { dot: 'bg-primary', ring: 'ring-primary/25', text: 'text-fg' },
  waiting: { dot: 'bg-warning', ring: 'ring-warning/25', text: 'text-fg' },
  trouble: { dot: 'bg-danger', ring: 'ring-danger/25', text: 'text-fg' },
  idle: { dot: 'bg-fg-subtle', ring: 'ring-border', text: 'text-fg-muted' },
}

/**
 * The status pill: a dot, a few words, and optionally what it is working on.
 *
 * Deliberately the same material as the hover name card — elevated surface,
 * soft shadow, a little blur — so the scene reads as one family of labels
 * rather than a card and a separate widget that happen to share a stage.
 */
export function CharacterStatus({
  status,
  scale,
}: {
  status: NonNullable<SceneCharacter['status']>
  /** The character's depth scale, so distant labels stay proportionate. */
  scale: number
}) {
  const tone = TONES[status.tone] ?? TONES.idle
  // Never smaller than legible. Depth should whisper, not hide.
  const fontSize = Math.max(10, 11 * scale)
  return (
    <motion.div
      initial={{ opacity: 0, y: 4, scale: 0.92 }}
      animate={{ opacity: 1, y: 0, scale: 1 }}
      exit={{ opacity: 0, y: 4, scale: 0.92 }}
      transition={{ type: 'spring', stiffness: 420, damping: 32 }}
      className={cn(
        'pointer-events-none flex max-w-[190px] items-center gap-1.5 rounded-full',
        'bg-elevated/90 px-2 py-0.5 shadow-sm ring-1 backdrop-blur-sm',
        tone.ring,
      )}
      style={{ fontSize }}
    >
      <span className="relative flex shrink-0" style={{ width: fontSize * 0.5, height: fontSize * 0.5 }}>
        <span className={cn('absolute inset-0 rounded-full', tone.dot)} />
        {status.tone !== 'idle' ? (
          // A slow pulse is the difference between "working" and "stopped".
          <motion.span
            className={cn('absolute inset-0 rounded-full', tone.dot)}
            animate={{ opacity: [0.55, 0, 0.55], scale: [1, 2.1, 1] }}
            transition={{ duration: 2.2, repeat: Infinity, ease: 'easeInOut' }}
          />
        ) : null}
      </span>
      <span className={cn('truncate font-medium', tone.text)}>{status.label}</span>
      {status.detail ? <span className="truncate text-fg-muted">{status.detail}</span> : null}
    </motion.div>
  )
}

/**
 * The speech bubble, drawn above the character with a tail pointing down at
 * them.
 *
 * `think` gets a softer, rounder treatment and a trail of dots rather than a
 * tail — the ordinary comic grammar, and the quickest way to tell working out
 * loud from talking to somebody.
 */
export function CharacterSpeech({
  speech,
  scale,
}: {
  speech: NonNullable<SceneCharacter['speech']>
  scale: number
}) {
  const fontSize = Math.max(10.5, 12 * scale)
  const thinking = speech.kind === 'think'
  return (
    <motion.div
      initial={{ opacity: 0, y: 8, scale: 0.9 }}
      animate={{ opacity: 1, y: 0, scale: 1 }}
      exit={{ opacity: 0, y: 4, scale: 0.94 }}
      transition={{ type: 'spring', stiffness: 380, damping: 28 }}
      className="pointer-events-none relative flex flex-col items-center"
      style={{ fontSize }}
    >
      <div
        className={cn(
          'max-w-[230px] bg-elevated/95 px-2.5 py-1.5 text-center shadow-md ring-1 ring-border/70 backdrop-blur-sm',
          thinking ? 'rounded-2xl' : 'rounded-xl',
        )}
      >
        {/* Three lines, then an ellipsis. The rest is on the run record. */}
        <span className="line-clamp-3 text-fg [overflow-wrap:anywhere]">{speech.text}</span>
      </div>
      {thinking ? (
        <span className="mt-0.5 flex flex-col items-center gap-0.5">
          <span className="rounded-full bg-elevated/95 ring-1 ring-border/70" style={{ width: 6, height: 6 }} />
          <span className="rounded-full bg-elevated/95 ring-1 ring-border/70" style={{ width: 4, height: 4 }} />
        </span>
      ) : (
        // The tail: a rotated square tucked under the bubble so its two visible
        // edges continue the ring, with the top edge hidden behind the body.
        <span
          className="-mt-[5px] rotate-45 rounded-[2px] bg-elevated/95 shadow-md ring-1 ring-border/70"
          style={{ width: 9, height: 9, clipPath: 'polygon(100% 0, 100% 100%, 0 100%)' }}
        />
      )}
    </motion.div>
  )
}

/**
 * Both, stacked above and below the figure, mounted and unmounted with
 * animation so a status appearing or a line being said is something you notice
 * out of the corner of your eye.
 */
export function CharacterBadges({
  character,
  scale,
  size,
}: {
  character: SceneCharacter
  scale: number
  /** The figure's rendered box, so the bubble sits just above the head. */
  size: number
}) {
  return (
    <>
      <div
        className="pointer-events-none absolute left-1/2 flex -translate-x-1/2 justify-center"
        style={{ bottom: size + 6 * scale, zIndex: 1 }}
      >
        <AnimatePresence>
          {character.speech ? <CharacterSpeech key="speech" speech={character.speech} scale={scale} /> : null}
        </AnimatePresence>
      </div>
      <div className="pointer-events-none absolute left-1/2 top-full mt-1 flex -translate-x-1/2 justify-center">
        <AnimatePresence>
          {character.status ? <CharacterStatus key="status" status={character.status} scale={scale} /> : null}
        </AnimatePresence>
      </div>
    </>
  )
}
