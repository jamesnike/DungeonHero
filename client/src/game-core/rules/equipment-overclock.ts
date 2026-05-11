import type { GameState } from '../types';
import { countEternalRelics, hasEternalRelic } from '@/lib/eternalRelics';

/**
 * 永恒护符·装备超频 aura check (stackable).
 *
 * Active iff:
 *   1. The hero holds at least one `equip-overclock` relic.
 *   2. `state.permanentMagicRecycleBag.length > 15` (i.e. 16+ cards in recycle).
 *
 * When active, equipment-slot derived effects fire **N extra times** where
 * `N = countEternalRelics(state.eternalRelics, 'equip-overclock')`. Drinking
 * the granting potion (`装备超频药`) again pushes another `equip-overclock`
 * relic into `state.eternalRelics`, so a player with 2 drinks sees each
 * equipment effect fire `1 + 2 = 3` times when the aura is active.
 *
 * Covered surfaces (each fires `1 + N` times when aura is active):
 *   - `onEquipEffect` handlers
 *   - lastWords / displaced-lastWords totalTriggers (additive with 墓园守卫)
 *   - hero-attack derived effects (heal-on-attack, overkill bonuses, kill rewards,
 *     post-attack spell damage, post-attack hand recycle, dragon retaliation)
 *   - block-derived effects (reflect damage, dragon retaliation, perfect-block
 *     rewards, shield-reflect actions)
 *   - durability-loss derived effects (mine boost, bleed, dragon bleed destroy,
 *     wraith rebirth, swarm corrode, golem layer reflect)
 *
 * Explicitly **does not** repeat:
 *   - the weapon swing damage itself
 *   - the block judgement itself (armor calc / durability tick)
 *   - hand-card effects (`onDiscardDamage`, `onEnterHand`)
 *   - amulet effects
 *   - monster `enterEffect` / building / row-level effects
 */
export function isEquipOverclockActive(state: GameState): boolean {
  return (
    hasEternalRelic(state.eternalRelics, 'equip-overclock') &&
    state.permanentMagicRecycleBag.length > 15
  );
}

/**
 * Returns the number of extra triggers granted by `equip-overclock` relics
 * (0 when the aura is inactive). Used by `totalTriggers` formulas, e.g.
 *   lastWords: `1 + lastWordsExtraTriggerCount + equipOverclockExtraTriggers(state)`
 *
 * Stacks linearly: each `equip-overclock` relic copy adds 1 extra trigger
 * while the aura is active (recycle bag > 15 cards).
 */
export function equipOverclockExtraTriggers(state: GameState): number {
  if (!isEquipOverclockActive(state)) return 0;
  return countEternalRelics(state.eternalRelics, 'equip-overclock');
}
