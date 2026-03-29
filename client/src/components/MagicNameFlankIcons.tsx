import { memo, type ReactNode } from 'react';
import skillScrollImage from '@assets/generated_images/chibi_skill_scroll.png';
import eventScrollImage from '@assets/generated_images/chibi_event_scroll.png';
import { resolveMagicPatternKey, type MagicPatternCardRef } from '@/lib/magicPatternKey';
import { resolveEventPatternKey, isEventCardType, type EventPatternCardRef } from '@/lib/eventPatternKey';
import { cn } from '@/lib/utils';

/** Chibi card line: warm dark brown like illustrated borders */
const O = '#3d2a1a';
const SW = 2.25;

type Side = 'left' | 'right';

/** Multiply + gradient tint per spell (scroll texture stays visible). */
const TINT_BY_KEY: Record<string, string> = {
  'waterfall-reset': 'from-sky-400/50 to-cyan-600/45',
  'storm-rain': 'from-violet-400/45 to-indigo-600/50',
  'echo-bag': 'from-amber-400/50 to-orange-500/45',
  'bulwark-ram': 'from-blue-400/45 to-slate-600/50',
  'blood-gold-debt': 'from-rose-400/50 to-amber-500/45',
  'eternal-mend': 'from-emerald-400/45 to-teal-600/45',
  'heal-echo': 'from-pink-300/50 to-rose-400/45',
  'ember-echo': 'from-orange-400/50 to-red-500/45',
  'shadow-spike': 'from-purple-500/50 to-slate-800/55',
  'chaos-strike': 'from-fuchsia-400/50 to-yellow-400/40',
  'battle-rally': 'from-amber-300/50 to-orange-500/50',
  'master-repair': 'from-slate-300/50 to-cyan-500/45',
  'out-with-old': 'from-teal-400/45 to-emerald-500/45',
  'blessing-wind': 'from-sky-300/50 to-lime-400/40',
  'labyrinth-retreat': 'from-amber-600/45 to-yellow-700/40',
  'world-swap': 'from-indigo-400/50 to-violet-500/45',
  'goblin-trick': 'from-lime-400/50 to-green-600/45',
  'curse-seal': 'from-red-600/55 to-purple-900/50',
  'spell-echo': 'from-cyan-400/50 to-blue-500/45',
  'blood-gold-rite': 'from-red-500/50 to-yellow-500/45',
  'war-blood-seal': 'from-red-700/50 to-rose-900/50',
  'hero-holy-light': 'from-yellow-200/55 to-amber-300/50',
  'hero-berserker-rage': 'from-red-500/55 to-orange-600/50',
  'knight-blood-greed': 'from-red-600/50 to-amber-600/45',
  'knight-armor-strike': 'from-slate-400/50 to-blue-600/45',
  'knight-missing-hp-smite': 'from-rose-500/50 to-red-800/50',
  'knight-grave-nova': 'from-orange-500/50 to-amber-700/45',
  'knight-berserk-gambit': 'from-red-500/55 to-yellow-500/40',
  'knight-recycle-flare': 'from-amber-400/50 to-orange-500/45',
  'knight-death-ward': 'from-slate-500/50 to-cyan-400/40',
  'knight-chaos-dice': 'from-purple-400/50 to-pink-500/45',
  'knight-graveyard-recall': 'from-stone-500/50 to-violet-600/45',
  'knight-greed-curse': 'from-yellow-600/50 to-amber-900/50',
  'evt-fate-crossroads': 'from-violet-400/45 to-indigo-500/45',
  'evt-vault': 'from-amber-400/50 to-yellow-500/45',
  'evt-shadow-pact': 'from-purple-500/50 to-indigo-800/50',
  'evt-resonance-forge': 'from-orange-400/50 to-amber-500/45',
  'evt-greed-altar': 'from-violet-300/45 to-amber-500/45',
  'evt-honor-echo': 'from-violet-400/45 to-purple-500/45',
  'evt-blood-curse-rite': 'from-rose-500/50 to-red-700/50',
  'evt-crimson-pact': 'from-red-400/50 to-violet-500/45',
  'evt-tomb-chamber': 'from-stone-400/45 to-violet-500/45',
  'evt-arcane-guild': 'from-purple-300/45 to-indigo-500/45',
  'evt-fate-dice-cup': 'from-violet-400/50 to-purple-500/45',
  'evt-chaos-dice-game': 'from-purple-400/45 to-pink-400/40',
  'evt-seal-demo': 'from-indigo-300/45 to-violet-500/45',
  'evt-nether-veil': 'from-indigo-500/50 to-purple-700/50',
};

export function tintForKey(k: string): string {
  if (k.startsWith('fallback-')) return 'from-cyan-400/40 to-teal-500/40';
  if (k.startsWith('evt-fallback-')) return 'from-violet-400/40 to-purple-500/40';
  return TINT_BY_KEY[k] ?? 'from-cyan-400/40 to-sky-500/40';
}

/** One continuous title band: wash + paper sheen; flanks sit inside (all magic / hero-magic). */
export const MagicTitleBand = memo(function MagicTitleBand({
  card,
  compact,
  isFlat,
  children,
}: {
  card: MagicPatternCardRef;
  compact?: boolean;
  isFlat?: boolean;
  children: ReactNode;
}) {
  const k = resolveMagicPatternKey(card);
  const tint = k ? tintForKey(k) : 'from-cyan-400/40 to-teal-500/40';
  const rose = card.type === 'hero-magic';
  const sheen = rose
    ? 'from-white/55 via-rose-50/38 to-rose-950/12'
    : 'from-white/55 via-cyan-50/35 to-sky-900/12';
  return (
    <div
      className={`relative z-10 flex min-w-0 items-stretch overflow-hidden rounded-md border border-transparent shadow-[inset_0_1px_0_rgba(255,255,255,0.55)] ${
        isFlat ? '-mt-0.5 mx-0.5' : compact ? '-mt-1 mx-0.5' : '-mt-1.5 mx-1'
      }`}
    >
      <div
        className={`pointer-events-none absolute inset-0 bg-gradient-to-r ${tint} mix-blend-multiply opacity-[0.22]`}
      />
      <div className={`pointer-events-none absolute inset-0 bg-gradient-to-b ${sheen}`} />
      <div className="relative z-10 flex min-h-[calc(1.3rem*var(--dh-card-instance-scale,1))] min-w-0 flex-1 items-stretch gap-0 sm:min-h-[calc(1.4rem*var(--dh-card-instance-scale,1))]">
        {children}
      </div>
    </div>
  );
});

/** Event name row: neutral paper only (no per-card color wash). */
export const EventTitleBand = memo(function EventTitleBand({
  card: _card,
  compact,
  isFlat,
  children,
}: {
  card: EventPatternCardRef;
  compact?: boolean;
  isFlat?: boolean;
  children: ReactNode;
}) {
  return (
    <div
      className={`relative z-10 flex min-w-0 items-stretch overflow-hidden rounded-md border border-transparent shadow-[inset_0_1px_0_rgba(255,255,255,0.55)] ${
        isFlat ? '-mt-0.5 mx-0.5' : compact ? '-mt-1 mx-0.5' : '-mt-1.5 mx-1'
      }`}
    >
      <div className="pointer-events-none absolute inset-0 bg-gradient-to-b from-white/50 via-stone-50/22 to-stone-900/6" />
      <div className="relative z-10 flex min-h-[calc(1.3rem*var(--dh-card-instance-scale,1))] min-w-0 flex-1 items-stretch gap-0 sm:min-h-[calc(1.4rem*var(--dh-card-instance-scale,1))]">
        {children}
      </div>
    </div>
  );
});

export function isMagicSpellCardType(type: string): boolean {
  return type === 'magic' || type === 'hero-magic';
}

export { isEventCardType };

function hashStickerKey(s: string): number {
  let h = 0;
  for (let i = 0; i < s.length; i++) {
    h = (h * 31 + s.charCodeAt(i)) | 0;
  }
  return Math.abs(h);
}

/** 12 distinct non-star shapes for unknown keys / fallback-N (never pentagram). */
function cuteFallbackSticker(index: number) {
  const n = ((index % 12) + 12) % 12;
  const g = { stroke: O, strokeWidth: SW, strokeLinecap: 'round' as const, strokeLinejoin: 'round' as const };
  switch (n) {
    case 0:
      return (
        <g {...g}>
          <rect x="8" y="10" width="16" height="12" rx="2" fill="#e9d5ff" />
          <path fill="none" d="M12 14h8M12 18h6" />
        </g>
      );
    case 1:
      return (
        <g {...g}>
          <path fill="#fde68a" d="M16 7l7 7-7 7-7-7z" />
        </g>
      );
    case 2:
      return (
        <g {...g} fill="none">
          <path stroke="#34d399" d="M6 14c4 2 8-2 12 0s8-2 12 0" />
          <path stroke="#6ee7b7" d="M6 20c4-2 8 2 12 0s8 2 12 0" />
        </g>
      );
    case 3:
      return (
        <g {...g} fill="none">
          <circle cx="16" cy="16" r="9" stroke="#93c5fd" />
          <circle cx="16" cy="16" r="4" fill="#bfdbfe" stroke={O} />
        </g>
      );
    case 4:
      return (
        <g {...g} fill="none" strokeWidth={SW}>
          <path stroke="#f472b6" d="M10 10l12 12M22 10L10 22" />
        </g>
      );
    case 5:
      return (
        <g {...g}>
          <path fill="#fcd34d" d="M16 8L9 22h14z" />
        </g>
      );
    case 6:
      return (
        <g {...g}>
          <rect x="9" y="12" width="14" height="8" rx="4" fill="#c4b5fd" />
          <path fill="none" d="M13 16h6" />
        </g>
      );
    case 7:
      return (
        <g {...g} fill="#7dd3fc">
          <circle cx="10" cy="16" r="2.5" />
          <circle cx="16" cy="16" r="2.5" />
          <circle cx="22" cy="16" r="2.5" />
          <path fill="none" d="M7 16h18" strokeWidth={1.8} />
        </g>
      );
    case 8:
      return (
        <g {...g} fill="none">
          <path stroke="#fb923c" d="M8 22L16 8l8 14" strokeWidth={SW} />
        </g>
      );
    case 9:
      return (
        <g {...g} fill="none">
          <path stroke="#94a3b8" d="M11 10v12M16 10v12M21 10v12" />
        </g>
      );
    case 10:
      return (
        <g {...g}>
          <path
            fill="#86efac"
            d="M16 6c4 4 6 10 4 16-2 4-6 6-10 4s-4-8 0-14c2-3 4-6 6-6z"
          />
        </g>
      );
    default:
      return (
        <g {...g}>
          <path fill="#fdba74" d="M10 22L16 10l10 12H10z" />
        </g>
      );
  }
}

/** One distinct glyph per spell key (+ fallbacks). No shared pentagram default. */
export function CuteSticker({ k }: { k: string }) {
  if (k.startsWith('fallback-')) {
    return cuteFallbackSticker(parseInt(k.replace('fallback-', ''), 10) || 0);
  }
  if (k.startsWith('evt-fallback-')) {
    return cuteFallbackSticker(parseInt(k.replace('evt-fallback-', ''), 10) || 0);
  }

  switch (k) {
    case 'battle-rally':
      return (
        <g stroke={O} strokeWidth={SW} strokeLinecap="round" strokeLinejoin="round">
          <path fill="#fcd34d" d="M8 24 L12 10 L16 24 M16 24 L20 10 L24 24" />
        </g>
      );
    case 'master-repair':
      return (
        <g stroke={O} strokeWidth={SW} strokeLinecap="round" strokeLinejoin="round">
          <circle cx="14" cy="16" r="6" fill="#bae6fd" />
          <path fill="#94a3b8" d="M20 12h8v3h-3v7h-3v-7h-2z" />
        </g>
      );
    case 'out-with-old':
      return (
        <g stroke={O} strokeWidth={SW} strokeLinecap="round" strokeLinejoin="round" fill="none">
          <rect x="9" y="12" width="8" height="8" rx="2" fill="#99f6e4" />
          <path stroke="#0d9488" d="M6 16H9M6 16c3-4 3-7 0-9" />
          <path stroke="#0d9488" d="M19 16h9M24 12l4 4-4 4" />
        </g>
      );
    case 'blessing-wind':
      return (
        <g stroke={O} strokeWidth={SW} strokeLinecap="round" fill="none">
          <path stroke="#22c55e" d="M6 12c6-2 10 0 14 2s10 2 14-1" />
          <path stroke="#4ade80" d="M8 20c5-2 9 0 13 2s9 2 12-1" />
        </g>
      );
    case 'labyrinth-retreat':
      return (
        <g stroke={O} strokeWidth={SW} strokeLinecap="round" strokeLinejoin="round" fill="none">
          <path stroke="#d97706" d="M8 8h12v6H12v6h14v6H8V8" />
        </g>
      );
    case 'world-swap':
      return (
        <g stroke={O} strokeWidth={SW} strokeLinecap="round" strokeLinejoin="round" fill="none">
          <path stroke="#a78bfa" d="M8 10v12M10 10v12M12 10v12" />
          <path stroke="#a78bfa" d="M22 10v12M24 10v12M26 10v12" />
          <path stroke="#6366f1" d="M14 16h6M14 14l-2 2 2 2M20 18l2-2-2-2" />
        </g>
      );
    case 'waterfall-reset':
      return (
        <g stroke={O} strokeWidth={SW} strokeLinecap="round" fill="none">
          <path stroke="#38bdf8" d="M10 10a6 6 0 1 1 0 0.1" />
          <path stroke="#0ea5e9" d="M22 22a6 6 0 1 0 0-0.1" />
        </g>
      );
    case 'storm-rain':
      return (
        <g stroke={O} strokeWidth={SW} strokeLinecap="round">
          <path fill="#fde047" d="M16 6L10 18h12z" />
          <path fill="none" stroke="#6366f1" d="M9 24v4M13 22v5M19 23v4M23 24v4" />
        </g>
      );
    case 'echo-bag':
      return (
        <g stroke={O} strokeWidth={SW} strokeLinecap="round" strokeLinejoin="round">
          <path fill="#fcd34d" d="M11 14h10l-1.5 10h-7z" />
          <path fill="none" d="M13 14c0-3 1.5-5 3-5s3 2 3 5" />
        </g>
      );
    case 'bulwark-ram':
      return (
        <g stroke={O} strokeWidth={SW} strokeLinecap="round" strokeLinejoin="round">
          <rect x="7" y="12" width="5" height="10" rx="0.5" fill="#93c5fd" />
          <rect x="13" y="10" width="5" height="12" rx="0.5" fill="#60a5fa" />
          <rect x="19" y="12" width="5" height="10" rx="0.5" fill="#93c5fd" />
          <path fill="#64748b" d="M26 22V10l5 6-5 6z" />
        </g>
      );
    case 'blood-gold-debt':
      return (
        <g stroke={O} strokeWidth={SW} strokeLinecap="round">
          <circle cx="11" cy="16" r="3.5" fill="#fde047" />
          <circle cx="16" cy="16" r="3.5" fill="#facc15" />
          <circle cx="21" cy="16" r="3.5" fill="#eab308" />
          <path fill="none" stroke="#f43f5e" d="M26 9v14M28 11c2 4 2 8 0 10" />
        </g>
      );
    case 'eternal-mend':
      return (
        <g stroke={O} strokeWidth={SW} strokeLinecap="round" strokeLinejoin="round" fill="none">
          <path stroke="#34d399" d="M10 12c4-4 8-2 10 2s8 4 12 0" />
          <path stroke="#10b981" d="M22 20c-4 4-8 2-10-2s-8-4-12 0" />
        </g>
      );
    case 'heal-echo':
      return (
        <g stroke={O} strokeWidth={SW} strokeLinecap="round" strokeLinejoin="round">
          <path
            fill="#fda4af"
            d="M16 8c-4 2-6 6-6 9s3 6 6 5c3 1 6-2 6-5s-2-7-6-9z"
          />
        </g>
      );
    case 'ember-echo':
      return (
        <g stroke={O} strokeWidth={SW} strokeLinecap="round" strokeLinejoin="round">
          <path fill="#fb923c" d="M11 22c-2-8 2-12 5-14-1 5 1 9 3 11" />
          <path fill="#f97316" d="M16 22c-1-6 2-10 5-12-1 4 0 8 1 10" />
          <path fill="#ea580c" d="M21 22c-2-7 3-11 6-13-2 5-1 9 0 11" />
        </g>
      );
    case 'shadow-spike':
      return (
        <g stroke={O} strokeWidth={SW} strokeLinecap="round" strokeLinejoin="round">
          <path fill="#c4b5fd" opacity="0.5" d="M18 7l-8 20h10z" transform="translate(4 0)" />
          <path fill="#7c3aed" d="M16 7l-8 20h16z" />
        </g>
      );
    case 'chaos-strike':
      return (
        <g stroke={O} strokeWidth={SW} strokeLinecap="round">
          <path stroke="#a855f7" strokeWidth="3" d="M16 8v16M8 16h16" />
          <path stroke="#eab308" strokeWidth="2.5" d="M10 10l12 12M22 10L10 22" />
          <circle cx="16" cy="16" r="2.5" fill="#f472b6" />
        </g>
      );
    case 'goblin-trick':
      return (
        <g stroke={O} strokeWidth={SW} strokeLinecap="round" fill="none">
          <path stroke="#84cc16" d="M7 18c4-8 10-6 14-2s8 4 11-3" />
          <circle cx="9" cy="9" r="2" fill="#bef264" />
          <circle cx="23" cy="11" r="1.8" fill="#a3e635" />
        </g>
      );
    case 'curse-seal':
      return (
        <g stroke={O} strokeWidth={SW} strokeLinecap="round" strokeLinejoin="round">
          <path
            fill="#fca5a5"
            d="M16 7l6 3.5v7L16 21l-6-3.5v-7z"
          />
          <path fill="none" stroke="#991b1b" d="M12 12l8 8M20 12l-8 8" strokeWidth="2" />
        </g>
      );
    case 'spell-echo':
      return (
        <g stroke={O} strokeWidth={SW} strokeLinecap="round" fill="none">
          <path stroke="#22d3ee" strokeWidth="2.5" d="M11 8l-3 16M14 8l-3 16" />
          <path stroke="#06b6d4" strokeWidth="2.5" d="M21 8l3 16M18 8l3 16" />
        </g>
      );
    case 'blood-gold-rite':
      return (
        <g stroke={O} strokeWidth={SW} strokeLinecap="round" strokeLinejoin="round">
          <path
            fill="#fb7185"
            d="M13 8c0 8 4 11 6 14 2-3 6-6 6-14-4 3-5 3-6 0-1 3-2 3-6 0z"
          />
          <circle cx="22" cy="17" r="4" fill="#fde047" />
        </g>
      );
    case 'war-blood-seal':
      return (
        <g stroke={O} strokeWidth={SW} strokeLinecap="round" strokeLinejoin="round">
          <path fill="#fecdd3" d="M11 11h10v10H11z" />
          <path fill="none" stroke="#be123c" d="M16 9v14M11 16h10" strokeWidth="2.2" />
        </g>
      );
    case 'hero-holy-light':
      return (
        <g stroke={O} strokeWidth={SW} strokeLinecap="round">
          <circle cx="16" cy="16" r="4" fill="#fef08a" />
          <path fill="none" stroke="#eab308" d="M16 7v4M16 21v4M7 16h4M21 16h4M9 9l3 3M23 23l-3-3M23 9l-3 3M9 23l3-3" />
        </g>
      );
    case 'hero-berserker-rage':
      return (
        <g stroke={O} strokeWidth={SW} strokeLinecap="round">
          <path stroke="#ef4444" strokeWidth="4" d="M9 9l14 14M23 9L9 23" />
        </g>
      );
    case 'knight-blood-greed':
      return (
        <g stroke={O} strokeWidth={SW} strokeLinecap="round" strokeLinejoin="round">
          <path fill="none" d="M10 12c0 6 4 9 6 10s6-2 6-10" />
          <path fill="#fecaca" d="M10 12h12v2H10z" />
          <circle cx="20" cy="9" r="3" fill="#fde047" />
        </g>
      );
    case 'knight-armor-strike':
      return (
        <g stroke={O} strokeWidth={SW} strokeLinecap="round" strokeLinejoin="round">
          <path fill="#94a3b8" d="M10 12h12v8l-6 4-6-4z" />
          <path fill="#cbd5e1" d="M22 10l6 6-6 6V10z" />
        </g>
      );
    case 'knight-missing-hp-smite':
      return (
        <g stroke={O} strokeWidth={SW} strokeLinecap="round" strokeLinejoin="round">
          <path fill="none" stroke="#f87171" d="M8 20c3-10 8-10 12-6s8 2 12-6" strokeWidth="2.5" />
          <path fill="#fca5a5" d="M14 10h4v8h-4z" />
        </g>
      );
    case 'knight-grave-nova':
      return (
        <g stroke={O} strokeWidth={SW} strokeLinecap="round">
          <circle cx="16" cy="16" r="3" fill="#fb923c" />
          <path stroke="#f97316" d="M16 6v5M16 21v5M6 16h5M21 16h5M9 9l4 4M23 23l-4-4M23 9l-4 4M9 23l4-4" />
        </g>
      );
    case 'knight-berserk-gambit':
      return (
        <g stroke={O} strokeWidth={SW} strokeLinecap="round" strokeLinejoin="round">
          <path fill="#f87171" d="M10 20c2-10 6-12 6-12s4 2 6 12" />
          <path fill="none" stroke="#dc2626" d="M12 12l4 3-2 5M20 12l-4 3 2 5" />
        </g>
      );
    case 'knight-recycle-flare':
      return (
        <g stroke={O} strokeWidth={SW} strokeLinecap="round" strokeLinejoin="round" fill="none">
          <path stroke="#fbbf24" d="M12 10a5 5 0 1 1 4 4" />
          <path stroke="#f59e0b" d="M14 8H9V5M20 24h5v-3" />
          <path stroke="#fcd34d" d="M14 16h8M20 13l3 3-3 3" />
        </g>
      );
    case 'knight-death-ward':
      return (
        <g stroke={O} strokeWidth={SW} strokeLinecap="round" strokeLinejoin="round">
          <path fill="#a5f3fc" d="M10 10h12v12H10z" />
          <path fill="none" d="M13 16h6M16 13v6" strokeWidth="2" />
        </g>
      );
    case 'knight-chaos-dice':
      return (
        <g stroke={O} strokeWidth={SW} strokeLinecap="round" strokeLinejoin="round">
          <rect x="9" y="11" width="7" height="7" rx="1" fill="#e9d5ff" transform="rotate(-8 12.5 14.5)" />
          <rect x="16" y="11" width="7" height="7" rx="1" fill="#ddd6fe" transform="rotate(10 19.5 14.5)" />
        </g>
      );
    case 'knight-graveyard-recall':
      return (
        <g stroke={O} strokeWidth={SW} strokeLinecap="round" strokeLinejoin="round">
          <path fill="#d6d3d1" d="M11 22V12h10v10" />
          <path fill="none" d="M13 16h6M14 14v5" />
          <path fill="none" d="M8 22c2-3 4-3 5 0M24 22c-2-3-4-3-5 0" />
        </g>
      );
    case 'knight-greed-curse':
      return (
        <g stroke={O} strokeWidth={SW} strokeLinecap="round" strokeLinejoin="round">
          <circle cx="16" cy="16" r="8" fill="#fef08a" />
          <path stroke="#854d0e" strokeWidth="2.2" d="M11 16h10M16 11v10" />
          <path fill="none" d="M22 8l3 2-2 2" />
        </g>
      );
    case 'evt-fate-crossroads':
      return (
        <g stroke={O} strokeWidth={SW} strokeLinecap="round" strokeLinejoin="round" fill="none">
          <path stroke="#8b5cf6" d="M16 7v18M7 16h18" />
          <circle cx="16" cy="16" r="3.5" fill="#c4b5fd" />
        </g>
      );
    case 'evt-vault':
      return (
        <g stroke={O} strokeWidth={SW} strokeLinecap="round" strokeLinejoin="round">
          <path fill="#fde68a" d="M9 14h14v10H9z" />
          <path fill="#a78bfa" d="M9 14l3.5-4h7L23 14" />
          <path fill="none" d="M13 18h6" />
        </g>
      );
    case 'evt-shadow-pact':
      return (
        <g stroke={O} strokeWidth={SW} strokeLinecap="round" fill="none">
          <path stroke="#7c3aed" d="M10 8c4 2 6 6 6 10s-2 8-6 10" />
          <path stroke="#4c1d95" d="M22 8c-4 2-6 6-6 10s2 8 6 10" />
        </g>
      );
    case 'evt-resonance-forge':
      return (
        <g stroke={O} strokeWidth={SW} strokeLinecap="round" strokeLinejoin="round">
          <path fill="#fb923c" d="M12 22h8v4h-8z" />
          <path fill="none" stroke="#ea580c" d="M10 14c2-4 6-6 6-6s4 2 6 6" />
          <circle cx="16" cy="11" r="2.5" fill="#fcd34d" />
        </g>
      );
    case 'evt-greed-altar':
      return (
        <g stroke={O} strokeWidth={SW} strokeLinecap="round" strokeLinejoin="round">
          <path fill="#c4b5fd" d="M8 22h16l-2-10H10z" />
          <path fill="#fbbf24" d="M12 12h8l-1-4h-6z" />
        </g>
      );
    case 'evt-honor-echo':
      return (
        <g stroke={O} strokeWidth={SW} strokeLinecap="round" fill="none">
          <path stroke="#8b5cf6" d="M8 14c3-4 8-4 11 0s8 4 11 0" />
          <path stroke="#a78bfa" d="M8 20c3-4 8-4 11 0s8 4 11 0" />
        </g>
      );
    case 'evt-blood-curse-rite':
      return (
        <g stroke={O} strokeWidth={SW} strokeLinecap="round" strokeLinejoin="round">
          <path fill="#fca5a5" d="M16 8l6 4v8l-6 4-6-4v-8z" />
          <path fill="none" stroke="#7f1d1d" d="M12 14l8 4M20 14l-8 4" />
        </g>
      );
    case 'evt-crimson-pact':
      return (
        <g stroke={O} strokeWidth={SW} strokeLinecap="round">
          <path fill="#f87171" d="M16 22c-4-6-6-10-6-13s2.5-5 6-5 6 2 6 5-2 7-6 13z" />
          <path fill="none" stroke="#7c3aed" d="M11 12h10M16 7v10" />
        </g>
      );
    case 'evt-tomb-chamber':
      return (
        <g stroke={O} strokeWidth={SW} strokeLinecap="round" strokeLinejoin="round" fill="none">
          <path stroke="#a8a29e" d="M10 22V12h12v10" />
          <path stroke="#8b5cf6" d="M8 12h16M12 8h8v4H12z" />
        </g>
      );
    case 'evt-arcane-guild':
      return (
        <g stroke={O} strokeWidth={SW} strokeLinecap="round" strokeLinejoin="round">
          <path fill="#ddd6fe" d="M8 18h16v4H8z" />
          <path fill="none" stroke="#6d28d9" d="M11 18v-6h10v6M16 12v-3" />
          <circle cx="16" cy="8" r="2" fill="#e9d5ff" />
        </g>
      );
    case 'evt-fate-dice-cup':
      return (
        <g stroke={O} strokeWidth={SW} strokeLinecap="round" strokeLinejoin="round">
          <path fill="#c4b5fd" d="M10 10h12l-1 12H11z" />
          <rect x="12" y="14" width="3" height="3" rx="0.5" fill="#fafafa" />
          <rect x="17" y="16" width="3" height="3" rx="0.5" fill="#fafafa" />
        </g>
      );
    case 'evt-chaos-dice-game':
      return (
        <g stroke={O} strokeWidth={SW} strokeLinecap="round" strokeLinejoin="round" fill="none">
          <rect x="9" y="9" width="6" height="6" rx="1" fill="#e9d5ff" transform="rotate(-12 12 12)" />
          <rect x="17" y="11" width="6" height="6" rx="1" fill="#ddd6fe" transform="rotate(14 20 14)" />
        </g>
      );
    case 'evt-seal-demo':
      return (
        <g stroke={O} strokeWidth={SW} strokeLinecap="round" strokeLinejoin="round">
          <rect x="10" y="10" width="12" height="12" rx="1" fill="#ede9fe" />
          <path fill="none" stroke="#6d28d9" d="M13 16h6M16 13v6" />
        </g>
      );
    case 'evt-nether-veil':
      return (
        <g stroke={O} strokeWidth={SW} strokeLinecap="round" fill="none">
          <circle cx="16" cy="16" r="7" stroke="#6366f1" />
          <path stroke="#a855f7" d="M9 16h14M16 9v14" opacity="0.7" />
          <path stroke="#4c1d95" d="M12 12l8 8M20 12l-8 8" />
        </g>
      );
    default:
      return cuteFallbackSticker(hashStickerKey(k));
  }
}

export const MagicNameFlankIcons = memo(function MagicNameFlankIcons({
  card,
  side,
  compact,
  isFlat,
  integrated,
}: {
  card: MagicPatternCardRef;
  side: Side;
  compact?: boolean;
  isFlat?: boolean;
  integrated?: boolean;
}) {
  const k = resolveMagicPatternKey(card);
  const roseBand = card.type === 'hero-magic';
  if (!k) {
    return (
      <span
        className={cn(
          'z-0 shrink-0',
          integrated
            ? isFlat
              ? 'inline-block w-[calc(1.15rem*var(--dh-card-instance-scale,1))]'
              : compact
                ? 'inline-block w-[calc(1.25rem*var(--dh-card-instance-scale,1))]'
                : 'inline-block w-[calc(1.65rem*var(--dh-card-instance-scale,1))] sm:w-[calc(1.75rem*var(--dh-card-instance-scale,1))]'
            : isFlat
              ? 'inline-block w-[calc(1.25rem*var(--dh-card-instance-scale,1))]'
              : compact
                ? 'inline-block w-[calc(1.5rem*var(--dh-card-instance-scale,1))]'
                : 'inline-block w-[calc(2rem*var(--dh-card-instance-scale,1))]',
        )}
        aria-hidden
      />
    );
  }

  const tint = tintForKey(k);
  const pos = side === 'left' ? 'object-[center_28%]' : 'object-[center_72%]';

  const frame = integrated
    ? `relative z-0 isolate h-full min-h-0 shrink-0 overflow-hidden ${
        isFlat
          ? 'w-[calc(1.15rem*var(--dh-card-instance-scale,1))]'
          : compact
            ? 'w-[calc(1.25rem*var(--dh-card-instance-scale,1))]'
            : 'w-[calc(1.65rem*var(--dh-card-instance-scale,1))] sm:w-[calc(1.75rem*var(--dh-card-instance-scale,1))]'
      }`
    : `relative z-0 shrink-0 overflow-hidden rounded-lg border-2 border-amber-900/40 bg-amber-50/80 shadow-[inset_0_1px_0_rgba(255,255,255,0.65),0_2px_4px_rgba(62,42,26,0.12)] ${
        isFlat
          ? 'h-[calc(1.25rem*var(--dh-card-instance-scale,1))] w-[calc(1.25rem*var(--dh-card-instance-scale,1))] min-h-[calc(1.25rem*var(--dh-card-instance-scale,1))] min-w-[calc(1.25rem*var(--dh-card-instance-scale,1))]'
          : compact
            ? 'h-[calc(1.5rem*var(--dh-card-instance-scale,1))] w-[calc(1.5rem*var(--dh-card-instance-scale,1))] min-h-[calc(1.5rem*var(--dh-card-instance-scale,1))] min-w-[calc(1.5rem*var(--dh-card-instance-scale,1))]'
            : 'h-[calc(2rem*var(--dh-card-instance-scale,1))] w-[calc(2rem*var(--dh-card-instance-scale,1))] min-h-[calc(2rem*var(--dh-card-instance-scale,1))] min-w-[calc(2rem*var(--dh-card-instance-scale,1))]'
      }`;

  return (
    <div className={frame} aria-hidden>
      <img
        src={skillScrollImage}
        alt=""
        draggable={false}
        className={`h-full w-full ${integrated ? 'scale-[1.2] opacity-90' : 'scale-[1.35]'} object-cover ${pos}`}
      />
      <div
        className={`pointer-events-none absolute inset-0 bg-gradient-to-br ${tint} mix-blend-multiply ${
          integrated ? 'opacity-80' : ''
        }`}
      />
      <div
        className={`pointer-events-none absolute inset-0 bg-gradient-to-t from-amber-950/10 via-transparent to-white/20 ${
          integrated ? 'to-white/12' : 'to-white/25'
        }`}
      />
      {integrated && (
        <div
          className={`pointer-events-none absolute inset-y-0 w-[calc(0.625rem*var(--dh-card-instance-scale,1))] ${
            side === 'left'
              ? `right-0 bg-gradient-to-l ${roseBand ? 'from-rose-50/90' : 'from-cyan-50/90'} to-transparent`
              : `left-0 bg-gradient-to-r ${roseBand ? 'from-rose-50/90' : 'from-cyan-50/90'} to-transparent`
          }`}
        />
      )}
      <svg
        className={`pointer-events-none absolute inset-0.5 ${integrated ? 'opacity-[0.72]' : 'drop-shadow-[0_1px_0_rgba(255,255,255,0.5)]'}`}
        viewBox="0 0 32 32"
        preserveAspectRatio="xMidYMid meet"
      >
        <CuteSticker k={k} />
      </svg>
    </div>
  );
});

/** Magic / hero-magic title flank on board: same as event — transparent slot, SVG pattern only (no scroll PNG). */
export const MagicNameLeftGlyph = memo(function MagicNameLeftGlyph({
  card,
  compact,
  isFlat,
}: {
  card: MagicPatternCardRef;
  compact?: boolean;
  isFlat?: boolean;
}) {
  const k = resolveMagicPatternKey(card);
  if (!k) return null;

  const svgBox = isFlat
    ? 'h-[calc(1.05rem*var(--dh-card-instance-scale,1))] w-[calc(1.05rem*var(--dh-card-instance-scale,1))]'
    : compact
      ? 'h-[calc(1.25rem*var(--dh-card-instance-scale,1))] w-[calc(1.25rem*var(--dh-card-instance-scale,1))]'
      : 'h-[calc(1.35rem*var(--dh-card-instance-scale,1))] w-[calc(1.35rem*var(--dh-card-instance-scale,1))] sm:h-[calc(1.5rem*var(--dh-card-instance-scale,1))] sm:w-[calc(1.5rem*var(--dh-card-instance-scale,1))]';

  return (
    <div className="relative z-0 isolate flex h-full w-full items-center justify-center bg-transparent" aria-hidden>
      <svg
        className={cn(
          'pointer-events-none shrink-0 opacity-[0.88] drop-shadow-[0_1px_0_rgba(255,255,255,0.45)]',
          svgBox,
        )}
        viewBox="0 0 32 32"
        preserveAspectRatio="xMidYMid meet"
      >
        <CuteSticker k={k} />
      </svg>
    </div>
  );
});

/** Event title flank: transparent — only the SVG glyph (no box behind it). */
export const EventNameLeftGlyph = memo(function EventNameLeftGlyph({
  card,
  compact,
  isFlat,
}: {
  card: EventPatternCardRef;
  compact?: boolean;
  isFlat?: boolean;
}) {
  const k = resolveEventPatternKey(card);
  if (!k) return null;

  const svgBox = isFlat
    ? 'h-[calc(1.05rem*var(--dh-card-instance-scale,1))] w-[calc(1.05rem*var(--dh-card-instance-scale,1))]'
    : compact
      ? 'h-[calc(1.25rem*var(--dh-card-instance-scale,1))] w-[calc(1.25rem*var(--dh-card-instance-scale,1))]'
      : 'h-[calc(1.35rem*var(--dh-card-instance-scale,1))] w-[calc(1.35rem*var(--dh-card-instance-scale,1))] sm:h-[calc(1.5rem*var(--dh-card-instance-scale,1))] sm:w-[calc(1.5rem*var(--dh-card-instance-scale,1))]';

  return (
    <div className="relative z-0 isolate flex h-full w-full items-center justify-center bg-transparent" aria-hidden>
      <svg
        className={cn(
          'pointer-events-none shrink-0 opacity-[0.88] drop-shadow-[0_1px_0_rgba(255,255,255,0.45)]',
          svgBox,
        )}
        viewBox="0 0 32 32"
        preserveAspectRatio="xMidYMid meet"
      >
        <CuteSticker k={k} />
      </svg>
    </div>
  );
});

/** Matches magic/event title side slots so the name stays optically centered. */
export function eventTitleSideSlotClass(isFlat?: boolean, compact?: boolean): string {
  return isFlat
    ? 'w-[calc(1.15rem*var(--dh-card-instance-scale,1))]'
    : compact
      ? 'w-[calc(1.25rem*var(--dh-card-instance-scale,1))]'
      : 'w-[calc(1.65rem*var(--dh-card-instance-scale,1))] sm:w-[calc(1.75rem*var(--dh-card-instance-scale,1))]';
}

/** Full-area spell art for modals / deck lists (replaces flat scroll PNG for magic + hero-magic). */
export const MagicSpellPreview = memo(function MagicSpellPreview({
  card,
  className,
  aspect = 'square',
  /** Card-detail `aspect-video` header: less zoom + glyph shifted up so the sticker is not clipped at the bottom. */
  detailBanner = false,
  /** Grids / long lists: defer decode and only load near viewport to reduce jank. */
  lazyImage = false,
}: {
  card: MagicPatternCardRef;
  className?: string;
  aspect?: 'square' | 'landscape' | 'none';
  detailBanner?: boolean;
  lazyImage?: boolean;
}) {
  const rose = card.type === 'hero-magic';
  const sheen = rose
    ? 'from-white/50 via-rose-50/35 to-rose-950/14'
    : 'from-white/50 via-cyan-50/32 to-sky-900/12';

  const aspectCls =
    aspect === 'landscape' ? 'aspect-video w-full' : aspect === 'square' ? 'aspect-square w-full' : '';

  const k = resolveMagicPatternKey(card);

  if (!k) {
    return (
      <div
        className={cn(
          'relative overflow-hidden rounded-md border border-transparent bg-muted/70',
          aspectCls,
          className,
        )}
        aria-hidden
      />
    );
  }

  const tint = tintForKey(k);

  return (
    <div
      className={cn(
        'relative overflow-hidden rounded-md border border-transparent shadow-[inset_0_1px_0_rgba(255,255,255,0.45)]',
        aspectCls,
        className,
      )}
      aria-hidden
    >
      <img
        src={skillScrollImage}
        alt=""
        draggable={false}
        loading={lazyImage ? 'lazy' : undefined}
        decoding={lazyImage ? 'async' : undefined}
        fetchPriority={lazyImage ? 'low' : undefined}
        className={cn(
          'h-full w-full object-cover opacity-[0.93]',
          detailBanner ? 'scale-[1.06] object-center' : 'scale-[1.18] object-center',
        )}
      />
      <div
        className={`pointer-events-none absolute inset-0 bg-gradient-to-br ${tint} mix-blend-multiply opacity-[0.78]`}
      />
      <div className="pointer-events-none absolute inset-0 bg-gradient-to-t from-amber-950/10 via-transparent to-white/18" />
      <div className={`pointer-events-none absolute inset-0 bg-gradient-to-b ${sheen}`} />
      <svg
        className={cn(
          'pointer-events-none absolute opacity-[0.8] drop-shadow-[0_1px_0_rgba(255,255,255,0.35)]',
          detailBanner
            ? 'inset-x-[4%] top-0 bottom-[28%] -translate-y-[18%]'
            : 'inset-[10%]',
        )}
        viewBox="0 0 32 32"
        preserveAspectRatio="xMidYMid meet"
      >
        <CuteSticker k={k} />
      </svg>
    </div>
  );
});

/**
 * Event preview for modals / lists: event scroll bulletin (like magic’s skill scroll) + glyph on top.
 * No per-event tint multiply — pattern colors come only from the SVG art.
 */
export const EventPatternPreview = memo(function EventPatternPreview({
  card,
  className,
  aspect = 'square',
  detailBanner = false,
  lazyImage = false,
}: {
  card: EventPatternCardRef;
  className?: string;
  aspect?: 'square' | 'landscape' | 'none';
  detailBanner?: boolean;
  lazyImage?: boolean;
}) {
  const sheen = 'from-white/50 via-amber-50/30 to-amber-950/12';

  const aspectCls =
    aspect === 'landscape' ? 'aspect-video w-full' : aspect === 'square' ? 'aspect-square w-full' : '';

  const k = resolveEventPatternKey(card);

  if (!k) {
    return (
      <div
        className={cn('relative overflow-hidden rounded-md border border-transparent bg-muted/70', aspectCls, className)}
        aria-hidden
      />
    );
  }

  return (
    <div
      className={cn(
        'relative overflow-hidden rounded-md border border-transparent shadow-[inset_0_1px_0_rgba(255,255,255,0.45)]',
        aspectCls,
        className,
      )}
      aria-hidden
    >
      <img
        src={eventScrollImage}
        alt=""
        draggable={false}
        loading={lazyImage ? 'lazy' : undefined}
        decoding={lazyImage ? 'async' : undefined}
        fetchPriority={lazyImage ? 'low' : undefined}
        className={cn(
          'h-full w-full object-cover opacity-[0.93]',
          detailBanner ? 'scale-[1.06] object-center' : 'scale-[1.18] object-center',
        )}
      />
      <div className="pointer-events-none absolute inset-0 bg-gradient-to-t from-amber-950/10 via-transparent to-white/18" />
      <div className={`pointer-events-none absolute inset-0 bg-gradient-to-b ${sheen}`} />
      <svg
        className={cn(
          'pointer-events-none absolute opacity-[0.8] drop-shadow-[0_1px_0_rgba(255,255,255,0.35)]',
          detailBanner
            ? 'inset-x-[4%] top-0 bottom-[28%] -translate-y-[18%]'
            : 'inset-[10%]',
        )}
        viewBox="0 0 32 32"
        preserveAspectRatio="xMidYMid meet"
      >
        <CuteSticker k={k} />
      </svg>
    </div>
  );
});
