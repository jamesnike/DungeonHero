/**
 * Combat Domain — pure game logic for combat resolution.
 *
 * Every function takes the current GameState (or relevant slices) and returns
 * either a new value or a Partial<GameState> patch. The GameEngine applies
 * the patch and emits events for UI animations.
 */

import type { GameCardData, HeroMagicId } from '@/components/GameCard';
import type { RngState } from './rng';
import { nextRandom, nextInt, nextBool, shuffle as rngShuffle, pickRandom } from './rng';
import type {
  CombatState,
  CombatInitiator,
  EquipmentSlotId,
  EquipmentSlotBonusState,
  SlotPermanentBonus,
  ActiveRowSlots,
  BlockTarget,
  ActiveAmuletEffects,
} from '@/components/game-board/types';
import type { EquipmentBuffSnapshot } from '@/lib/gameStorage';
import type { SlotTempArmorState } from '@/components/game-board/types';
import type { GameState } from './types';
import { initialCombatState, INITIAL_HP, STRENGTH_SELF_DAMAGE } from './constants';
import { flattenActiveRowSlots } from './helpers';
import { isMonsterMagicImmuneByBuilding } from './buildingAura';
import { getHeroSkillById } from '@/lib/heroSkills';
import type { HeroSkillId } from '@/lib/heroSkills';
import type { MonsterSkillKey } from './monsterSkillNames';

/**
 * Lightweight pair telling the call site to enqueue a
 * `TRIGGER_MONSTER_SKILL_FLOAT` action for a given monster + skill name.
 *
 * The pure helpers in this file deliberately don't import the `GameAction`
 * type (they pre-date the action layer), so the call site in `rules/turn.ts`
 * is responsible for converting these triggers into actions in the right
 * order — BEFORE any follow-up gameplay actions so the float plays first.
 */
export interface MonsterSkillFloatTrigger {
  monsterId: string;
  skillKey: MonsterSkillKey;
}

// ---------------------------------------------------------------------------
// Pure computation: monster damage (overflow does NOT penetrate layers)
// ---------------------------------------------------------------------------

export function damageMonsterWithLayerOverflow(
  monster: GameCardData,
  damage: number,
  _maxLayerLoss?: number,
  opts?: { bypassMaxPerHit?: boolean },
): GameCardData {
  let effectiveDamage = damage;
  // bypassMaxPerHit is for "fixed-effect" sources (e.g. 命运之刃 fate-dice-strike)
  // that semantically "directly strip N layers" and should ignore per-hit damage
  // caps such as Golem's 护体 (maxDamagePerHit = 5). Normal weapon / spell
  // damage MUST keep the cap to preserve elite Golem's defensive identity.
  if (
    monster.maxDamagePerHit &&
    effectiveDamage > monster.maxDamagePerHit &&
    !monster.isStunned &&
    !opts?.bypassMaxPerHit
  ) {
    effectiveDamage = monster.maxDamagePerHit;
  }
  if (effectiveDamage <= 0) return monster;

  if (!monster.maxHp || monster.hp == null) {
    return {
      ...monster,
      hp: Math.max(0, (monster.hp || monster.value) - effectiveDamage),
      value: Math.max(0, (monster.hp || monster.value) - effectiveDamage),
    };
  }

  const layers = monster.currentLayer ?? monster.hpLayers ?? monster.fury ?? 1;
  const hpNow = monster.hp ?? 0;
  if (layers <= 0 || hpNow <= 0) return monster;

  if (effectiveDamage < hpNow) {
    return { ...monster, hp: hpNow - effectiveDamage };
  }

  const newLayer = layers - 1;

  let attackBoost = 0;
  if (monster.bleedEffect?.startsWith('attack+') && newLayer > 0) {
    attackBoost = parseInt(monster.bleedEffect.replace('attack+', ''), 10) || 0;
  }

  const maxHp = monster.maxHp ?? hpNow;
  return {
    ...monster,
    currentLayer: newLayer,
    hp: newLayer > 0 ? maxHp : 0,
    attack: (monster.attack ?? monster.value) + attackBoost,
    value: monster.value + attackBoost,
    specialAttackBoost: (monster.specialAttackBoost ?? 0) + attackBoost,
    tempAttackBoost: (monster.tempAttackBoost ?? 0) + attackBoost,
  };
}

/**
 * Compute overkill damage — the portion of damage that exceeds the current
 * layer's HP. Overflow never penetrates to the next layer.
 */
export function computeOverkill(
  monster: GameCardData,
  damage: number,
  _maxLayerLoss?: number,
): number {
  let effectiveDamage = damage;
  if (monster.maxDamagePerHit && effectiveDamage > monster.maxDamagePerHit && !monster.isStunned) {
    effectiveDamage = monster.maxDamagePerHit;
  }
  if (effectiveDamage <= 0) return 0;

  if (!monster.maxHp || monster.hp == null) {
    const hp = monster.hp || monster.value || 0;
    return Math.max(0, effectiveDamage - hp);
  }

  const hpNow = monster.hp ?? 0;
  return Math.max(0, effectiveDamage - hpNow);
}

/** True if this damage would overkill the current layer. */
export function chaosStrikeHasOverkill(monster: GameCardData, rawDamage: number): boolean {
  return computeOverkill(monster, rawDamage) > 0;
}

export function isMonsterDefeated(monster: GameCardData): boolean {
  return (monster.currentLayer ?? 0) <= 0 || (monster.hp ?? 0) <= 0;
}

// ---------------------------------------------------------------------------
// Spell-damage mitigation preview — pure mirror of `reduceDealDamageToMonster`
// ---------------------------------------------------------------------------

/**
 * Result of previewing the spell-damage mitigation chain a `DEAL_DAMAGE_TO_MONSTER`
 * action with `isSpellDamage: true` would actually apply.
 *
 * Resolvers (e.g. 淬炼冲击 / 混沌冲击) need this BEFORE enqueueing follow-up
 * bonus actions like `SET_UPGRADE_MODAL_OPEN` / `DRAW_FROM_BACKPACK` — those
 * bonuses are gated on "actually overkilled", not on "tried to deal X damage".
 *
 * **MUST stay in lock-step with `rules/combat.ts > reduceDealDamageToMonster`.**
 * Any new spell-damage mitigation added there must be mirrored here, otherwise
 * resolvers will silently mispredict and trigger ghost bonuses.
 */
export interface SpellDamageMitigationPreview {
  effectiveDamage: number;
  immuneByBuilding: boolean;
  bugletShielded: boolean;
  spellResisted: boolean;
}

export function computeEffectiveSpellDamageOnMonster(
  state: GameState,
  monsterId: string,
  rawDamage: number,
): SpellDamageMitigationPreview {
  const empty = (): SpellDamageMitigationPreview => ({
    effectiveDamage: 0,
    immuneByBuilding: false,
    bugletShielded: false,
    spellResisted: false,
  });

  const idx = (state.activeCards as (GameCardData | null)[]).findIndex(c => c?.id === monsterId);
  if (idx < 0) return empty();
  const monster = state.activeCards[idx] as GameCardData | null;
  if (!monster || monster.type !== 'monster') return empty();

  // 1. Curse stele aura — total magic immunity for the column.
  if (isMonsterMagicImmuneByBuilding(state.activeCards as ActiveRowSlots, state.activeCardStacks ?? {}, idx)) {
    return { effectiveDamage: 0, immuneByBuilding: true, bugletShielded: false, spellResisted: false };
  }

  // 2. Swarm buglet shield — fully blocks when any buglet is on the field.
  if (monster.swarmBugletShield && !monster.isStunned) {
    const hasBuglet = (state.activeCards as (GameCardData | null)[]).some(c => c && (c as { isBuglet?: boolean }).isBuglet);
    if (hasBuglet) {
      return { effectiveDamage: 0, immuneByBuilding: false, bugletShielded: true, spellResisted: false };
    }
  }

  // 3. spellDamageReduction (e.g. Wraith 50%).
  let dmg = rawDamage;
  let resisted = false;
  if (monster.spellDamageReduction && !monster.isStunned) {
    dmg = Math.max(1, Math.floor(dmg * (1 - monster.spellDamageReduction)));
    resisted = true;
  }

  // 4. maxDamagePerHit cap (Golem 护体). Note `damageMonsterWithLayerOverflow`
  // also applies this cap, so ignoring it here would over-predict overkill.
  if (monster.maxDamagePerHit && dmg > monster.maxDamagePerHit && !monster.isStunned) {
    dmg = monster.maxDamagePerHit;
  }

  return { effectiveDamage: dmg, immuneByBuilding: false, bugletShielded: false, spellResisted: resisted };
}

// ---------------------------------------------------------------------------
// Begin combat
// ---------------------------------------------------------------------------

export function beginCombatPatch(
  prev: CombatState,
  monster: GameCardData,
  initiator: CombatInitiator,
  pendingDefeatIds: Set<string>,
): CombatState {
  const liveEngagedIds = prev.engagedMonsterIds.filter(id => !pendingDefeatIds.has(id));
  const alreadyEngaged = liveEngagedIds.includes(monster.id);
  const nextEngaged = alreadyEngaged ? liveEngagedIds : [...liveEngagedIds, monster.id];

  if (liveEngagedIds.length === 0) {
    const freshAttackState = {
      heroAttacksThisTurn: { equipmentSlot1: false, equipmentSlot2: false } as Record<EquipmentSlotId, boolean>,
      heroAttacksRemaining: 2,
      heroDamageThisTurn: {} as Record<string, number>,
      monsterAttackQueue: [] as string[],
      slotBlocksThisTurn: { equipmentSlot1: false, equipmentSlot2: false } as Record<EquipmentSlotId, boolean>,
      slotDurabilityUsedThisTurn: { equipmentSlot1: 0, equipmentSlot2: 0 } as Record<EquipmentSlotId, number>,
    };
    if (initiator === 'monster') {
      return {
        ...prev,
        engagedMonsterIds: nextEngaged,
        initiator,
        currentTurn: 'monster',
        ...freshAttackState,
        pendingBlock: {
          monsterId: monster.id,
          attackValue: monster.attack ?? monster.value,
          monsterName: monster.name,
        },
      };
    }
    return {
      ...prev,
      engagedMonsterIds: nextEngaged,
      initiator,
      currentTurn: 'hero',
      ...freshAttackState,
      pendingBlock: null,
    };
  }

  if (initiator === 'monster') {
    if (prev.currentTurn === 'hero' && !prev.pendingBlock) {
      return {
        ...prev,
        engagedMonsterIds: nextEngaged,
        currentTurn: 'monster',
        pendingBlock: {
          monsterId: monster.id,
          attackValue: monster.attack ?? monster.value,
          monsterName: monster.name,
        },
      };
    }
    return {
      ...prev,
      engagedMonsterIds: nextEngaged,
      monsterAttackQueue: [...prev.monsterAttackQueue, monster.id],
    };
  }

  return {
    ...prev,
    engagedMonsterIds: nextEngaged,
    initiator: prev.initiator ?? initiator,
  };
}

// ---------------------------------------------------------------------------
// End hero turn — transitions to monster turn
// ---------------------------------------------------------------------------

export interface EndHeroTurnResult {
  combatState: CombatState;
  activeCards: ActiveRowSlots;
  berserkerSlotUsed: Record<string, boolean>;
  flashSlotUsed: Record<string, number>;
  gambitSlotUsed: Record<string, number>;
  weaponExtraAttackUsed: Record<string, number>;
  logs: Array<{ type: string; message: string }>;
  /** Monster-skill triggers fired during this hero turn end (e.g. dragon regen, elite heal) */
  skillFloats: MonsterSkillFloatTrigger[];
  rng: RngState;
}

export function endHeroTurnPatch(
  state: GameState,
  heroTurnLayerLossIds: Set<string>,
): EndHeroTurnResult {
  let rng = state.rng;
  const logs: Array<{ type: string; message: string }> = [];
  const skillFloats: MonsterSkillFloatTrigger[] = [];
  const engagedMonsters = flattenActiveRowSlots(state.activeCards).filter(
    c => c.type === 'monster' && state.combatState.engagedMonsterIds.includes(c.id),
  );

  if (engagedMonsters.length === 0) {
    return {
      combatState: { ...initialCombatState },
      activeCards: state.activeCards,
      berserkerSlotUsed: {},
      flashSlotUsed: {},
      gambitSlotUsed: {},
      weaponExtraAttackUsed: {},
      logs: [{ type: 'combat', message: '战斗结束' }],
      skillFloats,
      rng: state.rng,
    };
  }

  const newActiveCards = [...state.activeCards] as ActiveRowSlots;
  engagedMonsters.forEach(monster => {
    const idx = newActiveCards.findIndex(c => c?.id === monster.id);
    if (idx < 0) return;

    if (monster.eliteRegenHeroTurn && !monster.isStunned && !heroTurnLayerLossIds.has(monster.id)) {
      // Unified layer-heal rule: layer change preserves hp; if already at max
      // layers, fall back to refilling hp (so the skill still does something
      // meaningful for a damaged-but-full-layer monster).
      const currentLayer = monster.currentLayer ?? monster.fury ?? 1;
      const maxLayers = monster.fury ?? monster.hpLayers ?? 1;
      const maxHp = monster.maxHp ?? monster.hp ?? 0;
      const currentHp = monster.hp ?? 0;
      if (currentLayer < maxLayers) {
        const restoredLayer = currentLayer + 1;
        newActiveCards[idx] = {
          ...monster,
          currentLayer: restoredLayer,
          // hp preserved on layer gain
        };
        skillFloats.push({ monsterId: monster.id, skillKey: 'heroTurnEnd:eliteRegen' });
        logs.push({ type: 'combat', message: `${monster.name} 未受到血层伤害，恢复了一个血层！当前 ${restoredLayer} 层。` });
        return;
      }
      if (currentHp < maxHp) {
        newActiveCards[idx] = {
          ...monster,
          hp: maxHp,
        };
        skillFloats.push({ monsterId: monster.id, skillKey: 'heroTurnEnd:eliteRegen' });
        logs.push({ type: 'combat', message: `${monster.name} 未受到血层伤害，血量回满！` });
        return;
      }
      // currentLayer >= maxLayers and hp == maxHp → no-op (skip)
    }

    if (monster.eliteHealOtherMonster && !monster.isStunned && !heroTurnLayerLossIds.has(monster.id)) {
      // Unified layer-heal rule: candidates include both "未满层"（可加层 hp 不变）
      // and "满层但残血"（不加层、改成补满 hp）. Targets at full layer + full hp
      // are excluded since the skill would have nothing to do.
      const otherMonsters = newActiveCards
        .map((c, i) => ({ card: c, index: i }))
        .filter(({ card }) => {
          if (!card || card.type !== 'monster' || card.id === monster.id) return false;
          const layers = card.currentLayer ?? card.fury ?? 1;
          const maxLayers = card.fury ?? card.hpLayers ?? 1;
          const cardMaxHp = card.maxHp ?? card.hp ?? 0;
          const cardHp = card.hp ?? 0;
          return layers < maxLayers || cardHp < cardMaxHp;
        });
      if (otherMonsters.length > 0) {
        const [target, nextRng] = pickRandom(otherMonsters, rng);
        rng = nextRng;
        const targetCard = target.card!;
        const targetLayers = targetCard.currentLayer ?? targetCard.fury ?? 1;
        const targetMaxLayers = targetCard.fury ?? targetCard.hpLayers ?? 1;
        const canHealLayer = targetLayers < targetMaxLayers;
        if (canHealLayer) {
          const restoredLayer = targetLayers + 1;
          newActiveCards[target.index] = {
            ...targetCard,
            currentLayer: restoredLayer,
            // hp preserved on layer gain
          };
          logs.push({ type: 'combat', message: `${monster.name} 庇护：为 ${targetCard.name} 恢复了一个血层！当前 ${restoredLayer} 层。` });
        } else {
          newActiveCards[target.index] = {
            ...targetCard,
            hp: targetCard.maxHp ?? targetCard.hp ?? 0,
          };
          logs.push({ type: 'combat', message: `${monster.name} 庇护：为 ${targetCard.name} 回满血量！` });
        }
        skillFloats.push({ monsterId: monster.id, skillKey: 'heroTurnEnd:eliteHealOther' });
        return;
      }
    }

  });

  // Non-engaged dragons in the active row also trigger 庇护:
  // outside of combat the dragon cannot lose layers, so the "未掉血层" condition is implicitly satisfied.
  const nonEngagedDragons = flattenActiveRowSlots(state.activeCards).filter(
    c =>
      c.type === 'monster' &&
      c.eliteHealOtherMonster &&
      !state.combatState.engagedMonsterIds.includes(c.id) &&
      !c.isStunned &&
      !heroTurnLayerLossIds.has(c.id),
  );
  nonEngagedDragons.forEach(dragon => {
    const idx = newActiveCards.findIndex(c => c?.id === dragon.id);
    if (idx < 0) return;
    // Mirrors the engaged-branch unified rule: 未满层（可加层 hp 不变）or
    // 满层残血（改成补满 hp）都是合法目标; 满层满血 跳过.
    const otherMonsters = newActiveCards
      .map((c, i) => ({ card: c, index: i }))
      .filter(({ card }) => {
        if (!card || card.type !== 'monster' || card.id === dragon.id) return false;
        const layers = card.currentLayer ?? card.fury ?? 1;
        const maxLayers = card.fury ?? card.hpLayers ?? 1;
        const cardMaxHp = card.maxHp ?? card.hp ?? 0;
        const cardHp = card.hp ?? 0;
        return layers < maxLayers || cardHp < cardMaxHp;
      });
    if (otherMonsters.length > 0) {
      const [target, nextRng] = pickRandom(otherMonsters, rng);
      rng = nextRng;
      const targetCard = target.card!;
      const targetLayers = targetCard.currentLayer ?? targetCard.fury ?? 1;
      const targetMaxLayers = targetCard.fury ?? targetCard.hpLayers ?? 1;
      const canHealLayer = targetLayers < targetMaxLayers;
      if (canHealLayer) {
        const restoredLayer = targetLayers + 1;
        newActiveCards[target.index] = {
          ...targetCard,
          currentLayer: restoredLayer,
          // hp preserved on layer gain
        };
        logs.push({ type: 'combat', message: `${dragon.name} 庇护：为 ${targetCard.name} 恢复了一个血层！当前 ${restoredLayer} 层。` });
      } else {
        newActiveCards[target.index] = {
          ...targetCard,
          hp: targetCard.maxHp ?? targetCard.hp ?? 0,
        };
        logs.push({ type: 'combat', message: `${dragon.name} 庇护：为 ${targetCard.name} 回满血量！` });
      }
      skillFloats.push({ monsterId: dragon.id, skillKey: 'heroTurnEnd:eliteHealOther' });
    }
  });

  const sortedMonsters = [...engagedMonsters].sort((a, b) => {
    const idxA = state.activeCards.findIndex(c => c?.id === a.id);
    const idxB = state.activeCards.findIndex(c => c?.id === b.id);
    return idxA - idxB;
  });

  const newCombatState: CombatState = {
    ...state.combatState,
    currentTurn: 'monster',
    heroAttacksThisTurn: { equipmentSlot1: false, equipmentSlot2: false },
    heroAttacksRemaining: 2,
    heroDamageThisTurn: {},
    monsterAttackQueue: sortedMonsters.map(m => m.id),
    pendingBlock: null,
    slotBlocksThisTurn: { equipmentSlot1: false, equipmentSlot2: false },
    slotDurabilityUsedThisTurn: { equipmentSlot1: 0, equipmentSlot2: 0 },
  };

  return {
    combatState: newCombatState,
    activeCards: newActiveCards,
    berserkerSlotUsed: {},
    flashSlotUsed: {},
    gambitSlotUsed: {},
    weaponExtraAttackUsed: {},
    logs,
    skillFloats,
    rng,
  };
}

// ---------------------------------------------------------------------------
// Advance monster turn (process attack queue)
// ---------------------------------------------------------------------------

export interface AdvanceMonsterTurnResult {
  combatState: CombatState;
  skippedMonsters: Array<{ id: string; name: string }>;
}

export function advanceMonsterTurnPatch(
  prev: CombatState,
  activeCards: ActiveRowSlots,
): AdvanceMonsterTurnResult {
  if (prev.currentTurn !== 'monster' || prev.pendingBlock) {
    return { combatState: prev, skippedMonsters: [] };
  }

  const skipped: Array<{ id: string; name: string }> = [];
  const queue = [...prev.monsterAttackQueue];

  while (queue.length > 0) {
    const nextId = queue.shift()!;
    const monster = activeCards.find(card => card?.id === nextId);
    if (!monster) continue;

    if (monster.isStunned) {
      skipped.push({ id: monster.id, name: monster.name });
      continue;
    }

    return {
      combatState: {
        ...prev,
        monsterAttackQueue: queue,
        pendingBlock: {
          monsterId: monster.id,
          attackValue: monster.attack ?? monster.value,
          monsterName: monster.name,
        },
      },
      skippedMonsters: skipped,
    };
  }

  if (prev.engagedMonsterIds.length === 0) {
    return { combatState: { ...initialCombatState }, skippedMonsters: skipped };
  }

  return {
    combatState: {
      ...prev,
      currentTurn: 'hero',
      heroAttacksThisTurn: { equipmentSlot1: false, equipmentSlot2: false },
      heroAttacksRemaining: 2,
      heroDamageThisTurn: {},
      monsterAttackQueue: [],
    },
    skippedMonsters: skipped,
  };
}

// ---------------------------------------------------------------------------
// Finish combat
// ---------------------------------------------------------------------------

export function finishCombatPatch(): Partial<GameState> {
  return {
    combatState: { ...initialCombatState },
    berserkerSlotUsed: {},
    flashSlotUsed: {},
    gambitSlotUsed: {},
    weaponExtraAttackUsed: {},
    heroStunned: false,
  };
}

// ---------------------------------------------------------------------------
// Max HP (pure computation, single source of truth)
// ---------------------------------------------------------------------------

export function computeMaxHp(state: GameState, amuletEffects: ActiveAmuletEffects): number {
  const ironWillBonus = state.permanentSkills.includes('Iron Will') ? 3 : 0;
  const heroSkillDef = getHeroSkillById(state.selectedHeroSkill as HeroSkillId | null);
  const heroSkillBonus = heroSkillDef?.initialMaxHpBonus ?? 0;
  const eternalMaxHpBonus = Array.isArray(state.eternalRelics)
    ? state.eternalRelics.reduce((sum, r) => sum + (r.initialMaxHpBonus ?? 0), 0)
    : 0;
  const raw = INITIAL_HP
    + (amuletEffects.aura.maxHp || 0)
    + (state.permanentMaxHpBonus || 0)
    + ironWillBonus
    + heroSkillBonus
    + eternalMaxHpBonus;
  return Number.isFinite(raw) ? raw : INITIAL_HP;
}

// ---------------------------------------------------------------------------
// Hero heal (pure computation)
// ---------------------------------------------------------------------------

export interface HealResult {
  hp: number;
  totalHealed: number;
  healAccumulator: number;
  actualHeal: number;
  equipmentSlotBonuses?: EquipmentSlotBonusState;
  healToDamageBonusGained?: number;
}

export function computeHeal(
  state: GameState,
  baseAmount: number,
  amuletEffects: ActiveAmuletEffects,
): HealResult {
  const safeHp = Number.isFinite(state.hp) ? state.hp : 0;
  const safeTotalHealed = Number.isFinite(state.totalHealed) ? state.totalHealed : 0;
  const safeHealAccum = Number.isFinite(state.healAccumulator) ? state.healAccumulator : 0;
  const safeBase = Number.isFinite(baseAmount) ? baseAmount : 0;

  const multiplier = Math.pow(2, amuletEffects.healCount);
  const adjustedAmount = Math.max(0, Math.floor(safeBase * multiplier));
  const maxHp = computeMaxHp(state, amuletEffects);
  const actualHeal = adjustedAmount <= 0 ? 0 : Math.min(adjustedAmount, Math.max(0, maxHp - safeHp));

  const result: HealResult = {
    hp: Math.min(maxHp, safeHp + adjustedAmount),
    totalHealed: safeTotalHealed + actualHeal,
    healAccumulator: safeHealAccum + actualHeal,
    actualHeal,
  };

  const hasHealToDamage =
    state.selectedHeroSkill === 'heal-to-damage' ||
    state.eternalRelics.some(r => r.id === 'heal-to-damage');

  if (actualHeal > 0 && hasHealToDamage) {
    const prevAccum = safeHealAccum;
    const newAccum = prevAccum + actualHeal;
    const bonusGained = Math.floor(newAccum / 5) - Math.floor(prevAccum / 5);
    if (bonusGained > 0) {
      result.equipmentSlotBonuses = {
        equipmentSlot1: {
          damage: (state.equipmentSlotBonuses.equipmentSlot1.damage || 0) + bonusGained,
          shield: state.equipmentSlotBonuses.equipmentSlot1.shield,
        },
        equipmentSlot2: {
          damage: (state.equipmentSlotBonuses.equipmentSlot2.damage || 0) + bonusGained,
          shield: state.equipmentSlotBonuses.equipmentSlot2.shield,
        },
      };
      result.healToDamageBonusGained = bonusGained;
    }
  }

  return result;
}

// ---------------------------------------------------------------------------
// Apply damage to hero (pure computation)
// ---------------------------------------------------------------------------

export interface DamageResult {
  hp: number;
  tempShield: number;
  totalDamageTaken: number;
  turnDamageTaken: number;
  appliedDamage: number;
  shieldAbsorbed: number;
  gameOver: boolean;
  /**
   * 「血怒战符」(bloodrage-attack) 自伤命中时给所有装备栏写的临时攻击。
   * 走 `slotTempAttack` 的生命周期（waterfall 清零、START_TURN 不动），
   * 跟卡面文案「装备栏临时攻击 +3」对齐——而不是历史上误用的 `berserkTurnBuff`
   * （那是 per-turn 的「狂血豪赌」buff，START_TURN 清零、waterfall 不动，
   * 跟玩家对「临时攻击」的心智模型不一致）。
   */
  slotTempAttack?: SlotTempArmorState;
  needsDeathWard?: boolean;
}

export function computeDamage(
  state: GameState,
  rawDamage: number,
  amuletEffects: ActiveAmuletEffects,
  hasDeathWardCard: boolean,
  opts?: { selfInflicted?: boolean },
): DamageResult {
  const safeHp = Number.isFinite(state.hp) ? state.hp : 0;
  const safeTotalDmg = Number.isFinite(state.totalDamageTaken) ? state.totalDamageTaken : 0;
  const safeTurnDmg = Number.isFinite(state.turnDamageTaken) ? state.turnDamageTaken : 0;
  const safeShield = Number.isFinite(state.tempShield) ? state.tempShield : 0;

  let remaining = Math.max(0, Math.floor(Number.isFinite(rawDamage) ? rawDamage : 0));
  if (remaining <= 0) {
    return {
      hp: safeHp,
      tempShield: safeShield,
      totalDamageTaken: safeTotalDmg,
      turnDamageTaken: safeTurnDmg,
      appliedDamage: 0,
      shieldAbsorbed: 0,
      gameOver: false,
    };
  }

  let shieldAbsorbed = 0;
  let tempShield = safeShield;
  if (tempShield > 0 && remaining > 0) {
    shieldAbsorbed = Math.min(tempShield, remaining);
    remaining -= shieldAbsorbed;
    tempShield -= shieldAbsorbed;
  }

  if (remaining <= 0) {
    return {
      hp: safeHp,
      tempShield,
      totalDamageTaken: safeTotalDmg,
      turnDamageTaken: safeTurnDmg,
      appliedDamage: 0,
      shieldAbsorbed,
      gameOver: false,
    };
  }

  if (remaining >= safeHp && hasDeathWardCard && !state.deathWardPrompt) {
    return {
      hp: safeHp,
      tempShield,
      totalDamageTaken: safeTotalDmg,
      turnDamageTaken: safeTurnDmg,
      appliedDamage: 0,
      shieldAbsorbed,
      gameOver: false,
      needsDeathWard: true,
    };
  }

  const newHp = Math.max(0, safeHp - remaining);
  const appliedDamage = safeHp - newHp;

  const result: DamageResult = {
    hp: newHp,
    tempShield,
    totalDamageTaken: safeTotalDmg + appliedDamage,
    turnDamageTaken: safeTurnDmg + appliedDamage,
    appliedDamage,
    shieldAbsorbed,
    gameOver: newHp === 0,
  };

  if (appliedDamage > 0 && amuletEffects.bloodrageAttackCount > 0 && opts?.selfInflicted) {
    const bonus = 3 * amuletEffects.bloodrageAttackCount;
    const prev = state.slotTempAttack ?? { equipmentSlot1: 0, equipmentSlot2: 0 };
    result.slotTempAttack = {
      equipmentSlot1: (prev.equipmentSlot1 ?? 0) + bonus,
      equipmentSlot2: (prev.equipmentSlot2 ?? 0) + bonus,
    };
  }

  return result;
}

// ---------------------------------------------------------------------------
// Compute attack damage
// ---------------------------------------------------------------------------

export interface AttackDamageParams {
  weaponValue: number;
  slotId: EquipmentSlotId;
  slotDamageBonus: number;
  slotBerserkBonus: number;
  nextWeaponBonus: number;
  slotBurstBonus: number;
  slotTempAttack: number;
  attackBonus: number;
  amuletEffects: ActiveAmuletEffects;
  isCrit: boolean;
  stunnedDoubleMultiplier: number;
}

export function computeAttackDamage(params: AttackDamageParams): number {
  const baseDamage = Math.max(
    0,
    params.weaponValue +
    params.attackBonus +
    params.slotDamageBonus +
    params.slotBerserkBonus +
    params.nextWeaponBonus +
    params.slotBurstBonus +
    params.slotTempAttack,
  );

  const preFinal = (params.isCrit ? baseDamage * 2 : baseDamage) * params.stunnedDoubleMultiplier;
  return params.amuletEffects.flashCount > 0
    ? Math.max(0, Math.floor(preFinal / Math.pow(2, params.amuletEffects.flashCount)))
    : preFinal;
}

// ---------------------------------------------------------------------------
// Compute shield block value
// ---------------------------------------------------------------------------

export interface BlockParams {
  shieldValue: number;
  slotId: EquipmentSlotId;
  slotShieldBonus: number;
  slotTempArmor: number;
  defenseBonus: number;
  amuletEffects: ActiveAmuletEffects;
  isMonsterEquip: boolean;
  gold: number;
  eliteLowGoldPower?: boolean;
}

export function computeShieldBlockValue(params: BlockParams): number {
  const rawBase = params.isMonsterEquip && params.eliteLowGoldPower && params.gold >= 30
    ? params.shieldValue * 2 : params.shieldValue;
  return Math.max(0, rawBase + params.defenseBonus + params.slotShieldBonus + params.slotTempArmor);
}

// ---------------------------------------------------------------------------
// Prune stale engaged monster IDs
// ---------------------------------------------------------------------------

export function pruneStaleEngagedIds(
  combatState: CombatState,
  activeCards: ActiveRowSlots,
  pendingDefeatIds: Set<string>,
): CombatState | null {
  if (combatState.engagedMonsterIds.length === 0) return null;

  const staleIds = combatState.engagedMonsterIds.filter(
    id => !activeCards.some(c => c?.id === id) && !pendingDefeatIds.has(id),
  );
  if (staleIds.length === 0) return null;

  const remaining = combatState.engagedMonsterIds.filter(id => !staleIds.includes(id));
  if (remaining.length === 0) return { ...initialCombatState };
  return { ...combatState, engagedMonsterIds: remaining };
}

// ---------------------------------------------------------------------------
// Monster turn-end effects (stun clear, wraith aura, boss last stand)
// ---------------------------------------------------------------------------

export interface DragonRegenEffect {
  slotId: EquipmentSlotId;
  itemName: string;
  otherSlotId: EquipmentSlotId;
  otherItemName: string;
  newDurability: number;
  maxDurability: number;
  success: boolean;
}

/**
 * Pre-rolled dice flow for a goblin "疗养" (stack heal) check at end of
 * monster turn. A single D20 is rolled with seeded RNG; success threshold is
 * `min(stackCount * 3, 20)` (so each stacked card grants +15% chance, capped
 * at 100%). The actual heal is applied later in the `RESOLVE_DICE` handler
 * after the player closes the dice modal.
 */
export interface GoblinStackHealDice {
  goblinId: string;
  goblinName: string;
  colIndex: number;
  stackCount: number;
  predeterminedRoll: number;
  threshold: number;
  success: boolean;
  currentLayer: number;
  maxLayers: number;
}

/**
 * Pre-rolled dice flow for a goblin "窃宝" (steal equipment) check at end of
 * monster turn. Single D20 with threshold `min(stackCount * 5, 20)` (each
 * stacked card grants +25% steal chance, capped at 100%). The actual stolen
 * item is picked at flow-build time (in `turn.ts`) and applied in the
 * `RESOLVE_DICE` handler after the dice modal closes.
 */
export interface GoblinStealDice {
  goblinId: string;
  goblinName: string;
  colIndex: number;
  stackCount: number;
  predeterminedRoll: number;
  threshold: number;
  success: boolean;
}

export interface MonsterTurnEndResult {
  activeCards: ActiveRowSlots;
  logs: Array<{ type: string; message: string }>;
  banners: string[];
  wraithEnrage: boolean;
  wraithDestroyAmulet: boolean;
  /** Monsters to force-engage via BEGIN_COMBAT (wraith enrage) */
  monstersToEngage: Array<{ id: string; name: string }>;
  /** Dragon regen effects on equipment */
  dragonRegenEffects: DragonRegenEffect[];
  /**
   * Goblin "疗养" pre-rolled dice flows. Caller must apply heal via
   * `RESOLVE_DICE` after the dice modal closes.
   */
  goblinStackHealDice: GoblinStackHealDice[];
  /**
   * Goblin "窃宝" pre-rolled dice flows. Caller must pick a stolen item and
   * apply it via `RESOLVE_DICE` after the dice modal closes.
   */
  goblinStealDice: GoblinStealDice[];
  /**
   * Monster-skill triggers fired during this monster turn end (wraith aura,
   * golem spell growth, boss last stand, dragon regen, etc). Caller must
   * enqueue a `TRIGGER_MONSTER_SKILL_FLOAT` for each entry BEFORE any
   * follow-up actions so the float plays first.
   */
  skillFloats: MonsterSkillFloatTrigger[];
  rng: RngState;
}

export function applyMonsterTurnEndEffects(
  activeCards: ActiveRowSlots,
  engagedMonsterIds: string[],
  rngIn: RngState,
  opts?: {
    heroTookDamageThisMonsterTurn?: boolean;
    equipmentSlot1?: GameCardData | null;
    equipmentSlot2?: GameCardData | null;
    activeCardStacks?: Record<number, GameCardData[]>;
  },
): MonsterTurnEndResult {
  let rng = rngIn;
  const logs: Array<{ type: string; message: string }> = [];
  const banners: string[] = [];
  const skillFloats: MonsterSkillFloatTrigger[] = [];
  let changed = false;
  let wraithEnrage = false;
  let wraithDestroyAmulet = false;
  const dragonRegenEffects: DragonRegenEffect[] = [];
  const goblinStackHealDice: GoblinStackHealDice[] = [];
  const goblinStealDice: GoblinStealDice[] = [];
  const monstersToEngage: Array<{ id: string; name: string }> = [];

  // Dragon elite regen: if hero wasn't damaged, 50% chance to restore 1 durability on other equipment slot
  if (opts && !opts.heroTookDamageThisMonsterTurn) {
    const dragonSlots: Array<{ slotId: EquipmentSlotId; item: GameCardData }> = [];
    if (opts.equipmentSlot1?.type === 'monster' && (opts.equipmentSlot1 as GameCardData).eliteRegenHeroTurn) {
      dragonSlots.push({ slotId: 'equipmentSlot1', item: opts.equipmentSlot1 });
    }
    if (opts.equipmentSlot2?.type === 'monster' && (opts.equipmentSlot2 as GameCardData).eliteRegenHeroTurn) {
      dragonSlots.push({ slotId: 'equipmentSlot2', item: opts.equipmentSlot2 });
    }
    for (const { slotId, item } of dragonSlots) {
      const otherSlotId: EquipmentSlotId = slotId === 'equipmentSlot1' ? 'equipmentSlot2' : 'equipmentSlot1';
      const otherItem = otherSlotId === 'equipmentSlot1' ? opts.equipmentSlot1 : opts.equipmentSlot2;
      const [roll, nextRng] = nextBool(rng);
      rng = nextRng;
      if (roll && otherItem && otherItem.durability != null && otherItem.maxDurability != null
        && otherItem.durability < otherItem.maxDurability) {
        const newDur = otherItem.durability + 1;
        dragonRegenEffects.push({
          slotId, itemName: item.name, otherSlotId, otherItemName: otherItem.name!,
          newDurability: newDur, maxDurability: otherItem.maxDurability, success: true,
        });
        // NOTE: dragon equipment regen is hero-side equipment behavior, not an
        // active-row monster skill, so we deliberately don't queue a float here
        // (the float UI renders above active-row monster cards only).
        logs.push({ type: 'equip', message: `${item.name} 再生：Hero 未受伤，${otherItem.name} 恢复 1 耐久！（${newDur}/${otherItem.maxDurability}）` });
        banners.push(`${item.name} 再生！${otherItem.name} +1 耐久！`);
      } else if (roll) {
        logs.push({ type: 'equip', message: `${item.name} 再生：判定成功，但另一装备栏无可恢复的装备。` });
      } else {
        logs.push({ type: 'equip', message: `${item.name} 再生：判定失败（50%）。` });
      }
    }
  }

  // Check for wraith aura effects from ALL active-row wraiths (not just engaged)
  let auraBoost = 0;
  for (const card of activeCards) {
    if (!card || card.type !== 'monster' || card.isStunned) continue;
    if (card.wraithAuraAttack && card.wraithAuraAttack > 0) {
      auraBoost = Math.max(auraBoost, card.wraithAuraAttack);
    }
    if (card.wraithTurnEnrage) wraithEnrage = true;
    if (card.wraithDestroyAmulet) wraithDestroyAmulet = true;
  }

  let next = activeCards.map(card => {
    if (!card) return card;
    const isEngaged = engagedMonsterIds.includes(card.id);
    let updated = card;

    // Stun recovery only ticks for engaged monsters (existing behaviour).
    if (isEngaged && updated.isStunned) {
      changed = true;
      logs.push({ type: 'combat', message: `${updated.name} 从晕眩中恢复了。` });
      updated = { ...updated, isStunned: false };
      return updated;
    }

    // If still stunned (non-engaged stunned monster), skip skill triggers — same as
    // the wraith-aura loop above which short-circuits on `card.isStunned`.
    if (updated.isStunned) {
      return updated !== card ? updated : card;
    }

    // Legacy wraith tier-2 self-only attack boost: still gated by engagement
    // (it's a "self-buff while fighting" effect, not an aura).
    if (isEngaged && updated.wraithTurnAttack && updated.wraithTurnAttack > 0) {
      const boost = updated.wraithTurnAttack;
      changed = true;
      const newAttack = (updated.attack ?? updated.value ?? 0) + boost;
      const newValue = (updated.value ?? 0) + boost;
      skillFloats.push({ monsterId: updated.id, skillKey: 'turnEnd:wraithSelfAttack' });
      logs.push({ type: 'combat', message: `${updated.name} 蓄积：攻击力 +${boost}！（当前 ${newAttack}）` });
      updated = { ...updated, attack: newAttack, value: newValue, tempAttackBoost: (updated.tempAttackBoost ?? 0) + boost };
    }

    // 吞噬 (golem spell growth): triggers every monster turn end regardless
    // of whether the golem is engaged in combat. Mirrors the wraith aura model
    // (active-row presence is enough; stunned is excluded above) so a back-row
    // golem still ramps its anti-magic / layer-reflect coefficients.
    if (updated.golemSpellGrowth && updated.golemSpellGrowth > 0 && updated.antiMagicReflect != null) {
      const growth = updated.golemSpellGrowth;
      const newReflect = updated.antiMagicReflect + growth;
      changed = true;
      const parts: string[] = [`反魔伤害 +${growth}（当前 ${newReflect}）`];
      let newLayerReflect = updated.golemLayerLossReflect;
      if (newLayerReflect != null) {
        newLayerReflect = newLayerReflect + growth;
        parts.push(`反震系数 +${growth}（当前 ${newLayerReflect}）`);
      }
      skillFloats.push({ monsterId: updated.id, skillKey: 'turnEnd:golemSpellGrowth' });
      logs.push({ type: 'combat', message: `${updated.name} 吞噬：${parts.join('，')}！` });
      updated = { ...updated, antiMagicReflect: newReflect, ...(newLayerReflect != null ? { golemLayerLossReflect: newLayerReflect } : {}) };
    }

    return updated !== card ? updated : card;
  });

  // Boss last-stand aura: when an engaged boss has 1 layer, ALL row monsters get +5 atk.
  // Layer/HP heal follows the unified rule: 未满层 → +1 层 hp 不变; 满层 → 补满 hp.
  // (+5 atk applies unconditionally to all row monsters regardless of heal branch.)
  const lastStandBoss = activeCards.find(c =>
    c && c.type === 'monster' && !c.isStunned && c.bossLastStandAura
      && engagedMonsterIds.includes(c.id) && (c.currentLayer ?? 1) === 1,
  );
  if (lastStandBoss) {
    const boostedNames: string[] = [];
    next = next.map(card => {
      if (!card || card.type !== 'monster') return card;
      const newAttack = (card.attack ?? card.value ?? 0) + 5;
      const newValue = (card.value ?? 0) + 5;
      const maxLayers = card.fury ?? card.hpLayers ?? 1;
      const currentLayer = card.currentLayer ?? 1;
      const canHealLayer = currentLayer < maxLayers;
      const maxHp = card.maxHp ?? card.hp ?? 0;
      const currentHp = card.hp ?? 0;
      boostedNames.push(card.name);
      if (canHealLayer) {
        // +1 层, hp 保持不变
        return {
          ...card,
          attack: newAttack,
          value: newValue,
          currentLayer: currentLayer + 1,
          tempAttackBoost: (card.tempAttackBoost ?? 0) + 5,
        };
      }
      if (currentHp < maxHp) {
        // 满层但残血 → 补满 hp
        return {
          ...card,
          attack: newAttack,
          value: newValue,
          hp: maxHp,
          tempAttackBoost: (card.tempAttackBoost ?? 0) + 5,
        };
      }
      // 满层 + 满血 → 只加攻
      return {
        ...card,
        attack: newAttack,
        value: newValue,
        tempAttackBoost: (card.tempAttackBoost ?? 0) + 5,
      };
    });
    changed = true;
    if (boostedNames.length > 0) {
      // One float on the boss who emits the aura — not per-affected monster,
      // since the aura is conceptually a single skill firing on the boss.
      skillFloats.push({ monsterId: lastStandBoss.id, skillKey: 'turnEnd:bossLastStandAura' });
      logs.push({ type: 'combat', message: `${lastStandBoss.name} 暴走：激活行所有怪物攻击 +5，并恢复血量/血层！（${boostedNames.join('、')}）` });
      banners.push(`${lastStandBoss.name} 暴走！全体怪物 +5 攻击！`);
    }
  }

  // Wraith aura: boost ALL active row monsters
  if (auraBoost > 0) {
    const boostedNames: string[] = [];
    next = next.map(card => {
      if (!card || card.type !== 'monster') return card;
      const newAttack = (card.attack ?? card.value ?? 0) + auraBoost;
      const newValue = (card.value ?? 0) + auraBoost;
      boostedNames.push(card.name);
      return { ...card, attack: newAttack, value: newValue, tempAttackBoost: (card.tempAttackBoost ?? 0) + auraBoost };
    });
    changed = true;
    if (boostedNames.length > 0) {
      // Float on each wraith that contributed to the aura (we lost track of
      // exactly which one emitted the highest, so attribute to all wraith
      // aura emitters in the row — sequential floats make the source clear).
      for (const card of activeCards) {
        if (card && card.type === 'monster' && !card.isStunned
          && card.wraithAuraAttack && card.wraithAuraAttack > 0) {
          skillFloats.push({ monsterId: card.id, skillKey: 'turnEnd:wraithAura' });
        }
      }
      logs.push({ type: 'combat', message: `光环：激活行所有怪物攻击力 +${auraBoost}！（${boostedNames.join('、')}）` });
      banners.push(`光环！全体怪物攻击力 +${auraBoost}！`);
    }
  }

  // Wraith enrage: collect non-engaged, non-stunned monsters
  if (wraithEnrage) {
    for (const card of activeCards) {
      if (!card || card.type !== 'monster' || card.isStunned) continue;
      if (!engagedMonsterIds.includes(card.id)) {
        monstersToEngage.push({ id: card.id, name: card.name });
      }
    }
    // One float per wraith with the enrage flag so the player can see which
    // wraith was the trigger source. Suppress if no monsters were actually
    // dragged into combat (no visible effect).
    if (monstersToEngage.length > 0) {
      for (const card of activeCards) {
        if (card && card.type === 'monster' && !card.isStunned && card.wraithTurnEnrage) {
          skillFloats.push({ monsterId: card.id, skillKey: 'turnEnd:wraithTurnEnrage' });
        }
      }
    }
  }

  // Wraith destroy amulet flag — attribute float to wraiths carrying it. Side
  // effect (actual amulet destruction) is applied by the caller.
  if (wraithDestroyAmulet) {
    for (const card of activeCards) {
      if (card && card.type === 'monster' && !card.isStunned && card.wraithDestroyAmulet) {
        skillFloats.push({ monsterId: card.id, skillKey: 'turnEnd:wraithDestroyAmulet' });
      }
    }
  }

  // Goblin "疗养" / "窃宝": single D20 roll per goblin where the success
  // threshold scales with the number of cards stacked underneath.
  //
  //   疗养: threshold = min(stackCount * 3, 20)  // +15% per card, capped 100%
  //   窃宝:     threshold = min(stackCount * 5, 20)  // +25% per card, capped 100%
  //   roll <= threshold  => success (heal 1 layer / steal 1 item)
  //
  // We pre-roll the D20 here using seeded RNG and return the dice metadata in
  // the result. The actual heal / steal mutation is deferred to the
  // RESOLVE_DICE handler so the player sees a dice animation before the
  // outcome is applied (matches the wraith-rebirth / bone-regen pattern).
  if (opts?.activeCardStacks) {
    for (const card of activeCards) {
      if (!card || !engagedMonsterIds.includes(card.id) || card.isStunned || !card.goblinStackHeal) continue;
      const colIndex = activeCards.findIndex(c => c?.id === card.id);
      if (colIndex < 0) continue;
      const stacks = opts.activeCardStacks[colIndex] ?? [];
      if (stacks.length === 0) continue;

      const maxLayers = card.hpLayers ?? card.fury ?? 1;
      const currentLayer = card.currentLayer ?? 1;
      // Skip the dice entirely when already at max layers — there's nothing
      // to heal so showing a roll the player can't benefit from is noise.
      if (currentLayer >= maxLayers) continue;

      const threshold = Math.min(stacks.length * 3, 20);
      let predeterminedRoll: number;
      [predeterminedRoll, rng] = nextInt(rng, 1, 20);
      const success = predeterminedRoll <= threshold;

      goblinStackHealDice.push({
        goblinId: card.id,
        goblinName: card.name,
        colIndex,
        stackCount: stacks.length,
        predeterminedRoll,
        threshold,
        success,
        currentLayer,
        maxLayers,
      });
      // Only show the float when the heal actually fires; the dice modal
      // already communicates a failed roll, no need to also stop the world
      // for a "skill triggered" float in that case.
      if (success) {
        skillFloats.push({ monsterId: card.id, skillKey: 'turnEnd:goblinStackHeal' });
      }
    }

    for (const card of activeCards) {
      if (!card || !engagedMonsterIds.includes(card.id) || card.isStunned || !card.goblinStealEquip) continue;
      const colIndex = activeCards.findIndex(c => c?.id === card.id);
      if (colIndex < 0) continue;
      const stacks = opts.activeCardStacks[colIndex] ?? [];
      if (stacks.length === 0) continue;

      // 窃宝: each stacked card contributes +25% (threshold +5 on a D20),
      // capped at 100%. Diverges from 疗养's +15% per stack.
      const threshold = Math.min(stacks.length * 5, 20);
      let predeterminedRoll: number;
      [predeterminedRoll, rng] = nextInt(rng, 1, 20);
      const success = predeterminedRoll <= threshold;

      goblinStealDice.push({
        goblinId: card.id,
        goblinName: card.name,
        colIndex,
        stackCount: stacks.length,
        predeterminedRoll,
        threshold,
        success,
      });
      if (success) {
        skillFloats.push({ monsterId: card.id, skillKey: 'turnEnd:goblinStealEquip' });
      }
    }
  }

  return {
    activeCards: changed ? next as ActiveRowSlots : activeCards,
    logs,
    banners,
    wraithEnrage,
    wraithDestroyAmulet,
    monstersToEngage,
    dragonRegenEffects,
    goblinStackHealDice,
    goblinStealDice,
    skillFloats,
    rng,
  };
}

// ---------------------------------------------------------------------------
// Low-gold elite goblin buff
// ---------------------------------------------------------------------------

export function applyLowGoldEliteBuff(
  activeCards: ActiveRowSlots,
  isLowGold: boolean,
): { activeCards: ActiveRowSlots; logs: Array<{ type: string; message: string }>; banners: string[] } | null {
  const logs: Array<{ type: string; message: string }> = [];
  const banners: string[] = [];
  let changed = false;

  const next = activeCards.map(card => {
    if (!card || card.type !== 'monster' || !card.eliteLowGoldPower) return card;

    if (isLowGold && !card.lowGoldBuffActive) {
      changed = true;
      logs.push({ type: 'combat', message: `${card.name} 感受到了贪婪的力量！攻击力与血量翻倍！` });
      banners.push(`${card.name} 窘境！攻击力与血量翻倍！`);
      const atkBefore = card.attack ?? card.value;
      const maxHpBefore = card.maxHp ?? 0;
      return {
        ...card,
        attack: atkBefore * 2,
        value: card.value * 2,
        hp: (card.hp ?? 0) * 2,
        maxHp: maxHpBefore * 2,
        lowGoldBuffActive: true,
        tempAttackBoost: (card.tempAttackBoost ?? 0) + atkBefore,
        tempHpBoost: (card.tempHpBoost ?? 0) + maxHpBefore,
      };
    }

    if (!isLowGold && card.lowGoldBuffActive) {
      changed = true;
      logs.push({ type: 'combat', message: `${card.name} 的窘境消退了。` });
      const newAtk = Math.floor((card.attack ?? card.value) / 2);
      const newMaxHp = Math.floor((card.maxHp ?? 0) / 2);
      const prevTempAtk = Math.floor((card.tempAttackBoost ?? 0) / 2);
      const prevTempHp = Math.floor((card.tempHpBoost ?? 0) / 2);
      return {
        ...card,
        attack: newAtk,
        value: Math.floor(card.value / 2),
        hp: Math.ceil((card.hp ?? 0) / 2),
        maxHp: newMaxHp,
        lowGoldBuffActive: false,
        tempAttackBoost: prevTempAtk,
        tempHpBoost: prevTempHp,
      };
    }

    return card;
  });

  if (!changed) return null;
  return { activeCards: next as ActiveRowSlots, logs, banners };
}

// ---------------------------------------------------------------------------
// Boss transformation
// ---------------------------------------------------------------------------

export function createBossCard(monster: GameCardData): GameCardData {
  const fullHp = monster.maxHp ?? monster.hp ?? monster.value ?? 0;
  const layers = monster.fury ?? monster.hpLayers ?? 2;
  return {
    ...monster,
    // Clear ephemeral combat state from the old form — Boss is a fresh form.
    // 与 resetMonsterForGraveyard 的清单一致（除 tempAttackBoost 外，下面会单独累加 +5）。
    isStunned: false,
    defeatProcessed: false,
    specialAttackBoost: 0,
    tempHpBoost: 0,
    lowGoldBuffActive: false,
    bossPhase: true,
    currentLayer: layers,
    hp: fullHp,
    hasRevive: true,
    reviveUsed: false,
    bossLastStandAura: true,
    bossEnrageGraveyardSummon: 4,
    attack: (monster.attack ?? monster.value ?? 0) + 5,
    value: (monster.value ?? 0) + 5,
    tempAttackBoost: (monster.tempAttackBoost ?? 0) + 5,
    name: `${monster.name} (Boss)`,
    description: `Boss形态！1层时全行怪物攻+5并恢复1血层；激怒时从坟场召唤2怪物各占1格（顶层）+ 2非怪物堆叠在另一格。`,
  };
}

// ---------------------------------------------------------------------------
// Wraith last-words effect (shuffle & boost row)
// ---------------------------------------------------------------------------

export function applyWraithHauntEffect(
  activeCards: ActiveRowSlots,
  monsterId: string,
  atkBoost: number,
  rngIn: RngState,
): [ActiveRowSlots, RngState] {
  const occupiedIndices: number[] = [];
  const occupiedCards: (GameCardData | null)[] = [];

  for (let i = 0; i < activeCards.length; i++) {
    const c = activeCards[i];
    if (!c || c.id === monsterId) continue;
    occupiedIndices.push(i);
    occupiedCards.push(c);
  }

  if (occupiedIndices.length === 0) return [activeCards, rngIn];

  let rng = rngIn;
  let [shuffled, nextRng] = rngShuffle(occupiedCards, rng);
  rng = nextRng;
  if (occupiedCards.length >= 2) {
    const sameOrder = shuffled.every((c, i) => c === occupiedCards[i]);
    if (sameOrder) {
      [shuffled, nextRng] = rngShuffle(occupiedCards, rng);
      rng = nextRng;
    }
  }

  const next = [...activeCards] as ActiveRowSlots;
  for (let i = 0; i < occupiedIndices.length; i++) {
    let card = shuffled[i];
    if (card && card.type === 'monster') {
      card = {
        ...card,
        attack: (card.attack ?? card.value) + atkBoost,
        specialAttackBoost: (card.specialAttackBoost ?? 0) + atkBoost,
        tempAttackBoost: (card.tempAttackBoost ?? 0) + atkBoost,
      };
    }
    next[occupiedIndices[i]] = card;
  }

  return [next, rng];
}
