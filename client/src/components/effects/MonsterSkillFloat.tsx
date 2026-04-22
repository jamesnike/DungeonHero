/**
 * MonsterSkillFloat — blocking floating-text component announcing a monster
 * skill trigger above the firing monster card.
 *
 * USAGE:
 *   Render this component as a positioned child of the cell containing the
 *   firing monster card (the parent must be `position: relative`). The
 *   animation handles its own absolute placement and z-index so all the
 *   parent has to do is reserve a stacking context.
 *
 * BLOCKING SEMANTICS:
 *   The component itself does not block — it is purely a presentation layer.
 *   The actual pipeline pause is enforced by the reducer (see
 *   `rules/skill-float.ts` + `pipeline.ts` HARD_PAUSE_PHASES). This component
 *   only needs to render for its full duration; the parent hook is responsible
 *   for dispatching `RELEASE_MONSTER_SKILL_FLOAT` after `SKILL_FLOAT_DURATION_MS`.
 */
import { type CSSProperties } from 'react';
import {
  type MonsterSkillKey,
  type MonsterSkillKind,
  getMonsterSkillEntry,
} from '@/game-core/monsterSkillNames';

interface MonsterSkillFloatProps {
  skillKey: MonsterSkillKey;
  /**
   * Optional override for placement when the parent isn't a positioned
   * monster cell (e.g. equipment slot, banner fallback). Defaults to the
   * standard "above the card" placement defined in `index.css`.
   */
  style?: CSSProperties;
}

export function MonsterSkillFloat({ skillKey, style }: MonsterSkillFloatProps) {
  const { name, kind } = getMonsterSkillEntry(skillKey);
  return (
    <div
      className={`monster-skill-float ${kindClass(kind)}`}
      role="status"
      aria-live="polite"
      style={style}
    >
      {name}
    </div>
  );
}

function kindClass(kind: MonsterSkillKind): string {
  return `monster-skill-float--${kind}`;
}
