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
import type { GameState } from './types';
import { initialCombatState, INITIAL_HP, STRENGTH_SELF_DAMAGE } from './constants';
import { flattenActiveRowSlots } from './helpers';
import { getHeroSkillById } from '@/lib/heroSkills';
import type { HeroSkillId } from '@/lib/heroSkills';

// ---------------------------------------------------------------------------
// Pure computation: monster damage (overflow does NOT penetrate layers)
// ---------------------------------------------------------------------------

export function damageMonsterWithLayerOverflow(
  monster: GameCardData,
  damage: number,
  _maxLayerLoss?: number,
): GameCardData {
  let effectiveDamage = damage;
  if (monster.maxDamagePerHit && effectiveDamage > monster.maxDamagePerHit && !monster.isStunned) {
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
  flashSlotUsed: Record<string, boolean>;
  gambitSlotUsed: Record<string, number>;
  weaponExtraAttackUsed: Record<string, number>;
  logs: Array<{ type: string; message: string }>;
  rng: RngState;
}

export function endHeroTurnPatch(
  state: GameState,
  heroTurnLayerLossIds: Set<string>,
): EndHeroTurnResult {
  let rng = state.rng;
  const logs: Array<{ type: string; message: string }> = [];
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
      rng: state.rng,
    };
  }

  const newActiveCards = [...state.activeCards] as ActiveRowSlots;
  engagedMonsters.forEach(monster => {
    const idx = newActiveCards.findIndex(c => c?.id === monster.id);
    if (idx < 0) return;

    if (monster.eliteRegenHeroTurn && !monster.isStunned && !heroTurnLayerLossIds.has(monster.id)) {
      const currentLayer = monster.currentLayer ?? monster.fury ?? 1;
      const maxLayers = monster.fury ?? monster.hpLayers ?? 1;
      if (currentLayer < maxLayers) {
        const restoredLayer = currentLayer + 1;
        newActiveCards[idx] = {
          ...monster,
          currentLayer: restoredLayer,
          hp: monster.maxHp ?? monster.hp ?? 0,
        };
        logs.push({ type: 'combat', message: `${monster.name} 未受到血层伤害，恢复了一个血层！当前 ${restoredLayer} 层。` });
        return;
      }
    }

    if (monster.eliteHealOtherMonster && !monster.isStunned && !heroTurnLayerLossIds.has(monster.id)) {
      const otherMonsters = newActiveCards
        .map((c, i) => ({ card: c, index: i }))
        .filter(({ card }) => card && card.type === 'monster' && card.id !== monster.id && (card.currentLayer ?? card.fury ?? 1) < (card.fury ?? card.hpLayers ?? 1));
      if (otherMonsters.length > 0) {
        const [target, nextRng] = pickRandom(otherMonsters, rng);
        rng = nextRng;
        const targetCard = target.card!;
        const targetLayer = (targetCard.currentLayer ?? targetCard.fury ?? 1) + 1;
        newActiveCards[target.index] = {
          ...targetCard,
          currentLayer: targetLayer,
          hp: targetCard.maxHp ?? targetCard.hp ?? 0,
        };
        logs.push({ type: 'combat', message: `${monster.name} 龙息庇护：为 ${targetCard.name} 恢复了一个血层！当前 ${targetLayer} 层。` });
        return;
      }
    }

  });

  // Non-engaged dragons in the active row also trigger 龙息庇护:
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
    const otherMonsters = newActiveCards
      .map((c, i) => ({ card: c, index: i }))
      .filter(({ card }) => card && card.type === 'monster' && card.id !== dragon.id && (card.currentLayer ?? card.fury ?? 1) < (card.fury ?? card.hpLayers ?? 1));
    if (otherMonsters.length > 0) {
      const [target, nextRng] = pickRandom(otherMonsters, rng);
      rng = nextRng;
      const targetCard = target.card!;
      const targetLayer = (targetCard.currentLayer ?? targetCard.fury ?? 1) + 1;
      newActiveCards[target.index] = {
        ...targetCard,
        currentLayer: targetLayer,
        hp: targetCard.maxHp ?? targetCard.hp ?? 0,
      };
      logs.push({ type: 'combat', message: `${dragon.name} 龙息庇护：为 ${targetCard.name} 恢复了一个血层！当前 ${targetLayer} 层。` });
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

  const multiplier = amuletEffects.hasHeal ? 2 : 1;
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
  berserkTurnBuff?: EquipmentBuffSnapshot;
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

  if (appliedDamage > 0 && amuletEffects.hasBloodrageAttack && opts?.selfInflicted) {
    result.berserkTurnBuff = {
      equipmentSlot1: (state.berserkTurnBuff.equipmentSlot1 ?? 0) + 2,
      equipmentSlot2: (state.berserkTurnBuff.equipmentSlot2 ?? 0) + 2,
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
  return params.amuletEffects.hasFlash ? Math.max(0, Math.floor(preFinal / 2)) : preFinal;
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

export interface GoblinStackHealEffect {
  monsterId: string;
  monsterName: string;
  restored: number;
  fromLayer: number;
  toLayer: number;
}

export interface GoblinStealTarget {
  source: 'equip' | 'amulet';
  slotId?: EquipmentSlotId;
  itemId: string;
  itemName: string;
  goblinName: string;
  colIndex: number;
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
  /** Goblin stack heal results */
  goblinStackHeals: GoblinStackHealEffect[];
  /** Goblin steal targets (caller must apply equipment/amulet removal) */
  goblinStealTargets: GoblinStealTarget[];
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
  let changed = false;
  let wraithEnrage = false;
  let wraithDestroyAmulet = false;
  const dragonRegenEffects: DragonRegenEffect[] = [];
  const goblinStackHeals: GoblinStackHealEffect[] = [];
  const goblinStealTargets: GoblinStealTarget[] = [];
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
        logs.push({ type: 'equip', message: `${item.name} 龙息回复：Hero 未受伤，${otherItem.name} 恢复 1 耐久！（${newDur}/${otherItem.maxDurability}）` });
        banners.push(`${item.name} 龙息回复！${otherItem.name} +1 耐久！`);
      } else if (roll) {
        logs.push({ type: 'equip', message: `${item.name} 龙息回复：判定成功，但另一装备栏无可恢复的装备。` });
      } else {
        logs.push({ type: 'equip', message: `${item.name} 龙息回复：判定失败（50%）。` });
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
    if (!card || !engagedMonsterIds.includes(card.id)) return card;
    let updated = card;

    if (updated.isStunned) {
      changed = true;
      logs.push({ type: 'combat', message: `${updated.name} 从晕眩中恢复了。` });
      updated = { ...updated, isStunned: false };
      return updated;
    }

    // Legacy wraith tier-2: self-only attack boost
    if (updated.wraithTurnAttack && updated.wraithTurnAttack > 0) {
      const boost = updated.wraithTurnAttack;
      changed = true;
      const newAttack = (updated.attack ?? updated.value ?? 0) + boost;
      const newValue = (updated.value ?? 0) + boost;
      logs.push({ type: 'combat', message: `${updated.name} 怨念蓄积：攻击力 +${boost}！（当前 ${newAttack}）` });
      updated = { ...updated, attack: newAttack, value: newValue, tempAttackBoost: (updated.tempAttackBoost ?? 0) + boost };
    }

    if (updated.golemSpellGrowth && updated.golemSpellGrowth > 0 && updated.antiMagicReflect != null) {
      const growth = updated.golemSpellGrowth;
      const newReflect = updated.antiMagicReflect + growth;
      changed = true;
      const parts: string[] = [`反魔伤害 +${growth}（当前 ${newReflect}）`];
      let newLayerReflect = updated.golemLayerLossReflect;
      if (newLayerReflect != null) {
        newLayerReflect = newLayerReflect + growth;
        parts.push(`岩层反震系数 +${growth}（当前 ${newLayerReflect}）`);
      }
      logs.push({ type: 'combat', message: `${updated.name} 法力吞噬：${parts.join('，')}！` });
      updated = { ...updated, antiMagicReflect: newReflect, ...(newLayerReflect != null ? { golemLayerLossReflect: newLayerReflect } : {}) };
    }

    return updated !== card ? updated : card;
  });

  // Boss last-stand aura: when an engaged boss has 1 layer, ALL row monsters get +5 atk & +1 layer (heal to full HP).
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
      const newLayer = canHealLayer ? currentLayer + 1 : currentLayer;
      const fullHp = card.maxHp ?? card.hp ?? 0;
      boostedNames.push(card.name);
      return {
        ...card,
        attack: newAttack,
        value: newValue,
        hp: fullHp,
        currentLayer: newLayer,
        tempAttackBoost: (card.tempAttackBoost ?? 0) + 5,
      };
    });
    changed = true;
    if (boostedNames.length > 0) {
      logs.push({ type: 'combat', message: `${lastStandBoss.name} 暴走光环：激活行所有怪物攻击 +5，恢复 1 血层！（${boostedNames.join('、')}）` });
      banners.push(`${lastStandBoss.name} 暴走光环！全体怪物 +5 攻击，恢复 1 血层！`);
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
      logs.push({ type: 'combat', message: `怨念光环：激活行所有怪物攻击力 +${auraBoost}！（${boostedNames.join('、')}）` });
      banners.push(`怨念光环！全体怪物攻击力 +${auraBoost}！`);
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
  }

  // Goblin stack heal: per stacked card below, 15% chance restore 1 layer
  if (opts?.activeCardStacks) {
    for (const card of activeCards) {
      if (!card || !engagedMonsterIds.includes(card.id) || card.isStunned || !card.goblinStackHeal) continue;
      const colIndex = activeCards.findIndex(c => c?.id === card.id);
      if (colIndex < 0) continue;
      const stacks = opts.activeCardStacks[colIndex] ?? [];
      if (stacks.length === 0) continue;
      let healCount = 0;
      for (let i = 0; i < stacks.length; i++) {
        const [healed, nextRng] = nextBool(rng, 0.15);
        rng = nextRng;
        if (healed) healCount++;
      }
      if (healCount > 0) {
        const maxLayers = card.hpLayers ?? card.fury ?? 1;
        const currentLayer = card.currentLayer ?? 1;
        const restored = Math.min(healCount, maxLayers - currentLayer);
        if (restored > 0) {
          const fullHp = card.maxHp ?? card.hp ?? 0;
          const cardIdx = next.findIndex(c => c?.id === card.id);
          if (cardIdx >= 0) {
            next[cardIdx] = { ...card, currentLayer: currentLayer + restored, hp: fullHp };
            changed = true;
          }
          goblinStackHeals.push({
            monsterId: card.id, monsterName: card.name,
            restored, fromLayer: currentLayer, toLayer: currentLayer + restored,
          });
          logs.push({ type: 'combat', message: `${card.name} 贼窝疗养：恢复了 ${restored} 血层！（${currentLayer} → ${currentLayer + restored}）` });
          banners.push(`${card.name} 贼窝疗养！恢复 ${restored} 血层！`);
        }
      }
    }

    // Goblin steal equip: per stacked card below, 15% chance steal
    for (const card of activeCards) {
      if (!card || !engagedMonsterIds.includes(card.id) || card.isStunned || !card.goblinStealEquip) continue;
      const colIndex = activeCards.findIndex(c => c?.id === card.id);
      if (colIndex < 0) continue;
      const stacks = opts.activeCardStacks[colIndex] ?? [];
      if (stacks.length === 0) continue;
      let stealCount = 0;
      for (let i = 0; i < stacks.length; i++) {
        const [stolen, nextRng] = nextBool(rng, 0.15);
        rng = nextRng;
        if (stolen) stealCount++;
      }
      for (let s = 0; s < stealCount; s++) {
        goblinStealTargets.push({
          source: 'equip', goblinName: card.name, colIndex,
          itemId: '', itemName: '',
        });
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
    goblinStackHeals,
    goblinStealTargets,
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
      banners.push(`${card.name} 贪婪强化！攻击力与血量翻倍！`);
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
      logs.push({ type: 'combat', message: `${card.name} 的贪婪强化消退了。` });
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
    bossPhase: true,
    currentLayer: layers,
    hp: fullHp,
    hasRevive: true,
    reviveUsed: false,
    bossRetaliationDamage: 3,
    bossLastStandAura: true,
    bossEnrageGraveyardSummon: 4,
    attack: (monster.attack ?? monster.value ?? 0) + 5,
    value: (monster.value ?? 0) + 5,
    tempAttackBoost: (monster.tempAttackBoost ?? 0) + 5,
    name: `${monster.name} (Boss)`,
    description: `Boss形态！反噬3；1层时全行怪物攻+5并恢复1血层；激怒时从坟场召唤4张牌（含2怪物）。`,
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
