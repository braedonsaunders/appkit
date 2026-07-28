'use client'

/**
 * Scene art — six fully drawn stages (beach, campfire, forest, studio, space,
 * rooftop), each with a day and a night take, ported whole from the OpenStudio
 * homepage world. Everything is inline SVG and CSS gradients: no image assets,
 * sharp at any size, and themed by the `isDark` flag alone.
 *
 * The art is deliberately self-contained — the walking, depth-scaling, and
 * selection logic live in `CharacterScene`, which paints one of these behind
 * its characters via the `art` prop.
 */

import * as React from 'react'
import { useMemo, memo } from 'react'
import { motion } from 'framer-motion'

/** The stages that ship with the scene package. */
export type SceneKind = 'beach' | 'campfire' | 'forest' | 'studio' | 'space' | 'rooftop'

export interface SceneProps {
  isDark: boolean
}

// The art is server-rendered: positions must be identical on both sides of
// hydration, so every "random" placement draws from this seeded generator
// (mulberry32) instead of rnd(). Each useMemo re-seeds its own
// sequence, which also keeps re-renders from reshuffling the sky.
function seededRandom(seed: number): () => number {
  let a = seed >>> 0
  return () => {
    a = (a + 0x6d2b79f5) >>> 0
    let t = a
    t = Math.imul(t ^ (t >>> 15), t | 1)
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}


/** Horizon line per stage, percent from the top — mirrors the walk geometry. */
export const SCENE_HORIZONS: Record<SceneKind, number> = {
  beach: 30,
  campfire: 28,
  forest: 25,
  studio: 20,
  space: 35,
  rooftop: 25,
}


// Memoized star field for performance
const StarField = memo(function StarField({ count = 50, maxTop = 40 }: { count?: number; maxTop?: number }) {
  const rnd = seededRandom(2089155684) // fresh per render: identical on server, client, and StrictMode re-invocations
  const stars = useMemo(() =>
    Array.from({ length: count }, (_, i) => ({
      id: i,
      left: rnd() * 100,
      top: rnd() * maxTop,
      size: rnd() * 2 + 0.5,
      delay: rnd() * 3,
      duration: 2 + rnd() * 2,
    })), [count, maxTop]);

  return (
    <div className="absolute inset-0 pointer-events-none">
      {stars.map((star) => (
        <motion.div
          key={star.id}
          className="absolute rounded-full bg-white"
          style={{
            left: `${star.left}%`,
            top: `${star.top}%`,
            width: star.size,
            height: star.size,
          }}
          animate={{ opacity: [0.2, 1, 0.2], scale: [0.8, 1.2, 0.8] }}
          transition={{ duration: star.duration, delay: star.delay, repeat: Infinity, ease: 'easeInOut' }}
        />
      ))}
    </div>
  );
});

// Animated clouds
const CloudLayer = memo(function CloudLayer({ isDark }: { isDark: boolean }) {
  const clouds = useMemo(() => [
    { width: 120, height: 40, top: 8, duration: 80, delay: 0 },
    { width: 100, height: 35, top: 5, duration: 100, delay: -30 },
    { width: 140, height: 50, top: 12, duration: 70, delay: -50 },
    { width: 90, height: 30, top: 3, duration: 90, delay: -20 },
  ], []);

  return (
    <div className="absolute inset-0 overflow-hidden pointer-events-none">
      {clouds.map((cloud, i) => (
        <motion.div
          key={i}
          className="absolute"
          style={{ top: `${cloud.top}%` }}
          initial={{ x: '-20%' }}
          animate={{ x: '120vw' }}
          transition={{ duration: cloud.duration, delay: cloud.delay, repeat: Infinity, ease: 'linear' }}
        >
          <svg width={cloud.width} height={cloud.height} viewBox="0 0 120 50">
            <ellipse cx="60" cy="35" rx="50" ry="15" fill={isDark ? 'rgba(100,116,139,0.3)' : 'rgba(255,255,255,0.9)'} />
            <ellipse cx="35" cy="28" rx="30" ry="20" fill={isDark ? 'rgba(100,116,139,0.4)' : 'rgba(255,255,255,0.95)'} />
            <ellipse cx="85" cy="30" rx="28" ry="18" fill={isDark ? 'rgba(100,116,139,0.35)' : 'rgba(255,255,255,0.9)'} />
            <ellipse cx="55" cy="20" rx="25" ry="18" fill={isDark ? 'rgba(100,116,139,0.45)' : 'white'} />
          </svg>
        </motion.div>
      ))}
    </div>
  );
});

// Fireflies/Particles
const Particles = memo(function Particles({ color = '#fbbf24', count = 20 }: { color?: string; count?: number }) {
  const rnd = seededRandom(159819506 + count * 977 + color.charCodeAt(1) * 131) // fresh per render: identical on server, client, and StrictMode re-invocations
  const particles = useMemo(() =>
    Array.from({ length: count }, (_, i) => ({
      id: i,
      left: 10 + rnd() * 80,
      top: 30 + rnd() * 50,
      size: rnd() * 4 + 2,
      duration: 3 + rnd() * 4,
      delay: rnd() * 5,
    })), [count]);

  return (
    <>
      {particles.map((p) => (
        <motion.div
          key={p.id}
          className="absolute rounded-full"
          style={{
            left: `${p.left}%`,
            top: `${p.top}%`,
            width: p.size,
            height: p.size,
            background: color,
            boxShadow: `0 0 ${p.size * 2}px ${color}`,
          }}
          animate={{
            opacity: [0, 0.8, 0],
            scale: [0.5, 1.2, 0.5],
            x: [0, rnd() * 30 - 15, 0],
            y: [0, rnd() * -30, 0],
          }}
          transition={{ duration: p.duration, delay: p.delay, repeat: Infinity, ease: 'easeInOut' }}
        />
      ))}
    </>
  );
});

// ============================================
// BEACH SCENE - Day & Night (Ground-dominant pseudo-3D)
// ============================================
function BeachScene({ isDark }: SceneProps) {
  const config = { horizonY: SCENE_HORIZONS.beach }

  return (
    <div className="absolute inset-0 overflow-hidden">
      {/* Sky - compact at top */}
      <div className="absolute left-0 right-0 top-0" style={{ height: `${config.horizonY}%` }}>
        <div className={`absolute inset-0 ${
          isDark
            ? 'bg-gradient-to-b from-orange-400 via-pink-500 to-purple-600'
            : 'bg-gradient-to-b from-sky-300 via-cyan-200 to-blue-300'
        }`} />

        {/* Sun/Moon at horizon */}
        <motion.div
          className={`absolute bottom-[15%] left-1/2 -translate-x-1/2 w-14 h-14 rounded-full ${
            isDark
              ? 'bg-gradient-to-b from-yellow-300 to-orange-500'
              : 'bg-gradient-to-b from-yellow-200 to-yellow-400'
          }`}
          style={{
            boxShadow: isDark
              ? '0 0 40px 15px rgba(255, 180, 100, 0.5)'
              : '0 0 50px 20px rgba(255, 220, 100, 0.6)',
          }}
          animate={{ y: [0, -3, 0] }}
          transition={{ duration: 6, repeat: Infinity }}
        />

        {/* Ocean strip at horizon */}
        <div className={`absolute bottom-0 left-0 right-0 h-[30%] ${
          isDark
            ? 'bg-gradient-to-b from-purple-700 via-blue-700 to-cyan-600'
            : 'bg-gradient-to-b from-blue-400 via-cyan-400 to-cyan-300'
        }`} />

        {/* Waves at waterline */}
        <svg className="absolute bottom-0 left-0 right-0 w-full h-[20%]" viewBox="0 0 1440 50" preserveAspectRatio="none">
          <motion.path
            d="M0 25 Q90 15 180 25 Q270 35 360 25 Q450 15 540 25 Q630 35 720 25 Q810 15 900 25 Q990 35 1080 25 Q1170 15 1260 25 Q1350 35 1440 25 L1440 50 L0 50 Z"
            fill={isDark ? 'rgba(6, 182, 212, 0.4)' : 'rgba(34, 211, 238, 0.5)'}
            animate={{ d: [
              'M0 25 Q90 15 180 25 Q270 35 360 25 Q450 15 540 25 Q630 35 720 25 Q810 15 900 25 Q990 35 1080 25 Q1170 15 1260 25 Q1350 35 1440 25 L1440 50 L0 50 Z',
              'M0 25 Q90 35 180 25 Q270 15 360 25 Q450 35 540 25 Q630 15 720 25 Q810 35 900 25 Q990 15 1080 25 Q1170 35 1260 25 Q1350 15 1440 25 L1440 50 L0 50 Z',
            ] }}
            transition={{ duration: 4, repeat: Infinity, ease: 'easeInOut' }}
          />
        </svg>
      </div>

      {/* Sandy beach - large walkable area */}
      <div className="absolute left-0 right-0 bottom-0" style={{ top: `${config.horizonY}%` }}>
        {/* Sand gradient with perspective */}
        <div className={`absolute inset-0 ${
          isDark
            ? 'bg-gradient-to-b from-amber-500 via-amber-400 to-amber-300'
            : 'bg-gradient-to-b from-amber-300 via-amber-200 to-amber-100'
        }`} />

        {/* Wet sand near water */}
        <div className={`absolute top-0 left-0 right-0 h-[12%] ${isDark ? 'bg-amber-600/40' : 'bg-amber-400/30'}`} />

        {/* Beach items at different depths */}
        {useMemo(() => [
          { x: 8, y: 8, type: 'shell', scale: 0.4 },
          { x: 92, y: 12, type: 'shell', scale: 0.45 },
          { x: 18, y: 35, type: 'towel', scale: 0.55 },
          { x: 78, y: 40, type: 'umbrella', scale: 0.6 },
          { x: 12, y: 65, type: 'bucket', scale: 0.75 },
          { x: 88, y: 70, type: 'shell', scale: 0.8 },
        ].map((item, i) => (
          <div
            key={i}
            className="absolute"
            style={{
              left: `${item.x}%`,
              top: `${item.y}%`,
              transform: `scale(${item.scale})`,
              opacity: 0.5 + item.scale * 0.4,
            }}
          >
            {item.type === 'shell' && <div className="w-4 h-3 rounded-full bg-pink-200/70" />}
            {item.type === 'towel' && <div className="w-16 h-8 rounded bg-red-400/60" />}
            {item.type === 'umbrella' && (
              <div className="relative">
                <div className="w-20 h-10 rounded-t-full bg-yellow-400/70" />
                <div className="absolute top-8 left-1/2 w-1 h-8 bg-amber-800/60" />
              </div>
            )}
            {item.type === 'bucket' && <div className="w-6 h-5 rounded-b bg-blue-400/60" />}
          </div>
        )), [])}

        {/* Palm trees - fewer, bigger, closer to water */}
        {useMemo(() => {
          const palmTrees = [
            // Near water - larger trees
            { x: 3, bottom: 60, scale: 0.7, zIndex: 1, flip: false },
            { x: 92, bottom: 58, scale: 0.75, zIndex: 1, flip: true },
            // Middle distance - biggest trees
            { x: 8, bottom: 45, scale: 0.85, zIndex: 2, flip: true },
            { x: 88, bottom: 48, scale: 0.9, zIndex: 2, flip: false },
            // Foreground - partial trees at edges
            { x: -5, bottom: 25, scale: 1.1, zIndex: 10, flip: false },
            { x: 105, bottom: 22, scale: 1.15, zIndex: 10, flip: true },
          ];

          const trunkColor = isDark ? '#4a3728' : '#8B4513';
          const trunkHighlight = isDark ? '#5d4037' : '#a0522d';
          const frondDark = isDark ? '#1b4332' : '#228B22';
          const frondMid = isDark ? '#2d6a4f' : '#2E8B57';
          const frondLight = isDark ? '#40916c' : '#3CB371';

          return palmTrees.map((palm, i) => (
            <div
              key={`palm-${i}`}
              className="absolute"
              style={{
                left: `${palm.x}%`,
                bottom: `${palm.bottom}%`,
                transform: `scaleX(${palm.flip ? -1 : 1})`,
                zIndex: palm.zIndex,
              }}
            >
              <svg
                width={120 * palm.scale}
                height={200 * palm.scale}
                viewBox="0 0 120 200"
                style={{ overflow: 'visible' }}
              >
                {/* Trunk with curve and texture */}
                <path
                  d="M55 200 Q52 160 54 120 Q58 80 55 50 Q52 30 58 15"
                  stroke={trunkColor}
                  strokeWidth="12"
                  fill="none"
                  strokeLinecap="round"
                />
                <path
                  d="M58 200 Q56 160 57 120 Q60 80 58 50 Q56 32 60 18"
                  stroke={trunkHighlight}
                  strokeWidth="6"
                  fill="none"
                  strokeLinecap="round"
                />
                {/* Trunk rings */}
                {[180, 150, 120, 90, 65, 45].map((y, ri) => (
                  <ellipse
                    key={ri}
                    cx="56"
                    cy={y}
                    rx="7"
                    ry="2"
                    fill="none"
                    stroke={isDark ? '#3d2817' : '#6b4423'}
                    strokeWidth="1"
                    opacity="0.5"
                  />
                ))}
                {/* Coconuts */}
                <circle cx="52" cy="22" r="5" fill={isDark ? '#5d4037' : '#8B4513'} />
                <circle cx="62" cy="20" r="4" fill={isDark ? '#4a3728' : '#a0522d'} />
                <circle cx="56" cy="26" r="4.5" fill={isDark ? '#5d4037' : '#8B4513'} />
                {/* Palm fronds - layered */}
                {/* Back fronds */}
                <path d="M58 15 Q30 -20 -20 10" stroke={frondDark} strokeWidth="3" fill="none" />
                <path d="M58 15 Q80 -25 130 5" stroke={frondDark} strokeWidth="3" fill="none" />
                <path d="M58 15 Q20 -10 -10 30" stroke={frondDark} strokeWidth="2.5" fill="none" />
                <path d="M58 15 Q90 -15 120 25" stroke={frondDark} strokeWidth="2.5" fill="none" />
                {/* Middle fronds */}
                <path d="M58 15 Q25 5 -15 40" stroke={frondMid} strokeWidth="3" fill="none" />
                <path d="M58 15 Q85 0 125 35" stroke={frondMid} strokeWidth="3" fill="none" />
                <path d="M58 15 Q40 -30 10 -15" stroke={frondMid} strokeWidth="2.5" fill="none" />
                <path d="M58 15 Q75 -35 105 -20" stroke={frondMid} strokeWidth="2.5" fill="none" />
                {/* Front fronds */}
                <path d="M58 15 Q35 20 0 55" stroke={frondLight} strokeWidth="3.5" fill="none" />
                <path d="M58 15 Q80 15 115 50" stroke={frondLight} strokeWidth="3.5" fill="none" />
                <path d="M58 15 Q55 -20 58 -40" stroke={frondLight} strokeWidth="3" fill="none" />
                <path d="M58 15 Q30 10 5 45" stroke={frondLight} strokeWidth="2" fill="none" />
                <path d="M58 15 Q85 5 110 40" stroke={frondLight} strokeWidth="2" fill="none" />
                {/* Frond leaf details */}
                {[-20, -10, 0, 10, 20, 30, 40].map((offset, li) => (
                  <g key={`leaf-${li}`}>
                    <path
                      d={`M${30 + offset * 0.5} ${25 + Math.abs(offset) * 0.3} Q${25 + offset * 0.4} ${30 + Math.abs(offset) * 0.2} ${20 + offset * 0.3} ${35}`}
                      stroke={frondLight}
                      strokeWidth="1"
                      fill="none"
                      opacity="0.6"
                    />
                  </g>
                ))}
              </svg>
            </div>
          ));
        }, [isDark])}

        {/* Footprints at various depths */}
        {useMemo(() => Array.from({ length: 6 }, (_, i) => (
          <div
            key={i}
            className="absolute opacity-20"
            style={{ left: `${30 + i * 8}%`, top: `${45 + (i % 2) * 3}%` }}
          >
            <div className={`w-2 h-3 rounded-full ${isDark ? 'bg-amber-700' : 'bg-amber-500'}`} />
          </div>
        )), [isDark])}

        {/* Seagulls */}
        {!isDark && [
          { x: 20, y: -15, scale: 0.6 },
          { x: 70, y: -20, scale: 0.5 },
        ].map((bird, i) => (
          <motion.svg
            key={i}
            className="absolute"
            style={{ left: `${bird.x}%`, top: `${bird.y}%`, transform: `scale(${bird.scale})` }}
            width="20" height="10" viewBox="0 0 20 10"
            animate={{ y: [0, -5, 0], x: [0, 10, 0] }}
            transition={{ duration: 8 + i * 2, repeat: Infinity }}
          >
            <path d="M0 5 Q5 0 10 5 Q15 0 20 5" stroke="#64748b" strokeWidth="2" fill="none" />
          </motion.svg>
        ))}
      </div>

      {/* Fireflies (night) */}
      {isDark && <Particles color="#fef08a" count={12} />}
    </div>
  );
}

// ============================================
// CAMPFIRE SCENE - Northern Lake Camping Under Stars
// ============================================

// Pine tree silhouette component for lakeshore
export const PineTreeSilhouette = memo(function PineTreeSilhouette({
  x,
  scale,
  isDark,
}: {
  x: number;
  scale: number;
  isDark: boolean;
}) {
  const treeColor = isDark ? '#0a1628' : '#1e3a2f';
  return (
    <svg
      className="absolute bottom-0"
      style={{
        left: `${x}%`,
        transform: 'translateX(-50%)',
        zIndex: Math.floor((1 - scale) * 5),
      }}
      width={40 * scale}
      height={100 * scale}
      viewBox="0 0 40 100"
    >
      {/* Trunk */}
      <rect x="17" y="70" width="6" height="30" fill={treeColor} />
      {/* Pine layers */}
      <path d="M20 0 L5 35 L12 32 L2 55 L10 52 L0 75 L40 75 L30 52 L38 55 L28 32 L35 35 Z" fill={treeColor} />
    </svg>
  );
});

// Aurora borealis effect
const AuroraBorealis = memo(function AuroraBorealis() {
  const auroras = useMemo(() => [
    { x: 10, width: 25, color1: '#22d3ee', color2: '#34d399', delay: 0 },
    { x: 30, width: 30, color1: '#a78bfa', color2: '#22d3ee', delay: 1 },
    { x: 55, width: 28, color1: '#34d399', color2: '#a78bfa', delay: 2 },
    { x: 75, width: 22, color1: '#22d3ee', color2: '#34d399', delay: 0.5 },
  ], []);

  return (
    <>
      {auroras.map((aurora, i) => (
        <motion.div
          key={i}
          className="absolute pointer-events-none"
          style={{
            left: `${aurora.x}%`,
            top: '5%',
            width: `${aurora.width}%`,
            height: '60%',
            background: `linear-gradient(180deg, transparent 0%, ${aurora.color1}20 20%, ${aurora.color2}30 50%, ${aurora.color1}15 80%, transparent 100%)`,
            filter: 'blur(20px)',
            transform: 'skewX(-5deg)',
          }}
          animate={{
            opacity: [0.3, 0.7, 0.4, 0.6, 0.3],
            scaleX: [1, 1.2, 0.9, 1.1, 1],
            x: [0, 20, -10, 15, 0],
          }}
          transition={{
            duration: 8 + i * 2,
            delay: aurora.delay,
            repeat: Infinity,
            ease: 'easeInOut',
          }}
        />
      ))}
    </>
  );
});

// Loon call visual ripples
export const LoonRipples = memo(function LoonRipples({ x, isDark }: { x: number; isDark: boolean }) {
  return (
    <div className="absolute" style={{ left: `${x}%`, top: '35%' }}>
      {[0, 1, 2].map((ring) => (
        <motion.div
          key={ring}
          className="absolute rounded-full border"
          style={{
            left: '50%',
            top: '50%',
            width: 20,
            height: 8,
            borderColor: isDark ? 'rgba(148, 163, 184, 0.3)' : 'rgba(71, 85, 105, 0.3)',
            transform: 'translate(-50%, -50%)',
          }}
          animate={{
            width: [20, 60 + ring * 20],
            height: [8, 24 + ring * 8],
            opacity: [0.5, 0],
          }}
          transition={{
            duration: 3,
            delay: ring * 0.5,
            repeat: Infinity,
            repeatDelay: 4,
          }}
        />
      ))}
    </div>
  );
});

// ============================================
// CAMPFIRE SCENE - High Fidelity Upgrade
// ============================================

// Majestic Mountain Range with Snow Caps
const MountainRange = memo(function MountainRange({ isDark }: { isDark: boolean }) {
  const colors = isDark ? {
    back: '#1e1b4b',
    front: '#312e81',
    snow: '#6366f1',
    snowShadow: '#4338ca'
  } : {
    back: '#60a5fa',
    front: '#3b82f6',
    snow: '#ffffff',
    snowShadow: '#dbeafe'
  };

  return (
    <div className="absolute bottom-[25%] left-0 right-0 h-[45%] w-full pointer-events-none">
      <svg className="w-full h-full" viewBox="0 0 1440 320" preserveAspectRatio="none">
        <path
          d="M0 320 L0 180 L180 80 L350 220 L500 100 L700 250 L900 120 L1100 240 L1250 150 L1440 280 L1440 320 Z"
          fill={colors.back}
          opacity="0.8"
        />
        <g>
          <path d="M-50 320 L-50 320 L150 120 L400 320 L400 320 Z" fill={colors.front} />
          <path d="M150 120 L200 160 L180 180 L150 165 L120 180 L100 160 Z" fill={colors.snow} />
        </g>
        <g>
          <path d="M250 320 L550 50 L850 320 Z" fill={colors.front} />
          <path d="M550 50 L620 110 L590 130 L550 110 L510 130 L480 110 Z" fill={colors.snow} />
          <path d="M550 50 L550 110 L510 130 L480 110 Z" fill={colors.snowShadow} opacity="0.3" />
        </g>
        <g>
          <path d="M700 320 L1000 80 L1300 320 Z" fill={colors.front} />
          <path d="M1000 80 L1060 130 L1030 150 L1000 130 L970 150 L940 130 Z" fill={colors.snow} />
        </g>
        <g>
          <path d="M1100 320 L1350 140 L1600 320 Z" fill={colors.front} />
          <path d="M1350 140 L1400 180 L1350 170 L1300 180 Z" fill={colors.snow} />
        </g>
      </svg>
    </div>
  );
});

// Shimmering Lake Water
const LakeWater = memo(function LakeWater({ isDark }: { isDark: boolean }) {
  return (
    <div className="absolute left-0 right-0 bottom-[25%] h-[20%] overflow-hidden">
      <div className={`absolute inset-0 ${
        isDark
          ? 'bg-gradient-to-b from-indigo-950 via-slate-900 to-slate-900'
          : 'bg-gradient-to-b from-sky-400 via-sky-300 to-teal-300'
      }`} />
      <div className={`absolute inset-0 opacity-30 ${
        isDark
          ? 'bg-gradient-to-t from-transparent via-indigo-900 to-transparent'
          : 'bg-gradient-to-t from-transparent via-white to-transparent'
      }`} />
      <svg className="absolute inset-0 w-full h-full" preserveAspectRatio="none">
        {[0, 1, 2, 3].map((i) => (
          <motion.path
            key={i}
            d={`M0 ${20 + i * 25} Q 360 ${10 + i * 25} 720 ${20 + i * 25} T 1440 ${20 + i * 25} V 100 H 0 Z`}
            fill={isDark ? '#1e1b4b' : '#0ea5e9'}
            fillOpacity={0.1 + i * 0.05}
            animate={{ d: [
              `M0 ${20 + i * 25} Q 360 ${10 + i * 25} 720 ${20 + i * 25} T 1440 ${20 + i * 25} V 100 H 0 Z`,
              `M0 ${20 + i * 25} Q 360 ${30 + i * 25} 720 ${20 + i * 25} T 1440 ${20 + i * 25} V 100 H 0 Z`,
              `M0 ${20 + i * 25} Q 360 ${10 + i * 25} 720 ${20 + i * 25} T 1440 ${20 + i * 25} V 100 H 0 Z`,
            ]}}
            transition={{ duration: 4 + i, repeat: Infinity, ease: "easeInOut" }}
          />
        ))}
      </svg>
    </div>
  );
});

// Modern Dome Tent
const CampingTent = memo(function CampingTent({
  x, y, color, scale = 1, isDark
}: {
  x: number; y: number; color: 'red' | 'blue'; scale?: number; isDark: boolean
}) {
  const mainColor = color === 'red'
    ? (isDark ? '#7f1d1d' : '#ef4444')
    : (isDark ? '#1e3a8a' : '#3b82f6');
  const highlightColor = color === 'red'
    ? (isDark ? '#991b1b' : '#f87171')
    : (isDark ? '#1d4ed8' : '#60a5fa');
  const darkColor = color === 'red'
    ? (isDark ? '#450a0a' : '#b91c1c')
    : (isDark ? '#172554' : '#1d4ed8');

  return (
    <div
      className="absolute"
      style={{ left: `${x}%`, top: `${y}%`, transform: `scale(${scale}) translateX(-50%)`, zIndex: Math.floor(y) }}
    >
      <svg width="120" height="80" viewBox="0 0 120 80">
        <ellipse cx="60" cy="75" rx="55" ry="5" fill="black" opacity="0.3" />
        <path d="M25 75 L60 15 L95 75 Z" fill={darkColor} />
        <path d="M10 75 Q15 40 60 10 Q35 40 25 75 Z" fill={mainColor} />
        <path d="M110 75 Q105 40 60 10 Q85 40 95 75 Z" fill={highlightColor} />
        <path d="M40 75 L60 30 L80 75 Z" fill={isDark ? '#000' : '#1f2937'} opacity="0.8" />
        <path d="M10 75 Q60 -5 110 75" fill="none" stroke={isDark ? '#4b5563' : '#cbd5e1'} strokeWidth="2" />
        <path d="M25 75 L95 75" fill="none" stroke={isDark ? '#4b5563' : '#cbd5e1'} strokeWidth="1" strokeDasharray="4 4" />
        {isDark && (
          <motion.path
            d="M45 75 L60 40 L75 75 Z"
            fill="#fbbf24"
            opacity="0.2"
            animate={{ opacity: [0.1, 0.3, 0.1] }}
            transition={{ duration: 2, repeat: Infinity }}
          />
        )}
      </svg>
    </div>
  );
});

// Camping Chair
const FoldingChair = memo(function FoldingChair({
  x, y, scale = 1, isDark
}: {
  x: number; y: number; scale?: number; isDark: boolean
}) {
  return (
    <div
      className="absolute"
      style={{ left: `${x}%`, top: `${y}%`, transform: `scale(${scale}) translateX(-50%)` }}
    >
      <svg width="40" height="50" viewBox="0 0 40 50">
        <path d="M5 45 L35 45" stroke={isDark ? '#4b5563' : '#64748b'} strokeWidth="2" />
        <path d="M10 45 L20 25 L30 45" stroke={isDark ? '#9ca3af' : '#cbd5e1'} strokeWidth="2" fill="none" />
        <path d="M10 25 L10 45" stroke={isDark ? '#9ca3af' : '#cbd5e1'} strokeWidth="2" />
        <path d="M30 25 L30 45" stroke={isDark ? '#9ca3af' : '#cbd5e1'} strokeWidth="2" />
        <path d="M10 25 Q20 30 30 25" stroke={isDark ? '#166534' : '#15803d'} strokeWidth="3" fill="none" />
        <path d="M10 25 L5 5" stroke={isDark ? '#9ca3af' : '#cbd5e1'} strokeWidth="2" />
        <path d="M30 25 L35 5" stroke={isDark ? '#9ca3af' : '#cbd5e1'} strokeWidth="2" />
        <rect x="5" y="5" width="30" height="15" rx="2" fill={isDark ? '#166534' : '#15803d'} />
      </svg>
    </div>
  );
});

function CampfireScene({ isDark }: SceneProps) {

  return (
    <div className="absolute inset-0 overflow-hidden">
      {/* ==================== SKY & BACKDROP ==================== */}
      <div className="absolute inset-0">
        <div className={`absolute inset-0 transition-colors duration-1000 ${
          isDark
            ? 'bg-gradient-to-b from-slate-950 via-indigo-950 to-slate-900'
            : 'bg-gradient-to-b from-sky-400 via-sky-300 to-blue-200'
        }`} />
        {isDark && <StarField count={120} maxTop={70} />}
        {isDark && <AuroraBorealis />}
        <motion.div
          className={`absolute rounded-full ${
            isDark
              ? 'top-[10%] right-[15%] w-16 h-16 bg-slate-100'
              : 'top-[8%] left-[10%] w-24 h-24 bg-yellow-300'
          }`}
          style={{
            boxShadow: isDark
              ? '0 0 40px 10px rgba(255, 255, 255, 0.15)'
              : '0 0 60px 20px rgba(253, 224, 71, 0.4)'
          }}
          animate={{ y: [0, -5, 0] }}
          transition={{ duration: 8, repeat: Infinity, ease: "easeInOut" }}
        />
        {!isDark && <CloudLayer isDark={isDark} />}
      </div>

      {/* ==================== BACKGROUND LANDSCAPE ==================== */}
      <MountainRange isDark={isDark} />
      <LakeWater isDark={isDark} />

      {/* ==================== FOREGROUND CLEARING ==================== */}
      <div className="absolute left-0 right-0 bottom-0" style={{ height: '35%' }}>
        <div className={`absolute inset-0 ${
          isDark
            ? 'bg-gradient-to-b from-emerald-900 via-slate-900 to-black'
            : 'bg-gradient-to-b from-emerald-400 via-green-500 to-green-600'
        }`} />
        <div className="absolute inset-0 bg-gradient-to-r from-black/40 via-transparent to-black/40" />
      </div>

      {/* ==================== SCENE OBJECTS ==================== */}

      {/* Trees - Pushed to sides to create clearing */}
      <div className="absolute bottom-[5%] left-[-5%] z-10">
        <ForestTree x={0} scale={1.2} variant="pine" isDark={isDark} />
        <ForestTree x={50} scale={0.9} variant="pine" isDark={isDark} />
      </div>
      <div className="absolute bottom-[5%] right-[-5%] z-10">
        <ForestTree x={0} scale={1.1} variant="pine" isDark={isDark} flip />
        <ForestTree x={-40} scale={0.8} variant="pine" isDark={isDark} flip />
      </div>

      {/* Tents - Placed on edges of clearing */}
      <CampingTent x={15} y={65} color="blue" scale={1.2} isDark={isDark} />
      <CampingTent x={85} y={62} color="red" scale={1.1} isDark={isDark} />

      {/* Campfire Pit - Center Stage */}
      <div className="absolute left-1/2 top-[72%] -translate-x-1/2 -translate-y-1/2 z-0">
        <div className="relative">
          <div className="absolute top-8 left-1/2 -translate-x-1/2 w-32 h-12 bg-black/40 rounded-[100%] blur-sm" />
          <svg width="100" height="100" viewBox="0 0 100 100" className="overflow-visible">
            <g transform="translate(0, 10)">
              {[0, 45, 90, 135, 180, 225, 270, 315].map((angle, i) => (
                <ellipse
                  key={i}
                  cx={50 + 25 * Math.cos(angle * Math.PI / 180)}
                  cy={80 + 10 * Math.sin(angle * Math.PI / 180)}
                  rx="6" ry="4"
                  fill={isDark ? '#4b5563' : '#9ca3af'}
                />
              ))}
            </g>
            <path d="M30 75 L70 85 L70 90 L30 80 Z" fill="#5D4037" />
            <path d="M70 75 L30 85 L30 90 L70 80 Z" fill="#4E342E" />
            <motion.g
              style={{ transformOrigin: '50px 80px' }}
              animate={{ scaleY: [1, 1.1, 0.9, 1.05, 1], scaleX: [1, 0.95, 1.05, 0.98, 1] }}
              transition={{ duration: 0.6, repeat: Infinity, ease: "easeInOut" }}
            >
              <path d="M50 20 Q70 60 65 85 L35 85 Q30 60 50 20" fill="#fbbf24" opacity="0.8" />
              <path d="M50 30 Q65 60 60 85 L40 85 Q35 60 50 30" fill="#f59e0b" opacity="0.9" />
              <path d="M50 45 Q60 65 55 85 L45 85 Q40 65 50 45" fill="#ef4444" />
            </motion.g>
            <circle cx="50" cy="70" r="40" fill="url(#fireGlow)" opacity={isDark ? 0.6 : 0.3} />
            <defs>
              <radialGradient id="fireGlow">
                <stop offset="0%" stopColor="#f59e0b" />
                <stop offset="100%" stopColor="transparent" />
              </radialGradient>
            </defs>
          </svg>
          <Particles color="#fbbf24" count={isDark ? 15 : 5} />
        </div>
      </div>

      {/* Props around fire */}
      <FoldingChair x={38} y={68} scale={0.9} isDark={isDark} />

      {/* Sitting Logs */}
      <div className="absolute left-[62%] top-[75%]">
        <svg width="40" height="20" viewBox="0 0 40 20">
          <ellipse cx="20" cy="10" rx="18" ry="8" fill={isDark ? '#3f2c22' : '#5d4037'} />
          <ellipse cx="20" cy="8" rx="18" ry="8" fill={isDark ? '#5d4037' : '#8d6e63'} />
          <ellipse cx="20" cy="8" rx="14" ry="6" fill={isDark ? '#795548' : '#a1887f'} />
        </svg>
      </div>

      {/* String Lights */}
      <div className="absolute top-0 left-0 right-0 h-[30%] pointer-events-none z-20">
        <svg width="100%" height="100%" preserveAspectRatio="none">
          <path d="M0 0 Q 720 200 1440 0" fill="none" stroke={isDark ? '#4b5563' : '#94a3b8'} strokeWidth="1" />
        </svg>
        {Array.from({ length: 12 }).map((_, i) => (
          <motion.div
            key={i}
            className="absolute w-2 h-2 rounded-full bg-yellow-200"
            style={{
              left: `${8 + i * 7.5}%`,
              top: `${15 + Math.sin(i * 0.5) * 2}%`,
              boxShadow: isDark ? '0 0 10px 2px #fcd34d' : 'none'
            }}
            animate={{ opacity: [0.6, 1, 0.6] }}
            transition={{ duration: 2, delay: i * 0.2, repeat: Infinity }}
          />
        ))}
      </div>

      {/* Fireflies (Night) */}
      {isDark && <Particles color="#bef264" count={20} />}
    </div>
  );
}

// ============================================
// FOREST SCENE - Magical Enchanted Forest Clearing
// ============================================

// Realistic tree component with trunk, branches, and layered foliage
const ForestTree = memo(function ForestTree({
  x,
  scale,
  variant,
  isDark,
  flip = false,
}: {
  x: number;
  scale: number;
  variant: 'oak' | 'pine' | 'birch' | 'willow';
  isDark: boolean;
  flip?: boolean;
}) {
  const baseHeight = variant === 'pine' ? 180 : variant === 'willow' ? 160 : 150;
  const height = baseHeight * scale;
  const width = (variant === 'pine' ? 80 : variant === 'willow' ? 120 : 100) * scale;

  // Color palettes for day/night
  const colors = isDark ? {
    trunk: '#1a0f0a',
    trunkLight: '#2d1f15',
    foliage1: '#052e16',
    foliage2: '#064e3b',
    foliage3: '#065f46',
    highlight: '#0d9488',
  } : {
    trunk: '#5d4037',
    trunkLight: '#795548',
    foliage1: '#166534',
    foliage2: '#15803d',
    foliage3: '#22c55e',
    highlight: '#86efac',
  };

  const renderTree = () => {
    switch (variant) {
      case 'pine':
        return (
          <svg width={width} height={height} viewBox="0 0 80 180" style={{ transform: flip ? 'scaleX(-1)' : undefined }}>
            {/* Trunk */}
            <path d="M36 180 L36 100 Q40 95 44 100 L44 180" fill={colors.trunk} />
            <path d="M38 180 L38 105 Q40 102 42 105 L42 180" fill={colors.trunkLight} />
            {/* Pine layers */}
            <path d="M40 10 L10 70 L25 65 L5 100 L20 95 L0 130 L40 110 L80 130 L60 95 L75 100 L55 65 L70 70 Z" fill={colors.foliage1} />
            <path d="M40 15 L18 65 L28 62 L12 92 L25 88 L10 118 L40 102 L70 118 L55 88 L68 92 L52 62 L62 65 Z" fill={colors.foliage2} />
            <path d="M40 25 L28 58 L35 56 L22 82 L32 78 L20 105 L40 92 L60 105 L48 78 L58 82 L45 56 L52 58 Z" fill={colors.foliage3} />
            {/* Highlight */}
            <path d="M40 30 L32 52 L38 50 L30 72 L36 70 L28 90 L40 82 L52 90 L44 70 L50 72 L42 50 L48 52 Z" fill={colors.highlight} opacity="0.3" />
          </svg>
        );
      case 'birch':
        return (
          <svg width={width} height={height} viewBox="0 0 100 150" style={{ transform: flip ? 'scaleX(-1)' : undefined }}>
            {/* Birch trunk with markings */}
            <path d="M45 150 L45 40 Q50 35 55 40 L55 150" fill={isDark ? '#374151' : '#f5f5f4'} />
            <path d="M46 150 L46 45 Q50 42 54 45 L54 150" fill={isDark ? '#4b5563' : '#fafaf9'} />
            {/* Birch bark markings */}
            {[50, 70, 95, 115, 135].map((y, i) => (
              <ellipse key={i} cx={50 + (i % 2) * 3} cy={y} rx={4} ry={2} fill={isDark ? '#1f2937' : '#292524'} opacity="0.6" />
            ))}
            {/* Foliage clusters */}
            <ellipse cx="35" cy="35" rx="25" ry="20" fill={colors.foliage2} />
            <ellipse cx="60" cy="30" rx="28" ry="22" fill={colors.foliage1} />
            <ellipse cx="50" cy="22" rx="22" ry="18" fill={colors.foliage3} />
            <ellipse cx="70" cy="40" rx="20" ry="16" fill={colors.foliage2} />
            <ellipse cx="30" cy="45" rx="18" ry="14" fill={colors.foliage1} />
            {/* Highlights */}
            <ellipse cx="50" cy="20" rx="12" ry="10" fill={colors.highlight} opacity="0.25" />
          </svg>
        );
      case 'willow':
        return (
          <svg width={width} height={height} viewBox="0 0 120 160" style={{ transform: flip ? 'scaleX(-1)' : undefined }}>
            {/* Trunk */}
            <path d="M55 160 L50 80 Q60 60 60 40 Q58 60 70 80 L65 160" fill={colors.trunk} />
            <path d="M57 160 L53 85 Q60 68 60 50 Q58 68 67 85 L63 160" fill={colors.trunkLight} />
            {/* Main canopy */}
            <ellipse cx="60" cy="35" rx="45" ry="30" fill={colors.foliage1} />
            <ellipse cx="60" cy="30" rx="38" ry="25" fill={colors.foliage2} />
            {/* Drooping branches */}
            {[20, 40, 60, 80, 100].map((bx, i) => (
              <path
                key={i}
                d={`M${bx} 45 Q${bx + (i % 2 ? 5 : -5)} 80 ${bx + (i % 2 ? 10 : -10)} 120`}
                stroke={colors.foliage3}
                strokeWidth="8"
                fill="none"
                opacity="0.8"
              />
            ))}
            {/* Leaf clusters on branches */}
            {[18, 42, 62, 82, 102].map((bx, i) => (
              <g key={i}>
                <ellipse cx={bx + (i % 2 ? 8 : -8)} cy={90 + i * 5} rx="12" ry="8" fill={colors.foliage2} opacity="0.7" />
                <ellipse cx={bx + (i % 2 ? 12 : -12)} cy={110 + i * 3} rx="10" ry="6" fill={colors.foliage3} opacity="0.6" />
              </g>
            ))}
          </svg>
        );
      default: // oak
        return (
          <svg width={width} height={height} viewBox="0 0 100 150" style={{ transform: flip ? 'scaleX(-1)' : undefined }}>
            {/* Main trunk */}
            <path d="M42 150 L40 90 Q35 70 38 50 Q42 45 50 45 Q58 45 62 50 Q65 70 60 90 L58 150" fill={colors.trunk} />
            {/* Trunk texture */}
            <path d="M44 150 L43 95 Q40 75 42 55 Q46 50 50 50 Q54 50 58 55 Q60 75 57 95 L56 150" fill={colors.trunkLight} />
            {/* Branches */}
            <path d="M42 70 Q30 60 20 55" stroke={colors.trunk} strokeWidth="6" fill="none" />
            <path d="M58 65 Q70 55 82 50" stroke={colors.trunk} strokeWidth="5" fill="none" />
            <path d="M45 55 Q35 45 30 35" stroke={colors.trunk} strokeWidth="4" fill="none" />
            <path d="M55 52 Q62 42 72 35" stroke={colors.trunk} strokeWidth="4" fill="none" />
            {/* Foliage clusters */}
            <ellipse cx="20" cy="45" rx="22" ry="18" fill={colors.foliage1} />
            <ellipse cx="80" cy="40" rx="20" ry="16" fill={colors.foliage1} />
            <ellipse cx="30" cy="28" rx="18" ry="15" fill={colors.foliage2} />
            <ellipse cx="70" cy="25" rx="20" ry="16" fill={colors.foliage2} />
            <ellipse cx="50" cy="20" rx="30" ry="22" fill={colors.foliage1} />
            <ellipse cx="50" cy="15" rx="25" ry="18" fill={colors.foliage2} />
            <ellipse cx="40" cy="35" rx="22" ry="18" fill={colors.foliage3} />
            <ellipse cx="60" cy="32" rx="24" ry="20" fill={colors.foliage2} />
            <ellipse cx="50" cy="25" rx="20" ry="16" fill={colors.foliage3} />
            {/* Highlights */}
            <ellipse cx="45" cy="18" rx="12" ry="10" fill={colors.highlight} opacity="0.2" />
            <ellipse cx="65" cy="28" rx="10" ry="8" fill={colors.highlight} opacity="0.15" />
          </svg>
        );
    }
  };

  return (
    <div
      className="absolute bottom-0"
      style={{
        left: `${x}%`,
        transform: 'translateX(-50%)',
        zIndex: Math.floor((1 - scale) * 10),
      }}
    >
      {renderTree()}
    </div>
  );
});

// Magical floating particles for the forest
const MagicalParticles = memo(function MagicalParticles({ isDark }: { isDark: boolean }) {
  const rnd = seededRandom(5767171) // fresh per render: identical on server, client, and StrictMode re-invocations
  const particles = useMemo(() =>
    Array.from({ length: isDark ? 40 : 25 }, (_, i) => ({
      id: i,
      left: 15 + rnd() * 70,
      top: 20 + rnd() * 60,
      size: isDark ? rnd() * 4 + 2 : rnd() * 3 + 1,
      duration: 4 + rnd() * 6,
      delay: rnd() * 8,
      color: isDark
        ? ['#fef08a', '#a5f3fc', '#c4b5fd', '#fbcfe8', '#bef264'][Math.floor(rnd() * 5)]
        : ['#fef9c3', '#d9f99d', '#bbf7d0', '#a7f3d0'][Math.floor(rnd() * 4)],
    })), [isDark]);

  return (
    <>
      {particles.map((p) => (
        <motion.div
          key={p.id}
          className="absolute rounded-full pointer-events-none"
          style={{
            left: `${p.left}%`,
            top: `${p.top}%`,
            width: p.size,
            height: p.size,
            background: p.color,
            boxShadow: isDark ? `0 0 ${p.size * 3}px ${p.color}` : `0 0 ${p.size}px ${p.color}`,
          }}
          animate={{
            opacity: [0, isDark ? 0.9 : 0.6, 0],
            scale: [0.3, 1.2, 0.3],
            y: [0, -30 - rnd() * 40, -60],
            x: [0, (rnd() - 0.5) * 40, (rnd() - 0.5) * 60],
          }}
          transition={{
            duration: p.duration,
            delay: p.delay,
            repeat: Infinity,
            ease: 'easeInOut'
          }}
        />
      ))}
    </>
  );
});

// Sun rays through canopy
const SunRays = memo(function SunRays() {
  const rays = useMemo(() => [
    { x: 20, width: 60, skew: -15, delay: 0 },
    { x: 35, width: 80, skew: -8, delay: 0.5 },
    { x: 50, width: 100, skew: 0, delay: 1 },
    { x: 65, width: 70, skew: 8, delay: 1.5 },
    { x: 80, width: 50, skew: 15, delay: 2 },
  ], []);

  return (
    <>
      {rays.map((ray, i) => (
        <motion.div
          key={i}
          className="absolute top-0 pointer-events-none"
          style={{
            left: `${ray.x}%`,
            width: ray.width,
            height: '100%',
            background: 'linear-gradient(180deg, rgba(255, 251, 235, 0.5) 0%, rgba(254, 249, 195, 0.3) 30%, transparent 70%)',
            transform: `translateX(-50%) skewX(${ray.skew}deg)`,
          }}
          animate={{
            opacity: [0.15, 0.4, 0.15],
            scaleX: [0.9, 1.1, 0.9],
          }}
          transition={{
            duration: 5,
            delay: ray.delay,
            repeat: Infinity,
            ease: 'easeInOut'
          }}
        />
      ))}
    </>
  );
});

// Glowing mushroom cluster
const MushroomCluster = memo(function MushroomCluster({
  x,
  y,
  scale,
  isDark
}: {
  x: number;
  y: number;
  scale: number;
  isDark: boolean;
}) {
  const mushrooms = useMemo(() => [
    { offsetX: 0, offsetY: 0, size: 1, hue: 280 },
    { offsetX: -12, offsetY: 5, size: 0.7, hue: 320 },
    { offsetX: 10, offsetY: 3, size: 0.8, hue: 200 },
  ], []);

  return (
    <div
      className="absolute"
      style={{
        left: `${x}%`,
        top: `${y}%`,
        transform: `scale(${scale})`,
        zIndex: Math.floor(y / 10),
      }}
    >
      {mushrooms.map((m, i) => (
        <div
          key={i}
          className="absolute"
          style={{
            left: m.offsetX,
            top: m.offsetY,
            transform: `scale(${m.size})`,
          }}
        >
          {/* Stem */}
          <div
            className="w-3 h-6 mx-auto rounded-b-lg"
            style={{
              background: isDark
                ? 'linear-gradient(to right, #fef3c7, #fde68a, #fef3c7)'
                : 'linear-gradient(to right, #fefce8, #fef9c3, #fefce8)',
              opacity: isDark ? 0.9 : 0.7,
            }}
          />
          {/* Cap */}
          <motion.div
            className="w-10 h-5 -mt-2 rounded-t-full mx-auto"
            style={{
              background: `radial-gradient(ellipse at 50% 80%, hsl(${m.hue}, 80%, ${isDark ? '45%' : '55%'}), hsl(${m.hue}, 70%, ${isDark ? '30%' : '40%'}))`,
              boxShadow: isDark
                ? `0 0 15px 5px hsla(${m.hue}, 80%, 50%, 0.5), inset 0 -2px 4px hsla(${m.hue}, 60%, 60%, 0.3)`
                : 'none',
            }}
            animate={isDark ? {
              boxShadow: [
                `0 0 15px 5px hsla(${m.hue}, 80%, 50%, 0.4)`,
                `0 0 25px 8px hsla(${m.hue}, 80%, 60%, 0.6)`,
                `0 0 15px 5px hsla(${m.hue}, 80%, 50%, 0.4)`,
              ]
            } : {}}
            transition={{ duration: 2 + i * 0.5, repeat: Infinity }}
          />
          {/* Cap spots */}
          <div className="absolute -top-1.5 left-1/2 -translate-x-1/2 flex gap-1">
            <div className="w-1.5 h-1 rounded-full bg-white/40" />
            <div className="w-1 h-1 rounded-full bg-white/30" />
          </div>
        </div>
      ))}
    </div>
  );
});

// Forest floor details - ferns, flowers, grass patches
const ForestFloorDetails = memo(function ForestFloorDetails({ isDark }: { isDark: boolean }) {
  const elements = useMemo(() => ({
    ferns: [
      { x: 12, y: 25, scale: 0.5, flip: false },
      { x: 88, y: 22, scale: 0.45, flip: true },
      { x: 8, y: 55, scale: 0.7, flip: false },
      { x: 92, y: 58, scale: 0.65, flip: true },
      { x: 5, y: 78, scale: 0.9, flip: false },
      { x: 95, y: 82, scale: 0.85, flip: true },
    ],
    flowers: [
      { x: 22, y: 40, color: '#f472b6', scale: 0.6 },
      { x: 78, y: 38, color: '#a78bfa', scale: 0.55 },
      { x: 18, y: 65, color: '#fbbf24', scale: 0.75 },
      { x: 82, y: 68, color: '#f472b6', scale: 0.7 },
      { x: 25, y: 85, color: '#60a5fa', scale: 0.9 },
      { x: 75, y: 88, color: '#a78bfa', scale: 0.85 },
    ],
    grassPatches: [
      { x: 15, y: 30, scale: 0.5 },
      { x: 85, y: 28, scale: 0.45 },
      { x: 10, y: 50, scale: 0.65 },
      { x: 90, y: 52, scale: 0.6 },
      { x: 20, y: 75, scale: 0.8 },
      { x: 80, y: 78, scale: 0.75 },
    ],
  }), []);

  const fernColor = isDark ? '#065f46' : '#16a34a';
  const fernColorLight = isDark ? '#059669' : '#22c55e';
  const grassColor = isDark ? '#047857' : '#22c55e';

  return (
    <>
      {/* Ferns */}
      {elements.ferns.map((fern, i) => (
        <svg
          key={`fern-${i}`}
          className="absolute"
          style={{
            left: `${fern.x}%`,
            top: `${fern.y}%`,
            transform: `scale(${fern.scale}) ${fern.flip ? 'scaleX(-1)' : ''}`,
            opacity: 0.4 + fern.scale * 0.5,
            zIndex: Math.floor(fern.y / 10),
          }}
          width="40" height="35" viewBox="0 0 40 35"
        >
          {/* Fern fronds */}
          <path d="M20 35 Q18 25 15 20 Q10 22 5 20 Q12 18 15 15 Q10 12 8 8 Q15 12 18 12 Q16 8 18 2 Q20 10 22 12 Q25 12 32 8 Q30 12 25 15 Q28 18 35 20 Q30 22 25 20 Q22 25 20 35"
            fill={fernColor} />
          <path d="M20 35 Q19 26 17 21 Q14 22 10 21 Q15 19 17 17 Q14 15 12 12 Q17 14 19 14 Q18 10 19 5 Q20 12 21 14 Q23 14 28 12 Q26 15 23 17 Q25 19 30 21 Q26 22 23 21 Q21 26 20 35"
            fill={fernColorLight} opacity="0.7" />
        </svg>
      ))}

      {/* Wildflowers */}
      {elements.flowers.map((flower, i) => (
        <motion.div
          key={`flower-${i}`}
          className="absolute"
          style={{
            left: `${flower.x}%`,
            top: `${flower.y}%`,
            transform: `scale(${flower.scale})`,
            zIndex: Math.floor(flower.y / 10),
          }}
          animate={{ rotate: [-2, 2, -2] }}
          transition={{ duration: 3 + i * 0.5, repeat: Infinity }}
        >
          <svg width="16" height="24" viewBox="0 0 16 24">
            {/* Stem */}
            <path d="M8 24 Q7 18 8 12" stroke={grassColor} strokeWidth="1.5" fill="none" />
            {/* Leaves */}
            <path d="M8 18 Q4 16 3 18 Q5 17 8 18" fill={grassColor} />
            <path d="M8 20 Q12 18 13 20 Q11 19 8 20" fill={grassColor} />
            {/* Petals */}
            <circle cx="8" cy="8" r="5" fill={flower.color} opacity={isDark ? 0.6 : 0.8} />
            <circle cx="8" cy="8" r="3" fill={flower.color} />
            {/* Center */}
            <circle cx="8" cy="8" r="1.5" fill={isDark ? '#fef08a' : '#fbbf24'} />
          </svg>
        </motion.div>
      ))}

      {/* Grass patches */}
      {elements.grassPatches.map((patch, i) => (
        <motion.svg
          key={`grass-${i}`}
          className="absolute"
          style={{
            left: `${patch.x}%`,
            top: `${patch.y}%`,
            transform: `scale(${patch.scale})`,
            opacity: 0.5 + patch.scale * 0.4,
            zIndex: Math.floor(patch.y / 10),
          }}
          width="30" height="25" viewBox="0 0 30 25"
          animate={{ scaleX: [1, 1.02, 0.98, 1] }}
          transition={{ duration: 4 + i, repeat: Infinity }}
        >
          <path d="M3 25 Q4 15 6 8 Q5 16 3 25" fill={grassColor} />
          <path d="M8 25 Q10 12 11 3 Q10 14 8 25" fill={fernColorLight} />
          <path d="M13 25 Q14 14 16 6 Q15 15 13 25" fill={grassColor} />
          <path d="M18 25 Q20 10 22 2 Q20 12 18 25" fill={fernColorLight} />
          <path d="M23 25 Q24 15 27 7 Q25 16 23 25" fill={grassColor} />
        </motion.svg>
      ))}
    </>
  );
});

function ForestScene({ isDark }: SceneProps) {
  const rnd = seededRandom(1905059208) // fresh per render: identical on server, client, and StrictMode re-invocations
  const config = { horizonY: SCENE_HORIZONS.forest }

  // Tree configurations for the forest surrounding the clearing
  const trees = useMemo(() => ({
    // Far back row - distant silhouette trees (smallest, at horizon)
    farBackRow: [
      { x: -5, scale: 0.18, variant: 'pine' as const },
      { x: 0, scale: 0.22, variant: 'oak' as const },
      { x: 5, scale: 0.2, variant: 'pine' as const },
      { x: 10, scale: 0.24, variant: 'birch' as const },
      { x: 15, scale: 0.19, variant: 'pine' as const },
      { x: 20, scale: 0.23, variant: 'oak' as const },
      { x: 25, scale: 0.21, variant: 'pine' as const },
      { x: 30, scale: 0.25, variant: 'birch' as const },
      { x: 35, scale: 0.2, variant: 'pine' as const },
      // Center gap for clearing view
      { x: 65, scale: 0.21, variant: 'pine' as const },
      { x: 70, scale: 0.24, variant: 'birch' as const },
      { x: 75, scale: 0.19, variant: 'pine' as const },
      { x: 80, scale: 0.23, variant: 'oak' as const },
      { x: 85, scale: 0.2, variant: 'pine' as const },
      { x: 90, scale: 0.25, variant: 'birch' as const },
      { x: 95, scale: 0.22, variant: 'pine' as const },
      { x: 100, scale: 0.24, variant: 'oak' as const },
      { x: 105, scale: 0.19, variant: 'pine' as const },
    ],
    // Back row - larger background trees
    backRow: [
      { x: -8, scale: 0.38, variant: 'oak' as const },
      { x: -2, scale: 0.42, variant: 'pine' as const },
      { x: 5, scale: 0.35, variant: 'birch' as const },
      { x: 12, scale: 0.4, variant: 'pine' as const },
      { x: 18, scale: 0.36, variant: 'oak' as const },
      { x: 25, scale: 0.44, variant: 'pine' as const },
      { x: 32, scale: 0.38, variant: 'willow' as const },
      // Gap for clearing center
      { x: 68, scale: 0.36, variant: 'willow' as const },
      { x: 75, scale: 0.42, variant: 'pine' as const },
      { x: 82, scale: 0.38, variant: 'oak' as const },
      { x: 88, scale: 0.4, variant: 'pine' as const },
      { x: 95, scale: 0.35, variant: 'birch' as const },
      { x: 102, scale: 0.44, variant: 'pine' as const },
      { x: 108, scale: 0.4, variant: 'oak' as const },
    ],
    // Middle row - medium trees
    middleRow: [
      { x: -8, scale: 0.55, variant: 'oak' as const, flip: false },
      { x: 0, scale: 0.6, variant: 'pine' as const, flip: false },
      { x: 8, scale: 0.52, variant: 'willow' as const, flip: false },
      { x: 16, scale: 0.58, variant: 'pine' as const, flip: false },
      { x: 24, scale: 0.54, variant: 'birch' as const, flip: false },
      // Gap for clearing
      { x: 76, scale: 0.56, variant: 'birch' as const, flip: true },
      { x: 84, scale: 0.6, variant: 'pine' as const, flip: true },
      { x: 92, scale: 0.54, variant: 'willow' as const, flip: true },
      { x: 100, scale: 0.58, variant: 'pine' as const, flip: true },
      { x: 108, scale: 0.52, variant: 'oak' as const, flip: true },
    ],
    // Front row - largest trees, framing the scene
    frontRow: [
      { x: -10, scale: 0.95, variant: 'oak' as const, flip: false },
      { x: 2, scale: 0.85, variant: 'pine' as const, flip: false },
      { x: 12, scale: 0.78, variant: 'willow' as const, flip: false },
      { x: 22, scale: 0.82, variant: 'pine' as const, flip: false },
      // Gap for clearing
      { x: 78, scale: 0.8, variant: 'pine' as const, flip: true },
      { x: 88, scale: 0.76, variant: 'willow' as const, flip: true },
      { x: 98, scale: 0.88, variant: 'pine' as const, flip: true },
      { x: 110, scale: 0.98, variant: 'oak' as const, flip: true },
    ],
  }), []);

  // Mushroom cluster positions
  const mushroomClusters = useMemo(() => [
    { x: 10, y: 35, scale: 0.5 },
    { x: 90, y: 32, scale: 0.45 },
    { x: 8, y: 60, scale: 0.7 },
    { x: 92, y: 62, scale: 0.65 },
    { x: 15, y: 80, scale: 0.85 },
    { x: 85, y: 82, scale: 0.8 },
  ], []);

  return (
    <div className="absolute inset-0 overflow-hidden">
      {/* Sky/Canopy backdrop */}
      <div className="absolute left-0 right-0 top-0" style={{ height: `${config.horizonY}%` }}>
        {/* Sky gradient - blue for day, sunset/purple for night */}
        <div
          className="absolute inset-0"
          style={{
            background: isDark
              ? 'linear-gradient(to bottom, #0f0a1e 0%, #1a1035 15%, #2d1b4e 30%, #4a2c6a 50%, #6b3d5c 70%, #1a3a2a 100%)'
              : 'linear-gradient(to bottom, #60a5fa 0%, #38bdf8 20%, #7dd3fc 40%, #bae6fd 60%, #e0f2fe 80%, #bbf7d0 100%)',
          }}
        />

        {/* Sun glow (day) */}
        {!isDark && (
          <div
            className="absolute top-[5%] left-1/2 -translate-x-1/2 w-32 h-32 rounded-full"
            style={{
              background: 'radial-gradient(circle, rgba(253, 224, 71, 0.6) 0%, rgba(251, 191, 36, 0.3) 30%, transparent 70%)',
              boxShadow: '0 0 80px 40px rgba(253, 224, 71, 0.3)',
            }}
          />
        )}

        {/* Sunset glow at horizon (night) */}
        {isDark && (
          <div
            className="absolute bottom-0 left-0 right-0 h-[40%]"
            style={{
              background: 'linear-gradient(to top, rgba(107, 61, 92, 0.5) 0%, rgba(74, 44, 106, 0.3) 50%, transparent 100%)',
            }}
          />
        )}

        {/* Stars visible through canopy gaps (night) */}
        {isDark && <StarField count={40} maxTop={70} />}

        {/* Moon (night) */}
        {isDark && (
          <motion.div
            className="absolute top-[8%] right-[20%] w-10 h-10 rounded-full"
            style={{
              background: 'radial-gradient(circle at 30% 30%, #fef9c3 0%, #fde68a 50%, #fcd34d 100%)',
              boxShadow: '0 0 40px 15px rgba(254, 249, 195, 0.4), 0 0 80px 30px rgba(254, 240, 138, 0.2)',
            }}
            animate={{ opacity: [0.8, 1, 0.8] }}
            transition={{ duration: 6, repeat: Infinity }}
          />
        )}

        {/* Light canopy overlay - semi-transparent to show sky */}
        <div
          className={`absolute inset-0 ${isDark ? 'opacity-60' : 'opacity-40'}`}
          style={{
            background: isDark
              ? 'radial-gradient(ellipse at 50% 150%, #022c22 0%, #064e3b 30%, transparent 70%)'
              : 'radial-gradient(ellipse at 50% 150%, #15803d 0%, #22c55e 30%, transparent 70%)',
          }}
        />

        {/* Canopy leaf texture - sparse to show more sky */}
        <svg className="absolute inset-0 w-full h-full" preserveAspectRatio="none">
          {useMemo(() => Array.from({ length: 18 }, (_, i) => {
            const x = (i % 6) * 20 + rnd() * 10;
            const y = Math.floor(i / 6) * 35 + rnd() * 10;
            return (
              <ellipse
                key={i}
                cx={`${x}%`}
                cy={`${y}%`}
                rx="10%"
                ry="12%"
                fill={isDark ? '#052e16' : '#166534'}
                opacity={0.25 + rnd() * 0.25}
              />
            );
          }), [isDark])}
        </svg>

        {/* Sun rays through canopy (day) */}
        {!isDark && <SunRays />}

        {/* Far back row trees (distant silhouettes at horizon) */}
        <div className="absolute bottom-0 left-0 right-0 h-[60%]">
          {trees.farBackRow.map((tree, i) => (
            <ForestTree key={`farback-${i}`} x={tree.x} scale={tree.scale} variant={tree.variant} isDark={isDark} />
          ))}
        </div>

        {/* Back row trees (larger, in front of far back) */}
        <div className="absolute bottom-0 left-0 right-0 h-[80%]">
          {trees.backRow.map((tree, i) => (
            <ForestTree key={`back-${i}`} x={tree.x} scale={tree.scale} variant={tree.variant} isDark={isDark} />
          ))}
        </div>
      </div>

      {/* Forest floor - the magical clearing */}
      <div className="absolute left-0 right-0 bottom-0" style={{ top: `${config.horizonY}%` }}>
        {/* Base ground with moss gradient */}
        <div className={`absolute inset-0 ${
          isDark
            ? 'bg-gradient-to-b from-emerald-950 via-green-950 to-slate-950'
            : 'bg-gradient-to-b from-emerald-400 via-green-500 to-emerald-600'
        }`} />

        {/* Clearing spotlight effect - lighter center */}
        <div
          className="absolute inset-0"
          style={{
            background: isDark
              ? 'radial-gradient(ellipse at 50% 30%, rgba(16, 185, 129, 0.15) 0%, transparent 50%)'
              : 'radial-gradient(ellipse at 50% 30%, rgba(254, 249, 195, 0.4) 0%, transparent 50%)',
          }}
        />

        {/* Ground texture - moss and grass */}
        <div
          className={`absolute inset-0 ${isDark ? 'opacity-15' : 'opacity-20'}`}
          style={{
            backgroundImage: `
              radial-gradient(circle at 20% 30%, ${isDark ? '#22c55e' : '#16a34a'} 1px, transparent 1px),
              radial-gradient(circle at 80% 60%, ${isDark ? '#22c55e' : '#16a34a'} 1px, transparent 1px),
              radial-gradient(circle at 40% 80%, ${isDark ? '#22c55e' : '#16a34a'} 1px, transparent 1px)
            `,
            backgroundSize: '60px 60px, 80px 80px, 50px 50px',
          }}
        />

        {/* Fallen leaves scattered on ground */}
        {useMemo(() => Array.from({ length: 15 }, (_, i) => (
          <motion.div
            key={`leaf-${i}`}
            className="absolute rounded-full"
            style={{
              left: `${10 + rnd() * 80}%`,
              top: `${20 + rnd() * 60}%`,
              width: 4 + rnd() * 4,
              height: 3 + rnd() * 3,
              background: isDark
                ? ['#713f12', '#854d0e', '#92400e'][Math.floor(rnd() * 3)]
                : ['#ca8a04', '#eab308', '#facc15'][Math.floor(rnd() * 3)],
              opacity: 0.3 + rnd() * 0.3,
              transform: `rotate(${rnd() * 360}deg)`,
            }}
            animate={{ rotate: [0, 5, -5, 0] }}
            transition={{ duration: 8 + rnd() * 4, repeat: Infinity, delay: rnd() * 5 }}
          />
        )), [isDark])}

        {/* Middle row trees */}
        {trees.middleRow.map((tree, i) => (
          <ForestTree
            key={`mid-${i}`}
            x={tree.x}
            scale={tree.scale}
            variant={tree.variant}
            isDark={isDark}
            flip={tree.flip}
          />
        ))}

        {/* Forest floor details - ferns, flowers, grass */}
        <ForestFloorDetails isDark={isDark} />

        {/* Glowing mushroom clusters */}
        {mushroomClusters.map((cluster, i) => (
          <MushroomCluster
            key={`mushroom-${i}`}
            x={cluster.x}
            y={cluster.y}
            scale={cluster.scale}
            isDark={isDark}
          />
        ))}

        {/* Front row trees - framing the scene */}
        {trees.frontRow.map((tree, i) => (
          <ForestTree
            key={`front-${i}`}
            x={tree.x}
            scale={tree.scale}
            variant={tree.variant}
            isDark={isDark}
            flip={tree.flip}
          />
        ))}

        {/* Deer in the clearing (day) */}
        {!isDark && (
          <motion.div
            className="absolute"
            style={{
              top: '35%',
              left: '60%',
              zIndex: 5,
            }}
            animate={{ x: [-10, 10, -10], y: [0, -3, 0] }}
            transition={{ duration: 8, repeat: Infinity }}
          >
            <svg width="50" height="45" viewBox="0 0 50 45">
              {/* Body */}
              <ellipse cx="25" cy="30" rx="15" ry="10" fill="#a16207" />
              {/* Neck */}
              <path d="M32 25 Q38 15 35 8" stroke="#a16207" strokeWidth="6" fill="none" />
              {/* Head */}
              <ellipse cx="35" cy="8" rx="6" ry="5" fill="#ca8a04" />
              {/* Ear */}
              <ellipse cx="38" cy="4" rx="2" ry="4" fill="#ca8a04" />
              {/* Eye */}
              <circle cx="33" cy="7" r="1" fill="#1c1917" />
              {/* Legs */}
              <path d="M15 38 L15 45" stroke="#854d0e" strokeWidth="2" />
              <path d="M20 38 L20 45" stroke="#854d0e" strokeWidth="2" />
              <path d="M30 38 L30 45" stroke="#854d0e" strokeWidth="2" />
              <path d="M35 38 L35 45" stroke="#854d0e" strokeWidth="2" />
              {/* Tail */}
              <ellipse cx="10" cy="28" rx="3" ry="2" fill="#fef3c7" />
            </svg>
          </motion.div>
        )}

        {/* Fox in the clearing (night) */}
        {isDark && (
          <motion.div
            className="absolute"
            style={{
              top: '45%',
              left: '35%',
              zIndex: 5,
            }}
            animate={{ rotate: [-2, 2, -2] }}
            transition={{ duration: 4, repeat: Infinity }}
          >
            <svg width="40" height="30" viewBox="0 0 40 30">
              {/* Body */}
              <ellipse cx="20" cy="22" rx="12" ry="7" fill="#ea580c" />
              {/* Tail */}
              <path d="M8 22 Q2 18 0 22 Q2 24 8 22" fill="#ea580c" />
              <path d="M2 22 Q1 21 0 22 Q1 23 2 22" fill="#fef3c7" />
              {/* Head */}
              <ellipse cx="30" cy="18" rx="7" ry="6" fill="#f97316" />
              {/* Snout */}
              <ellipse cx="36" cy="20" rx="4" ry="3" fill="#fef3c7" />
              <circle cx="38" cy="19" r="1" fill="#1c1917" />
              {/* Ears */}
              <path d="M26 12 L24 6 L28 10 Z" fill="#f97316" />
              <path d="M32 12 L34 6 L30 10 Z" fill="#f97316" />
              <path d="M26 11 L25 8 L27 10 Z" fill="#1c1917" />
              <path d="M32 11 L33 8 L31 10 Z" fill="#1c1917" />
              {/* Eyes */}
              <ellipse cx="28" cy="17" rx="1.5" ry="2" fill="#fef08a">
                <animate attributeName="ry" values="2;0.5;2" dur="4s" repeatCount="indefinite" />
              </ellipse>
              {/* Legs */}
              <path d="M14 28 L14 30" stroke="#c2410c" strokeWidth="2" />
              <path d="M26 28 L26 30" stroke="#c2410c" strokeWidth="2" />
            </svg>
          </motion.div>
        )}

        {/* Owl in tree (night) */}
        {isDark && (
          <motion.div
            className="absolute"
            style={{ top: '15%', left: '12%', zIndex: 20 }}
            animate={{ rotate: [-5, 5, -5], y: [0, -2, 0] }}
            transition={{ duration: 5, repeat: Infinity }}
          >
            <svg width="28" height="35" viewBox="0 0 28 35">
              {/* Body */}
              <ellipse cx="14" cy="24" rx="10" ry="11" fill="#78716c" />
              {/* Chest */}
              <ellipse cx="14" cy="26" rx="6" ry="8" fill="#a8a29e" />
              {/* Chest pattern */}
              <path d="M11 22 L14 24 L17 22" stroke="#57534e" strokeWidth="0.5" fill="none" />
              <path d="M10 25 L14 27 L18 25" stroke="#57534e" strokeWidth="0.5" fill="none" />
              <path d="M11 28 L14 30 L17 28" stroke="#57534e" strokeWidth="0.5" fill="none" />
              {/* Head */}
              <ellipse cx="14" cy="10" rx="9" ry="8" fill="#78716c" />
              {/* Ear tufts */}
              <path d="M6 5 L4 0 L8 4 Z" fill="#57534e" />
              <path d="M22 5 L24 0 L20 4 Z" fill="#57534e" />
              {/* Face disc */}
              <ellipse cx="14" cy="11" rx="7" ry="6" fill="#d6d3d1" />
              {/* Eyes */}
              <circle cx="10" cy="10" r="3" fill="#1c1917" />
              <circle cx="18" cy="10" r="3" fill="#1c1917" />
              <motion.circle
                cx="10" cy="10" r="2"
                fill="#fef08a"
                animate={{ scale: [1, 1.25, 1] }}
                transition={{ duration: 3, repeat: Infinity }}
                style={{ transformOrigin: '10px 10px' }}
              />
              <motion.circle
                cx="18" cy="10" r="2"
                fill="#fef08a"
                animate={{ scale: [1, 1.25, 1] }}
                transition={{ duration: 3, repeat: Infinity, delay: 0.5 }}
                style={{ transformOrigin: '18px 10px' }}
              />
              <circle cx="10" cy="10" r="1" fill="#1c1917" />
              <circle cx="18" cy="10" r="1" fill="#1c1917" />
              {/* Beak */}
              <path d="M14 12 L12 15 L14 14 L16 15 Z" fill="#f59e0b" />
            </svg>
          </motion.div>
        )}
      </div>

      {/* Magical particles floating throughout */}
      <MagicalParticles isDark={isDark} />

      {/* Butterflies (day) */}
      {!isDark && Array.from({ length: 5 }, (_, i) => (
        <motion.div
          key={`butterfly-${i}`}
          className="absolute pointer-events-none"
          style={{
            left: `${20 + i * 15}%`,
            top: `${30 + (i % 3) * 15}%`,
            zIndex: 30,
          }}
          animate={{
            x: [0, 40, -20, 30, 0],
            y: [0, -30, 20, -10, 0],
            rotate: [0, 10, -10, 5, 0],
          }}
          transition={{ duration: 12 + i * 2, repeat: Infinity, delay: i * 1.5 }}
        >
          <svg width="20" height="16" viewBox="0 0 20 16">
            <motion.g
              animate={{ scaleY: [1, 0.3, 1] }}
              transition={{ duration: 0.3, repeat: Infinity }}
            >
              {/* Left wing */}
              <ellipse cx="6" cy="8" rx="5" ry="6" fill={['#f472b6', '#a78bfa', '#60a5fa', '#34d399', '#fbbf24'][i % 5]} opacity="0.8" />
              {/* Right wing */}
              <ellipse cx="14" cy="8" rx="5" ry="6" fill={['#f472b6', '#a78bfa', '#60a5fa', '#34d399', '#fbbf24'][i % 5]} opacity="0.8" />
            </motion.g>
            {/* Body */}
            <ellipse cx="10" cy="8" rx="1" ry="5" fill="#1c1917" />
          </svg>
        </motion.div>
      ))}

      {/* Mystical fog near ground (night) */}
      {isDark && (
        <>
          <motion.div
            className="absolute bottom-0 left-0 right-0 h-[25%] pointer-events-none"
            style={{
              background: 'linear-gradient(to top, rgba(16, 185, 129, 0.15) 0%, transparent 100%)',
            }}
            animate={{ opacity: [0.3, 0.5, 0.3] }}
            transition={{ duration: 8, repeat: Infinity }}
          />
          <motion.div
            className="absolute bottom-[5%] left-[10%] w-[30%] h-[15%] rounded-full pointer-events-none"
            style={{
              background: 'radial-gradient(ellipse, rgba(167, 139, 250, 0.2) 0%, transparent 70%)',
            }}
            animate={{ x: [0, 20, 0], opacity: [0.2, 0.4, 0.2] }}
            transition={{ duration: 12, repeat: Infinity }}
          />
          <motion.div
            className="absolute bottom-[8%] right-[15%] w-[25%] h-[12%] rounded-full pointer-events-none"
            style={{
              background: 'radial-gradient(ellipse, rgba(34, 211, 238, 0.15) 0%, transparent 70%)',
            }}
            animate={{ x: [0, -15, 0], opacity: [0.15, 0.35, 0.15] }}
            transition={{ duration: 10, repeat: Infinity, delay: 3 }}
          />
        </>
      )}
    </div>
  );
}

// ============================================
// STUDIO SCENE - Professional Recording Studio
// ============================================

// Mixing console component
const MixingConsole = memo(function MixingConsole({ isDark, scale }: { isDark: boolean; scale: number }) {
  const rnd = seededRandom(950563628) // fresh per render: identical on server, client, and StrictMode re-invocations
  const consoleColor = isDark ? '#27272a' : '#3f3f46';
  const faderColor = isDark ? '#52525b' : '#71717a';
  const ledGreen = '#22c55e';
  const ledYellow = '#eab308';
  const ledRed = '#ef4444';

  return (
    <div style={{ transform: `scale(${scale})` }}>
      <svg width="200" height="80" viewBox="0 0 200 80">
        {/* Console body */}
        <rect x="0" y="20" width="200" height="60" rx="4" fill={consoleColor} />
        <rect x="5" y="25" width="190" height="50" rx="2" fill={isDark ? '#1c1c1e' : '#52525b'} />

        {/* Channel strips */}
        {Array.from({ length: 12 }).map((_, i) => (
          <g key={i} transform={`translate(${12 + i * 15}, 30)`}>
            {/* Fader track */}
            <rect x="0" y="0" width="8" height="40" rx="1" fill={isDark ? '#0a0a0a' : '#27272a'} />
            {/* Fader knob */}
            <motion.rect
              x="-1"
              width="10"
              height="8"
              rx="1"
              fill={faderColor}
              animate={{ y: [10 + rnd() * 15, 5 + rnd() * 20, 10 + rnd() * 15] }}
              transition={{ duration: 2 + rnd(), repeat: Infinity, delay: i * 0.1 }}
            />
            {/* LED meter */}
            {[0, 1, 2, 3, 4].map((led) => (
              <motion.rect
                key={led}
                x="10"
                y={32 - led * 7}
                width="3"
                height="5"
                rx="0.5"
                fill={led < 3 ? ledGreen : led < 4 ? ledYellow : ledRed}
                animate={{ opacity: [0.2, led < 3 ? 1 : led < 4 ? 0.8 : 0.6, 0.2] }}
                transition={{ duration: 0.3, repeat: Infinity, delay: i * 0.05 + led * 0.05 }}
              />
            ))}
          </g>
        ))}

        {/* Master section */}
        <rect x="185" y="28" width="10" height="44" rx="2" fill={isDark ? '#dc2626' : '#ef4444'} opacity="0.8" />
      </svg>
    </div>
  );
});

// Studio speaker/monitor component
const StudioMonitor = memo(function StudioMonitor({
  x,
  y,
  scale,
  side,
  isDark,
}: {
  x: number;
  y: number;
  scale: number;
  side: 'left' | 'right';
  isDark: boolean;
}) {
  return (
    <div
      className="absolute"
      style={{
        left: `${x}%`,
        top: `${y}%`,
        transform: `scale(${scale}) ${side === 'right' ? 'scaleX(-1)' : ''}`,
        zIndex: Math.floor(y / 10),
      }}
    >
      <svg width="50" height="80" viewBox="0 0 50 80">
        {/* Speaker cabinet */}
        <rect x="2" y="0" width="46" height="80" rx="3" fill={isDark ? '#18181b' : '#27272a'} />
        <rect x="5" y="3" width="40" height="74" rx="2" fill={isDark ? '#0a0a0a' : '#1c1c1e'} />

        {/* Tweeter */}
        <circle cx="25" cy="18" r="8" fill={isDark ? '#27272a' : '#3f3f46'} />
        <circle cx="25" cy="18" r="5" fill={isDark ? '#52525b' : '#71717a'} />
        <motion.circle
          cx="25"
          cy="18"
          r="3"
          fill={isDark ? '#a1a1aa' : '#d4d4d8'}
          animate={{ scale: [1, 1.1, 1] }}
          transition={{ duration: 0.1, repeat: Infinity }}
        />

        {/* Woofer */}
        <circle cx="25" cy="52" r="18" fill={isDark ? '#27272a' : '#3f3f46'} />
        <circle cx="25" cy="52" r="14" fill={isDark ? '#3f3f46' : '#52525b'} />
        <motion.circle
          cx="25"
          cy="52"
          r="10"
          fill={isDark ? '#52525b' : '#71717a'}
          animate={{ scale: [1, 1.02, 1] }}
          transition={{ duration: 0.15, repeat: Infinity }}
        />
        <circle cx="25" cy="52" r="4" fill={isDark ? '#71717a' : '#a1a1aa'} />

        {/* Power LED */}
        <motion.circle
          cx="25"
          cy="75"
          r="2"
          fill="#22c55e"
          animate={{ opacity: [0.6, 1, 0.6] }}
          transition={{ duration: 2, repeat: Infinity }}
        />
      </svg>
    </div>
  );
});

// Stage light / spotlight component
const StageLight = memo(function StageLight({
  x,
  color,
  intensity,
  isDark,
}: {
  x: number;
  color: string;
  intensity: number;
  isDark: boolean;
}) {
  const rnd = seededRandom(180349508 + Math.round(x * 1013)) // fresh per render: identical on server, client, and StrictMode re-invocations
  return (
    <div
      className="absolute top-0"
      style={{ left: `${x}%`, transform: 'translateX(-50%)' }}
    >
      {/* Light fixture */}
      <div
        className="w-8 h-6 rounded-b-lg"
        style={{
          background: isDark ? '#27272a' : '#3f3f46',
          boxShadow: `0 4px 20px ${color}${Math.round(intensity * 255).toString(16).padStart(2, '0')}`,
        }}
      />
      {/* Light beam */}
      <motion.div
        className="absolute top-6 left-1/2 -translate-x-1/2"
        style={{
          width: 0,
          height: 0,
          borderLeft: '40px solid transparent',
          borderRight: '40px solid transparent',
          borderTop: `120px solid ${color}`,
          opacity: isDark ? intensity * 0.4 : intensity * 0.2,
          filter: 'blur(10px)',
        }}
        animate={{
          opacity: isDark ? [intensity * 0.3, intensity * 0.5, intensity * 0.3] : [intensity * 0.15, intensity * 0.25, intensity * 0.15],
        }}
        transition={{ duration: 3 + rnd() * 2, repeat: Infinity }}
      />
    </div>
  );
});

// Instrument stand (guitar/keyboard)
const InstrumentStand = memo(function InstrumentStand({
  x,
  y,
  type,
  scale,
  isDark,
}: {
  x: number;
  y: number;
  type: 'guitar' | 'keyboard' | 'drums';
  scale: number;
  isDark: boolean;
}) {
  return (
    <div
      className="absolute"
      style={{
        left: `${x}%`,
        top: `${y}%`,
        transform: `scale(${scale})`,
        zIndex: Math.floor(y / 10),
        opacity: 0.6 + scale * 0.3,
      }}
    >
      {type === 'guitar' && (
        <svg width="30" height="70" viewBox="0 0 30 70">
          {/* Stand */}
          <path d="M15 70 L15 45" stroke={isDark ? '#52525b' : '#71717a'} strokeWidth="2" />
          <path d="M5 70 L15 60 L25 70" stroke={isDark ? '#52525b' : '#71717a'} strokeWidth="2" fill="none" />
          {/* Guitar body */}
          <ellipse cx="15" cy="35" rx="12" ry="8" fill={isDark ? '#92400e' : '#b45309'} />
          <ellipse cx="15" cy="28" rx="10" ry="6" fill={isDark ? '#78350f' : '#92400e'} />
          <circle cx="15" cy="32" r="3" fill={isDark ? '#1c1917' : '#292524'} />
          {/* Neck */}
          <rect x="13" y="5" width="4" height="25" fill={isDark ? '#78350f' : '#92400e'} />
          <rect x="12" y="0" width="6" height="6" rx="1" fill={isDark ? '#52525b' : '#71717a'} />
        </svg>
      )}
      {type === 'keyboard' && (
        <svg width="80" height="40" viewBox="0 0 80 40">
          {/* Stand legs */}
          <path d="M10 40 L15 25" stroke={isDark ? '#52525b' : '#71717a'} strokeWidth="2" />
          <path d="M70 40 L65 25" stroke={isDark ? '#52525b' : '#71717a'} strokeWidth="2" />
          {/* Keyboard body */}
          <rect x="5" y="10" width="70" height="18" rx="2" fill={isDark ? '#18181b' : '#27272a'} />
          {/* White keys */}
          {Array.from({ length: 14 }).map((_, i) => (
            <rect key={i} x={8 + i * 5} y="14" width="4" height="12" rx="0.5" fill="#fafafa" />
          ))}
          {/* Black keys */}
          {[0, 1, 3, 4, 5, 7, 8, 10, 11, 12].map((i) => (
            <rect key={i} x={11 + i * 5} y="14" width="3" height="7" rx="0.5" fill="#18181b" />
          ))}
        </svg>
      )}
      {type === 'drums' && (
        <svg width="60" height="50" viewBox="0 0 60 50">
          {/* Hi-hat */}
          <ellipse cx="10" cy="15" rx="8" ry="3" fill={isDark ? '#a1a1aa' : '#d4d4d8'} />
          <path d="M10 18 L10 45" stroke={isDark ? '#52525b' : '#71717a'} strokeWidth="1.5" />
          {/* Snare */}
          <ellipse cx="30" cy="35" rx="12" ry="5" fill={isDark ? '#52525b' : '#71717a'} />
          <rect x="18" y="35" width="24" height="10" fill={isDark ? '#dc2626' : '#ef4444'} />
          <ellipse cx="30" cy="45" rx="12" ry="4" fill={isDark ? '#52525b' : '#71717a'} />
          {/* Cymbal */}
          <ellipse cx="50" cy="12" rx="10" ry="4" fill={isDark ? '#fbbf24' : '#fcd34d'} />
          <path d="M50 16 L50 45" stroke={isDark ? '#52525b' : '#71717a'} strokeWidth="1.5" />
        </svg>
      )}
    </div>
  );
});

// Vinyl record / turntable
const Turntable = memo(function Turntable({ x, y, scale, isDark }: { x: number; y: number; scale: number; isDark: boolean }) {
  return (
    <motion.div
      className="absolute"
      style={{
        left: `${x}%`,
        top: `${y}%`,
        transform: `scale(${scale})`,
        zIndex: Math.floor(y / 10),
      }}
    >
      <svg width="50" height="50" viewBox="0 0 50 50">
        {/* Turntable base */}
        <rect x="0" y="5" width="50" height="40" rx="3" fill={isDark ? '#18181b' : '#27272a'} />
        {/* Platter */}
        <motion.g
          animate={{ rotate: 360 }}
          transition={{ duration: 2, repeat: Infinity, ease: 'linear' }}
          style={{ transformOrigin: '25px 25px' }}
        >
          <circle cx="25" cy="25" r="18" fill={isDark ? '#0a0a0a' : '#1c1c1e'} />
          {/* Vinyl grooves */}
          {[14, 11, 8, 5].map((r, i) => (
            <circle key={i} cx="25" cy="25" r={r} fill="none" stroke={isDark ? '#27272a' : '#3f3f46'} strokeWidth="0.5" />
          ))}
          {/* Label */}
          <circle cx="25" cy="25" r="5" fill={isDark ? '#dc2626' : '#ef4444'} />
        </motion.g>
        {/* Tonearm */}
        <path d="M42 10 L42 20 L30 28" stroke={isDark ? '#a1a1aa' : '#d4d4d8'} strokeWidth="1.5" fill="none" />
        <circle cx="42" cy="10" r="3" fill={isDark ? '#52525b' : '#71717a'} />
      </svg>
    </motion.div>
  );
});

function StudioScene({ isDark }: SceneProps) {
  const rnd = seededRandom(979054805) // fresh per render: identical on server, client, and StrictMode re-invocations
  const config = { horizonY: SCENE_HORIZONS.studio }

  // Stage light configurations
  const stageLights = useMemo(() => [
    { x: 15, color: '#8b5cf6', intensity: 0.7 },
    { x: 30, color: '#ec4899', intensity: 0.6 },
    { x: 50, color: '#22d3ee', intensity: 0.8 },
    { x: 70, color: '#ec4899', intensity: 0.6 },
    { x: 85, color: '#8b5cf6', intensity: 0.7 },
  ], []);

  // Instruments and equipment
  const instruments = useMemo(() => [
    { x: 12, y: 35, type: 'guitar' as const, scale: 0.5 },
    { x: 88, y: 38, type: 'guitar' as const, scale: 0.55 },
    { x: 15, y: 60, type: 'keyboard' as const, scale: 0.6 },
    { x: 85, y: 65, type: 'drums' as const, scale: 0.65 },
  ], []);

  return (
    <div className="absolute inset-0 overflow-hidden">
      {/* Back wall */}
      <div className="absolute left-0 right-0 top-0" style={{ height: `${config.horizonY}%` }}>
        {/* Wall gradient */}
        <div
          className="absolute inset-0"
          style={{
            background: isDark
              ? 'linear-gradient(to bottom, #0a0a0a 0%, #18181b 30%, #27272a 70%, #3f3f46 100%)'
              : 'linear-gradient(to bottom, #27272a 0%, #3f3f46 30%, #52525b 70%, #71717a 100%)',
          }}
        />

        {/* Acoustic panels - detailed foam pattern */}
        <div className="absolute inset-0 opacity-30">
          {useMemo(() => Array.from({ length: 8 }).map((_, row) => (
            <div key={row} className="flex justify-around" style={{ marginTop: row === 0 ? '5%' : '2%' }}>
              {Array.from({ length: 6 }).map((_, col) => (
                <div
                  key={col}
                  className="rounded"
                  style={{
                    width: '12%',
                    height: 20,
                    background: isDark
                      ? `linear-gradient(135deg, #27272a 25%, #1c1c1e 50%, #27272a 75%)`
                      : `linear-gradient(135deg, #52525b 25%, #3f3f46 50%, #52525b 75%)`,
                    boxShadow: 'inset 0 2px 4px rgba(0,0,0,0.3)',
                  }}
                />
              ))}
            </div>
          )), [isDark])}
        </div>

        {/* Neon accent strips */}
        <motion.div
          className="absolute top-0 left-0 right-0 h-1"
          style={{
            background: 'linear-gradient(90deg, #8b5cf6, #ec4899, #22d3ee, #ec4899, #8b5cf6)',
          }}
          animate={{
            boxShadow: [
              '0 0 20px #8b5cf6, 0 0 40px #8b5cf680',
              '0 0 30px #ec4899, 0 0 60px #ec489980',
              '0 0 20px #22d3ee, 0 0 40px #22d3ee80',
              '0 0 30px #ec4899, 0 0 60px #ec489980',
              '0 0 20px #8b5cf6, 0 0 40px #8b5cf680',
            ],
          }}
          transition={{ duration: 4, repeat: Infinity }}
        />

        {/* Large studio monitors on back wall */}
        <StudioMonitor x={12} y={25} scale={0.8} side="left" isDark={isDark} />
        <StudioMonitor x={88} y={25} scale={0.8} side="right" isDark={isDark} />

        {/* LED VU meter display */}
        <div className="absolute bottom-[15%] left-1/2 -translate-x-1/2">
          <div
            className="flex gap-4 p-3 rounded-lg"
            style={{
              background: isDark ? '#0a0a0a' : '#18181b',
              border: `1px solid ${isDark ? '#27272a' : '#3f3f46'}`,
            }}
          >
            {[0, 1].map((ch) => (
              <div key={ch} className="flex gap-1">
                {Array.from({ length: 16 }).map((_, i) => (
                  <motion.div
                    key={i}
                    className="w-2 h-8 rounded-sm"
                    style={{
                      background: i < 10 ? '#22c55e' : i < 14 ? '#eab308' : '#ef4444',
                    }}
                    animate={{
                      opacity: [0.2, i < 8 + rnd() * 6 ? 1 : 0.2, 0.2],
                      scaleY: [0.3, i < 10 ? 1 : 0.6, 0.3],
                    }}
                    transition={{
                      duration: 0.2 + rnd() * 0.3,
                      repeat: Infinity,
                      delay: ch * 0.1 + i * 0.02,
                    }}
                  />
                ))}
              </div>
            ))}
          </div>
        </div>

        {/* Stage lights */}
        {stageLights.map((light, i) => (
          <StageLight key={i} {...light} isDark={isDark} />
        ))}
      </div>

      {/* Stage floor */}
      <div className="absolute left-0 right-0 bottom-0" style={{ top: `${config.horizonY}%` }}>
        {/* Polished wood floor */}
        <div
          className="absolute inset-0"
          style={{
            background: isDark
              ? 'linear-gradient(to bottom, #1c1917 0%, #0c0a09 50%, #0a0908 100%)'
              : 'linear-gradient(to bottom, #44403c 0%, #292524 50%, #1c1917 100%)',
          }}
        />

        {/* Floor reflection/shine */}
        <div
          className="absolute inset-0 opacity-10"
          style={{
            background: 'linear-gradient(to bottom, rgba(255,255,255,0.1) 0%, transparent 30%)',
          }}
        />

        {/* Perspective floor lines */}
        <svg className="absolute inset-0 w-full h-full opacity-15" preserveAspectRatio="none">
          {/* Horizontal planks */}
          {[0.1, 0.22, 0.38, 0.58, 0.82].map((y, i) => (
            <line
              key={`h-${i}`}
              x1="0%"
              x2="100%"
              y1={`${y * 100}%`}
              y2={`${y * 100}%`}
              stroke={isDark ? '#44403c' : '#57534e'}
              strokeWidth="1"
            />
          ))}
          {/* Vertical perspective lines */}
          {[-60, -35, -15, 0, 15, 35, 60].map((offset, i) => (
            <line
              key={`v-${i}`}
              x1="50%"
              y1="0%"
              x2={`${50 + offset}%`}
              y2="100%"
              stroke={isDark ? '#44403c' : '#57534e'}
              strokeWidth="0.5"
            />
          ))}
        </svg>

        {/* Stage edge LED strip */}
        <motion.div
          className="absolute top-0 left-[5%] right-[5%] h-1 rounded-full"
          style={{
            background: 'linear-gradient(90deg, #8b5cf6, #ec4899, #22d3ee, #ec4899, #8b5cf6)',
          }}
          animate={{
            boxShadow: [
              '0 0 10px #8b5cf6, 0 0 20px #8b5cf680',
              '0 0 15px #22d3ee, 0 0 30px #22d3ee80',
              '0 0 10px #8b5cf6, 0 0 20px #8b5cf680',
            ],
          }}
          transition={{ duration: 2, repeat: Infinity }}
        />

        {/* Mixing console */}
        <div className="absolute bottom-[10%] left-1/2 -translate-x-1/2">
          <MixingConsole isDark={isDark} scale={0.8} />
        </div>

        {/* Instruments */}
        {instruments.map((inst, i) => (
          <InstrumentStand key={i} {...inst} isDark={isDark} />
        ))}

        {/* Turntables */}
        <Turntable x={25} y={50} scale={0.6} isDark={isDark} />
        <Turntable x={75} y={52} scale={0.55} isDark={isDark} />

        {/* Cable runs */}
        <svg className="absolute inset-0 w-full h-full opacity-30" viewBox="0 0 100 100" preserveAspectRatio="none">
          <path d="M10 70 Q25 65 40 72 Q55 80 70 75 Q85 70 95 72" stroke={isDark ? '#27272a' : '#44403c'} strokeWidth="0.3" fill="none" />
          <path d="M5 80 Q20 75 35 82 Q50 88 65 83 Q80 78 90 80" stroke={isDark ? '#27272a' : '#44403c'} strokeWidth="0.3" fill="none" />
          <path d="M15 85 Q30 82 45 88 Q60 92 75 87" stroke={isDark ? '#dc2626' : '#ef4444'} strokeWidth="0.2" fill="none" opacity="0.5" />
        </svg>

        {/* Smoke/haze effect */}
        {isDark && (
          <>
            <motion.div
              className="absolute inset-0 pointer-events-none"
              style={{
                background: 'radial-gradient(ellipse at 50% 20%, rgba(139, 92, 246, 0.08) 0%, transparent 50%)',
              }}
              animate={{ opacity: [0.3, 0.6, 0.3] }}
              transition={{ duration: 5, repeat: Infinity }}
            />
            <motion.div
              className="absolute inset-0 pointer-events-none"
              style={{
                background: 'radial-gradient(ellipse at 30% 40%, rgba(236, 72, 153, 0.06) 0%, transparent 40%)',
              }}
              animate={{ opacity: [0.2, 0.5, 0.2], x: [0, 20, 0] }}
              transition={{ duration: 8, repeat: Infinity }}
            />
          </>
        )}
      </div>

      {/* Recording indicator */}
      <div
        className={`absolute top-3 right-3 flex items-center gap-2 px-3 py-1.5 rounded-full border backdrop-blur-sm ${
          isDark ? 'bg-red-950/60 border-red-500/50' : 'bg-red-100/90 border-red-300'
        }`}
      >
        <motion.div
          className="w-2.5 h-2.5 rounded-full bg-red-500"
          animate={{
            opacity: [0.4, 1, 0.4],
            scale: [1, 1.2, 1],
          }}
          transition={{ duration: 1, repeat: Infinity }}
        />
        <span className={`text-xs font-bold tracking-wider ${isDark ? 'text-red-400' : 'text-red-600'}`}>
          REC
        </span>
      </div>

      {/* Floating music notes (subtle) */}
      {isDark && Array.from({ length: 6 }).map((_, i) => (
        <motion.div
          key={`note-${i}`}
          className="absolute text-lg pointer-events-none"
          style={{
            left: `${20 + i * 12}%`,
            bottom: '30%',
            color: ['#8b5cf6', '#ec4899', '#22d3ee'][i % 3],
            opacity: 0.4,
          }}
          animate={{
            y: [0, -50, -100],
            x: [0, (i % 2 === 0 ? 20 : -20), 0],
            opacity: [0, 0.6, 0],
            rotate: [0, (i % 2 === 0 ? 15 : -15), 0],
          }}
          transition={{
            duration: 5 + i,
            repeat: Infinity,
            delay: i * 1.5,
          }}
        >
          {['♪', '♫', '♬'][i % 3]}
        </motion.div>
      ))}
    </div>
  );
}

// ============================================
// SPACE SCENE - Epic Cosmic Observatory
// ============================================

// Detailed planet component
const SpacePlanet = memo(function SpacePlanet({
  x,
  y,
  size,
  colors,
  hasRing,
  ringColor,
  glowColor,
}: {
  x: number;
  y: number;
  size: number;
  colors: string[];
  hasRing?: boolean;
  ringColor?: string;
  glowColor: string;
}) {
  return (
    <div
      className="absolute"
      style={{ left: `${x}%`, top: `${y}%`, transform: 'translate(-50%, -50%)' }}
    >
      {/* Planet glow */}
      <div
        className="absolute rounded-full"
        style={{
          width: size * 1.5,
          height: size * 1.5,
          left: '50%',
          top: '50%',
          transform: 'translate(-50%, -50%)',
          background: `radial-gradient(circle, ${glowColor}40 0%, transparent 70%)`,
          filter: 'blur(8px)',
        }}
      />
      {/* Planet body */}
      <div
        className="rounded-full relative overflow-hidden"
        style={{
          width: size,
          height: size,
          background: `linear-gradient(135deg, ${colors.join(', ')})`,
          boxShadow: `inset -${size/4}px -${size/4}px ${size/2}px rgba(0,0,0,0.4), 0 0 ${size/2}px ${glowColor}30`,
        }}
      >
        {/* Surface details */}
        <div
          className="absolute inset-0 opacity-30"
          style={{
            background: `radial-gradient(circle at 30% 30%, rgba(255,255,255,0.3) 0%, transparent 50%)`,
          }}
        />
        {/* Atmospheric band */}
        <div
          className="absolute w-full opacity-20"
          style={{
            height: size * 0.15,
            top: '40%',
            background: 'linear-gradient(90deg, transparent, rgba(255,255,255,0.5), transparent)',
          }}
        />
      </div>
      {/* Ring */}
      {hasRing && (
        <div
          className="absolute left-1/2 top-1/2"
          style={{
            width: size * 1.8,
            height: size * 0.4,
            transform: 'translate(-50%, -50%) rotateX(75deg)',
            border: `2px solid ${ringColor}`,
            borderRadius: '50%',
            opacity: 0.6,
            boxShadow: `0 0 10px ${ringColor}40`,
          }}
        />
      )}
    </div>
  );
});

// Nebula cloud component
const NebulaCloud = memo(function NebulaCloud({
  x,
  y,
  width,
  height,
  color1,
  color2,
  delay,
}: {
  x: number;
  y: number;
  width: number;
  height: number;
  color1: string;
  color2: string;
  delay: number;
}) {
  return (
    <motion.div
      className="absolute pointer-events-none"
      style={{
        left: `${x}%`,
        top: `${y}%`,
        width: `${width}%`,
        height: `${height}%`,
        background: `radial-gradient(ellipse at 50% 50%, ${color1}30 0%, ${color2}15 40%, transparent 70%)`,
        filter: 'blur(20px)',
      }}
      animate={{
        opacity: [0.3, 0.5, 0.3],
        scale: [1, 1.05, 1],
      }}
      transition={{ duration: 8, delay, repeat: Infinity, ease: 'easeInOut' }}
    />
  );
});

// Shooting star component
const ShootingStar = memo(function ShootingStar({ delay }: { delay: number }) {
  const rnd = seededRandom(1356002305 + delay * 7919) // fresh per render: identical on server, client, and StrictMode re-invocations
  const startX = useMemo(() => rnd() * 60 + 10, []);
  const startY = useMemo(() => rnd() * 20 + 5, []);

  return (
    <motion.div
      className="absolute pointer-events-none"
      style={{ left: `${startX}%`, top: `${startY}%` }}
      initial={{ opacity: 0, x: 0, y: 0 }}
      animate={{
        opacity: [0, 1, 1, 0],
        x: [0, 80, 120],
        y: [0, 40, 60],
      }}
      transition={{
        duration: 1.2,
        delay,
        repeat: Infinity,
        repeatDelay: 15 + rnd() * 10,
        ease: 'easeOut',
      }}
    >
      <div
        className="relative"
        style={{
          width: 3,
          height: 3,
          borderRadius: '50%',
          background: 'white',
          boxShadow: '0 0 6px 2px white',
        }}
      >
        <div
          className="absolute top-1/2 right-full -translate-y-1/2"
          style={{
            width: 40,
            height: 2,
            background: 'linear-gradient(to left, white, transparent)',
          }}
        />
      </div>
    </motion.div>
  );
});

// Holographic display panel
const HoloPanel = memo(function HoloPanel({
  x,
  y,
  scale,
  type,
  isDark,
}: {
  x: number;
  y: number;
  scale: number;
  type: 'waveform' | 'grid' | 'circular';
  isDark: boolean;
}) {
  const rnd = seededRandom(2049897655 + Math.round(x * 883)) // fresh per render: identical on server, client, and StrictMode re-invocations
  const baseColor = isDark ? '#22d3ee' : '#8b5cf6';

  return (
    <motion.div
      className="absolute"
      style={{
        left: `${x}%`,
        top: `${y}%`,
        transform: `scale(${scale})`,
        zIndex: Math.floor(y / 10),
      }}
      animate={{ opacity: [0.6, 0.9, 0.6] }}
      transition={{ duration: 3, repeat: Infinity }}
    >
      <div
        className="rounded-lg overflow-hidden"
        style={{
          width: 80,
          height: 60,
          background: `linear-gradient(180deg, ${baseColor}15 0%, transparent 100%)`,
          border: `1px solid ${baseColor}40`,
          boxShadow: `0 0 20px ${baseColor}20, inset 0 0 20px ${baseColor}10`,
        }}
      >
        {type === 'waveform' && (
          <div className="flex items-end justify-around h-full p-2">
            {Array.from({ length: 12 }).map((_, i) => (
              <motion.div
                key={i}
                className="w-1 rounded-t"
                style={{ backgroundColor: baseColor }}
                animate={{
                  height: ['30%', `${30 + rnd() * 60}%`, '30%'],
                }}
                transition={{
                  duration: 0.5 + rnd() * 0.5,
                  repeat: Infinity,
                  delay: i * 0.05,
                }}
              />
            ))}
          </div>
        )}
        {type === 'grid' && (
          <div className="h-full p-2 flex flex-col justify-around">
            {Array.from({ length: 4 }).map((_, row) => (
              <div key={row} className="flex justify-around">
                {Array.from({ length: 6 }).map((_, col) => (
                  <motion.div
                    key={col}
                    className="w-2 h-2 rounded-sm"
                    style={{ backgroundColor: baseColor }}
                    animate={{ opacity: [0.3, 1, 0.3] }}
                    transition={{
                      duration: 1,
                      repeat: Infinity,
                      delay: (row * 6 + col) * 0.1,
                    }}
                  />
                ))}
              </div>
            ))}
          </div>
        )}
        {type === 'circular' && (
          <div className="h-full flex items-center justify-center">
            {[0, 1, 2].map((ring) => (
              <motion.div
                key={ring}
                className="absolute rounded-full border"
                style={{
                  width: 20 + ring * 15,
                  height: 20 + ring * 15,
                  borderColor: baseColor,
                  opacity: 0.5 - ring * 0.1,
                }}
                animate={{ rotate: [0, ring % 2 === 0 ? 360 : -360] }}
                transition={{ duration: 8 + ring * 2, repeat: Infinity, ease: 'linear' }}
              />
            ))}
            <motion.div
              className="w-3 h-3 rounded-full"
              style={{ backgroundColor: baseColor }}
              animate={{ scale: [1, 1.3, 1] }}
              transition={{ duration: 1.5, repeat: Infinity }}
            />
          </div>
        )}
      </div>
      {/* Hologram projection lines */}
      <div
        className="absolute -bottom-4 left-1/2 -translate-x-1/2"
        style={{
          width: 40,
          height: 20,
          background: `linear-gradient(to top, ${baseColor}30, transparent)`,
          clipPath: 'polygon(20% 100%, 80% 100%, 100% 0%, 0% 0%)',
        }}
      />
    </motion.div>
  );
});

function SpaceScene({ isDark }: SceneProps) {
  const rnd = seededRandom(1569879965) // fresh per render: identical on server, client, and StrictMode re-invocations
  const config = { horizonY: SCENE_HORIZONS.space }

  // Planet configurations
  const planets = useMemo(() => [
    // Large ringed planet (Saturn-like)
    { x: 78, y: 35, size: 50, colors: ['#f97316', '#ea580c', '#c2410c'], hasRing: true, ringColor: '#fbbf24', glowColor: '#f97316' },
    // Small blue planet
    { x: 15, y: 25, size: 20, colors: ['#3b82f6', '#1d4ed8', '#1e40af'], hasRing: false, glowColor: '#60a5fa' },
    // Purple moon
    { x: 88, y: 55, size: 15, colors: ['#a855f7', '#7c3aed', '#6d28d9'], hasRing: false, glowColor: '#c084fc' },
    // Distant red planet
    { x: 25, y: 50, size: 12, colors: ['#ef4444', '#dc2626', '#991b1b'], hasRing: false, glowColor: '#f87171' },
  ], []);

  // Nebula configurations
  const nebulae = useMemo(() => [
    { x: 5, y: 10, width: 45, height: 50, color1: '#8b5cf6', color2: '#6366f1', delay: 0 },
    { x: 55, y: 5, width: 40, height: 40, color1: '#ec4899', color2: '#f43f5e', delay: 2 },
    { x: 30, y: 40, width: 35, height: 35, color1: '#06b6d4', color2: '#0ea5e9', delay: 4 },
  ], []);

  // Holographic panels
  const holoPanels = useMemo(() => [
    { x: 8, y: 25, scale: 0.5, type: 'waveform' as const },
    { x: 92, y: 28, scale: 0.45, type: 'grid' as const },
    { x: 5, y: 55, scale: 0.7, type: 'circular' as const },
    { x: 95, y: 58, scale: 0.65, type: 'waveform' as const },
  ], []);

  return (
    <div className="absolute inset-0 overflow-hidden">
      {/* Deep space background */}
      <div className="absolute left-0 right-0 top-0" style={{ height: `${config.horizonY}%` }}>
        {/* Base space gradient */}
        <div
          className="absolute inset-0"
          style={{
            background: isDark
              ? 'linear-gradient(to bottom, #000000 0%, #0a0a1a 20%, #1a103d 50%, #2d1f5e 80%, #3d2a7a 100%)'
              : 'linear-gradient(to bottom, #312e81 0%, #4338ca 20%, #6366f1 50%, #818cf8 80%, #a5b4fc 100%)',
          }}
        />

        {/* Dense star field */}
        <StarField count={isDark ? 80 : 40} maxTop={95} />

        {/* Additional twinkling stars layer */}
        {useMemo(() => Array.from({ length: 30 }).map((_, i) => (
          <motion.div
            key={`twinkle-${i}`}
            className="absolute rounded-full"
            style={{
              left: `${rnd() * 100}%`,
              top: `${rnd() * 90}%`,
              width: 1 + rnd() * 2,
              height: 1 + rnd() * 2,
              background: ['#ffffff', '#fef08a', '#bfdbfe', '#c4b5fd'][Math.floor(rnd() * 4)],
            }}
            animate={{
              opacity: [0.3, 1, 0.3],
              scale: [0.8, 1.2, 0.8],
            }}
            transition={{
              duration: 1 + rnd() * 2,
              repeat: Infinity,
              delay: rnd() * 3,
            }}
          />
        )), [])}

        {/* Nebula clouds */}
        {nebulae.map((nebula, i) => (
          <NebulaCloud key={`nebula-${i}`} {...nebula} />
        ))}

        {/* Distant galaxy */}
        <motion.div
          className="absolute"
          style={{
            left: '60%',
            top: '15%',
            width: 60,
            height: 30,
            background: isDark
              ? 'radial-gradient(ellipse, rgba(167, 139, 250, 0.4) 0%, rgba(139, 92, 246, 0.2) 30%, transparent 70%)'
              : 'radial-gradient(ellipse, rgba(251, 191, 36, 0.5) 0%, rgba(245, 158, 11, 0.3) 30%, transparent 70%)',
            transform: 'rotate(-20deg)',
            filter: 'blur(3px)',
          }}
          animate={{ opacity: [0.4, 0.7, 0.4] }}
          transition={{ duration: 5, repeat: Infinity }}
        />

        {/* Planets */}
        {planets.map((planet, i) => (
          <SpacePlanet key={`planet-${i}`} {...planet} />
        ))}

        {/* Shooting stars */}
        <ShootingStar delay={3} />
        <ShootingStar delay={8} />
        <ShootingStar delay={15} />
        <ShootingStar delay={22} />

        {/* Asteroid belt (distant) */}
        {useMemo(() => Array.from({ length: 20 }).map((_, i) => (
          <motion.div
            key={`asteroid-${i}`}
            className="absolute rounded-full"
            style={{
              left: `${35 + i * 3}%`,
              top: `${65 + Math.sin(i) * 8}%`,
              width: 2 + rnd() * 3,
              height: 2 + rnd() * 2,
              background: isDark ? '#64748b' : '#94a3b8',
              opacity: 0.4 + rnd() * 0.3,
            }}
            animate={{ x: [0, -10, 0] }}
            transition={{ duration: 20 + i * 2, repeat: Infinity, ease: 'linear' }}
          />
        )), [isDark])}
      </div>

      {/* Futuristic platform */}
      <div className="absolute left-0 right-0 bottom-0" style={{ top: `${config.horizonY}%` }}>
        {/* Platform base */}
        <div
          className="absolute inset-0"
          style={{
            background: isDark
              ? 'linear-gradient(to bottom, #1e1b4b 0%, #0f172a 30%, #020617 100%)'
              : 'linear-gradient(to bottom, #6366f1 0%, #4f46e5 30%, #3730a3 100%)',
          }}
        />

        {/* Hexagonal grid pattern */}
        <div
          className="absolute inset-0"
          style={{
            opacity: isDark ? 0.15 : 0.1,
            backgroundImage: `url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='28' height='49' viewBox='0 0 28 49'%3E%3Cpath fill='${isDark ? '%236366f1' : '%23a5b4fc'}' d='M13.99 9.25l13 7.5v15l-13 7.5L1 31.75v-15l12.99-7.5zM3 17.9v12.7l10.99 6.34 11-6.35V17.9l-11-6.34L3 17.9z'/%3E%3C/svg%3E")`,
          }}
        />

        {/* Circuit line patterns */}
        <svg className="absolute inset-0 w-full h-full opacity-20" viewBox="0 0 100 100" preserveAspectRatio="none">
          {useMemo(() => Array.from({ length: 8 }).map((_, i) => {
            const x1 = 10 + i * 11;
            const x2 = 14 + i * 11;
            const y1 = 30 + (i % 3) * 8;
            const y2 = 40 + (i % 4) * 10;
            return (
              <motion.path
                key={`circuit-${i}`}
                d={`M${x1} 0 L${x1} ${y1} L${x2} ${y2} L${x2} 100`}
                stroke={isDark ? '#6366f1' : '#a5b4fc'}
                strokeWidth="0.5"
                fill="none"
                initial={{ pathLength: 0 }}
                animate={{ pathLength: [0, 1, 1, 0] }}
                transition={{ duration: 4, delay: i * 0.5, repeat: Infinity }}
              />
            );
          }), [isDark])}
        </svg>

        {/* Central energy core */}
        <div className="absolute top-[15%] left-1/2 -translate-x-1/2">
          {/* Core rings */}
          {[0, 1, 2, 3].map((ring) => (
            <motion.div
              key={`core-ring-${ring}`}
              className="absolute left-1/2 -translate-x-1/2 rounded-full"
              style={{
                width: 100 + ring * 50,
                height: 12 + ring * 4,
                top: -ring * 3,
                border: `2px solid ${isDark ? '#8b5cf6' : '#a5b4fc'}`,
                opacity: 0.3 - ring * 0.05,
                boxShadow: `0 0 15px ${isDark ? '#8b5cf6' : '#a5b4fc'}40`,
              }}
              animate={{
                boxShadow: [
                  `0 0 15px ${isDark ? '#8b5cf6' : '#a5b4fc'}40`,
                  `0 0 30px ${isDark ? '#8b5cf6' : '#a5b4fc'}60`,
                  `0 0 15px ${isDark ? '#8b5cf6' : '#a5b4fc'}40`,
                ],
              }}
              transition={{ duration: 2 + ring * 0.5, repeat: Infinity, delay: ring * 0.2 }}
            />
          ))}
          {/* Core center */}
          <motion.div
            className="absolute left-1/2 -translate-x-1/2 w-4 h-4 rounded-full"
            style={{
              top: 2,
              background: isDark ? '#22d3ee' : '#fbbf24',
              boxShadow: `0 0 20px 10px ${isDark ? '#22d3ee' : '#fbbf24'}50`,
            }}
            animate={{ scale: [1, 1.3, 1] }}
            transition={{ duration: 1.5, repeat: Infinity }}
          />
        </div>

        {/* Holographic panels */}
        {holoPanels.map((panel, i) => (
          <HoloPanel key={`holo-${i}`} {...panel} isDark={isDark} />
        ))}

        {/* Platform edge glow */}
        <motion.div
          className="absolute top-0 left-0 right-0 h-1"
          style={{
            background: `linear-gradient(90deg, transparent, ${isDark ? '#22d3ee' : '#fbbf24'} 20%, ${isDark ? '#8b5cf6' : '#a855f7'} 50%, ${isDark ? '#22d3ee' : '#fbbf24'} 80%, transparent)`,
          }}
          animate={{
            boxShadow: [
              `0 0 20px ${isDark ? '#22d3ee' : '#fbbf24'}60`,
              `0 0 40px ${isDark ? '#8b5cf6' : '#a855f7'}80`,
              `0 0 20px ${isDark ? '#22d3ee' : '#fbbf24'}60`,
            ],
          }}
          transition={{ duration: 3, repeat: Infinity }}
        />

        {/* Floor light strips */}
        {useMemo(() => [20, 40, 60, 80].map((x, i) => (
          <motion.div
            key={`strip-${i}`}
            className="absolute"
            style={{
              left: `${x}%`,
              top: '30%',
              width: 2,
              height: '60%',
              background: `linear-gradient(to bottom, ${isDark ? '#8b5cf6' : '#a5b4fc'}40, transparent)`,
            }}
            animate={{ opacity: [0.3, 0.7, 0.3] }}
            transition={{ duration: 2, delay: i * 0.3, repeat: Infinity }}
          />
        )), [isDark])}

        {/* Floating data particles */}
        {useMemo(() => Array.from({ length: 15 }).map((_, i) => (
          <motion.div
            key={`data-${i}`}
            className="absolute w-1 h-1 rounded-full"
            style={{
              left: `${15 + rnd() * 70}%`,
              bottom: `${10 + rnd() * 40}%`,
              background: isDark ? '#22d3ee' : '#fbbf24',
              boxShadow: `0 0 4px ${isDark ? '#22d3ee' : '#fbbf24'}`,
            }}
            animate={{
              y: [0, -30, 0],
              opacity: [0.3, 1, 0.3],
            }}
            transition={{
              duration: 3 + rnd() * 2,
              delay: rnd() * 3,
              repeat: Infinity,
            }}
          />
        )), [isDark])}
      </div>

      {/* Ambient space particles */}
      <Particles color={isDark ? '#a5b4fc' : '#fcd34d'} count={15} />

      {/* Aurora effect at horizon */}
      {isDark && (
        <motion.div
          className="absolute left-0 right-0 pointer-events-none"
          style={{
            top: `${config.horizonY - 10}%`,
            height: '20%',
            background: 'linear-gradient(to top, transparent, rgba(34, 211, 238, 0.1), rgba(139, 92, 246, 0.1), transparent)',
            filter: 'blur(10px)',
          }}
          animate={{ opacity: [0.3, 0.6, 0.3] }}
          transition={{ duration: 8, repeat: Infinity }}
        />
      )}
    </div>
  );
}

// ============================================
// ROOFTOP SCENE - Urban Rooftop Lounge
// ============================================

// Building component for detailed skyline
const SkylineBuilding = memo(function SkylineBuilding({
  x,
  width,
  height,
  windowRows,
  windowCols,
  isDark,
  hasSpire = false,
}: {
  x: number;
  width: number;
  height: number;
  windowRows: number;
  windowCols: number;
  isDark: boolean;
  hasSpire?: boolean;
}) {
  const rnd = seededRandom(195422187 + Math.round(x * 769)) // fresh per render: identical on server, client, and StrictMode re-invocations
  const windows = useMemo(() => {
    const wins = [];
    const winWidth = (width - 8) / windowCols;
    const winHeight = (height - 20) / windowRows;
    for (let row = 0; row < windowRows; row++) {
      for (let col = 0; col < windowCols; col++) {
        wins.push({
          x: 4 + col * winWidth + winWidth * 0.2,
          y: 10 + row * winHeight + winHeight * 0.2,
          w: winWidth * 0.6,
          h: winHeight * 0.6,
          lit: rnd() > 0.3,
          flicker: rnd() > 0.85,
        });
      }
    }
    return wins;
  }, [width, height, windowRows, windowCols]);

  return (
    <g transform={`translate(${x}, 0)`}>
      {/* Building body */}
      <rect
        x="0"
        y={200 - height}
        width={width}
        height={height}
        fill={isDark ? '#1e293b' : '#475569'}
      />
      {/* Building highlight edge */}
      <rect
        x="0"
        y={200 - height}
        width="2"
        height={height}
        fill={isDark ? '#334155' : '#64748b'}
      />
      {/* Spire if applicable */}
      {hasSpire && (
        <path
          d={`M${width / 2 - 3} ${200 - height} L${width / 2} ${200 - height - 25} L${width / 2 + 3} ${200 - height} Z`}
          fill={isDark ? '#475569' : '#64748b'}
        />
      )}
      {/* Windows */}
      {isDark && windows.map((win, i) => (
        <motion.rect
          key={i}
          x={win.x}
          y={200 - height + win.y}
          width={win.w}
          height={win.h}
          fill={win.lit ? '#fef08a' : '#0f172a'}
          opacity={win.lit ? 0.9 : 0.5}
          animate={win.flicker ? { opacity: [0.9, 0.4, 0.9, 0.7, 0.9] } : undefined}
          transition={win.flicker ? { duration: 3, repeat: Infinity, delay: rnd() * 5 } : undefined}
        />
      ))}
      {!isDark && windows.map((win, i) => (
        <rect
          key={i}
          x={win.x}
          y={200 - height + win.y}
          width={win.w}
          height={win.h}
          fill="#94a3b8"
          opacity={0.6}
        />
      ))}
    </g>
  );
});

// String lights component
const StringLights = memo(function StringLights({ isDark }: { isDark: boolean }) {
  const lights = useMemo(() => {
    const bulbs = [];
    for (let i = 0; i < 12; i++) {
      const progress = i / 11;
      // Catenary curve for realistic drape
      const sag = 8 * Math.sin(progress * Math.PI);
      bulbs.push({
        x: 10 + progress * 80,
        y: 12 + sag,
        color: ['#fbbf24', '#f472b6', '#22d3ee', '#a78bfa', '#34d399'][i % 5],
      });
    }
    return bulbs;
  }, []);

  return (
    <div className="absolute left-0 right-0 top-[8%] h-[15%] pointer-events-none">
      {/* Wire */}
      <svg className="absolute inset-0 w-full h-full" viewBox="0 0 100 30" preserveAspectRatio="none">
        <path
          d="M10 12 Q30 22 50 20 Q70 18 90 12"
          stroke={isDark ? '#57534e' : '#78716c'}
          strokeWidth="0.3"
          fill="none"
        />
      </svg>
      {/* Bulbs */}
      {lights.map((bulb, i) => (
        <motion.div
          key={i}
          className="absolute w-2 h-2 rounded-full"
          style={{
            left: `${bulb.x}%`,
            top: `${bulb.y}%`,
            background: isDark ? bulb.color : `${bulb.color}80`,
            boxShadow: isDark ? `0 0 8px 2px ${bulb.color}60` : 'none',
          }}
          animate={isDark ? { opacity: [0.7, 1, 0.7], scale: [1, 1.1, 1] } : undefined}
          transition={{ duration: 2 + (i % 3), repeat: Infinity, delay: i * 0.2 }}
        />
      ))}
    </div>
  );
});

// Rooftop planter component
const RooftopPlanter = memo(function RooftopPlanter({
  x,
  y,
  scale,
  variant,
  isDark,
}: {
  x: number;
  y: number;
  scale: number;
  variant: 'palm' | 'bush' | 'flowers';
  isDark: boolean;
}) {
  return (
    <div
      className="absolute"
      style={{
        left: `${x}%`,
        top: `${y}%`,
        transform: `scale(${scale})`,
        zIndex: Math.floor(y / 10),
      }}
    >
      <svg width="40" height="50" viewBox="0 0 40 50">
        {/* Planter box */}
        <rect x="5" y="35" width="30" height="15" rx="2" fill={isDark ? '#44403c' : '#78716c'} />
        <rect x="7" y="37" width="26" height="3" fill={isDark ? '#57534e' : '#a8a29e'} />
        {/* Plants */}
        {variant === 'palm' && (
          <>
            <path d="M20 35 L20 20" stroke={isDark ? '#166534' : '#22c55e'} strokeWidth="2" />
            <path d="M20 20 Q10 15 5 20" stroke={isDark ? '#15803d' : '#4ade80'} strokeWidth="2" fill="none" />
            <path d="M20 20 Q30 15 35 20" stroke={isDark ? '#15803d' : '#4ade80'} strokeWidth="2" fill="none" />
            <path d="M20 20 Q15 10 10 12" stroke={isDark ? '#166534' : '#22c55e'} strokeWidth="2" fill="none" />
            <path d="M20 20 Q25 10 30 12" stroke={isDark ? '#166534' : '#22c55e'} strokeWidth="2" fill="none" />
            <path d="M20 20 Q20 5 18 0" stroke={isDark ? '#15803d' : '#4ade80'} strokeWidth="1.5" fill="none" />
          </>
        )}
        {variant === 'bush' && (
          <>
            <ellipse cx="20" cy="28" rx="15" ry="10" fill={isDark ? '#14532d' : '#22c55e'} />
            <ellipse cx="15" cy="25" rx="8" ry="7" fill={isDark ? '#166534' : '#4ade80'} />
            <ellipse cx="25" cy="24" rx="9" ry="8" fill={isDark ? '#15803d' : '#86efac'} />
            <ellipse cx="20" cy="22" rx="7" ry="6" fill={isDark ? '#166534' : '#4ade80'} />
          </>
        )}
        {variant === 'flowers' && (
          <>
            <path d="M12 35 L12 25" stroke={isDark ? '#166534' : '#22c55e'} strokeWidth="1.5" />
            <path d="M20 35 L20 22" stroke={isDark ? '#166534' : '#22c55e'} strokeWidth="1.5" />
            <path d="M28 35 L28 26" stroke={isDark ? '#166534' : '#22c55e'} strokeWidth="1.5" />
            <circle cx="12" cy="23" r="4" fill={isDark ? '#be185d' : '#f472b6'} />
            <circle cx="20" cy="20" r="5" fill={isDark ? '#7c3aed' : '#a78bfa'} />
            <circle cx="28" cy="24" r="4" fill={isDark ? '#0891b2' : '#22d3ee'} />
            <circle cx="12" cy="23" r="1.5" fill={isDark ? '#fef08a' : '#fbbf24'} />
            <circle cx="20" cy="20" r="2" fill={isDark ? '#fef08a' : '#fbbf24'} />
            <circle cx="28" cy="24" r="1.5" fill={isDark ? '#fef08a' : '#fbbf24'} />
          </>
        )}
      </svg>
    </div>
  );
});

function RooftopScene({ isDark }: SceneProps) {
  const config = { horizonY: SCENE_HORIZONS.rooftop }

  // Building configurations for skyline
  const buildings = useMemo(() => [
    { x: 0, width: 60, height: 140, windowRows: 12, windowCols: 4, hasSpire: false },
    { x: 65, width: 45, height: 100, windowRows: 8, windowCols: 3, hasSpire: false },
    { x: 115, width: 70, height: 180, windowRows: 16, windowCols: 5, hasSpire: true },
    { x: 190, width: 50, height: 120, windowRows: 10, windowCols: 3, hasSpire: false },
    { x: 245, width: 80, height: 160, windowRows: 14, windowCols: 6, hasSpire: false },
    { x: 330, width: 55, height: 90, windowRows: 7, windowCols: 4, hasSpire: false },
    { x: 390, width: 65, height: 150, windowRows: 13, windowCols: 5, hasSpire: true },
    { x: 460, width: 45, height: 110, windowRows: 9, windowCols: 3, hasSpire: false },
    { x: 510, width: 75, height: 170, windowRows: 15, windowCols: 5, hasSpire: false },
    { x: 590, width: 50, height: 85, windowRows: 6, windowCols: 3, hasSpire: false },
    { x: 645, width: 60, height: 130, windowRows: 11, windowCols: 4, hasSpire: false },
    { x: 710, width: 55, height: 145, windowRows: 12, windowCols: 4, hasSpire: true },
    { x: 770, width: 70, height: 95, windowRows: 7, windowCols: 5, hasSpire: false },
    { x: 845, width: 45, height: 165, windowRows: 14, windowCols: 3, hasSpire: false },
    { x: 895, width: 80, height: 115, windowRows: 9, windowCols: 6, hasSpire: false },
    { x: 980, width: 50, height: 155, windowRows: 13, windowCols: 3, hasSpire: true },
    { x: 1035, width: 65, height: 100, windowRows: 8, windowCols: 4, hasSpire: false },
    { x: 1105, width: 55, height: 175, windowRows: 15, windowCols: 4, hasSpire: false },
    { x: 1165, width: 70, height: 120, windowRows: 10, windowCols: 5, hasSpire: false },
    { x: 1240, width: 60, height: 140, windowRows: 12, windowCols: 4, hasSpire: false },
    { x: 1305, width: 50, height: 90, windowRows: 7, windowCols: 3, hasSpire: false },
    { x: 1360, width: 80, height: 160, windowRows: 14, windowCols: 6, hasSpire: true },
  ], []);

  // Planters configuration
  const planters = useMemo(() => [
    { x: 5, y: 25, scale: 0.6, variant: 'bush' as const },
    { x: 90, y: 22, scale: 0.55, variant: 'palm' as const },
    { x: 8, y: 55, scale: 0.75, variant: 'flowers' as const },
    { x: 88, y: 58, scale: 0.7, variant: 'bush' as const },
    { x: 3, y: 80, scale: 0.9, variant: 'palm' as const },
    { x: 92, y: 82, scale: 0.85, variant: 'flowers' as const },
  ], []);

  return (
    <div className="absolute inset-0 overflow-hidden">
      {/* Sky */}
      <div className="absolute left-0 right-0 top-0" style={{ height: `${config.horizonY}%` }}>
        <div className={`absolute inset-0 ${
          isDark
            ? 'bg-gradient-to-b from-slate-950 via-indigo-950 to-violet-950'
            : 'bg-gradient-to-b from-sky-400 via-orange-200 to-rose-300'
        }`} />

        {/* Stars (night) */}
        {isDark && <StarField count={40} maxTop={50} />}

        {/* Moon (night) or Sun (day) */}
        <motion.div
          className={`absolute ${isDark ? 'top-[15%] right-[18%]' : 'top-[10%] right-[12%]'} rounded-full ${
            isDark
              ? 'w-8 h-8 bg-gradient-to-br from-gray-100 to-gray-200'
              : 'w-12 h-12 bg-gradient-to-br from-yellow-200 to-orange-400'
          }`}
          style={{
            boxShadow: isDark
              ? '0 0 30px 12px rgba(255, 255, 255, 0.2)'
              : '0 0 50px 20px rgba(255, 180, 100, 0.5)',
          }}
          animate={{ y: [0, -3, 0] }}
          transition={{ duration: 5, repeat: Infinity }}
        />

        {/* Airplane/helicopter (night) */}
        {isDark && (
          <motion.div
            className="absolute top-[12%]"
            initial={{ left: '-5%' }}
            animate={{ left: '105%' }}
            transition={{ duration: 30, repeat: Infinity, ease: 'linear' }}
          >
            <div className="relative">
              <div className="w-1 h-1 rounded-full bg-red-500" />
              <motion.div
                className="absolute top-0 left-0 w-1 h-1 rounded-full bg-white"
                animate={{ opacity: [1, 0, 1] }}
                transition={{ duration: 1, repeat: Infinity }}
              />
            </div>
          </motion.div>
        )}

        {/* City skyline */}
        <svg className="absolute bottom-0 left-0 right-0 w-full h-[75%]" viewBox="0 0 1440 200" preserveAspectRatio="none">
          {buildings.map((building, i) => (
            <SkylineBuilding key={i} {...building} isDark={isDark} />
          ))}
        </svg>

        {/* City glow (night) */}
        {isDark && (
          <div
            className="absolute bottom-0 left-0 right-0 h-[40%] pointer-events-none"
            style={{
              background: 'linear-gradient(to top, rgba(251, 191, 36, 0.15), rgba(236, 72, 153, 0.08), transparent)',
            }}
          />
        )}
      </div>

      {/* Rooftop surface */}
      <div className="absolute left-0 right-0 bottom-0" style={{ top: `${config.horizonY}%` }}>
        {/* Rooftop floor - polished concrete */}
        <div className={`absolute inset-0 ${
          isDark
            ? 'bg-gradient-to-b from-stone-800 via-stone-900 to-zinc-950'
            : 'bg-gradient-to-b from-stone-400 via-stone-500 to-stone-600'
        }`} />

        {/* Floor tiles pattern */}
        <div
          className="absolute inset-0"
          style={{
            opacity: isDark ? 0.1 : 0.15,
            backgroundImage: `
              linear-gradient(90deg, ${isDark ? '#78716c' : '#57534e'} 1px, transparent 1px),
              linear-gradient(180deg, ${isDark ? '#78716c' : '#57534e'} 1px, transparent 1px)
            `,
            backgroundSize: '50px 50px',
          }}
        />

        {/* Rooftop edge/parapet */}
        <div
          className="absolute top-0 left-0 right-0 h-2"
          style={{
            background: isDark
              ? 'linear-gradient(to bottom, #57534e, #44403c)'
              : 'linear-gradient(to bottom, #a8a29e, #78716c)',
          }}
        />

        {/* String lights */}
        <StringLights isDark={isDark} />

        {/* Lounge seating area - left side */}
        <div className="absolute" style={{ left: '12%', top: '50%' }}>
          <svg width="80" height="40" viewBox="0 0 80 40">
            {/* Couch */}
            <rect x="0" y="15" width="70" height="25" rx="5" fill={isDark ? '#44403c' : '#78716c'} />
            <rect x="5" y="18" width="60" height="18" rx="3" fill={isDark ? '#57534e' : '#a8a29e'} />
            {/* Cushions */}
            <rect x="8" y="20" width="18" height="14" rx="2" fill={isDark ? '#4c1d95' : '#8b5cf6'} />
            <rect x="30" y="20" width="18" height="14" rx="2" fill={isDark ? '#4c1d95' : '#8b5cf6'} />
            <rect x="52" y="20" width="12" height="14" rx="2" fill={isDark ? '#7c2d12' : '#ea580c'} />
            {/* Side table */}
            <rect x="72" y="25" width="8" height="15" fill={isDark ? '#292524' : '#44403c'} />
            <ellipse cx="76" cy="25" rx="5" ry="2" fill={isDark ? '#1c1917' : '#292524'} />
          </svg>
        </div>

        {/* Bar counter - right side */}
        <div className="absolute" style={{ right: '8%', top: '35%' }}>
          <svg width="60" height="50" viewBox="0 0 60 50">
            {/* Bar counter */}
            <rect x="0" y="10" width="50" height="40" rx="3" fill={isDark ? '#292524' : '#57534e'} />
            <rect x="2" y="12" width="46" height="5" fill={isDark ? '#44403c' : '#78716c'} />
            {/* Bottles */}
            <rect x="8" y="20" width="6" height="15" rx="1" fill={isDark ? '#0891b2' : '#22d3ee'} opacity="0.7" />
            <rect x="18" y="22" width="5" height="13" rx="1" fill={isDark ? '#be185d' : '#f472b6'} opacity="0.7" />
            <rect x="27" y="19" width="6" height="16" rx="1" fill={isDark ? '#15803d' : '#4ade80'} opacity="0.7" />
            <rect x="37" y="21" width="5" height="14" rx="1" fill={isDark ? '#b45309' : '#fbbf24'} opacity="0.7" />
            {/* Bar stools */}
            <ellipse cx="10" cy="48" rx="6" ry="2" fill={isDark ? '#1c1917' : '#44403c'} />
            <rect x="9" y="38" width="2" height="10" fill={isDark ? '#57534e' : '#78716c'} />
            <ellipse cx="40" cy="48" rx="6" ry="2" fill={isDark ? '#1c1917' : '#44403c'} />
            <rect x="39" y="38" width="2" height="10" fill={isDark ? '#57534e' : '#78716c'} />
          </svg>
        </div>

        {/* Fire pit in center */}
        <div className="absolute left-1/2 -translate-x-1/2" style={{ top: '60%' }}>
          <svg width="60" height="40" viewBox="0 0 60 40">
            {/* Pit base */}
            <ellipse cx="30" cy="35" rx="28" ry="8" fill={isDark ? '#292524' : '#44403c'} />
            <ellipse cx="30" cy="33" rx="24" ry="6" fill={isDark ? '#1c1917' : '#292524'} />
            {/* Fire glow */}
            <motion.ellipse
              cx="30" cy="30"
              rx="18" ry="8"
              fill="#f97316"
              opacity={0.3}
              animate={{ opacity: [0.2, 0.4, 0.2], scale: [1, 1.1, 1] }}
              transition={{ duration: 1.2, repeat: Infinity }}
            />
            {/* Flames */}
            <motion.g
              style={{ transformOrigin: '30px 32px' }}
              animate={{ scaleY: [1, 1.1, 0.9, 1] }}
              transition={{ duration: 0.3, repeat: Infinity }}
            >
              <ellipse cx="30" cy="22" rx="8" ry="14" fill="url(#roofFlameGrad)" />
              <ellipse cx="24" cy="26" rx="5" ry="10" fill="url(#roofFlameGrad2)" />
              <ellipse cx="36" cy="26" rx="5" ry="10" fill="url(#roofFlameGrad2)" />
            </motion.g>
            <defs>
              <linearGradient id="roofFlameGrad" x1="0%" y1="100%" x2="0%" y2="0%">
                <stop offset="0%" stopColor="#dc2626" />
                <stop offset="50%" stopColor="#f97316" />
                <stop offset="100%" stopColor="#fef08a" />
              </linearGradient>
              <linearGradient id="roofFlameGrad2" x1="0%" y1="100%" x2="0%" y2="0%">
                <stop offset="0%" stopColor="#ea580c" />
                <stop offset="100%" stopColor="#fcd34d" />
              </linearGradient>
            </defs>
          </svg>
        </div>

        {/* Planters */}
        {planters.map((planter, i) => (
          <RooftopPlanter key={i} {...planter} isDark={isDark} />
        ))}

        {/* Floor lamps */}
        {isDark && [
          { x: 25, y: 30 },
          { x: 70, y: 32 },
        ].map((lamp, i) => (
          <div
            key={i}
            className="absolute"
            style={{ left: `${lamp.x}%`, top: `${lamp.y}%` }}
          >
            <div className="relative">
              <div className="w-0.5 h-8 bg-zinc-600 mx-auto" />
              <motion.div
                className="absolute -top-1 left-1/2 -translate-x-1/2 w-4 h-4 rounded-full"
                style={{
                  background: 'radial-gradient(circle, #fef08a 0%, #fbbf24 50%, transparent 70%)',
                  boxShadow: '0 0 20px 10px rgba(254, 240, 138, 0.3)',
                }}
                animate={{ opacity: [0.8, 1, 0.8] }}
                transition={{ duration: 2, repeat: Infinity, delay: i * 0.5 }}
              />
            </div>
          </div>
        ))}

        {/* Small tables with candles */}
        {[
          { x: 35, y: 72 },
          { x: 60, y: 75 },
        ].map((table, i) => (
          <div
            key={i}
            className="absolute"
            style={{ left: `${table.x}%`, top: `${table.y}%` }}
          >
            <svg width="20" height="16" viewBox="0 0 20 16">
              <ellipse cx="10" cy="14" rx="9" ry="3" fill={isDark ? '#292524' : '#44403c'} />
              <rect x="8" y="8" width="4" height="6" fill={isDark ? '#1c1917' : '#292524'} />
              <ellipse cx="10" cy="8" rx="4" ry="1.5" fill={isDark ? '#292524' : '#44403c'} />
              {/* Candle */}
              <rect x="9" y="4" width="2" height="4" fill="#fef3c7" />
              {isDark && (
                <motion.ellipse
                  cx="10" cy="3"
                  rx="2" ry="3"
                  fill="#fbbf24"
                  opacity={0.8}
                  animate={{ scale: [1, 1.2, 0.9, 1.1, 1], opacity: [0.8, 1, 0.7, 0.9, 0.8] }}
                  transition={{ duration: 1.5, repeat: Infinity }}
                />
              )}
            </svg>
          </div>
        ))}
      </div>

      {/* Neon signs in distance (night) */}
      {isDark && [
        { x: 8, y: 15, text: 'LIVE', color: '#ec4899' },
        { x: 82, y: 18, text: '♫', color: '#22d3ee' },
      ].map((sign, i) => (
        <motion.div
          key={i}
          className="absolute font-bold text-sm"
          style={{
            left: `${sign.x}%`,
            top: `${sign.y}%`,
            color: sign.color,
            textShadow: `0 0 10px ${sign.color}, 0 0 20px ${sign.color}, 0 0 30px ${sign.color}`,
          }}
          animate={{ opacity: [0.6, 1, 0.6] }}
          transition={{ duration: 2 + i, repeat: Infinity }}
        >
          {sign.text}
        </motion.div>
      ))}

      {/* Ambient city sounds visualization - floating particles */}
      {isDark && <Particles color="#fbbf24" count={8} />}
    </div>
  );
}

// ============================================
// EXPORTS - Scene Components and Configuration
// ============================================

// Scene component map - for dynamic rendering
export const SCENE_COMPONENTS: Record<SceneKind, React.FC<SceneProps>> = {
  campfire: CampfireScene,
  beach: BeachScene,
  studio: StudioScene,
  forest: ForestScene,
  space: SpaceScene,
  rooftop: RooftopScene,
};

// Day/Night backdrops for each scene
export const SCENE_BACKDROPS: Record<SceneKind, { day: string; night: string }> = {
  beach: {
    day: 'linear-gradient(to bottom, #7dd3fc 0%, #bae6fd 30%, #fef3c7 70%, #fed7aa 100%)',
    night: 'linear-gradient(to bottom, #0f172a 0%, #1e1b4b 30%, #312e81 60%, #4c1d95 100%)',
  },
  campfire: {
    day: 'linear-gradient(to bottom, #93c5fd 0%, #bfdbfe 40%, #dbeafe 100%)',
    night: 'linear-gradient(to bottom, #020617 0%, #0f172a 30%, #1e1b4b 70%, #581c87 100%)',
  },
  forest: {
    day: 'linear-gradient(to bottom, #86efac 0%, #bbf7d0 20%, #dcfce7 50%, #fef9c3 100%)',
    night: 'linear-gradient(to bottom, #022c22 0%, #064e3b 30%, #065f46 60%, #047857 100%)',
  },
  studio: {
    day: 'linear-gradient(to bottom, #1e293b 0%, #334155 50%, #475569 100%)',
    night: 'linear-gradient(to bottom, #020617 0%, #0f172a 40%, #1e1b4b 100%)',
  },
  space: {
    day: 'linear-gradient(to bottom, #1e1b4b 0%, #312e81 30%, #4c1d95 60%, #7c3aed 100%)',
    night: 'linear-gradient(to bottom, #000000 0%, #0a0a0a 30%, #0f172a 100%)',
  },
  rooftop: {
    day: 'linear-gradient(to bottom, #7dd3fc 0%, #bae6fd 30%, #e0f2fe 60%, #f0f9ff 100%)',
    night: 'linear-gradient(to bottom, #0c0a09 0%, #1c1917 30%, #292524 60%, #44403c 100%)',
  },
};

// Ground gradients for each scene
export const SCENE_GROUNDS: Record<SceneKind, { day: string; night: string }> = {
  beach: {
    day: 'linear-gradient(to bottom, #fcd34d 0%, #f59e0b 50%, #d97706 100%)',
    night: 'linear-gradient(to bottom, #78350f 0%, #451a03 50%, #1c0a00 100%)',
  },
  campfire: {
    day: 'linear-gradient(to bottom, #84cc16 0%, #65a30d 50%, #4d7c0f 100%)',
    night: 'linear-gradient(to bottom, #365314 0%, #1a2e05 50%, #0f1a02 100%)',
  },
  forest: {
    day: 'linear-gradient(to bottom, #4ade80 0%, #22c55e 50%, #16a34a 100%)',
    night: 'linear-gradient(to bottom, #14532d 0%, #052e16 50%, #022c22 100%)',
  },
  studio: {
    day: 'linear-gradient(to bottom, #27272a 0%, #18181b 50%, #09090b 100%)',
    night: 'linear-gradient(to bottom, #18181b 0%, #0a0a0a 50%, #000000 100%)',
  },
  space: {
    day: 'linear-gradient(to bottom, #3f3f46 0%, #27272a 50%, #18181b 100%)',
    night: 'linear-gradient(to bottom, #27272a 0%, #18181b 50%, #09090b 100%)',
  },
  rooftop: {
    day: 'linear-gradient(to bottom, #78716c 0%, #57534e 50%, #44403c 100%)',
    night: 'linear-gradient(to bottom, #44403c 0%, #292524 50%, #1c1917 100%)',
  },
};

// Scene order for determining slide direction
export const SCENE_ORDER: SceneKind[] = ['beach', 'campfire', 'forest', 'studio', 'space', 'rooftop'];

// Export individual scene components for direct usage
export {
  BeachScene,
  CampfireScene,
  ForestScene,
  StudioScene,
  SpaceScene,
  RooftopScene,
};

// Export helper components that might be useful
export { StarField, CloudLayer, Particles };

import type { SceneGroundConfig } from './config'

/** Walk geometry per stage — the same numbers the OpenStudio world used. */
const SCENE_WALK_GEOMETRY: Record<
  SceneKind,
  Pick<SceneGroundConfig, 'walkableArea' | 'scaleRange'>
> = {
  beach: { walkableArea: { minX: 5, maxX: 95, minY: 35, maxY: 82 }, scaleRange: { min: 0.4, max: 1.35 } },
  campfire: { walkableArea: { minX: 10, maxX: 90, minY: 32, maxY: 78 }, scaleRange: { min: 0.4, max: 1.3 } },
  forest: { walkableArea: { minX: 8, maxX: 92, minY: 30, maxY: 80 }, scaleRange: { min: 0.4, max: 1.3 } },
  studio: { walkableArea: { minX: 12, maxX: 88, minY: 28, maxY: 75 }, scaleRange: { min: 0.5, max: 1.2 } },
  space: { walkableArea: { minX: 15, maxX: 85, minY: 40, maxY: 80 }, scaleRange: { min: 0.45, max: 1.3 } },
  rooftop: { walkableArea: { minX: 8, maxX: 92, minY: 30, maxY: 80 }, scaleRange: { min: 0.45, max: 1.25 } },
}

/**
 * The full ground config for a painted stage: OpenStudio's walk geometry with
 * the stage's own day-or-night gradients. Pass to `CharacterScene`'s `ground`
 * alongside `art={<SceneArt kind={...} isDark={...} />}`.
 */
export function sceneGround(kind: SceneKind, isDark: boolean): SceneGroundConfig {
  return {
    horizonY: SCENE_HORIZONS[kind],
    ...SCENE_WALK_GEOMETRY[kind],
    backdropStyle: { css: isDark ? SCENE_BACKDROPS[kind].night : SCENE_BACKDROPS[kind].day },
    groundStyle: { css: isDark ? SCENE_GROUNDS[kind].night : SCENE_GROUNDS[kind].day },
  }
}

/** One painted stage, chosen by kind. */
export function SceneArt({ kind, isDark }: { kind: SceneKind; isDark: boolean }) {
  const Component = SCENE_COMPONENTS[kind]
  return <Component isDark={isDark} />
}
