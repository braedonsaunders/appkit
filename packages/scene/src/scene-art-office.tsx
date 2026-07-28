'use client'

/**
 * Office stages — five drawn work environments in the same visual language as
 * the OpenStudio stages: open-plan office, executive corner office, warehouse,
 * server room, and break room. Everything is inline SVG and CSS gradients with
 * a day and a night take, themed by `isDark` alone.
 *
 * These are the stages an application about work reaches for; the leisure
 * stages stay available beside them. Registered in `scene-art.tsx`.
 */

import { useMemo, memo } from 'react'
import { motion } from 'framer-motion'
import { seededRandom, type SceneProps } from './scene-art'

// ---------------------------------------------------------------------------
// Shared props
// ---------------------------------------------------------------------------

/** A potted office plant — monstera-ish leaves over a simple pot. */
const OfficePlant = memo(function OfficePlant({
  x,
  y,
  scale = 1,
  isDark,
}: {
  x: number
  y: number
  scale?: number
  isDark: boolean
}) {
  const leaf = isDark ? '#166534' : '#16a34a'
  const leafDark = isDark ? '#14532d' : '#15803d'
  return (
    <div
      className="absolute"
      style={{ left: `${x}%`, top: `${y}%`, transform: `translate(-50%, -100%) scale(${scale})` }}
    >
      <svg width="70" height="90" viewBox="0 0 70 90" className="overflow-visible">
        <motion.g
          style={{ transformOrigin: '35px 60px' }}
          animate={{ rotate: [0, 1.5, 0, -1.5, 0] }}
          transition={{ duration: 6, repeat: Infinity, ease: 'easeInOut' }}
        >
          <path d="M35 60 C20 45 8 40 6 22 C22 26 30 38 35 52 Z" fill={leafDark} />
          <path d="M35 60 C50 42 62 38 64 20 C48 24 40 38 35 52 Z" fill={leaf} />
          <path d="M35 58 C33 38 28 24 35 8 C44 22 40 40 36 56 Z" fill={leaf} />
          <path d="M35 60 C26 52 14 52 8 44 C18 42 30 48 35 56 Z" fill={leaf} />
          <path d="M35 60 C44 50 56 50 62 42 C52 40 40 48 35 56 Z" fill={leafDark} />
        </motion.g>
        <path d="M24 60 L46 60 L42 88 L28 88 Z" fill={isDark ? '#7c2d12' : '#c2410c'} />
        <rect x="22" y="58" width="26" height="6" rx="2" fill={isDark ? '#9a3412' : '#ea580c'} />
      </svg>
    </div>
  )
})

/** A hanging pendant lamp with a warm cone of light after dark. */
const PendantLamp = memo(function PendantLamp({
  x,
  drop,
  isDark,
  color = '#fbbf24',
}: {
  x: number
  /** Cable length as a percent of scene height. */
  drop: number
  isDark: boolean
  color?: string
}) {
  return (
    <div className="absolute pointer-events-none" style={{ left: `${x}%`, top: 0 }}>
      <div
        className="absolute"
        style={{
          left: -1,
          width: 2,
          height: `${drop}vh`,
          maxHeight: 120,
          background: isDark ? '#3f3f46' : '#a1a1aa',
        }}
      />
      <div className="absolute" style={{ top: `min(${drop}vh, 120px)`, left: 0 }}>
        <svg width="44" height="60" viewBox="0 0 44 60" className="-translate-x-1/2 overflow-visible">
          <path d="M8 22 L36 22 L30 6 L14 6 Z" fill={isDark ? '#27272a' : '#52525b'} />
          <motion.circle
            cx="22"
            cy="26"
            r="6"
            fill={color}
            animate={isDark ? { opacity: [0.9, 1, 0.85, 1] } : { opacity: 0.35 }}
            transition={{ duration: 3, repeat: Infinity }}
          />
          {isDark ? (
            <motion.path
              d="M8 24 L36 24 L58 60 L-14 60 Z"
              fill={color}
              animate={{ opacity: [0.1, 0.16, 0.1] }}
              transition={{ duration: 4, repeat: Infinity }}
            />
          ) : null}
        </svg>
      </div>
    </div>
  )
})

// ---------------------------------------------------------------------------
// OPEN-PLAN OFFICE — window wall, skyline, desk rows, monitor glow
// ---------------------------------------------------------------------------

function OfficeScene({ isDark }: SceneProps) {
  const rnd = seededRandom(701_001)
  // The skyline seen through the glass: parallax-free, drawn once.
  const towers = useMemo(
    () =>
      Array.from({ length: 9 }, (_, i) => ({
        x: i * 11 + rnd() * 4,
        w: 6 + rnd() * 5,
        h: 30 + rnd() * 52,
        lit: rnd() > 0.35,
      })),
    [],
  )
  const desks = [18, 41, 63, 85]

  return (
    <div className="absolute inset-0 pointer-events-none overflow-hidden">
      {/* The window wall: sky, skyline, then mullions over the glass. */}
      <div className="absolute inset-x-0 top-0" style={{ height: '30%' }}>
        <div
          className="absolute inset-0"
          style={{
            background: isDark
              ? 'linear-gradient(to bottom, #020617 0%, #0f172a 70%, #1e293b 100%)'
              : 'linear-gradient(to bottom, #7dd3fc 0%, #bae6fd 60%, #e0f2fe 100%)',
          }}
        />
        {!isDark ? (
          <motion.div
            className="absolute rounded-full"
            style={{
              left: '74%',
              top: '12%',
              width: 34,
              height: 34,
              background: 'radial-gradient(circle, #fef08a 0%, #fde047 55%, transparent 75%)',
            }}
            animate={{ opacity: [0.85, 1, 0.85] }}
            transition={{ duration: 5, repeat: Infinity }}
          />
        ) : null}
        <svg className="absolute inset-x-0 bottom-0 w-full" height="70%" viewBox="0 0 100 60" preserveAspectRatio="none">
          {towers.map((t, i) => (
            <g key={i}>
              <rect x={t.x} y={60 - t.h * 0.6} width={t.w} height={t.h * 0.6} fill={isDark ? '#1e293b' : '#94a3b8'} />
              {isDark && t.lit
                ? Array.from({ length: 8 }, (_, w) => (
                    <rect
                      key={w}
                      x={t.x + 0.8 + (w % 2) * (t.w / 2)}
                      y={60 - t.h * 0.6 + 3 + Math.floor(w / 2) * 6}
                      width={0.9}
                      height={2.2}
                      fill="#fef08a"
                      opacity={0.75}
                    />
                  ))
                : null}
            </g>
          ))}
        </svg>
        {/* Mullions — the glass grid in front of the view. */}
        {[14, 28, 42, 56, 70, 84].map((x) => (
          <div
            key={x}
            className="absolute top-0 bottom-0"
            style={{ left: `${x}%`, width: 3, background: isDark ? '#1c1917' : '#e7e5e4' }}
          />
        ))}
        <div className="absolute inset-x-0 bottom-0" style={{ height: 4, background: isDark ? '#1c1917' : '#d6d3d1' }} />
        {/* Sun through the glass, laid over the floor edge by the parent. */}
      </div>

      {/* Linear ceiling lights. */}
      {[22, 50, 78].map((x, i) => (
        <div key={i} className="absolute" style={{ left: `${x}%`, top: 0, transform: 'translateX(-50%)' }}>
          <div style={{ width: 2, height: 22, background: isDark ? '#3f3f46' : '#a1a1aa', margin: '0 auto' }} />
          <motion.div
            style={{
              width: 150,
              height: 6,
              borderRadius: 3,
              background: isDark ? '#fef9c3' : '#f4f4f5',
              boxShadow: isDark ? '0 6px 24px 6px rgba(254,249,195,0.25)' : 'none',
            }}
            animate={isDark ? { opacity: [0.9, 1, 0.9] } : {}}
            transition={{ duration: 4, repeat: Infinity, delay: i * 0.8 }}
          />
        </div>
      ))}

      {/* The back row of desks, sitting right on the horizon. */}
      {desks.map((x, i) => (
        <div key={i} className="absolute" style={{ left: `${x}%`, top: '30.5%', transform: 'translate(-50%, -100%)' }}>
          <svg width="150" height="95" viewBox="0 0 92 58" className="overflow-visible">
            {/* Monitor */}
            <rect x="28" y="6" width="36" height="24" rx="2" fill={isDark ? '#111827' : '#1f2937'} />
            <motion.rect
              x="30"
              y="8"
              width="32"
              height="20"
              rx="1"
              fill={isDark ? '#38bdf8' : '#bae6fd'}
              animate={isDark ? { opacity: [0.85, 1, 0.7, 0.95] } : { opacity: 0.9 }}
              transition={{ duration: 2.4 + i * 0.6, repeat: Infinity }}
            />
            <rect x="43" y="30" width="6" height="6" fill={isDark ? '#111827' : '#374151'} />
            {/* Desk top + legs */}
            <rect x="4" y="36" width="84" height="6" rx="2" fill={isDark ? '#57534e' : '#a8a29e'} />
            <rect x="10" y="42" width="5" height="16" fill={isDark ? '#44403c' : '#78716c'} />
            <rect x="77" y="42" width="5" height="16" fill={isDark ? '#44403c' : '#78716c'} />
            {/* Chair tucked in */}
            <rect x="36" y="40" width="20" height="5" rx="2.5" fill={isDark ? '#1c1917' : '#57534e'} />
            {isDark ? (
              <motion.ellipse
                cx="46"
                cy="38"
                rx="30"
                ry="8"
                fill="#38bdf8"
                animate={{ opacity: [0.08, 0.14, 0.08] }}
                transition={{ duration: 3, repeat: Infinity, delay: i * 0.5 }}
              />
            ) : null}
          </svg>
        </div>
      ))}

      {/* Whiteboard on the left wall edge. */}
      <div className="absolute" style={{ left: '2%', top: '9%' }}>
        <svg width="104" height="75" viewBox="0 0 72 52">
          <rect x="0" y="0" width="72" height="48" rx="3" fill={isDark ? '#d6d3d1' : '#fafaf9'} stroke={isDark ? '#57534e' : '#a8a29e'} strokeWidth="3" />
          <path d="M8 12 H40 M8 20 H52 M8 28 H30" stroke="#0ea5e9" strokeWidth="2.5" strokeLinecap="round" />
          <path d="M46 26 L62 12 M46 12 L62 26" stroke="#f43f5e" strokeWidth="2.5" strokeLinecap="round" />
          <path d="M8 38 H56" stroke={isDark ? '#78716c' : '#a8a29e'} strokeWidth="2" strokeLinecap="round" />
        </svg>
      </div>

      <OfficePlant x={5} y={86} scale={2} isDark={isDark} />
      <OfficePlant x={95} y={78} scale={1.6} isDark={isDark} />

      {/* Plank seams so the floor reads as a floor, not a void. */}
      <svg className="absolute inset-x-0 bottom-0 w-full" style={{ top: '30%' }} viewBox="0 0 100 70" preserveAspectRatio="none">
        {[12, 26, 41, 57, 74, 90].map((x) => (
          <line key={x} x1={x} y1="0" x2={(x - 50) * 1.7 + 50} y2="70" stroke={isDark ? 'rgba(0,0,0,0.35)' : 'rgba(0,0,0,0.14)'} strokeWidth="0.35" />
        ))}
        {[14, 32, 54].map((y) => (
          <line key={y} x1="0" y1={y} x2="100" y2={y} stroke={isDark ? 'rgba(0,0,0,0.3)' : 'rgba(0,0,0,0.12)'} strokeWidth="0.3" />
        ))}
      </svg>
    </div>
  )
}

// ---------------------------------------------------------------------------
// EXECUTIVE — corner office, floor-to-ceiling glass, one good desk
// ---------------------------------------------------------------------------

function ExecutiveScene({ isDark }: SceneProps) {
  const rnd = seededRandom(701_002)
  const towers = useMemo(
    () =>
      Array.from({ length: 11 }, (_, i) => ({
        x: i * 9 + rnd() * 3,
        w: 5 + rnd() * 5,
        h: 26 + rnd() * 60,
        lit: rnd() > 0.25,
      })),
    [],
  )

  return (
    <div className="absolute inset-0 pointer-events-none overflow-hidden">
      {/* Glass from ceiling to floor line: the whole backdrop is the view. */}
      <div className="absolute inset-x-0 top-0" style={{ height: '28%' }}>
        <svg className="absolute inset-x-0 bottom-0 w-full" height="86%" viewBox="0 0 100 60" preserveAspectRatio="none">
          {towers.map((t, i) => (
            <g key={i}>
              <rect
                x={t.x}
                y={60 - t.h * 0.6}
                width={t.w}
                height={t.h * 0.6}
                fill={isDark ? '#111c31' : '#7c8ba1'}
                opacity={0.9}
              />
              {isDark && t.lit
                ? Array.from({ length: 10 }, (_, w) => (
                    <motion.rect
                      key={w}
                      x={t.x + 0.6 + (w % 2) * (t.w / 2)}
                      y={60 - t.h * 0.6 + 2 + Math.floor(w / 2) * 5}
                      width={0.8}
                      height={2}
                      fill="#fde68a"
                      animate={w === 4 ? { opacity: [0.8, 0.3, 0.8] } : { opacity: 0.75 }}
                      transition={{ duration: 4, repeat: Infinity, delay: i * 0.4 }}
                    />
                  ))
                : null}
            </g>
          ))}
        </svg>
        {/* Slim mullions — this office paid for the view. */}
        {[25, 50, 75].map((x) => (
          <div
            key={x}
            className="absolute top-0 bottom-0"
            style={{ left: `${x}%`, width: 2, background: isDark ? '#0b0f19' : '#cbd5e1', opacity: 0.8 }}
          />
        ))}
        <div className="absolute inset-x-0 bottom-0" style={{ height: 3, background: isDark ? '#101623' : '#cbd5e1' }} />
      </div>

      <PendantLamp x={50} drop={7} isDark={isDark} color="#fcd34d" />

      {/* The desk — walnut slab, warm lamp, closed laptop. */}
      <div className="absolute" style={{ left: '30%', top: '52%', transform: 'translate(-50%, -100%)' }}>
        <svg width="240" height="138" viewBox="0 0 150 86" className="overflow-visible">
          {isDark ? (
            <motion.ellipse
              cx="112"
              cy="34"
              rx="34"
              ry="18"
              fill="#fbbf24"
              animate={{ opacity: [0.16, 0.24, 0.16] }}
              transition={{ duration: 4, repeat: Infinity }}
            />
          ) : null}
          {/* Lamp */}
          <path d="M104 18 L124 18 L118 8 L110 8 Z" fill={isDark ? '#166534' : '#15803d'} />
          <rect x="112.5" y="18" width="3" height="16" fill={isDark ? '#a16207' : '#854d0e'} />
          <motion.circle cx="114" cy="20" r="4" fill="#fde68a" animate={isDark ? { opacity: [0.9, 1, 0.9] } : { opacity: 0.3 }} transition={{ duration: 3, repeat: Infinity }} />
          {/* Laptop */}
          <path d="M34 30 L66 30 L70 36 L30 36 Z" fill={isDark ? '#334155' : '#64748b'} />
          <rect x="36" y="18" width="28" height="13" rx="1.5" fill={isDark ? '#1e293b' : '#475569'} />
          {/* Slab + legs */}
          <rect x="8" y="36" width="134" height="9" rx="3" fill={isDark ? '#5d4037' : '#8d6e63'} />
          <rect x="16" y="45" width="8" height="38" fill={isDark ? '#3e2c23' : '#6d4c41'} />
          <rect x="126" y="45" width="8" height="38" fill={isDark ? '#3e2c23' : '#6d4c41'} />
          {/* Chair behind */}
          <rect x="60" y="12" width="30" height="26" rx="6" fill={isDark ? '#111827' : '#1f2937'} />
          <rect x="66" y="45" width="18" height="6" rx="3" fill={isDark ? '#111827' : '#1f2937'} />
        </svg>
      </div>

      {/* Bookshelf, right wall. */}
      <div className="absolute" style={{ right: '1%', top: '46%', transform: 'translateY(-100%)' }}>
        <svg width="130" height="182" viewBox="0 0 86 120">
          <rect x="0" y="0" width="86" height="120" rx="3" fill={isDark ? '#3e2c23' : '#6d4c41'} />
          {[14, 44, 74, 100].map((y, row) => (
            <g key={row}>
              <rect x="6" y={y + 12} width="74" height="4" fill={isDark ? '#2b1f18' : '#5d4037'} />
              {Array.from({ length: 7 }, (_, b) => {
                const h = 8 + ((b * 37 + row * 13) % 8)
                const palette = isDark
                  ? ['#7f1d1d', '#14532d', '#1e3a8a', '#713f12', '#4c1d95']
                  : ['#dc2626', '#16a34a', '#2563eb', '#d97706', '#7c3aed']
                return (
                  <rect
                    key={b}
                    x={9 + b * 10}
                    y={y + 12 - h}
                    width={7}
                    height={h}
                    rx="1"
                    fill={palette[(b + row) % palette.length]}
                  />
                )
              })}
            </g>
          ))}
        </svg>
      </div>

      {/* Rug where visitors stand. */}
      <div
        className="absolute"
        style={{
          left: '55%',
          top: '72%',
          width: '34%',
          height: '14%',
          transform: 'translateX(-50%)',
          borderRadius: '50%',
          background: isDark
            ? 'radial-gradient(ellipse, rgba(120,53,15,0.5) 0%, rgba(120,53,15,0.2) 60%, transparent 75%)'
            : 'radial-gradient(ellipse, rgba(180,83,9,0.45) 0%, rgba(180,83,9,0.18) 60%, transparent 75%)',
        }}
      />

      <OfficePlant x={4} y={80} scale={2.1} isDark={isDark} />
    </div>
  )
}

// ---------------------------------------------------------------------------
// WAREHOUSE — racking, boxes, roller door, hanging lamps
// ---------------------------------------------------------------------------

const PalletRack = memo(function PalletRack({
  x,
  flip = false,
  isDark,
}: {
  x: number
  flip?: boolean
  isDark: boolean
}) {
  const rnd = seededRandom(701_003 + Math.round(x * 31))
  const boxes = useMemo(
    () =>
      Array.from({ length: 3 }, (_, shelf) =>
        Array.from({ length: 3 }, (_, slot) => ({
          present: rnd() > 0.25,
          w: 16 + rnd() * 8,
          h: 10 + rnd() * 6,
          tone: rnd(),
          shelf,
          slot,
        })),
      ).flat(),
    [],
  )
  const cardboard = (t: number) =>
    isDark ? (t > 0.5 ? '#7c5a3a' : '#6b4c30') : t > 0.5 ? '#d4a373' : '#c08552'
  return (
    <div
      className="absolute"
      style={{ left: `${x}%`, top: '46%', transform: `translate(-50%, -100%) ${flip ? 'scaleX(-1)' : ''}` }}
    >
      <svg width="190" height="238" viewBox="0 0 120 150" className="overflow-visible">
        {/* Uprights + beams */}
        {[0, 112].map((ux) => (
          <rect key={ux} x={ux} y="0" width="8" height="150" fill={isDark ? '#7f1d1d' : '#b91c1c'} />
        ))}
        {[36, 84, 132].map((y) => (
          <rect key={y} x="0" y={y} width="120" height="6" fill={isDark ? '#9a3412' : '#ea580c'} />
        ))}
        {/* Boxes per shelf */}
        {boxes.map((b, i) =>
          b.present ? (
            <g key={i}>
              <rect
                x={10 + b.slot * 34}
                y={36 + b.shelf * 48 - b.h}
                width={b.w}
                height={b.h}
                fill={cardboard(b.tone)}
                stroke={isDark ? '#4a3421' : '#a97142'}
                strokeWidth="1"
              />
              <line
                x1={10 + b.slot * 34 + b.w / 2}
                y1={36 + b.shelf * 48 - b.h}
                x2={10 + b.slot * 34 + b.w / 2}
                y2={36 + b.shelf * 48}
                stroke={isDark ? '#4a3421' : '#a97142'}
                strokeWidth="1.5"
              />
            </g>
          ) : null,
        )}
      </svg>
    </div>
  )
})

function WarehouseScene({ isDark }: SceneProps) {
  return (
    <div className="absolute inset-0 pointer-events-none overflow-hidden">
      {/* Clerestory windows high on the wall; daylight shafts through them. */}
      <div className="absolute inset-x-0" style={{ top: '2%', height: '7%' }}>
        {[8, 26, 44, 62, 80].map((x) => (
          <div
            key={x}
            className="absolute h-full"
            style={{
              left: `${x}%`,
              width: '12%',
              background: isDark ? '#1e293b' : '#e0f2fe',
              border: `2px solid ${isDark ? '#0f172a' : '#94a3b8'}`,
              borderRadius: 2,
            }}
          />
        ))}
      </div>
      {!isDark
        ? [14, 50, 86].map((x, i) => (
            <motion.div
              key={i}
              className="absolute"
              style={{
                left: `${x}%`,
                top: '8%',
                width: '9%',
                height: '55%',
                transform: 'skewX(-14deg)',
                background: 'linear-gradient(to bottom, rgba(254,249,195,0.35), transparent)',
              }}
              animate={{ opacity: [0.5, 0.8, 0.5] }}
              transition={{ duration: 7, repeat: Infinity, delay: i * 1.4 }}
            />
          ))
        : null}

      {/* Roller door, centre back. */}
      <div className="absolute" style={{ left: '50%', top: '26.5%', transform: 'translate(-50%, -100%)' }}>
        <svg width="240" height="168" viewBox="0 0 150 105">
          <rect x="0" y="0" width="150" height="105" fill={isDark ? '#334155' : '#94a3b8'} rx="3" />
          {Array.from({ length: 8 }, (_, i) => (
            <rect key={i} x="6" y={6 + i * 12} width="138" height="8" rx="2" fill={isDark ? '#475569' : '#cbd5e1'} />
          ))}
          <rect x="60" y="94" width="30" height="6" rx="2" fill={isDark ? '#1e293b' : '#64748b'} />
        </svg>
      </div>

      {/* Hanging industrial lamps. */}
      {[22, 50, 78].map((x, i) => (
        <div key={i} className="absolute" style={{ left: `${x}%`, top: 0 }}>
          <div style={{ width: 2, height: 34, background: isDark ? '#3f3f46' : '#71717a', margin: '0 auto' }} />
          <svg width="84" height="135" viewBox="0 0 56 90" className="-translate-x-1/2 overflow-visible">
            <path d="M12 18 L44 18 L36 6 L20 6 Z" fill={isDark ? '#27272a' : '#3f3f46'} />
            <motion.circle
              cx="28"
              cy="21"
              r="5"
              fill="#fde68a"
              animate={isDark ? { opacity: [0.85, 1, 0.85] } : { opacity: 0.3 }}
              transition={{ duration: 2.6, repeat: Infinity, delay: i * 0.7 }}
            />
            {isDark ? (
              <motion.path
                d="M12 20 L44 20 L66 90 L-10 90 Z"
                fill="#fde68a"
                animate={{ opacity: [0.08, 0.14, 0.08] }}
                transition={{ duration: 5, repeat: Infinity, delay: i }}
              />
            ) : null}
          </svg>
        </div>
      ))}

      <PalletRack x={11} isDark={isDark} />
      <PalletRack x={89} flip isDark={isDark} />

      {/* Floor markings: the walk lane. */}
      <div
        className="absolute inset-x-0"
        style={{
          top: '27.5%',
          height: 5,
          background: `repeating-linear-gradient(90deg, ${isDark ? '#b45309' : '#f59e0b'} 0 24px, ${isDark ? '#1f2937' : '#374151'} 24px 48px)`,
          opacity: 0.75,
        }}
      />

      {/* A stray pallet with boxes, downstage. */}
      <div className="absolute" style={{ left: '68%', top: '84%', transform: 'translate(-50%, -100%)' }}>
        <svg width="150" height="111" viewBox="0 0 100 74">
          <rect x="18" y="18" width="34" height="26" fill={isDark ? '#7c5a3a' : '#d4a373'} stroke={isDark ? '#4a3421' : '#a97142'} />
          <rect x="46" y="8" width="28" height="36" fill={isDark ? '#6b4c30' : '#c08552'} stroke={isDark ? '#4a3421' : '#a97142'} />
          <rect x="8" y="44" width="84" height="8" fill={isDark ? '#57534e' : '#a8a29e'} />
          {[12, 46, 80].map((x) => (
            <rect key={x} x={x} y="52" width="10" height="10" fill={isDark ? '#44403c' : '#78716c'} />
          ))}
        </svg>
      </div>

      {/* Hand truck resting on the rack. */}
      <div className="absolute" style={{ left: '20%', top: '82%', transform: 'translate(-50%, -100%) rotate(-8deg)' }}>
        <svg width="50" height="88" viewBox="0 0 34 60">
          <rect x="14" y="0" width="4" height="46" rx="2" fill={isDark ? '#525252' : '#737373'} />
          <rect x="22" y="0" width="4" height="46" rx="2" fill={isDark ? '#525252' : '#737373'} />
          <rect x="6" y="44" width="24" height="5" rx="2" fill={isDark ? '#404040' : '#525252'} />
          <circle cx="12" cy="54" r="6" fill={isDark ? '#171717' : '#262626'} />
        </svg>
      </div>
    </div>
  )
}

// ---------------------------------------------------------------------------
// SERVER ROOM — racks, blinking LEDs, cold-aisle glow
// ---------------------------------------------------------------------------

const ServerRack = memo(function ServerRack({
  x,
  isDark,
}: {
  x: number
  isDark: boolean
}) {
  const rnd = seededRandom(701_004 + Math.round(x * 53))
  const leds = useMemo(
    () =>
      Array.from({ length: 5 }, (_, unit) =>
        Array.from({ length: 6 }, (_, c) => ({
          unit,
          c,
          color: rnd() > 0.75 ? '#f87171' : rnd() > 0.4 ? '#4ade80' : '#38bdf8',
          blink: rnd() > 0.45,
          delay: rnd() * 3,
        })),
      ).flat(),
    [],
  )
  return (
    <div className="absolute" style={{ left: `${x}%`, top: '31%', transform: 'translate(-50%, -100%)' }}>
      <svg width="104" height="186" viewBox="0 0 66 118" className="overflow-visible">
        <rect x="0" y="0" width="66" height="118" rx="3" fill={isDark ? '#0b1220' : '#1e293b'} stroke={isDark ? '#1e293b' : '#334155'} strokeWidth="2" />
        {Array.from({ length: 5 }, (_, unit) => (
          <g key={unit}>
            <rect x="5" y={7 + unit * 22} width="56" height="17" rx="2" fill={isDark ? '#101a2e' : '#273549'} />
            <rect x="8" y={19 + unit * 22} width="30" height="2.5" rx="1" fill={isDark ? '#1e293b' : '#3b4a61'} />
          </g>
        ))}
        {leds.map((led, i) => (
          <motion.circle
            key={i}
            cx={10 + led.c * 5}
            cy={12 + led.unit * 22}
            r="1.6"
            fill={led.color}
            animate={led.blink ? { opacity: [1, 0.15, 1] } : { opacity: 0.9 }}
            transition={{ duration: 1.2 + led.delay, repeat: Infinity, delay: led.delay }}
          />
        ))}
        {/* Vent slots */}
        {Array.from({ length: 5 }, (_, unit) => (
          <g key={unit}>
            {[44, 50, 56].map((vx) => (
              <rect key={vx} x={vx} y={9 + unit * 22} width="2.5" height="13" rx="1" fill={isDark ? '#050b16' : '#16202f'} />
            ))}
          </g>
        ))}
      </svg>
    </div>
  )
})

function ServerRoomScene({ isDark }: SceneProps) {
  return (
    <div className="absolute inset-0 pointer-events-none overflow-hidden">
      {/* Overhead cable tray. */}
      <div className="absolute inset-x-0" style={{ top: '4%' }}>
        <div style={{ height: 6, background: isDark ? '#1e293b' : '#334155' }} />
        <svg className="w-full" height="26" viewBox="0 0 100 26" preserveAspectRatio="none">
          <path d="M0 2 C 20 16, 34 4, 50 12 C 66 20, 80 6, 100 10" stroke={isDark ? '#1d4ed8' : '#3b82f6'} strokeWidth="1.6" fill="none" opacity="0.8" />
          <path d="M0 8 C 18 20, 40 10, 58 16 C 74 22, 86 12, 100 16" stroke={isDark ? '#b45309' : '#f59e0b'} strokeWidth="1.4" fill="none" opacity="0.8" />
          <path d="M0 5 C 24 12, 44 20, 64 8 C 80 0, 90 14, 100 6" stroke={isDark ? '#15803d' : '#22c55e'} strokeWidth="1.2" fill="none" opacity="0.7" />
        </svg>
      </div>

      {/* Cold-aisle strip lights. */}
      {[18, 50, 82].map((x, i) => (
        <motion.div
          key={i}
          className="absolute"
          style={{
            left: `${x}%`,
            top: '9%',
            width: '22%',
            height: 4,
            transform: 'translateX(-50%)',
            borderRadius: 2,
            background: isDark ? '#22d3ee' : '#e2e8f0',
            boxShadow: isDark ? '0 4px 26px 5px rgba(34,211,238,0.3)' : 'none',
          }}
          animate={isDark ? { opacity: [0.8, 1, 0.8] } : {}}
          transition={{ duration: 5, repeat: Infinity, delay: i * 1.2 }}
        />
      ))}

      {/* The rack row on the back wall. */}
      {[10, 25, 40, 60, 75, 90].map((x) => (
        <ServerRack key={x} x={x} isDark={isDark} />
      ))}

      {/* A status console mid-floor. */}
      <div className="absolute" style={{ left: '50%', top: '58%', transform: 'translate(-50%, -100%)' }}>
        <svg width="92" height="98" viewBox="0 0 60 64" className="overflow-visible">
          <rect x="10" y="30" width="40" height="30" rx="3" fill={isDark ? '#0b1220' : '#1e293b'} />
          <rect x="6" y="2" width="48" height="30" rx="3" fill={isDark ? '#111c30' : '#273549'} />
          <motion.rect
            x="10"
            y="6"
            width="40"
            height="22"
            rx="2"
            fill={isDark ? '#38bdf8' : '#7dd3fc'}
            animate={{ opacity: [0.85, 1, 0.75, 0.95] }}
            transition={{ duration: 3, repeat: Infinity }}
          />
          <path d="M14 22 L20 16 L26 20 L34 10 L46 18" stroke={isDark ? '#0b1220' : '#0c4a6e'} strokeWidth="2" fill="none" />
        </svg>
      </div>

      {/* Perspective floor seams. */}
      <svg className="absolute inset-x-0 bottom-0 w-full" style={{ top: '31%' }} viewBox="0 0 100 70" preserveAspectRatio="none">
        {[10, 30, 50, 70, 90].map((x) => (
          <line key={x} x1={x} y1="0" x2={(x - 50) * 1.9 + 50} y2="70" stroke={isDark ? '#0f2036' : '#2c3e54'} strokeWidth="0.4" />
        ))}
        {[16, 36, 58].map((y) => (
          <line key={y} x1="0" y1={y} x2="100" y2={y} stroke={isDark ? '#0f2036' : '#2c3e54'} strokeWidth="0.35" />
        ))}
      </svg>
    </div>
  )
}

// ---------------------------------------------------------------------------
// BREAK ROOM — coffee bar, steam, stools, the good corner of the office
// ---------------------------------------------------------------------------

const SteamWisp = memo(function SteamWisp({ x, y, delay }: { x: number; y: number; delay: number }) {
  return (
    <motion.path
      d={`M${x} ${y} q 3 -6 0 -12 q -3 -6 0 -12`}
      stroke="rgba(255,255,255,0.55)"
      strokeWidth="2"
      strokeLinecap="round"
      fill="none"
      animate={{ opacity: [0, 0.7, 0], y: [-2, -10] }}
      transition={{ duration: 3, repeat: Infinity, delay, ease: 'easeOut' }}
    />
  )
})

function BreakRoomScene({ isDark }: SceneProps) {
  return (
    <div className="absolute inset-0 pointer-events-none overflow-hidden">
      {/* Menu board. */}
      <div className="absolute" style={{ left: '6%', top: '5%' }}>
        <svg width="126" height="93" viewBox="0 0 84 62">
          <rect x="0" y="0" width="84" height="62" rx="3" fill={isDark ? '#1c1917' : '#292524'} stroke={isDark ? '#57534e' : '#78716c'} strokeWidth="3" />
          <text x="42" y="16" textAnchor="middle" fontSize="10" fontFamily="cursive" fill="#fde68a">
            COFFEE
          </text>
          <path d="M10 26 H56 M10 34 H64 M10 42 H48 M10 50 H58" stroke="#e7e5e4" strokeWidth="2" strokeLinecap="round" opacity="0.7" />
          <path d="M64 44 q 4 -8 0 -14" stroke="#fde68a" strokeWidth="2" fill="none" strokeLinecap="round" />
        </svg>
      </div>

      {/* Mug shelf. */}
      <div className="absolute" style={{ right: '8%', top: '8%' }}>
        <svg width="140" height="58" viewBox="0 0 96 40">
          <rect x="0" y="30" width="96" height="5" rx="2" fill={isDark ? '#5d4037' : '#8d6e63'} />
          {['#f43f5e', '#38bdf8', '#fbbf24', '#4ade80', '#c084fc'].map((c, i) => (
            <g key={i} transform={`translate(${6 + i * 18}, 12)`}>
              <rect x="0" y="0" width="12" height="16" rx="2" fill={c} />
              <path d="M12 4 q 6 4 0 9" stroke={c} strokeWidth="2.5" fill="none" />
            </g>
          ))}
        </svg>
      </div>

      <PendantLamp x={34} drop={6} isDark={isDark} />
      <PendantLamp x={66} drop={8} isDark={isDark} />

      {/* The counter with the espresso machine and its steam. */}
      <div className="absolute" style={{ left: '50%', top: '31%', transform: 'translate(-50%, -100%)' }}>
        <svg width="380" height="152" viewBox="0 0 240 96" className="overflow-visible">
          {/* Espresso machine */}
          <rect x="96" y="18" width="52" height="30" rx="4" fill={isDark ? '#3f3f46' : '#52525b'} />
          <rect x="100" y="10" width="44" height="10" rx="3" fill={isDark ? '#27272a' : '#3f3f46'} />
          <rect x="108" y="48" width="6" height="8" fill={isDark ? '#18181b' : '#27272a'} />
          <rect x="130" y="48" width="6" height="8" fill={isDark ? '#18181b' : '#27272a'} />
          <motion.circle cx="140" cy="26" r="3" fill="#4ade80" animate={{ opacity: [1, 0.3, 1] }} transition={{ duration: 2, repeat: Infinity }} />
          {/* Cups under the spouts */}
          <rect x="104" y="56" width="13" height="9" rx="2" fill={isDark ? '#e7e5e4' : '#fafaf9'} />
          <rect x="126" y="56" width="13" height="9" rx="2" fill={isDark ? '#e7e5e4' : '#fafaf9'} />
          <SteamWisp x={111} y={54} delay={0} />
          <SteamWisp x={133} y={54} delay={1.4} />
          {/* Jars on the counter */}
          <rect x="170" y="40" width="16" height="24" rx="3" fill={isDark ? 'rgba(148,163,184,0.35)' : 'rgba(148,163,184,0.45)'} />
          <rect x="172" y="46" width="12" height="16" fill={isDark ? '#7c5a3a' : '#c08552'} />
          <rect x="192" y="46" width="14" height="18" rx="3" fill={isDark ? 'rgba(148,163,184,0.35)' : 'rgba(148,163,184,0.45)'} />
          <rect x="194" y="52" width="10" height="10" fill={isDark ? '#4a3421' : '#8d6e63'} />
          {/* Fruit bowl */}
          <path d="M36 58 q 14 12 28 0" fill={isDark ? '#5d4037' : '#8d6e63'} />
          <circle cx="44" cy="56" r="5" fill="#f59e0b" />
          <circle cx="54" cy="55" r="5" fill="#ef4444" />
          <circle cx="49" cy="51" r="5" fill="#84cc16" />
          {/* Counter slab + base */}
          <rect x="0" y="64" width="240" height="9" rx="3" fill={isDark ? '#78716c' : '#d6d3d1'} />
          <rect x="6" y="73" width="228" height="23" fill={isDark ? '#44403c' : '#a8a29e'} />
          {[30, 90, 150, 210].map((x) => (
            <rect key={x} x={x} y="76" width="18" height="17" rx="2" fill={isDark ? '#57534e' : '#bcb8b5'} />
          ))}
        </svg>
      </div>

      {/* Stools, downstage of the counter. */}
      {[36, 64].map((x, i) => (
        <div key={i} className="absolute" style={{ left: `${x}%`, top: '48%', transform: 'translate(-50%, -100%)' }}>
          <svg width="52" height="80" viewBox="0 0 34 52">
            <ellipse cx="17" cy="8" rx="14" ry="6" fill={isDark ? '#b45309' : '#f59e0b'} />
            <rect x="15" y="12" width="4" height="28" fill={isDark ? '#404040' : '#525252'} />
            <path d="M17 40 L5 50 M17 40 L29 50 M17 40 L17 51" stroke={isDark ? '#404040' : '#525252'} strokeWidth="3" strokeLinecap="round" />
          </svg>
        </div>
      ))}

      {/* Fridge. */}
      <div className="absolute" style={{ right: '3%', top: '44%', transform: 'translateY(-100%)' }}>
        <svg width="88" height="167" viewBox="0 0 58 110">
          <rect x="0" y="0" width="58" height="110" rx="6" fill={isDark ? '#94a3b8' : '#e2e8f0'} />
          <rect x="0" y="40" width="58" height="3" fill={isDark ? '#64748b' : '#94a3b8'} />
          <rect x="46" y="12" width="4" height="20" rx="2" fill={isDark ? '#475569' : '#94a3b8'} />
          <rect x="46" y="50" width="4" height="28" rx="2" fill={isDark ? '#475569' : '#94a3b8'} />
          <rect x="8" y="8" width="18" height="12" rx="2" fill="#fbbf24" opacity="0.8" />
          <rect x="10" y="24" width="14" height="8" rx="2" fill="#4ade80" opacity="0.7" />
        </svg>
      </div>

      <OfficePlant x={7} y={88} scale={1.9} isDark={isDark} />

      {/* Tile seams so the floor reads as a floor. */}
      <svg className="absolute inset-x-0 bottom-0 w-full" style={{ top: '30%' }} viewBox="0 0 100 70" preserveAspectRatio="none">
        {[10, 24, 38, 52, 66, 80, 94].map((x) => (
          <line key={x} x1={x} y1="0" x2={(x - 50) * 1.6 + 50} y2="70" stroke={isDark ? 'rgba(0,0,0,0.35)' : 'rgba(0,0,0,0.12)'} strokeWidth="0.35" />
        ))}
        {[12, 28, 48].map((y) => (
          <line key={y} x1="0" y1={y} x2="100" y2={y} stroke={isDark ? 'rgba(0,0,0,0.3)' : 'rgba(0,0,0,0.1)'} strokeWidth="0.3" />
        ))}
      </svg>
    </div>
  )
}

export { OfficeScene, ExecutiveScene, WarehouseScene, ServerRoomScene, BreakRoomScene }
