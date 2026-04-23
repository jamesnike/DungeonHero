/**
 * StunReleasedGoldFloat — non-blocking visual that plays once on the monster
 * cell when 「雷金护符」(amulet: stun-gold) just consumed a stun:
 *
 *   - A bright yellow / gold burst ring expands outward from the cell,
 *     visually "shattering" the spinning stun overlay (which also disappears
 *     this same frame because the reducer enqueues UPDATE_MONSTER_CARD
 *     { isStunned: false }).
 *   - A coin-shaped sparkle pulses in the center.
 *   - A "+10 G" / "+20 G" text rises and fades.
 *
 * USAGE:
 *   Render as a positioned overlay above the firing monster's cell. The
 *   parent (`StunReleasedGoldOverlayLayer`) provides absolute placement via
 *   `style`. This component handles all visual choreography via CSS keyframes
 *   defined in `index.css` (`@keyframes dh-stun-gold-*`).
 *
 *   The component is purely presentational — the `key` prop on the parent
 *   ensures each fresh emit re-runs the keyframe animation; auto-removal is
 *   handled by `useStunReleasedGoldFx`'s timer.
 *
 * NON-BLOCKING:
 *   Unlike `MonsterSkillFloat`, this float does NOT pause the game pipeline.
 *   The game logic (gold modify, un-stun, follow-up combat) continues
 *   immediately while the visual plays out. This matches the intent of an
 *   amulet passive: the trigger is silent + automatic, the player just sees
 *   the loot pop on the affected monster.
 */
import { type CSSProperties } from 'react';

interface StunReleasedGoldFloatProps {
  /** Gold delta to display ("+10 G", "+20 G", etc.). Should be > 0. */
  goldDelta: number;
  /** Optional placement override; defaults to `StunReleasedGoldOverlayLayer`'s anchor. */
  style?: CSSProperties;
}

export function StunReleasedGoldFloat({ goldDelta, style }: StunReleasedGoldFloatProps) {
  return (
    <div
      className="dh-stun-gold-float"
      role="status"
      aria-live="polite"
      style={style}
    >
      {/* Expanding burst ring — replaces the spinning stun overlay visually. */}
      <span className="dh-stun-gold-float__ring" />
      <span className="dh-stun-gold-float__ring dh-stun-gold-float__ring--inner" />
      {/* Center coin sparkle. */}
      <span className="dh-stun-gold-float__coin" aria-hidden>
        <svg viewBox="0 0 32 32" xmlns="http://www.w3.org/2000/svg">
          <defs>
            <radialGradient id="dh-stun-gold-grad" cx="35%" cy="30%" r="70%">
              <stop offset="0%" stopColor="#fffbeb" />
              <stop offset="55%" stopColor="#fbbf24" />
              <stop offset="100%" stopColor="#b45309" />
            </radialGradient>
          </defs>
          <circle cx="16" cy="16" r="13" fill="url(#dh-stun-gold-grad)" stroke="#92400e" strokeWidth="1.5" />
          <text
            x="16"
            y="22"
            textAnchor="middle"
            fontSize="18"
            fontWeight="900"
            fill="#7c2d12"
            fontFamily="system-ui, -apple-system, sans-serif"
          >
            G
          </text>
        </svg>
      </span>
      {/* Floating "+N G" text. */}
      <span className="dh-stun-gold-float__text">+{goldDelta} G</span>
    </div>
  );
}
