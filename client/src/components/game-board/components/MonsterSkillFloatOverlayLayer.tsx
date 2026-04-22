/**
 * MonsterSkillFloatOverlayLayer — renders the currently-active monster skill
 * float (if any) as an absolutely-positioned child of the game board.
 *
 * The hook (`useMonsterSkillFloats`) already chose the anchor (above the
 * firing monster's cell, or a centered fallback when the cell is missing
 * — e.g. the trigger came from an equipment slot). We just paint it.
 *
 * Z-INDEX:
 *   The float MUST sit above all other board chrome (combat overlays, modals
 *   that open BEFORE the awaitingSkillFloat phase is reached, etc.). The
 *   reducer hard-pauses the action pipeline so no NEW modals can open during
 *   the animation, but anything already mounted needs to be visually shouted
 *   over. The base `.monster-skill-float` z-index in `index.css` is 50; we
 *   bump the wrapper to 200 here so it floats over modals' backdrops too.
 */
import { memo } from 'react';
import { MonsterSkillFloat } from '@/components/effects/MonsterSkillFloat';
import type { ActiveMonsterSkillFloat } from '../hooks/useMonsterSkillFloats';

export interface MonsterSkillFloatOverlayLayerProps {
  active: ActiveMonsterSkillFloat | null;
}

function MonsterSkillFloatOverlayLayerInner({ active }: MonsterSkillFloatOverlayLayerProps) {
  if (!active) return null;
  return (
    <div
      className="pointer-events-none"
      style={{
        ...active.anchorStyle,
        zIndex: 200,
      }}
      aria-hidden={false}
    >
      <MonsterSkillFloat key={active.id} skillKey={active.skillKey} />
    </div>
  );
}

export const MonsterSkillFloatOverlayLayer = memo(MonsterSkillFloatOverlayLayerInner);
