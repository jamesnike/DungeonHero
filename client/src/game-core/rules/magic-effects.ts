/**
 * Magic Effects — full magic card resolution logic for the game reducer.
 *
 * Handles ALL magic/hero-magic effects in a pure, deterministic manner.
 * Interactive effects set `pendingMagicAction` and pause; non-interactive
 * effects compute state patches and enqueue follow-up actions directly.
 *
 * The reducer's `reduceResolveMagic` in `rules/cards.ts` delegates here.
 */

import type { GameState } from '../types';
import type { GameAction } from '../actions';
import type { ReduceResult, SideEffect } from '../reducer';
import { applyPatch, noChange } from '../reducer';
import type { GameCardData } from '@/components/GameCard';
import { cardHasPermFlag } from '@/components/GameCard';
import type { EquipmentSlotId, EquipmentItem, PendingMagicAction } from '@/components/game-board/types';
import {
  flattenActiveRowSlots,
  isDamageableTarget,
  sanitizeCardMetadata,
  getCardPlayCategory,
  isDamageMagic,
  pickRandomHandCardsForDiscardPreferGraveyard,
  applyAmplifyOnCreate,
  computeSlotArmorValuePure,
} from '../helpers';
import {
  drawFromBackpackToHandPure,
  drawMultipleFromBackpack,
  addToGraveyardPure,
  addToRecycleBag,
  addCardToBackpackPure,
  processRecycleBag,
  getEffectiveHandLimit,
  getEffectiveBackpackCapacity,
} from '../cards';
import { nextInt, pickRandom, nextBool, shuffle as rngShuffle, nextId } from '../rng';
import type { RngState } from '../rng';
import { pickGraveyardCardExcluding, computeEquipmentBreakEffects, computeEquipmentDisplacementLastWords } from './equipment-effects';
import {
  INITIAL_HP,
  HAND_LIMIT,
  BASE_BACKPACK_CAPACITY,
  PERSUADE_COST,
  MIN_PERSUADE_COST,
  createEmptyActiveRow,
  createEmptyAmuletEffects,
} from '../constants';
import { computeAmuletEffects, getEquipmentInSlot, getEquipmentSlots } from '../equipment';
import { chaosStrikeHasOverkill } from '../combat';
import { hasEternalRelic, getEternalRelic } from '@/lib/eternalRelics';
import { STARTER_CARD_IDS, getStarterBaseId, skillScrollImage } from '../deck';
import { createGreedCurseCard } from '@/lib/knightDeck';
import { getHeroMagicDefinition } from '@/lib/heroMagic';
import type { ActiveRowSlots, EquipmentSlotBonusState } from '@/components/game-board/types';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

export function getSpellDamage(baseDamage: number, state: GameState): number {
  return Math.max(0, baseDamage + (state.permanentSpellDamageBonus ?? 0));
}

export function computeMaxHp(state: GameState): number {
  const aura = computeAmuletEffects(state.amuletSlots as GameCardData[]);
  const ironWillBonus = state.permanentSkills.includes('Iron Will') ? 3 : 0;
  const eternalMaxHpBonus = Array.isArray(state.eternalRelics)
    ? state.eternalRelics.reduce((sum: number, r: any) => sum + (r.initialMaxHpBonus ?? 0), 0)
    : 0;
  const raw = INITIAL_HP + (state.permanentMaxHpBonus || 0) + (aura.aura.maxHp || 0) + ironWillBonus + eternalMaxHpBonus;
  return Number.isFinite(raw) ? raw : INITIAL_HP;
}

export function log(sideEffects: SideEffect[], type: string, message: string) {
  sideEffects.push({ event: 'log:entry', payload: { type, message } });
}

export function banner(sideEffects: SideEffect[], text: string) {
  sideEffects.push({ event: 'ui:banner', payload: { text } });
}

export function mergePatch(patch: Partial<GameState>, extra: Partial<GameState>): void {
  Object.assign(patch, extra);
}

/**
 * Apply post-damage relic effects shared by all 「魔弹」 (missile-bolt) resolutions:
 * - missile-stun-20: 20% chance to stun (capped by state.stunCap, never targets already-stunned).
 * - missile-draw-1: enqueue DRAW_CARDS from backpack after damage.
 * Mutates `patch.rng` and pushes into `sideEffects` / `enqueuedActions` in place.
 */
export function applyMissileRelicEffects(
  state: GameState,
  patch: Partial<GameState>,
  sideEffects: SideEffect[],
  enqueuedActions: GameAction[],
  target: GameCardData,
): void {
  if (hasEternalRelic(state.eternalRelics, 'missile-stun-20') && !target.isStunned) {
    const stunPct = Math.min(20, state.stunCap ?? 0);
    if (stunPct > 0) {
      const [roll, nextRng] = nextInt(patch.rng ?? state.rng, 1, 100);
      patch.rng = nextRng;
      if (roll <= stunPct) {
        enqueuedActions.push({ type: 'UPDATE_MONSTER_CARD', monsterId: target.id, patch: { isStunned: true } });
        log(sideEffects, 'magic', `永恒护符·震荡弹幕：${target.name} 被击晕了！`);
        const ae = computeAmuletEffects(state.amuletSlots as GameCardData[]);
        if (ae.hasStunGold) {
          enqueuedActions.push({ type: 'MODIFY_GOLD', delta: 10, source: 'amulet-stun-gold' });
          log(sideEffects, 'amulet', `雷金护符：${target.name} 被击晕，金币 +10`);
        }
      }
    }
  }
  if (hasEternalRelic(state.eternalRelics, 'missile-draw-1')) {
    enqueuedActions.push({ type: 'DRAW_CARDS', count: 1, source: 'backpack' });
    log(sideEffects, 'magic', `永恒护符·汲取弹幕：抽 1 张牌`);
  }
}

export function getRepairableSlots(state: GameState): Array<{ id: EquipmentSlotId; item: GameCardData }> {
  const result: Array<{ id: EquipmentSlotId; item: GameCardData }> = [];
  for (const slotId of ['equipmentSlot1', 'equipmentSlot2'] as const) {
    const item = state[slotId] as GameCardData | null;
    if (!item) continue;
    const maxDur = item.maxDurability ?? item.durability ?? 0;
    const curDur = item.durability ?? maxDur;
    if (maxDur > 0 && curDur < maxDur) {
      result.push({ id: slotId, item });
    }
  }
  return result;
}

export function getEquippedSlots(state: GameState): Array<{ id: EquipmentSlotId; item: GameCardData }> {
  const result: Array<{ id: EquipmentSlotId; item: GameCardData }> = [];
  if (state.equipmentSlot1) result.push({ id: 'equipmentSlot1', item: state.equipmentSlot1 as GameCardData });
  if (state.equipmentSlot2) result.push({ id: 'equipmentSlot2', item: state.equipmentSlot2 as GameCardData });
  return result;
}

/**
 * 流转之符 (`swap-upgrade`) progress tick. Call once per "position swap" effect
 * regardless of echo multiplier (consistent across 乾坤挪移、命运挪移、维度扭曲、
 * 深层交织、先锋换阵 etc.). Returns true when the third swap triggered the
 * upgrade modal (caller may want to override its own banner with the upgrade
 * prompt).
 */
export function checkSwapUpgrade(
  state: GameState,
  patch: Partial<GameState>,
  sideEffects: SideEffect[],
  enqueuedActions: GameAction[],
): boolean {
  const ae = computeAmuletEffects(state.amuletSlots as GameCardData[]) ?? createEmptyAmuletEffects();
  if (!ae.hasSwapUpgrade) return false;
  const baseProg = (patch.swapUpgradeProgress ?? state.swapUpgradeProgress ?? 0);
  const prog = baseProg + 1;
  if (prog >= 3) {
    patch.swapUpgradeProgress = 0;
    enqueuedActions.push({ type: 'SET_UPGRADE_MODAL_OPEN', open: true });
    sideEffects.push({ event: 'log:entry', payload: { type: 'amulet', message: '流转之符：交换 3 次位置，选择一张牌升级！' } });
    return true;
  }
  patch.swapUpgradeProgress = prog;
  sideEffects.push({ event: 'log:entry', payload: { type: 'amulet', message: `流转之符：交换位置（${prog}/3）` } });
  return false;
}

// ---------------------------------------------------------------------------
// resolveAllMagicEffects
// ---------------------------------------------------------------------------

export function resolveAllMagicEffects(
  state: GameState,
  card: GameCardData,
  target?: string,
  isFlank?: boolean,
): ReduceResult {
  const sideEffects: SideEffect[] = [];
  const patch: Partial<GameState> = {};
  const enqueuedActions: GameAction[] = [];

  // 1. Curse handling — type === 'curse' bypasses the magic pipeline entirely.
  if (card.type === 'curse') {
    const curseEffect = card.curseEffect ?? ((card as any).knightEffect === 'greed-curse' ? 'greed-curse' : 'blood-curse');
    if (curseEffect === 'greed-curse') {
      enqueuedActions.push({ type: 'MODIFY_GOLD', delta: -3, source: 'greed-curse' });
      log(sideEffects, 'magic', '贪婪诅咒消耗了 3 金币。');
      banner(sideEffects, '贪婪诅咒消耗了 3 金币。');
    } else if (curseEffect === 'frenzy-curse') {
      enqueuedActions.push({ type: 'DRAW_FROM_BACKPACK', count: 1 } as GameAction);
      log(sideEffects, 'magic', '战狂诅咒：抽 1 张牌。');
      banner(sideEffects, '战狂诅咒：抽 1 张牌！');
    } else {
      enqueuedActions.push({ type: 'APPLY_DAMAGE', amount: 3, source: 'blood-curse', selfInflicted: true });
      log(sideEffects, 'magic', '血咒吸取了 3 点生命。');
      banner(sideEffects, '血咒吸取了 3 点生命。');
    }
    enqueuedActions.push({ type: 'FINALIZE_MAGIC_CARD', card, dealtDamage: false });
    return applyPatch(state, patch, sideEffects, enqueuedActions);
  }

  // 2. Track magic cards played
  if (card.type === 'magic') {
    patch.magicCardsPlayedThisTurn = (state.magicCardsPlayedThisTurn ?? 0) + 1;
  }

  // 3. Echo/double-next handling
  const isEchoTriggered = state.doubleNextMagic && card.type === 'magic' && card.magicEffect !== 'double-next-magic';
  if (isEchoTriggered) {
    patch.doubleNextMagic = false;
    log(sideEffects, 'magic', `法术回响：${card.name} 的效果将触发两次！`);
    banner(sideEffects, `法术回响！${card.name} 效果触发两次！`);
  }
  const echoMultiplier = isEchoTriggered ? 2 : 1;
  const echoTag = isEchoTriggered ? '（回响×2）' : '';

  // 4. Hero magic cards
  if (card.type === 'hero-magic') {
    return resolveHeroMagicCard(state, card, sideEffects, patch, enqueuedActions);
  }

  // 5. Route by magicEffect, card name, knightEffect, or starter id
  const effect = card.magicEffect;
  const knightEffect = (card as any).knightEffect as string | undefined;

  // ------ honor-blood (must be checked before instant/permanent routing) ------
  if (effect === 'honor-blood') {
    return resolveHonorBlood(state, card, sideEffects, patch, enqueuedActions, echoMultiplier, isEchoTriggered);
  }

  // ------ active-row-monster-attack-debuff ------
  if (effect === 'active-row-monster-attack-debuff') {
    const reduction = 2 * echoMultiplier;
    let modified = 0;
    const updatedCards = (state.activeCards as (GameCardData | null)[]).map(c => {
      if (c?.type === 'monster') {
        modified++;
        const newAttack = Math.max(0, (c.attack ?? c.value) - reduction);
        return { ...c, attack: newAttack, value: newAttack };
      }
      return c;
    });
    patch.activeCards = updatedCards as ActiveRowSlots;
    log(sideEffects, 'magic', `威压之令：激活行 ${modified} 个怪物攻击力 -${reduction}`);
    banner(sideEffects, `威压之令！激活行怪物攻击力 -${reduction}！`);
    patch.lastPlayedCardCategory = getCardPlayCategory(card);
    enqueuedActions.push({ type: 'FINALIZE_MAGIC_CARD', card, dealtDamage: false });
    return applyPatch(state, patch, sideEffects, enqueuedActions);
  }

  // Route instant vs permanent
  if (card.magicType === 'instant') {
    // Try knight instant first
    const knightResult = resolveKnightInstantMagic(state, card, sideEffects, patch, enqueuedActions, echoMultiplier, isEchoTriggered);
    if (knightResult) return knightResult;

    return resolveInstantMagic(state, card, sideEffects, patch, enqueuedActions, echoMultiplier, isEchoTriggered, target);
  }

  if (card.magicType === 'permanent') {
    const knightResult = resolveKnightPermanentMagic(state, card, sideEffects, patch, enqueuedActions, echoMultiplier, isEchoTriggered, undefined, isFlank);
    if (knightResult) return knightResult;

    return resolvePermanentMagic(state, card, sideEffects, patch, enqueuedActions, echoMultiplier, isEchoTriggered);
  }

  // Fallback: emit card:magicResolved for the UI layer
  sideEffects.push({ event: 'card:magicResolved', payload: { card, target } });
  return applyPatch(state, patch, sideEffects, enqueuedActions.length > 0 ? enqueuedActions : undefined);
}

// ---------------------------------------------------------------------------
// Hero magic card resolution
// ---------------------------------------------------------------------------

export function resolveHeroMagicCard(
  state: GameState,
  card: GameCardData,
  sideEffects: SideEffect[],
  patch: Partial<GameState>,
  enqueuedActions: GameAction[],
): ReduceResult {
  // Hero magic cards are complex and deeply tied to heroMagicState.
  // Delegate to UI layer during migration.
  // TODO: Migrate hero magic resolution fully into reducer
  sideEffects.push({ event: 'card:magicResolved', payload: { card } });
  return applyPatch(state, patch, sideEffects, enqueuedActions.length > 0 ? enqueuedActions : undefined);
}

// ---------------------------------------------------------------------------
// Honor blood (self-damage + repair)
// ---------------------------------------------------------------------------

export function resolveHonorBlood(
  state: GameState,
  card: GameCardData,
  sideEffects: SideEffect[],
  patch: Partial<GameState>,
  enqueuedActions: GameAction[],
  echoMultiplier: number,
  isEchoTriggered: boolean,
): ReduceResult {
  enqueuedActions.push({ type: 'APPLY_DAMAGE', amount: 1, source: 'honor-blood', selfInflicted: true });

  const repairableSlots = getRepairableSlots(state);
  if (repairableSlots.length === 0) {
    banner(sideEffects, '战血之印：失去 1 点生命；没有可恢复耐久的装备。');
    log(sideEffects, 'magic', '战血之印：失去 1 点生命；没有可恢复耐久的装备。');
    patch.lastPlayedCardCategory = getCardPlayCategory(card);
    enqueuedActions.push({ type: 'FINALIZE_MAGIC_CARD', card, dealtDamage: false });
    return applyPatch(state, patch, sideEffects, enqueuedActions);
  }

  if (repairableSlots.length === 1) {
    const repairAmount = 1 * echoMultiplier;
    const slot = repairableSlots[0];
    const maxDur = slot.item.maxDurability ?? slot.item.durability ?? 0;
    const curDur = slot.item.durability ?? maxDur;
    (patch as any)[slot.id] = { ...slot.item, durability: Math.min(maxDur, curDur + repairAmount) };
    banner(sideEffects, `战血之印：失去 1 点生命，${slot.item.name} 恢复 ${repairAmount} 点耐久。${isEchoTriggered ? '（回响×2）' : ''}`);
    log(sideEffects, 'magic', `战血之印：失去 1 点生命，${slot.item.name} 恢复 ${repairAmount} 点耐久。`);
    patch.lastPlayedCardCategory = getCardPlayCategory(card);
    enqueuedActions.push({ type: 'FINALIZE_MAGIC_CARD', card, dealtDamage: false });
    return applyPatch(state, patch, sideEffects, enqueuedActions);
  }

  // Multiple repairable slots — interactive
  patch.pendingMagicAction = {
    card,
    effect: 'repair-one',
    step: 'slot-select',
    prompt: `战血之印：选择一件装备恢复 ${1 * echoMultiplier} 点耐久。`,
    echoMultiplier,
  } as any;
  patch.heroSkillBanner = `战血之印失去 1 点生命，请选择一件装备恢复 ${1 * echoMultiplier} 点耐久。${isEchoTriggered ? '（回响×2）' : ''}`;
  return applyPatch(state, patch, sideEffects);
}

// ---------------------------------------------------------------------------
// Instant magic effects
// ---------------------------------------------------------------------------

export function resolveInstantMagic(
  state: GameState,
  card: GameCardData,
  sideEffects: SideEffect[],
  patch: Partial<GameState>,
  enqueuedActions: GameAction[],
  echoMultiplier: number,
  isEchoTriggered: boolean,
  target?: string,
): ReduceResult {
  const effect = card.magicEffect;
  const echoTag = isEchoTriggered ? '（回响×2）' : '';

  // --- amplify-card: open amplify modal ---
  if (effect === 'amplify-card') {
    const hasEquip1 = state.equipmentSlot1 && (state.equipmentSlot1.type === 'weapon' || state.equipmentSlot1.type === 'shield');
    const hasEquip2 = state.equipmentSlot2 && (state.equipmentSlot2.type === 'weapon' || state.equipmentSlot2.type === 'shield');
    const eligibleHand = state.handCards.filter(
      c => c.id !== card.id && (c.type === 'weapon' || c.type === 'shield' || isDamageMagic(c)),
    );
    if (!hasEquip1 && !hasEquip2 && eligibleHand.length === 0) {
      banner(sideEffects, '增幅：没有可增幅的目标（装备栏无装备，手牌中无装备或伤害魔法）。');
      patch.lastPlayedCardCategory = getCardPlayCategory(card);
      enqueuedActions.push({ type: 'FINALIZE_MAGIC_CARD', card, dealtDamage: false });
      return applyPatch(state, patch, sideEffects, enqueuedActions);
    }
    patch.amplifyModal = { sourceCardId: card.id };
    patch.pendingMagicAction = {
      card,
      effect: 'amplify-card',
      step: 'modal-select',
      prompt: '增幅：选择一张牌进行增幅。',
    } as any;
    patch.heroSkillBanner = '增幅：选择一张牌进行增幅。';
    return applyPatch(state, patch, sideEffects);
  }

  // --- Route by card name ---
  switch (card.name) {
    case '风暴箭雨':
      return resolveStormVolley(state, card, sideEffects, patch, enqueuedActions, echoMultiplier, isEchoTriggered);

    case '涌泉满手':
      return resolveFountainHand(state, card, sideEffects, patch, enqueuedActions);

    case '余烬回响':
      return resolveEmberEcho(state, card, sideEffects, patch, enqueuedActions, echoMultiplier, isEchoTriggered);

    case '治愈术': {
      const healAmounts = [5, 3, 5];
      const healAmt = healAmounts[card.upgradeLevel ?? 0] ?? 5;
      enqueuedActions.push({ type: 'HEAL', amount: healAmt, source: 'heal-magic' });
      log(sideEffects, 'magic', `治愈术：恢复 ${healAmt} 点生命`);
      banner(sideEffects, `治愈术：回复 ${healAmt} 点生命。`);
      patch.lastPlayedCardCategory = getCardPlayCategory(card);
      enqueuedActions.push({ type: 'FINALIZE_MAGIC_CARD', card, dealtDamage: false });
      return applyPatch(state, patch, sideEffects, enqueuedActions);
    }

    case '点金裁决':
      return resolveBloodReckoning(state, card, sideEffects, patch, enqueuedActions, echoMultiplier, isEchoTriggered);

    case '等价交换':
      return resolveSoulSwap(state, card, sideEffects, patch, enqueuedActions);

    case '永恒铭刻':
      return resolvePermGrant(state, card, sideEffects, patch, enqueuedActions);

    case '专属召唤': {
      const playable = state.handCards.filter(c => c.id !== card.id);
      const discardCount = Math.min(playable.length, 2);
      if (discardCount > 0) {
        let rng = state.rng;
        const [discarded, rngAfter] = pickRandomHandCardsForDiscardPreferGraveyard(playable, discardCount, rng);
        patch.rng = rngAfter;
        const discardIds = new Set(discarded.map(c => c.id));
        patch.handCards = state.handCards.filter(c => !discardIds.has(c.id));
        for (const dc of discarded) {
          enqueuedActions.push({ type: 'ADD_TO_GRAVEYARD', card: dc });
        }
        log(sideEffects, 'magic', `专属召唤：弃回 ${discarded.map(c => c.name).join('、')}`);
      }
      enqueuedActions.push({ type: 'DRAW_CLASS_TO_BACKPACK', count: 1 });
      sideEffects.push({ event: 'card:classDrawRequested' as any, payload: { count: 1, source: '专属召唤' } });
      banner(sideEffects, `专属召唤：弃回 ${discardCount} 张牌，获得一张职业专属卡！`);
      patch.lastPlayedCardCategory = getCardPlayCategory(card);
      enqueuedActions.push({ type: 'FINALIZE_MAGIC_CARD', card, dealtDamage: false });
      return applyPatch(state, patch, sideEffects, enqueuedActions);
    }

    case '升级卷轴': {
      patch.upgradeModalOpen = true;
      banner(sideEffects, '升级卷轴：选择一张牌进行升级。');
      patch.lastPlayedCardCategory = getCardPlayCategory(card);
      enqueuedActions.push({ type: 'FINALIZE_MAGIC_CARD', card, dealtDamage: false });
      return applyPatch(state, patch, sideEffects, enqueuedActions);
    }

    case '秘法精炼': {
      patch.handMagicUpgradeModal = { sourceCardId: card.id };
      banner(sideEffects, '秘法精炼：选择至多 2 张魔法牌进行升级。');
      patch.lastPlayedCardCategory = getCardPlayCategory(card);
      enqueuedActions.push({ type: 'FINALIZE_MAGIC_CARD', card, dealtDamage: false });
      return applyPatch(state, patch, sideEffects, enqueuedActions);
    }

    case '天机铸炼': {
      const equipSlots = getEquippedSlots(state).filter(slot =>
        slot.item.type === 'weapon' || slot.item.type === 'shield' || slot.item.type === 'monster',
      );
      if (equipSlots.length === 0) {
        banner(sideEffects, '天机铸炼无效（没有可选的装备）。');
        patch.lastPlayedCardCategory = getCardPlayCategory(card);
        enqueuedActions.push({ type: 'FINALIZE_MAGIC_CARD', card, dealtDamage: false });
        return applyPatch(state, patch, sideEffects, enqueuedActions);
      }
      patch.pendingMagicAction = {
        card,
        effect: 'event-fortify',
        step: 'slot-select',
        prompt: '天机铸炼：选择一件装备，翻看牌堆顶 3 张牌。',
      } as any;
      patch.heroSkillBanner = '天机铸炼：选择一件装备。';
      return applyPatch(state, patch, sideEffects);
    }

    case '回响行囊':
      return resolveEchoBag(state, card, sideEffects, patch, enqueuedActions, echoMultiplier, isEchoTriggered);

    case '潮涌铸甲': {
      patch.pendingMagicAction = {
        card,
        effect: 'bulwark-choice',
        step: 'choice',
        prompt: '选择获得一个永恒护符。',
      } as any;
      patch.heroSkillBanner = '潮涌铸甲：选择获得一个永恒护符。';
      sideEffects.push({
        event: 'ui:requestMagicChoice' as any,
        payload: {
          prompt: '潮涌铸甲',
          options: [
            {
              id: 'waterfall-armor',
              label: '瀑流铸剑',
              description: '永恒护符：每次攻击时，该装备栏临时攻击 +2。（可叠加）',
            },
            {
              id: 'block-temp-armor',
              label: '格挡铸甲',
              description: '永恒护符：每次格挡时，该装备栏获得 2 点临时护甲。（可叠加）',
            },
          ],
          context: { subtitle: '选择获得一个永恒护符' },
        },
      });
      return applyPatch(state, patch, sideEffects);
    }

    case '万象探知': {
      const peekCount = [5, 6, 7][card.upgradeLevel ?? 0] ?? 5;
      const deck = state.remainingDeck as GameCardData[];
      const peekedCards = deck.slice(0, Math.min(peekCount, deck.length));

      if (peekedCards.length === 0) {
        banner(sideEffects, '万象探知：主牌堆已空，无效果。');
        patch.lastPlayedCardCategory = getCardPlayCategory(card);
        enqueuedActions.push({ type: 'FINALIZE_MAGIC_CARD', card, dealtDamage: false });
        return applyPatch(state, patch, sideEffects, enqueuedActions);
      }

      let rng = state.rng;
      const monsterCount = peekedCards.filter(c => c.type === 'monster').length;
      const equipCount = peekedCards.filter(c => c.type === 'weapon' || c.type === 'shield').length;
      const magicCount = peekedCards.filter(c => c.type === 'magic').length;
      const amuletCount = peekedCards.filter(c => c.type === 'amulet').length;
      const potionCount = peekedCards.filter(c => c.type === 'potion').length;

      const gains: Array<{ label: string; count: number }> = [];
      const bonuses = { ...state.equipmentSlotBonuses } as Record<string, { damage: number; shield: number }>;
      const slots = ['equipmentSlot1', 'equipmentSlot2'] as const;

      if (monsterCount > 0) {
        for (let i = 0; i < monsterCount; i++) {
          const [slotIdx, rng2] = nextInt(rng, 0, slots.length - 1); rng = rng2;
          const sid = slots[slotIdx];
          bonuses[sid] = { ...bonuses[sid], damage: (bonuses[sid]?.damage ?? 0) + 1 };
        }
        gains.push({ label: '随机装备栏永久攻击 +1', count: monsterCount });
      }
      if (equipCount > 0) {
        for (let i = 0; i < equipCount; i++) {
          const [slotIdx, rng2] = nextInt(rng, 0, slots.length - 1); rng = rng2;
          const sid = slots[slotIdx];
          bonuses[sid] = { ...bonuses[sid], shield: (bonuses[sid]?.shield ?? 0) + 1 };
        }
        gains.push({ label: '随机装备栏永久护甲 +1', count: equipCount });
      }
      if (magicCount > 0) {
        patch.permanentSpellDamageBonus = (state.permanentSpellDamageBonus ?? 0) + magicCount;
        gains.push({ label: '法术伤害 +1', count: magicCount });
      }
      if (amuletCount > 0) {
        patch.permanentSpellLifesteal = (state.permanentSpellLifesteal ?? 0) + amuletCount;
        gains.push({ label: '超杀吸血 +1', count: amuletCount });
      }
      if (potionCount > 0) {
        patch.stunCap = (state.stunCap ?? 0) + potionCount * 5;
        gains.push({ label: '击晕上限 +5%', count: potionCount });
      }

      patch.equipmentSlotBonuses = bonuses as EquipmentSlotBonusState;
      patch.rng = rng;

      const gainsSummary = gains.map(g => `${g.label}×${g.count}`).join('，');
      log(sideEffects, 'magic', `万象探知：翻看 ${peekedCards.length} 张牌 → ${gainsSummary || '无增益'}`);
      banner(sideEffects, `万象探知：翻看 ${peekedCards.length} 张牌！${gainsSummary || '无增益'}`);
      sideEffects.push({ event: 'hero:deckPeekRequest', payload: { mode: 'dungeon-insight', peekedCards, gains } });

      patch.lastPlayedCardCategory = getCardPlayCategory(card);
      enqueuedActions.push({ type: 'FINALIZE_MAGIC_CARD', card, dealtDamage: false });
      return applyPatch(state, patch, sideEffects, enqueuedActions);
    }
  }

  // --- altar-discard-discover ---
  if (effect === 'altar-discard-discover') {
    // Discard 2 random hand cards, then delegate discover to UI
    const playable = state.handCards.filter(c => c.id !== card.id);
    const discardCount = Math.min(playable.length, 2);
    if (discardCount > 0) {
      let rng = state.rng;
      const [discarded, rngAfter] = pickRandomHandCardsForDiscardPreferGraveyard(playable, discardCount, rng);
      patch.rng = rngAfter;
      const discardIds = new Set(discarded.map(c => c.id));
      patch.handCards = state.handCards.filter(c => !discardIds.has(c.id));
      for (const dc of discarded) {
        enqueuedActions.push({ type: 'ADD_TO_GRAVEYARD', card: dc });
      }
      log(sideEffects, 'magic', `祭坛秘术：弃回 ${discarded.map(c => c.name).join('、')}`);
    }
    const classDeck = patch.classDeck ?? state.classDeck ?? [];
    const discoverPool = classDeck.filter((c: GameCardData) => c.type === 'magic' || c.type === 'hero-magic');
    if (discoverPool.length > 0) {
      let drng = patch.rng ?? state.rng;
      let shuffled: GameCardData[];
      [shuffled, drng] = rngShuffle(discoverPool, drng);
      patch.rng = drng;
      const candidates = shuffled.slice(0, Math.min(3, discoverPool.length));
      const candidateIds = new Set(candidates.map(c => c.id));
      patch.classDeck = classDeck.filter((c: GameCardData) => !candidateIds.has(c.id));
      sideEffects.push({ event: 'card:discoverRequested' as any, payload: { source: 'altar-discard-discover', candidates, sourceLabel: card.name } });
      banner(sideEffects, `祭坛秘术：弃回 ${discardCount} 张牌，发现专属魔法卡…`);
    } else {
      log(sideEffects, 'magic', '祭坛秘术：专属牌堆中没有魔法卡。');
      banner(sideEffects, `祭坛秘术：弃回 ${discardCount} 张牌，但专属牌堆中没有魔法卡。`);
    }
    patch.lastPlayedCardCategory = getCardPlayCategory(card);
    enqueuedActions.push({ type: 'FINALIZE_MAGIC_CARD', card, dealtDamage: false });
    return applyPatch(state, patch, sideEffects, enqueuedActions);
  }

  // Fallback: delegate to UI
  sideEffects.push({ event: 'card:magicResolved', payload: { card, target } });
  patch.lastPlayedCardCategory = getCardPlayCategory(card);
  return applyPatch(state, patch, sideEffects, enqueuedActions.length > 0 ? enqueuedActions : undefined);
}

// ---------------------------------------------------------------------------
// Permanent magic effects
// ---------------------------------------------------------------------------

export function resolvePermanentMagic(
  state: GameState,
  card: GameCardData,
  sideEffects: SideEffect[],
  patch: Partial<GameState>,
  enqueuedActions: GameAction[],
  echoMultiplier: number,
  isEchoTriggered: boolean,
): ReduceResult {
  const effect = card.magicEffect;
  const echoTag = isEchoTriggered ? '（回响×2）' : '';

  // --- double-next-magic ---
  if (effect === 'double-next-magic') {
    patch.doubleNextMagic = true;
    log(sideEffects, 'magic', `${card.name}：下一张魔法牌效果翻倍！`);
    banner(sideEffects, '法术回响已激活！下一张法术的效果将触发两次。');
    patch.lastPlayedCardCategory = getCardPlayCategory(card);
    enqueuedActions.push({ type: 'FINALIZE_MAGIC_CARD', card, dealtDamage: false });
    return applyPatch(state, patch, sideEffects, enqueuedActions);
  }

  // --- swap-backpack-recycle ---
  if (effect === 'swap-backpack-recycle') {
    patch.backpackItems = state.permanentMagicRecycleBag.map(c => sanitizeCardMetadata(c));
    patch.permanentMagicRecycleBag = state.backpackItems.map((c: GameCardData) => sanitizeCardMetadata(c));
    log(sideEffects, 'magic', `虚空置换：背包与回收袋对换（背包现 ${patch.backpackItems.length} 张，回收袋现 ${patch.permanentMagicRecycleBag.length} 张）。`);
    banner(sideEffects, '虚空置换：背包与永久魔法回收袋内容已对换。');
    enqueuedActions.push({ type: 'ENFORCE_BACKPACK_CAPACITY' });
    patch.lastPlayedCardCategory = getCardPlayCategory(card);
    enqueuedActions.push({ type: 'FINALIZE_MAGIC_CARD', card, dealtDamage: false });
    return applyPatch(state, patch, sideEffects, enqueuedActions);
  }

  // --- guild-hand-recycle ---
  if (effect === 'guild-hand-recycle') {
    // Curses cannot be recycled — they remain in hand.
    const otherHandCards = state.handCards.filter(c => c.id !== card.id && c.type !== 'curse');
    const movedCount = otherHandCards.length;
    for (const hc of otherHandCards) {
      enqueuedActions.push({ type: 'ADD_TO_RECYCLE_BAG', card: sanitizeCardMetadata(hc) });
    }
    const movedIds = new Set(otherHandCards.map(c => c.id));
    patch.handCards = state.handCards.filter(c => !movedIds.has(c.id));
    const pool = [
      ...state.permanentMagicRecycleBag,
      ...otherHandCards.map(c => sanitizeCardMetadata(c)),
    ];
    let rng = state.rng;
    let shuffled: typeof pool;
    [shuffled, rng] = rngShuffle(pool, rng);
    patch.rng = rng;
    const toDraw = shuffled.slice(0, Math.min(2, shuffled.length));
    if (toDraw.length > 0) {
      const drawnIds = new Set(toDraw.map(c => c.id));
      patch.permanentMagicRecycleBag = (patch.permanentMagicRecycleBag ?? state.permanentMagicRecycleBag).filter(c => !drawnIds.has(c.id));
      patch.handCards = [...(patch.handCards ?? state.handCards), ...toDraw];
      for (const drawn of toDraw) {
        sideEffects.push({ event: 'card:drawnToHand', payload: { cardId: drawn.id, source: 'recycleBag' } });
      }
    }
    log(sideEffects, 'magic', `奇术轮转：${movedCount} 张手牌移入回收袋，取回 ${toDraw.length} 张。`);
    banner(sideEffects, `奇术轮转：${movedCount} 张手牌洗入回收袋，取回 ${toDraw.length} 张！`);
    patch.lastPlayedCardCategory = getCardPlayCategory(card);
    enqueuedActions.push({ type: 'FINALIZE_MAGIC_CARD', card, dealtDamage: false });
    return applyPatch(state, patch, sideEffects, enqueuedActions);
  }

  // --- guild-recycle-reshuffle ---
  if (effect === 'guild-recycle-reshuffle') {
    const recycled = state.permanentMagicRecycleBag;
    if (recycled.length > 0) {
      const readyCards: GameCardData[] = [];
      const waitingCards: GameCardData[] = [];
      for (const c of recycled) {
        const waits = ((c as GameCardData & { _recycleWaits?: number })._recycleWaits ?? 1) - 1;
        if (waits <= 0) {
          const { _recycleWaits, ...clean } = c as GameCardData & { _recycleWaits?: number };
          readyCards.push(clean as GameCardData);
        } else {
          waitingCards.push({ ...c, _recycleWaits: waits } as GameCardData);
        }
      }
      const cap = getEffectiveBackpackCapacity(state);
      const available = cap - state.backpackItems.length;
      const toAdd = readyCards.slice(0, Math.max(0, available));
      const overflow = readyCards.slice(Math.max(0, available));
      if (toAdd.length > 0) {
        patch.backpackItems = [...toAdd, ...state.backpackItems];
      }
      patch.permanentMagicRecycleBag = [...overflow, ...waitingCards];
      const parts: string[] = [];
      if (toAdd.length > 0) parts.push(`回收袋 ${toAdd.length} 张牌洗回背包`);
      if (waitingCards.length > 0) parts.push(`${waitingCards.length} 张牌剩余瀑流 -1`);
      if (overflow.length > 0) parts.push(`${overflow.length} 张因容量不足留在回收袋`);
      log(sideEffects, 'magic', `回收轮转：${parts.join('，')}`);
    } else {
      log(sideEffects, 'magic', '回收轮转：回收袋为空');
    }
    // Draw 1 from backpack
    const drawState = { ...state, ...patch } as GameState;
    const { card: drawn, patch: drawPatch } = drawFromBackpackToHandPure(drawState);
    if (drawn) {
      mergePatch(patch, drawPatch);
      sideEffects.push({ event: 'card:drawnToHand', payload: { cardId: drawn.id, source: 'backpack' } });
    }
    const bnr = recycled.length > 0
      ? '回收轮转：回收袋洗回背包，抽 1 张牌！'
      : '回收轮转：回收袋为空，抽 1 张牌。';
    banner(sideEffects, bnr);
    patch.lastPlayedCardCategory = getCardPlayCategory(card);
    enqueuedActions.push({ type: 'FINALIZE_MAGIC_CARD', card, dealtDamage: false });
    return applyPatch(state, patch, sideEffects, enqueuedActions);
  }

  // --- crossroads-left-swap ---
  if (effect === 'crossroads-left-swap') {
    const cards = state.activeCards as (GameCardData | null)[];
    let firstIdx = -1;
    let secondIdx = -1;
    for (let i = 0; i < cards.length; i++) {
      if (cards[i] != null) {
        if (firstIdx === -1) firstIdx = i;
        else if (secondIdx === -1) { secondIdx = i; break; }
      }
    }
    if (firstIdx === -1 || secondIdx === -1) {
      log(sideEffects, 'magic', '命运挪移无效（地城行剩余卡牌不足 2 张）。');
      banner(sideEffects, '命运挪移无效（地城行剩余卡牌不足 2 张）。');
      patch.lastPlayedCardCategory = getCardPlayCategory(card);
      enqueuedActions.push({ type: 'FINALIZE_MAGIC_CARD', card, dealtDamage: false });
      return applyPatch(state, patch, sideEffects, enqueuedActions);
    }
    const firstCard = cards[firstIdx]!;
    const secondCard = cards[secondIdx]!;
    const next = [...cards] as ActiveRowSlots;
    for (let swapI = 0; swapI < echoMultiplier; swapI++) {
      const tmp = next[firstIdx];
      next[firstIdx] = next[secondIdx];
      next[secondIdx] = tmp;
    }
    patch.activeCards = next;
    const bannerText = echoMultiplier > 1
      ? `命运挪移 ×${echoMultiplier}：${firstCard.name} ↔ ${secondCard.name}（回响）`
      : `命运挪移：${firstCard.name} ↔ ${secondCard.name} 位置互换！`;
    log(sideEffects, 'magic', `命运挪移：${firstCard.name} 与 ${secondCard.name} 互换 ${echoMultiplier} 次。`);
    banner(sideEffects, bannerText);
    checkSwapUpgrade(state, patch, sideEffects, enqueuedActions);
    patch.lastPlayedCardCategory = getCardPlayCategory(card);
    enqueuedActions.push({ type: 'FINALIZE_MAGIC_CARD', card, dealtDamage: false });
    return applyPatch(state, patch, sideEffects, enqueuedActions);
  }

  // --- persuade-boost-draw ---
  if (effect === 'persuade-boost-draw') {
    const normalBoost = 15 * echoMultiplier;
    patch.persuadeAmuletBonus = (state.persuadeAmuletBonus ?? 0) + normalBoost;
    log(sideEffects, 'magic', `劝降祝福：下次劝降成功率 +${normalBoost}%，抽 ${echoMultiplier} 张牌`);
    const drawState = { ...state, ...patch } as GameState;
    const drawResult = drawMultipleFromBackpack(drawState, 1 * echoMultiplier);
    if (drawResult.cards.length > 0) {
      mergePatch(patch, drawResult.patch);
      for (const d of drawResult.cards) {
        sideEffects.push({ event: 'card:drawnToHand', payload: { cardId: d.id, source: 'backpack' } });
      }
    }
    const drawText = drawResult.cards.length > 0 ? `，抽了 ${drawResult.cards.length} 张牌` : '';
    banner(sideEffects, `劝降祝福：劝降成功率 +${normalBoost}%${drawText}。${echoTag}`);
    patch.lastPlayedCardCategory = getCardPlayCategory(card);
    enqueuedActions.push({ type: 'FINALIZE_MAGIC_CARD', card, dealtDamage: false });
    return applyPatch(state, patch, sideEffects, enqueuedActions);
  }

  // --- bounty-spell-damage ---
  if (effect === 'bounty-spell-damage') {
    const monsters = flattenActiveRowSlots(state.activeCards).filter(isDamageableTarget);
    if (monsters.length === 0) {
      banner(sideEffects, '赏金裁决无效（没有怪物）。');
      patch.lastPlayedCardCategory = getCardPlayCategory(card);
      enqueuedActions.push({ type: 'FINALIZE_MAGIC_CARD', card, dealtDamage: false });
      return applyPatch(state, patch, sideEffects, enqueuedActions);
    }
    const baseDmg = 5 + (card.amplifyBonus ?? 0);
    const totalDmg = getSpellDamage(baseDmg, state) * echoMultiplier;
    if (monsters.length === 1) {
      enqueuedActions.push({ type: 'DEAL_DAMAGE_TO_MONSTER', monsterId: monsters[0].id, damage: totalDmg, source: 'bounty-spell-damage', isSpellDamage: true });
      enqueuedActions.push({ type: 'MODIFY_GOLD', delta: totalDmg, source: 'bounty-spell-damage' });
      log(sideEffects, 'magic', `赏金裁决：对 ${monsters[0].name} 造成 ${totalDmg} 点法术伤害，获得 ${totalDmg} 金币`);
      banner(sideEffects, `赏金裁决：${totalDmg} 点伤害 → ${totalDmg} 金币！${echoTag}`);
      patch.lastPlayedCardCategory = getCardPlayCategory(card);
      enqueuedActions.push({ type: 'FINALIZE_MAGIC_CARD', card, dealtDamage: true });
      return applyPatch(state, patch, sideEffects, enqueuedActions);
    }
    patch.pendingMagicAction = {
      card,
      effect: 'bounty-spell-damage',
      step: 'monster-select',
      echoMultiplier,
      prompt: `选择一个怪物，造成 ${totalDmg} 点法术伤害并获得等量金币。${echoTag}`,
    } as any;
    patch.heroSkillBanner = '赏金裁决：选择目标怪物。';
    return applyPatch(state, patch, sideEffects);
  }

  // --- arcane-shield-stun-cap ---
  if (effect === 'arcane-shield-stun-cap') {
    const totalMagic = (patch.magicCardsPlayedThisTurn ?? state.magicCardsPlayedThisTurn ?? 0);
    const damageMagic = state.damageMagicPlayedThisTurn ?? 0;
    const nonDamageCount = Math.max(0, totalMagic - damageMagic);
    const stunGain = nonDamageCount * echoMultiplier;
    if (stunGain > 0) {
      patch.stunCap = Math.min(100, (state.stunCap ?? 0) + stunGain);
    }
    const newCap = Math.min(100, (state.stunCap ?? 0) + stunGain);
    log(sideEffects, 'magic', `奥术护盾：本回合 ${nonDamageCount} 张非伤害魔法卡，击晕上限 +${stunGain}%`);
    banner(sideEffects, `奥术护盾：本回合 ${nonDamageCount} 张非伤害魔法卡，击晕上限 +${stunGain}%（当前 ${newCap}%）。${echoTag}`);
    patch.lastPlayedCardCategory = getCardPlayCategory(card);
    enqueuedActions.push({ type: 'FINALIZE_MAGIC_CARD', card, dealtDamage: false });
    return applyPatch(state, patch, sideEffects, enqueuedActions);
  }

  // --- storm-volley-recycle ---
  if (effect === 'storm-volley-recycle') {
    return resolveStormVolleyRecycle(state, card, sideEffects, patch, enqueuedActions, echoMultiplier, isEchoTriggered);
  }

  // --- arcane-storm-magic-count ---
  if (effect === 'arcane-storm-magic-count') {
    return resolveArcaneStorm(state, card, sideEffects, patch, enqueuedActions, echoMultiplier, isEchoTriggered);
  }

  // --- equipment-enchant-discard ---
  if (effect === 'equipment-enchant-discard') {
    const handEquip = state.handCards.filter(
      c => c.id !== card.id && (c.type === 'weapon' || c.type === 'shield'),
    );
    const equippedSlots = getEquippedSlots(state);
    if (handEquip.length === 0) {
      banner(sideEffects, '手牌中没有装备卡可弃置。');
      patch.lastPlayedCardCategory = getCardPlayCategory(card);
      enqueuedActions.push({ type: 'FINALIZE_MAGIC_CARD', card, dealtDamage: false });
      return applyPatch(state, patch, sideEffects, enqueuedActions);
    }
    if (equippedSlots.length === 0) {
      banner(sideEffects, '装备栏没有装备可附魔。');
      patch.lastPlayedCardCategory = getCardPlayCategory(card);
      enqueuedActions.push({ type: 'FINALIZE_MAGIC_CARD', card, dealtDamage: false });
      return applyPatch(state, patch, sideEffects, enqueuedActions);
    }
    patch.permGrantModal = { sourceCardId: card.id, sourceType: 'equipment-enchant' as const };
    patch.pendingMagicAction = { card, effect: 'equipment-enchant-discard', step: 'perm-grant-select' } as any;
    patch.heroSkillBanner = '选择一张手牌中的装备进行附魔。';
    return applyPatch(state, patch, sideEffects);
  }

  // --- amplify-target ---
  if (effect === 'amplify-target') {
    return resolveAmplifyTarget(state, card, sideEffects, patch, enqueuedActions);
  }

  // --- altar-discover-class-magic ---
  if (effect === 'altar-discover-class-magic') {
    const classDeck = state.classDeck ?? [];
    const pool = classDeck.filter((c: GameCardData) => c.type === 'magic' || c.type === 'hero-magic');
    if (pool.length === 0) {
      log(sideEffects, 'magic', '祭坛秘术：专属牌堆中没有魔法卡。');
      banner(sideEffects, '祭坛秘术：专属牌堆中没有魔法卡。');
    } else {
      let rng = patch.rng ?? state.rng;
      let shuffled: GameCardData[];
      [shuffled, rng] = rngShuffle(pool, rng);
      patch.rng = rng;
      const candidates = shuffled.slice(0, Math.min(3, pool.length));
      const candidateIds = new Set(candidates.map(c => c.id));
      patch.classDeck = classDeck.filter((c: GameCardData) => !candidateIds.has(c.id));
      sideEffects.push({ event: 'card:discoverRequested' as any, payload: { source: 'altar-discover-class-magic', candidates, sourceLabel: card.name } });
      banner(sideEffects, '祭坛秘术：发现专属魔法卡…');
    }
    patch.lastPlayedCardCategory = getCardPlayCategory(card);
    enqueuedActions.push({ type: 'FINALIZE_MAGIC_CARD', card, dealtDamage: false });
    return applyPatch(state, patch, sideEffects, enqueuedActions);
  }

  // --- equalize-temp-attack-armor ---
  if (effect === 'equalize-temp-attack-armor') {
    const equippedSlots = getEquippedSlots(state);
    if (equippedSlots.length === 0) {
      banner(sideEffects, '没有装备可选择。');
      patch.lastPlayedCardCategory = getCardPlayCategory(card);
      enqueuedActions.push({ type: 'FINALIZE_MAGIC_CARD', card, dealtDamage: false });
      return applyPatch(state, patch, sideEffects, enqueuedActions);
    }
    if (equippedSlots.length === 1) {
      const slotId = equippedSlots[0].id;
      const atkBoost = 2 * echoMultiplier;
      const tempAtk = (state.slotTempAttack?.[slotId] ?? 0) + atkBoost;
      const tempArm = state.slotTempArmor?.[slotId] ?? 0;
      const newTempAttack = { ...(state.slotTempAttack ?? {}), [slotId]: tempAtk };
      const newTempArmor = { ...(state.slotTempArmor ?? {}) };
      if (tempAtk > tempArm) {
        newTempArmor[slotId] = tempAtk;
      } else if (tempArm > tempAtk) {
        newTempAttack[slotId] = tempArm;
      }
      patch.slotTempAttack = newTempAttack;
      patch.slotTempArmor = newTempArmor;
      const finalVal = Math.max(tempAtk, tempArm);
      log(sideEffects, 'magic', `时空镜像：${equippedSlots[0].item.name} 临时攻防均为 ${finalVal}`);
      banner(sideEffects, `${equippedSlots[0].item.name} 临时攻击 +${atkBoost}，攻防均为 ${finalVal}。`);
      patch.lastPlayedCardCategory = getCardPlayCategory(card);
      enqueuedActions.push({ type: 'FINALIZE_MAGIC_CARD', card, dealtDamage: false });
      return applyPatch(state, patch, sideEffects, enqueuedActions);
    }
    patch.pendingMagicAction = {
      card,
      effect: 'equalize-temp-attack-armor',
      step: 'slot-select',
      prompt: '选择一个装备栏，临时攻击+2，然后使临时攻击与临时护甲相等。',
    } as any;
    patch.heroSkillBanner = '时空镜像：选择一个装备栏。';
    return applyPatch(state, patch, sideEffects);
  }

  // --- Route by starter card id ---
  const starterId = getStarterBaseId(card.id);

  switch (starterId) {
    case STARTER_CARD_IDS.weaponBurst: {
      const burstBase = 2 + 2 * (card.upgradeLevel ?? 0);
      const burstAmount = burstBase * echoMultiplier;
      patch.pendingMagicAction = {
        card,
        effect: 'weapon-burst',
        step: 'slot-select',
        prompt: `选择一个装备栏，临时攻击力 +${burstAmount}。`,
        echoMultiplier,
      } as any;
      patch.heroSkillBanner = `选择一个装备栏，临时攻击力 +${burstAmount}。`;
      return applyPatch(state, patch, sideEffects);
    }

    case STARTER_CARD_IDS.repairOne:
      return resolveRepairOne(state, card, sideEffects, patch, enqueuedActions, echoMultiplier, isEchoTriggered);

    case STARTER_CARD_IDS.surveyAction: {
      // 查阅动作：从背包抽 2 张牌（受回响倍率影响）。
      // 主效果不随 upgradeLevel 缩放——升级仅影响「上手」buff 的强度。
      const drawCount = 2 * echoMultiplier;
      const drawState = { ...state, ...patch } as GameState;
      const drawResult = drawMultipleFromBackpack(drawState, drawCount);
      if (drawResult.cards.length > 0) {
        mergePatch(patch, drawResult.patch);
        for (const d of drawResult.cards) {
          sideEffects.push({ event: 'card:drawnToHand', payload: { cardId: d.id, source: 'backpack' } });
        }
      }
      const drawMsg = drawResult.cards.length > 0
        ? `抽了 ${drawResult.cards.length} 张牌`
        : '背包为空';
      log(sideEffects, 'magic', `查阅动作：${drawMsg}`);
      banner(sideEffects, `查阅动作：${drawMsg}。${echoTag}`);
      patch.lastPlayedCardCategory = getCardPlayCategory(card);
      enqueuedActions.push({ type: 'FINALIZE_MAGIC_CARD', card, dealtDamage: false });
      return applyPatch(state, patch, sideEffects, enqueuedActions);
    }

    case STARTER_CARD_IDS.discardDraw: {
      const discards = [1, 2, 3];
      const draws = [2, 3, 4];
      const discardCount = discards[card.upgradeLevel ?? 0] ?? 1;
      const drawCount = draws[card.upgradeLevel ?? 0] ?? 2;
      const playable = state.handCards.filter(c => c.id !== card.id);
      const actualDiscard = Math.min(playable.length, discardCount);
      if (actualDiscard > 0) {
        let rng = patch.rng ?? state.rng;
        const [discarded, rngAfter] = pickRandomHandCardsForDiscardPreferGraveyard(playable, actualDiscard, rng);
        patch.rng = rngAfter;
        const discardIds = new Set(discarded.map(c => c.id));
        patch.handCards = state.handCards.filter(c => !discardIds.has(c.id));
        for (const dc of discarded) {
          enqueuedActions.push({ type: 'ADD_TO_RECYCLE_BAG', card: dc });
        }
        log(sideEffects, 'magic', `汰旧迎新：移回 ${discarded.map(c => c.name).join('、')} 至回收袋`);
      }
      const drawState = { ...state, ...patch } as GameState;
      const drawResult = drawMultipleFromBackpack(drawState, drawCount);
      if (drawResult.cards.length > 0) {
        mergePatch(patch, drawResult.patch);
        for (const d of drawResult.cards) {
          sideEffects.push({ event: 'card:drawnToHand', payload: { cardId: d.id, source: 'backpack' } });
        }
      }
      const drawMsg = drawResult.cards.length > 0
        ? `抽了 ${drawResult.cards.length} 张牌`
        : '背包为空';
      banner(sideEffects, `汰旧迎新：移回 ${actualDiscard} 张牌，${drawMsg}。${echoTag}`);
      patch.lastPlayedCardCategory = getCardPlayCategory(card);
      enqueuedActions.push({ type: 'FINALIZE_MAGIC_CARD', card, dealtDamage: false });
      return applyPatch(state, patch, sideEffects, enqueuedActions);
    }

    case STARTER_CARD_IDS.tempArmor: {
      const armorAmounts = [2, 3, 4];
      const armorAmt = armorAmounts[card.upgradeLevel ?? 0] ?? 2;
      patch.pendingMagicAction = {
        card,
        effect: 'temp-armor',
        step: 'slot-select',
        prompt: `选择一个装备栏，+${armorAmt} 临时护甲。`,
      } as any;
      patch.heroSkillBanner = `选择一个装备栏，+${armorAmt} 临时护甲。`;
      return applyPatch(state, patch, sideEffects);
    }

    case STARTER_CARD_IDS.healMagic: {
      const healAmounts = [5, 3, 5];
      const healAmt = healAmounts[card.upgradeLevel ?? 0] ?? 5;
      enqueuedActions.push({ type: 'HEAL', amount: healAmt, source: 'heal-magic' });
      log(sideEffects, 'magic', `治愈术：恢复 ${healAmt} 点生命`);
      banner(sideEffects, `治愈术：回复 ${healAmt} 点生命。`);
      patch.lastPlayedCardCategory = getCardPlayCategory(card);
      enqueuedActions.push({ type: 'FINALIZE_MAGIC_CARD', card, dealtDamage: false });
      return applyPatch(state, patch, sideEffects, enqueuedActions);
    }

    case STARTER_CARD_IDS.healEcho:
    case 'potion-flip-heal': {
      const healAmt = 2 * echoMultiplier;
      enqueuedActions.push({ type: 'HEAL', amount: healAmt, source: 'heal-echo' });
      banner(sideEffects, `治愈余韵生效，恢复 ${healAmt} 点生命。${echoTag}`);
      patch.lastPlayedCardCategory = getCardPlayCategory(card);
      enqueuedActions.push({ type: 'FINALIZE_MAGIC_CARD', card, dealtDamage: false });
      return applyPatch(state, patch, sideEffects, enqueuedActions);
    }

    case STARTER_CARD_IDS.reshuffle: {
      const dungeonCards = flattenActiveRowSlots(state.activeCards);
      if (dungeonCards.length === 0) {
        banner(sideEffects, '当前没有可置于牌堆底的地城卡牌。');
        patch.lastPlayedCardCategory = getCardPlayCategory(card);
        enqueuedActions.push({ type: 'FINALIZE_MAGIC_CARD', card, dealtDamage: false });
        return applyPatch(state, patch, sideEffects, enqueuedActions);
      }
      if (dungeonCards.length === 1 && echoMultiplier <= 1) {
        const target = dungeonCards[0];
        const newActive = (state.activeCards as (GameCardData | null)[]).map(c => c?.id === target.id ? null : c) as ActiveRowSlots;
        patch.activeCards = newActive;
        patch.remainingDeck = [...state.remainingDeck, sanitizeCardMetadata(target)];
        banner(sideEffects, `${target.name} 已置于牌堆底。`);
        patch.lastPlayedCardCategory = getCardPlayCategory(card);
        enqueuedActions.push({ type: 'FINALIZE_MAGIC_CARD', card, dealtDamage: false });
        return applyPatch(state, patch, sideEffects, enqueuedActions);
      }
      patch.pendingMagicAction = {
        card,
        effect: 'return-dungeon-bottom',
        step: 'dungeon-select',
        prompt: `选择一张地城卡牌，置于牌堆底。${echoMultiplier > 1 ? `（回响：第 1/${echoMultiplier} 次）` : ''}`,
        echoRemaining: echoMultiplier,
      } as any;
      patch.heroSkillBanner = `选择一张地城卡牌，置于牌堆底。${echoMultiplier > 1 ? `（回响：第 1/${echoMultiplier} 次）` : ''}`;
      return applyPatch(state, patch, sideEffects);
    }

    case STARTER_CARD_IDS.dungeonSwap: {
      const cards = state.activeCards as (GameCardData | null)[];
      let leftIdx = -1;
      let rightIdx = -1;
      for (let i = 0; i < cards.length; i++) {
        if (cards[i] != null) {
          if (leftIdx === -1) leftIdx = i;
          rightIdx = i;
        }
      }
      if (leftIdx === -1 || leftIdx === rightIdx) {
        banner(sideEffects, '乾坤挪移无效（地城行剩余卡牌不足 2 张）。');
        patch.lastPlayedCardCategory = getCardPlayCategory(card);
        enqueuedActions.push({ type: 'FINALIZE_MAGIC_CARD', card, dealtDamage: false });
        return applyPatch(state, patch, sideEffects, enqueuedActions);
      }
      const next = [...cards] as ActiveRowSlots;
      for (let swapI = 0; swapI < echoMultiplier; swapI++) {
        const tmp = next[leftIdx];
        next[leftIdx] = next[rightIdx];
        next[rightIdx] = tmp;
      }
      patch.activeCards = next;
      const leftCard = cards[leftIdx]!;
      const rightCard = cards[rightIdx]!;
      const bnr = echoMultiplier > 1
        ? `乾坤挪移 ×${echoMultiplier}：${leftCard.name} ↔ ${rightCard.name}（回响）`
        : `${leftCard.name} ↔ ${rightCard.name} 位置互换！`;
      log(sideEffects, 'magic', `乾坤挪移：${leftCard.name} 与 ${rightCard.name} 互换 ${echoMultiplier} 次。`);
      banner(sideEffects, bnr);
      checkSwapUpgrade(state, patch, sideEffects, enqueuedActions);
      patch.lastPlayedCardCategory = getCardPlayCategory(card);
      enqueuedActions.push({ type: 'FINALIZE_MAGIC_CARD', card, dealtDamage: false });
      return applyPatch(state, patch, sideEffects, enqueuedActions);
    }

    case STARTER_CARD_IDS.fateSwapDeep: {
      const depth = 4;
      const dungeonCards = flattenActiveRowSlots(state.activeCards);
      if (dungeonCards.length === 0) {
        banner(sideEffects, '地城行没有卡牌。');
        patch.lastPlayedCardCategory = getCardPlayCategory(card);
        enqueuedActions.push({ type: 'FINALIZE_MAGIC_CARD', card, dealtDamage: false });
        return applyPatch(state, patch, sideEffects, enqueuedActions);
      }
      if (state.remainingDeck.length === 0) {
        banner(sideEffects, '牌堆已空，无法交换。');
        patch.lastPlayedCardCategory = getCardPlayCategory(card);
        enqueuedActions.push({ type: 'FINALIZE_MAGIC_CARD', card, dealtDamage: false });
        return applyPatch(state, patch, sideEffects, enqueuedActions);
      }
      patch.pendingMagicAction = {
        card,
        effect: 'fate-swap',
        step: 'dungeon-select',
        prompt: `选择地城行一张牌，与牌堆顶 ${depth} 张中随机一张交换。`,
        deckDepth: depth,
      } as any;
      patch.heroSkillBanner = `选择地城行一张牌，与牌堆顶 ${depth} 张中随机一张交换。`;
      return applyPatch(state, patch, sideEffects);
    }

    case STARTER_CARD_IDS.dimensionWarp: {
      const dungeonCards = flattenActiveRowSlots(state.activeCards);
      if (dungeonCards.length === 0) {
        banner(sideEffects, '地城行没有卡牌。');
        patch.lastPlayedCardCategory = getCardPlayCategory(card);
        enqueuedActions.push({ type: 'FINALIZE_MAGIC_CARD', card, dealtDamage: false });
        return applyPatch(state, patch, sideEffects, enqueuedActions);
      }
      patch.pendingMagicAction = {
        card,
        effect: 'dungeon-preview-swap',
        step: 'dungeon-select',
        prompt: '选择地城行一张卡牌，与正上方预览行卡牌互换。',
      } as any;
      patch.heroSkillBanner = '选择地城行一张卡牌，与正上方预览行卡牌互换。';
      return applyPatch(state, patch, sideEffects);
    }

    case STARTER_CARD_IDS.undyingBlessing: {
      const equipSlots = getEquippedSlots(state);
      if (equipSlots.length === 0) {
        banner(sideEffects, '没有可赐福的装备。');
        patch.lastPlayedCardCategory = getCardPlayCategory(card);
        enqueuedActions.push({ type: 'FINALIZE_MAGIC_CARD', card, dealtDamage: false });
        return applyPatch(state, patch, sideEffects, enqueuedActions);
      }
      if (equipSlots.length === 1) {
        const slot = equipSlots[0];
        (patch as any)[slot.id] = { ...slot.item, hasEquipmentRevive: true, equipmentReviveUsed: false };
        let drawMsg = '';
        if ((card.upgradeLevel ?? 0) >= 1) {
          const drawState = { ...state, ...patch } as GameState;
          const { card: drawn, patch: drawPatch } = drawFromBackpackToHandPure(drawState);
          if (drawn) {
            mergePatch(patch, drawPatch);
            sideEffects.push({ event: 'card:drawnToHand', payload: { cardId: drawn.id, source: 'backpack' } });
            drawMsg = ` 抽到「${drawn.name}」。`;
          }
        }
        banner(sideEffects, `${slot.item.name} 获得了不灭赐福！失去 2 生命。${drawMsg}`);
        log(sideEffects, 'magic', `不灭赐福：${slot.item.name} 获得复生能力，失去 2 生命${drawMsg}`);
        patch.lastPlayedCardCategory = getCardPlayCategory(card);
        enqueuedActions.push({ type: 'APPLY_DAMAGE', amount: 2, source: 'undying-blessing', selfInflicted: true });
        enqueuedActions.push({ type: 'FINALIZE_MAGIC_CARD', card, dealtDamage: false });
        return applyPatch(state, patch, sideEffects, enqueuedActions);
      }
      patch.pendingMagicAction = {
        card,
        effect: 'grant-revive',
        step: 'slot-select',
        prompt: '选择一个装备赋予复生。',
      } as any;
      patch.heroSkillBanner = '选择一个装备赋予复生。';
      return applyPatch(state, patch, sideEffects);
    }

    case STARTER_CARD_IDS.magicMissile: {
      const boltCounts = [2, 3, 4];
      const boltCount = boltCounts[card.upgradeLevel ?? 0] ?? 2;
      const bolts: GameCardData[] = [];
      let rng = state.rng;
      for (let i = 0; i < boltCount; i++) {
        let boltId: string;
        [boltId, rng] = nextId(rng, 'missile-bolt');
        bolts.push({
          id: boltId,
          type: 'magic',
          name: '魔弹',
          value: 0,
          image: card.image,
          magicType: 'instant',
          knightEffect: 'missile-bolt',
          magicEffect: '一次性：选择一个怪物，造成 1 点法术伤害。',
          description: '选择一个怪物，造成 1 点法术伤害。',
        } as GameCardData);
      }
      patch.rng = rng;
      patch.handCards = [...state.handCards, ...bolts];
      log(sideEffects, 'magic', `魔法飞弹：加入 ${boltCount} 张「魔弹」到手牌`);
      banner(sideEffects, `魔法飞弹：${boltCount} 张「魔弹」已加入手牌！`);
      patch.lastPlayedCardCategory = getCardPlayCategory(card);
      enqueuedActions.push({ type: 'FINALIZE_MAGIC_CARD', card, dealtDamage: false });
      return applyPatch(state, patch, sideEffects, enqueuedActions);
    }

    case STARTER_CARD_IDS.stunStrike:
      return resolveStunStrike(state, card, sideEffects, patch, enqueuedActions, echoMultiplier, isEchoTriggered);

    case STARTER_CARD_IDS.gamblerGambit: {
      const goldAmounts = [1, 2, 3];
      const drawAmounts = [1, 2, 3];
      const goldAmt = goldAmounts[card.upgradeLevel ?? 0] ?? 1;
      const drawAmt = drawAmounts[card.upgradeLevel ?? 0] ?? 1;
      enqueuedActions.push({ type: 'APPLY_DAMAGE', amount: 1, source: 'gambler-gambit', selfInflicted: true });
      enqueuedActions.push({ type: 'MODIFY_GOLD', delta: goldAmt, source: 'potion-gold-draw' });
      const drawState = { ...state, ...patch } as GameState;
      const drawResult = drawMultipleFromBackpack(drawState, drawAmt);
      if (drawResult.cards.length > 0) {
        mergePatch(patch, drawResult.patch);
        for (const d of drawResult.cards) {
          sideEffects.push({ event: 'card:drawnToHand', payload: { cardId: d.id, source: 'backpack' } });
        }
      }
      const drawnMsg = drawResult.cards.length > 0
        ? `，抽到${drawResult.cards.map(c => `「${c.name}」`).join('、')}`
        : '，背包为空';
      log(sideEffects, 'magic', `赌徒之计：失去 1 生命，+${goldAmt} 金币${drawnMsg}`);
      banner(sideEffects, `赌徒之计：-1 生命，+${goldAmt} 金币${drawnMsg}。`);
      patch.lastPlayedCardCategory = getCardPlayCategory(card);
      enqueuedActions.push({ type: 'FINALIZE_MAGIC_CARD', card, dealtDamage: false });
      return applyPatch(state, patch, sideEffects, enqueuedActions);
    }

    case STARTER_CARD_IDS.recycleDrawMagic: {
      const recycled = state.permanentMagicRecycleBag ?? [];
      if (recycled.length > 0) {
        const readyCards: GameCardData[] = [];
        const waitingCards: GameCardData[] = [];
        for (const c of recycled) {
          const waits = ((c as GameCardData & { _recycleWaits?: number })._recycleWaits ?? 1) - 1;
          if (waits <= 0) {
            const { _recycleWaits, ...clean } = c as GameCardData & { _recycleWaits?: number };
            readyCards.push(clean as GameCardData);
          } else {
            waitingCards.push({ ...c, _recycleWaits: waits } as GameCardData);
          }
        }
        const cap = getEffectiveBackpackCapacity({ ...state, ...patch } as GameState);
        const currentBackpack = (patch.backpackItems ?? state.backpackItems) as GameCardData[];
        const available = Math.max(0, cap - currentBackpack.length);
        const toAdd = readyCards.slice(0, available);
        const overflow = readyCards.slice(available);
        if (toAdd.length > 0) {
          patch.backpackItems = [...currentBackpack, ...toAdd];
        }
        patch.permanentMagicRecycleBag = [...overflow, ...waitingCards];
        const parts: string[] = [];
        if (toAdd.length > 0) parts.push(`回收袋 ${toAdd.length} 张牌洗回背包`);
        if (waitingCards.length > 0) parts.push(`${waitingCards.length} 张牌剩余瀑流 -1`);
        if (overflow.length > 0) parts.push(`${overflow.length} 张因背包已满留在回收袋`);
        const detail = parts.length > 0 ? parts.join('，') : '回收袋无变化';
        log(sideEffects, 'magic', `回收余韵：${detail}`);
        banner(sideEffects, `回收余韵：${detail}！`);
      } else {
        log(sideEffects, 'magic', '回收余韵：回收袋为空');
        banner(sideEffects, '回收余韵：回收袋为空。');
      }
      patch.lastPlayedCardCategory = getCardPlayCategory(card);
      enqueuedActions.push({ type: 'FINALIZE_MAGIC_CARD', card, dealtDamage: false });
      return applyPatch(state, patch, sideEffects, enqueuedActions);
    }

    case 'guild-blood-gold': {
      enqueuedActions.push({ type: 'APPLY_DAMAGE', amount: 1 * echoMultiplier, source: 'guild-blood-gold', selfInflicted: true });
      enqueuedActions.push({ type: 'MODIFY_GOLD', delta: 2 * echoMultiplier, source: 'guild-blood-gold' });
      log(sideEffects, 'magic', `血金术：受到 ${1 * echoMultiplier} 点伤害，获得 ${2 * echoMultiplier} 金币`);
      banner(sideEffects, `血金术：以 ${1 * echoMultiplier} 点生命换取 ${2 * echoMultiplier} 金币。${echoTag}`);
      patch.lastPlayedCardCategory = getCardPlayCategory(card);
      enqueuedActions.push({ type: 'FINALIZE_MAGIC_CARD', card, dealtDamage: false });
      return applyPatch(state, patch, sideEffects, enqueuedActions);
    }
  }

  // --- Card name based routing for permanent cards ---
  switch (card.name) {
    case '混沌冲击':
      return resolveChaosStrike(state, card, sideEffects, patch, enqueuedActions, echoMultiplier, isEchoTriggered);

    case '淬炼冲击':
      return resolveOverkillUpgrade(state, card, sideEffects, patch, enqueuedActions, echoMultiplier, isEchoTriggered);

    case '专属召唤': {
      const playable = state.handCards.filter(c => c.id !== card.id);
      const discardCount = Math.min(playable.length, 2);
      if (discardCount > 0) {
        let rng = state.rng;
        const [discarded, rngAfter] = pickRandomHandCardsForDiscardPreferGraveyard(playable, discardCount, rng);
        patch.rng = rngAfter;
        const discardIds = new Set(discarded.map(c => c.id));
        patch.handCards = state.handCards.filter(c => !discardIds.has(c.id));
        for (const dc of discarded) {
          enqueuedActions.push({ type: 'ADD_TO_GRAVEYARD', card: dc });
        }
        log(sideEffects, 'magic', `专属召唤：弃回 ${discarded.map(c => c.name).join('、')}`);
      }
      enqueuedActions.push({ type: 'DRAW_CLASS_TO_BACKPACK', count: 1 });
      sideEffects.push({ event: 'card:classDrawRequested' as any, payload: { count: 1, source: '专属召唤' } });
      banner(sideEffects, `专属召唤：弃回 ${discardCount} 张牌，获得一张职业专属卡！`);
      patch.lastPlayedCardCategory = getCardPlayCategory(card);
      enqueuedActions.push({ type: 'FINALIZE_MAGIC_CARD', card, dealtDamage: false });
      return applyPatch(state, patch, sideEffects, enqueuedActions);
    }

    case '维度扭曲': {
      const dungeonCards = flattenActiveRowSlots(state.activeCards);
      if (dungeonCards.length === 0) {
        banner(sideEffects, '地城行没有卡牌。');
        patch.lastPlayedCardCategory = getCardPlayCategory(card);
        enqueuedActions.push({ type: 'FINALIZE_MAGIC_CARD', card, dealtDamage: false });
        return applyPatch(state, patch, sideEffects, enqueuedActions);
      }
      patch.pendingMagicAction = {
        card,
        effect: 'dungeon-preview-swap',
        step: 'dungeon-select',
        prompt: '选择地城行一张卡牌，与正上方预览行卡牌互换。',
      } as any;
      patch.heroSkillBanner = '选择地城行一张卡牌，与正上方预览行卡牌互换。';
      return applyPatch(state, patch, sideEffects);
    }

    case '哥布林的戏法': {
      // Curses cannot leave hand via forced shuffle effects.
      const otherHandCards = state.handCards.filter(c => c.id !== card.id && c.type !== 'curse');
      const count = otherHandCards.length;
      if (count === 0) {
        banner(sideEffects, '手中没有其他牌可以刷新。');
        patch.lastPlayedCardCategory = getCardPlayCategory(card);
        enqueuedActions.push({ type: 'FINALIZE_MAGIC_CARD', card, dealtDamage: false });
        return applyPatch(state, patch, sideEffects, enqueuedActions);
      }
      let newBackpack = [...state.backpackItems, ...otherHandCards];
      const movedIds = new Set(otherHandCards.map(c => c.id));
      patch.handCards = state.handCards.filter(c => !movedIds.has(c.id));
      let rng = state.rng;
      const drawn: GameCardData[] = [];
      for (let i = 0; i < count; i++) {
        if (newBackpack.length === 0) break;
        let idx: number;
        [idx, rng] = nextInt(rng, 0, newBackpack.length - 1);
        drawn.push(newBackpack[idx]);
        newBackpack = newBackpack.filter((_, j) => j !== idx);
      }
      patch.rng = rng;
      patch.backpackItems = newBackpack;
      if (drawn.length > 0) {
        patch.handCards = [...(patch.handCards as GameCardData[]), ...drawn];
      }
      log(sideEffects, 'magic', `哥布林的戏法：${count} 张手牌洗入背包，抽了 ${drawn.length} 张新牌。`);
      banner(sideEffects, `哥布林的戏法：刷新了 ${count} 张手牌！`);
      patch.lastPlayedCardCategory = getCardPlayCategory(card);
      enqueuedActions.push({ type: 'FINALIZE_MAGIC_CARD', card, dealtDamage: false });
      return applyPatch(state, patch, sideEffects, enqueuedActions);
    }
  }

  // --- scalingDamage cards ---
  if (card.scalingDamage != null) {
    return resolveScalingDamage(state, card, sideEffects, patch, enqueuedActions, echoMultiplier, isEchoTriggered);
  }

  // --- crypt-deathwish ---
  if (effect === 'crypt-deathwish') {
    const slots = getEquippedSlots(state);
    if (slots.length === 0) {
      banner(sideEffects, '墓语遗愿无效（没有已装备的装备）。');
      patch.lastPlayedCardCategory = getCardPlayCategory(card);
      enqueuedActions.push({ type: 'FINALIZE_MAGIC_CARD', card, dealtDamage: false });
      return applyPatch(state, patch, sideEffects, enqueuedActions);
    }
    if (slots.length === 1) {
      return applyCryptDeathwish(state, card, slots[0].id, sideEffects, patch, enqueuedActions);
    }
    patch.pendingMagicAction = {
      card,
      effect: 'crypt-deathwish',
      step: 'slot-select',
      prompt: '选择一个装备，触发其遗言效果 2 次',
    } as any;
    patch.heroSkillBanner = '墓语遗愿：选择一个装备触发遗言 2 次。';
    sideEffects.push({ event: 'card:cryptDeathwishSelect' as any, payload: { card } });
    return applyPatch(state, patch, sideEffects);
  }

  // --- 墓语回响: heal on play, onDiscardDraw handles discard ---
  if (card.name === '墓语回响') {
    const healAmt = 3;
    enqueuedActions.push({ type: 'HEAL', amount: healAmt, source: 'crypt-echo' });
    log(sideEffects, 'magic', `墓语回响：回复 ${healAmt} 点生命`);
    banner(sideEffects, `墓语回响：回复 ${healAmt} 点生命！`);
    patch.lastPlayedCardCategory = getCardPlayCategory(card);
    enqueuedActions.push({ type: 'FINALIZE_MAGIC_CARD', card, dealtDamage: false });
    return applyPatch(state, patch, sideEffects, enqueuedActions);
  }

  // --- 回响残页: no play effect, only discard effect (onDiscardDraw) ---
  if (card.name === '回响残页') {
    banner(sideEffects, '回响残页：无释放效果，被弃置时从背包抽牌。');
    patch.lastPlayedCardCategory = getCardPlayCategory(card);
    enqueuedActions.push({ type: 'FINALIZE_MAGIC_CARD', card, dealtDamage: false });
    return applyPatch(state, patch, sideEffects, enqueuedActions);
  }

  // --- Fallback: generic permanent magic ---
  banner(sideEffects, card.magicEffect || '永久魔法生效。');
  patch.lastPlayedCardCategory = getCardPlayCategory(card);
  enqueuedActions.push({ type: 'FINALIZE_MAGIC_CARD', card, dealtDamage: false });
  return applyPatch(state, patch, sideEffects, enqueuedActions);
}

// ---------------------------------------------------------------------------
// Knight Instant Magic
// ---------------------------------------------------------------------------

export function resolveKnightInstantMagic(
  state: GameState,
  card: GameCardData,
  sideEffects: SideEffect[],
  patch: Partial<GameState>,
  enqueuedActions: GameAction[],
  echoMultiplier: number,
  isEchoTriggered: boolean,
): ReduceResult | null {
  const knightEffect = (card as any).knightEffect as string | undefined;
  if (!knightEffect) return null;

  switch (knightEffect) {
    case 'blood-greed': {
      const maxHp = computeMaxHp(state);
      const goldEarned = Math.max(0, maxHp - state.hp);
      if (goldEarned > 0) {
        enqueuedActions.push({ type: 'MODIFY_GOLD', delta: goldEarned, source: 'blood-greed-card' });
      }
      let rng = patch.rng ?? state.rng;
      const [rawCurse, nextRng] = createGreedCurseCard(rng);
      patch.rng = nextRng;
      const curseCard = applyAmplifyOnCreate(rawCurse as GameCardData, state.amplifiedCardBonus);
      mergePatch(patch, addCardToBackpackPure({ ...state, ...patch } as GameState, curseCard));

      const canOpenShop = (card.upgradeLevel ?? 0) >= 1;
      let shopOpened = false;
      if (canOpenShop) {
        sideEffects.push({ event: 'card:bloodGreedShop' as any, payload: { card } });
        shopOpened = true;
      }

      const baseBanner = goldEarned > 0
        ? `嗜血贪欲让你获得 ${goldEarned} 金币（已损失生命），并将"贪婪"塞入背包。`
        : '当前满血，贪欲只留下"贪婪"。';
      banner(sideEffects, shopOpened ? `${baseBanner}商店已开启！` : baseBanner);
      patch.lastPlayedCardCategory = getCardPlayCategory(card);
      enqueuedActions.push({ type: 'FINALIZE_MAGIC_CARD', card, dealtDamage: false });
      return applyPatch(state, patch, sideEffects, enqueuedActions);
    }

    case 'berserk-gambit': {
      const hpLoss = Math.max(0, state.hp - 1);
      if (hpLoss > 0) {
        enqueuedActions.push({ type: 'APPLY_DAMAGE', amount: hpLoss, source: 'berserk-gambit', selfInflicted: true });
      }
      const lvl = card.upgradeLevel ?? 0;
      const buffAmounts = [0, 4, 8, 8];
      const extraPerSlot = lvl >= 3 ? 2 : 1;
      const buffAmt = buffAmounts[lvl] ?? 8;
      if (buffAmt > 0) {
        enqueuedActions.push({ type: 'ADD_BERSERK_BUFF', amount: buffAmt });
      }
      enqueuedActions.push({ type: 'SET_COMBAT_FLAG', flag: 'gambitExtraActive', value: true });
      enqueuedActions.push({ type: 'SET_GAMBIT_STATE', extraPerSlot });
      const parts: string[] = [];
      if (buffAmt > 0) parts.push(`本回合装备 +${buffAmt} 伤害`);
      parts.push(extraPerSlot > 1 ? `每个武器栏可多攻击 ${extraPerSlot} 次` : '每个武器栏可多攻击一次');
      banner(sideEffects, `狂血豪赌发动：${parts.join('，')}。`);
      patch.lastPlayedCardCategory = getCardPlayCategory(card);
      enqueuedActions.push({ type: 'FINALIZE_MAGIC_CARD', card, dealtDamage: false });
      return applyPatch(state, patch, sideEffects, enqueuedActions);
    }

    case 'persuade-discount': {
      const costDiscount = 2 * ((card.upgradeLevel ?? 0) + 1);
      const rateBonus = 10 * ((card.upgradeLevel ?? 0) + 1);
      const currentMod = state.persuadeCostModifier ?? 0;
      const currentCost = PERSUADE_COST + currentMod;
      let actualDiscount = 0;
      if (currentCost > MIN_PERSUADE_COST) {
        actualDiscount = Math.min(costDiscount, currentCost - MIN_PERSUADE_COST);
        patch.persuadeCostModifier = currentMod - actualDiscount;
      }
      patch.persuadeDiscount = { costReduction: 0, rateBonus };
      const costMsg = actualDiscount > 0 ? `劝降费用永久 -${actualDiscount}` : '劝降费用已达下限';
      banner(sideEffects, `怀柔令发动：${costMsg}，下次劝降成功率 +${rateBonus}%！`);
      patch.lastPlayedCardCategory = getCardPlayCategory(card);
      enqueuedActions.push({ type: 'FINALIZE_MAGIC_CARD', card, dealtDamage: false });
      return applyPatch(state, patch, sideEffects, enqueuedActions);
    }

    case 'recycle-random-to-hand': {
      const availableBag = state.permanentMagicRecycleBag.filter(c => c.id !== card.id);
      if (availableBag.length === 0) {
        banner(sideEffects, '归袋抽引：回收袋为空。');
        patch.lastPlayedCardCategory = getCardPlayCategory(card);
        enqueuedActions.push({ type: 'FINALIZE_MAGIC_CARD', card, dealtDamage: false });
        return applyPatch(state, patch, sideEffects, enqueuedActions);
      }
      let rng = state.rng;
      let pick: GameCardData;
      [pick, rng] = pickRandom(availableBag, rng);
      patch.rng = rng;
      patch.permanentMagicRecycleBag = state.permanentMagicRecycleBag.filter(c => c.id !== pick.id);
      patch.handCards = [...state.handCards, pick];
      log(sideEffects, 'deck', `归袋抽引：从回收袋抽取「${pick.name}」。`);
      banner(sideEffects, `归袋抽引：从回收袋抽取「${pick.name}」！`);
      patch.lastPlayedCardCategory = getCardPlayCategory(card);
      enqueuedActions.push({ type: 'FINALIZE_MAGIC_CARD', card, dealtDamage: false });
      return applyPatch(state, patch, sideEffects, enqueuedActions);
    }

    case 'amulet-expand': {
      patch.maxAmuletSlots = (state.maxAmuletSlots ?? 2) + 1;
      const newMax = patch.maxAmuletSlots;
      log(sideEffects, 'magic', `符位开辟：护符栏上限 +1（当前上限 ${newMax}）`);
      banner(sideEffects, `护符栏上限提升至 ${newMax}！`);
      patch.lastPlayedCardCategory = getCardPlayCategory(card);
      enqueuedActions.push({ type: 'FINALIZE_MAGIC_CARD', card, dealtDamage: false });
      return applyPatch(state, patch, sideEffects, enqueuedActions);
    }

    case 'grave-nova': {
      // Effect triggers on discard, just finalize
      patch.lastPlayedCardCategory = getCardPlayCategory(card);
      enqueuedActions.push({ type: 'FINALIZE_MAGIC_CARD', card, dealtDamage: false });
      return applyPatch(state, patch, sideEffects, enqueuedActions);
    }

    case 'missile-bolt': {
      const monsters = flattenActiveRowSlots(state.activeCards).filter(isDamageableTarget);
      if (monsters.length === 0) {
        banner(sideEffects, '魔弹无效（没有怪物）。');
        patch.lastPlayedCardCategory = getCardPlayCategory(card);
        enqueuedActions.push({ type: 'FINALIZE_MAGIC_CARD', card, dealtDamage: false });
        return applyPatch(state, patch, sideEffects, enqueuedActions);
      }
      const boltDmg = getSpellDamage(1 + (card.amplifyBonus ?? 0), state);
      if (monsters.length === 1) {
        const target = monsters[0];
        enqueuedActions.push({ type: 'DEAL_DAMAGE_TO_MONSTER', monsterId: target.id, damage: boltDmg, source: 'missile-bolt', isSpellDamage: true });
        log(sideEffects, 'magic', `魔弹：对 ${target.name} 造成 ${boltDmg} 点法术伤害`);
        banner(sideEffects, `魔弹：对 ${target.name} 造成 ${boltDmg} 点伤害！`);
        applyMissileRelicEffects(state, patch, sideEffects, enqueuedActions, target);
        patch.lastPlayedCardCategory = getCardPlayCategory(card);
        enqueuedActions.push({ type: 'FINALIZE_MAGIC_CARD', card, dealtDamage: true });
        return applyPatch(state, patch, sideEffects, enqueuedActions);
      }
      patch.pendingMagicAction = {
        card,
        effect: 'missile-bolt',
        step: 'monster-select',
        prompt: `选择一个怪物，造成 ${boltDmg} 点法术伤害。`,
      } as any;
      patch.heroSkillBanner = `选择一个怪物，造成 ${boltDmg} 点法术伤害。`;
      return applyPatch(state, patch, sideEffects);
    }

    case 'death-ward': {
      patch.heroSkillBanner = '命悬一线会在你受到致死伤害时自动触发，无需主动打出。';
      return applyPatch(state, patch, sideEffects);
    }

    case 'fortune-wheel': {
      patch.pendingMagicAction = {
        card,
        effect: 'fortune-wheel',
        step: 'dice',
      } as any;
      let fwRoll: number;
      let fwRng: RngState;
      [fwRoll, fwRng] = nextInt(patch.rng ?? state.rng, 1, 20);
      patch.rng = fwRng;
      sideEffects.push({
        event: 'ui:requestDice' as any,
        payload: {
          title: '际遇轮盘',
          subtitle: '命运转动——掷出你的机遇',
          entries: [
            { id: 'fw-discover', range: [1, 5], label: '发现一张专属魔法卡（三选一）', effect: 'none' },
            { id: 'fw-draw', range: [6, 10], label: '从背包抽 2 张牌', effect: 'none' },
            { id: 'fw-delete', range: [11, 15], label: '删除 1 张牌', effect: 'none' },
            { id: 'fw-persuade', range: [16, 20], label: '下次劝降概率 +20%', effect: 'none' },
          ],
          flowContext: { flowId: 'fortune-wheel', cardId: card.id },
          predeterminedRoll: fwRoll,
        },
      });
      return applyPatch(state, patch, sideEffects);
    }

    case 'chaos-dice': {
      patch.pendingMagicAction = {
        card,
        effect: 'chaos-dice',
        step: 'dice',
      } as any;
      let chaosRoll: number;
      let chaosRng: RngState;
      [chaosRoll, chaosRng] = nextInt(patch.rng ?? state.rng, 1, 20);
      patch.rng = chaosRng;
      sideEffects.push({
        event: 'ui:requestDice' as any,
        payload: {
          title: '混沌骰运',
          subtitle: '掷出混沌之力',
          entries: [
            { id: 'chaos-1', range: [1, 4], label: '装备回手（满则回收袋）', effect: 'none' },
            { id: 'chaos-2', range: [5, 8], label: '发现 1 张专属（三选一）', effect: 'none' },
            { id: 'chaos-3', range: [9, 12], label: '临时混沌商店', effect: 'none' },
            { id: 'chaos-4', range: [13, 16], label: '雷击：随机 1 怪，基础伤 3（双段）', effect: 'none' },
            { id: 'chaos-5', range: [17, 20], label: '弃回 2 抽 2', effect: 'none' },
          ],
          flowContext: { flowId: 'chaos-dice', cardId: card.id },
          predeterminedRoll: chaosRoll,
        },
      });
      return applyPatch(state, patch, sideEffects);
    }

    case 'graveyard-recall': {
      const recallCounts = [3, 4, 5, 6];
      const maxRecall = recallCounts[card.upgradeLevel ?? 0] ?? 6;
      const eligible = (state.discardedCards ?? []).filter((c: GameCardData) => c.id !== card.id);
      let rng = patch.rng ?? state.rng;
      let shuffled: GameCardData[];
      [shuffled, rng] = rngShuffle(eligible, rng);
      patch.rng = rng;
      const recalled = shuffled.slice(0, Math.min(maxRecall, shuffled.length));
      const recalledIds = new Set(recalled.map(c => c.id));
      patch.discardedCards = (state.discardedCards ?? []).filter((c: GameCardData) => !recalledIds.has(c.id));
      let patchedState = { ...state, ...patch } as GameState;
      for (const rc of recalled) {
        mergePatch(patch, addCardToBackpackPure(patchedState, rc));
        patchedState = { ...patchedState, ...patch } as GameState;
      }
      const recallBanner = recalled.length > 0
        ? `冥途拾遗从坟场召回了 ${recalled.length} 张牌：${recalled.map(c => c.name).join('、')}`
        : '坟场中没有可召回的卡牌。';
      log(sideEffects, 'magic', `魔法：${card.name} — ${recallBanner}`);
      banner(sideEffects, recallBanner);
      if (recalled.length > 0) {
        sideEffects.push({ event: 'card:graveyardRecalled' as any, payload: { cards: recalled } });
      }
      patch.lastPlayedCardCategory = getCardPlayCategory(card);
      enqueuedActions.push({ type: 'FINALIZE_MAGIC_CARD', card, dealtDamage: false });
      return applyPatch(state, patch, sideEffects, enqueuedActions);
    }

    case 'monster-fusion':
      return resolveMonsterFusion(state, card, sideEffects, patch, enqueuedActions);

    case 'transform-grant':
      return resolveTransformGrant(state, card, sideEffects, patch, enqueuedActions);

    case 'stun-wave':
      return resolveStunWave(state, card, sideEffects, patch, enqueuedActions);

    case 'graveyard-discover-equip-amulet':
      return resolveGraveyardDiscoverEquipAmulet(state, card, sideEffects, patch, enqueuedActions);

    case 'monster-recruit':
      return resolveMonsterRecruit(state, card, sideEffects, patch, enqueuedActions);

    // Modal-dependent effects — emit specific events for UI
    case 'mirror-copy': {
      const hasEquip = Boolean(state.equipmentSlot1) || Boolean(state.equipmentSlot2);
      const hasAmulets = (state.amuletSlots ?? []).length > 0;
      const hasHand = state.handCards.length > 0;
      if (!hasEquip && !hasAmulets && !hasHand) {
        banner(sideEffects, '镜影摹形：没有可选的牌（装备栏、护符栏与手牌皆空）。');
        patch.lastPlayedCardCategory = getCardPlayCategory(card);
        enqueuedActions.push({ type: 'FINALIZE_MAGIC_CARD', card, dealtDamage: false });
        return applyPatch(state, patch, sideEffects, enqueuedActions);
      }
      sideEffects.push({ event: 'card:mirrorCopyRequested' as any, payload: { card } });
      return applyPatch(state, patch, sideEffects);
    }

    case 'deck-judge-delete': {
      sideEffects.push({ event: 'card:deckJudgeRequested' as any, payload: { card } });
      return applyPatch(state, patch, sideEffects);
    }

    default:
      return null;
  }
}

// ---------------------------------------------------------------------------
// Knight Permanent Magic
// ---------------------------------------------------------------------------

/**
 * 盾影双噬 (`armor-double-strike`) shared executor.
 *
 * Picks up to 2 random monsters from the active row and deals each a spell hit
 * worth `armorPct%` of the chosen shield's armor value, then consumes 1
 * durability from that shield (going through the standard equipment break flow
 * — last-words / revive / salvage — when the shield was at its last point).
 *
 * Called from two places:
 *   1. The initial `resolveKnightPermanentMagic` dispatch when only a single
 *      shield slot is equipped (auto-pick, mirroring `armor-strike`).
 *   2. `reduceMagicSlotSelection` after the player picks a shield via the
 *      slot-select prompt.
 */
export function executeArmorDoubleStrike(
  state: GameState,
  card: GameCardData,
  slotId: EquipmentSlotId,
  sideEffects: SideEffect[],
  patch: Partial<GameState>,
  enqueuedActions: GameAction[],
): ReduceResult {
  const slotItem = (slotId === 'equipmentSlot1' ? state.equipmentSlot1 : state.equipmentSlot2) as GameCardData | null;
  if (!slotItem || (slotItem.type !== 'shield' && slotItem.type !== 'monster')) {
    banner(sideEffects, '请选择一面护盾。');
    patch.lastPlayedCardCategory = getCardPlayCategory(card);
    enqueuedActions.push({ type: 'FINALIZE_MAGIC_CARD', card, dealtDamage: false });
    return applyPatch(state, patch, sideEffects, enqueuedActions);
  }

  // Damage = armorPct% of the slot's full armor value (base + permanent + temp).
  const armorPcts = [50, 75];
  const armorPct = armorPcts[card.upgradeLevel ?? 0] ?? 75;
  const rawArmor = computeSlotArmorValuePure(state, slotId);
  const scaledArmor = Math.floor(rawArmor * armorPct / 100);
  const ampBonus = card.amplifyBonus ?? 0;
  const perTargetDamage = getSpellDamage(scaledArmor + ampBonus, state);

  // Pick up to 2 random monsters; if only 1 exists, hit it once (no doubling).
  const monsters = flattenActiveRowSlots(state.activeCards as ActiveRowSlots).filter(isDamageableTarget);
  let dealtDamage = false;
  if (monsters.length > 0 && perTargetDamage > 0) {
    let rng = state.rng;
    const [shuffled, rng2] = rngShuffle(monsters, rng);
    rng = rng2;
    const targets = shuffled.slice(0, 2);
    patch.rng = rng;
    for (const target of targets) {
      ensureEngagedLocal(state, target, enqueuedActions);
      enqueuedActions.push({
        type: 'DEAL_DAMAGE_TO_MONSTER',
        monsterId: target.id,
        damage: perTargetDamage,
        source: 'armor-double-strike',
        isSpellDamage: true,
      });
    }
    dealtDamage = true;
    log(sideEffects, 'magic',
      `盾影双噬：${slotItem.name} 护甲 ${rawArmor} → 伤害 ${perTargetDamage}（${armorPct}%），命中 ${targets.length} 个怪物。`);
  } else if (monsters.length === 0) {
    log(sideEffects, 'magic', `盾影双噬：激活行没有怪物，未造成伤害。`);
  } else {
    log(sideEffects, 'magic', `盾影双噬：${slotItem.name} 当前没有可用护甲。`);
  }

  // Consume 1 durability from the chosen shield. If it would drop to 0, run the
  // full equipment break flow (last words / revive / salvage / promote reserve).
  const curDur = slotItem.durability ?? 1;
  if (curDur <= 1) {
    const ae = computeAmuletEffects(state.amuletSlots as GameCardData[]) ?? createEmptyAmuletEffects();
    const breakResult = computeEquipmentBreakEffects(state, slotId, slotItem, ae);
    Object.assign(patch, breakResult.patch);
    sideEffects.push(...breakResult.sideEffects);
    enqueuedActions.push(...breakResult.enqueuedActions);
    if (breakResult.drawFromBackpack > 0) {
      sideEffects.push({ event: 'equipment:drawFromBackpack', payload: { count: breakResult.drawFromBackpack } });
    }
    if (breakResult.classCardDraw > 0) {
      sideEffects.push({ event: 'equipment:classCardDraw', payload: { count: breakResult.classCardDraw } });
    }
    // computeEquipmentBreakEffects already advances rng internally via patch.rng
  } else {
    patch[slotId] = { ...slotItem, durability: curDur - 1 } as EquipmentItem;
    log(sideEffects, 'equip', `盾影双噬：${slotItem.name} 耐久 -1（${curDur} → ${curDur - 1}）。`);
  }

  patch.pendingMagicAction = null;
  patch.heroSkillBanner = monsters.length > 0 && perTargetDamage > 0
    ? `盾影双噬：每目标 ${perTargetDamage} 伤害，护盾耐久 -1。`
    : `盾影双噬：护盾耐久 -1。`;
  patch.lastPlayedCardCategory = getCardPlayCategory(card);
  enqueuedActions.push({ type: 'FINALIZE_MAGIC_CARD', card, dealtDamage });
  return applyPatch(state, patch, sideEffects, enqueuedActions);
}

function ensureEngagedLocal(state: GameState, monster: GameCardData, enqueuedActions: GameAction[]): void {
  if (!(state.combatState?.engagedMonsterIds ?? []).includes(monster.id)) {
    enqueuedActions.push({ type: 'BEGIN_COMBAT', monster, initiator: 'hero' });
  }
}

export function resolveKnightPermanentMagic(
  state: GameState,
  card: GameCardData,
  sideEffects: SideEffect[],
  patch: Partial<GameState>,
  enqueuedActions: GameAction[],
  echoMultiplier: number,
  isEchoTriggered: boolean,
  /** 不使用，仅为匹配 `MagicResolver` 签名（target 占位） */
  _target?: string,
  isFlank?: boolean,
): ReduceResult | null {
  const knightEffect = (card as any).knightEffect as string | undefined;
  if (!knightEffect) return null;

  switch (knightEffect) {
    case 'armor-strike': {
      const shieldSlots = getEquippedSlots(state).filter(s =>
        s.item.type === 'shield' || s.item.type === 'monster',
      );
      if (shieldSlots.length === 0) {
        banner(sideEffects, '没有可转化为伤害的护甲。');
        patch.lastPlayedCardCategory = getCardPlayCategory(card);
        enqueuedActions.push({ type: 'FINALIZE_MAGIC_CARD', card, dealtDamage: false });
        return applyPatch(state, patch, sideEffects, enqueuedActions);
      }
      if (shieldSlots.length === 1) {
        const slotId = shieldSlots[0].id;
        const monsters = flattenActiveRowSlots(state.activeCards).filter(isDamageableTarget);
        if (monsters.length === 0) {
          banner(sideEffects, '没有怪物可攻击。');
          patch.lastPlayedCardCategory = getCardPlayCategory(card);
          enqueuedActions.push({ type: 'FINALIZE_MAGIC_CARD', card, dealtDamage: false });
          return applyPatch(state, patch, sideEffects, enqueuedActions);
        }
        // Auto-pick single slot, then check if single or multi monster
        if (monsters.length === 1) {
          const armorPcts = [100, 150];
          const armorPct = armorPcts[card.upgradeLevel ?? 0] ?? 150;
          const rawArmor = computeSlotArmorValuePure(state, slotId);
          const scaledArmor = Math.floor(rawArmor * armorPct / 100);
          const totalDamage = getSpellDamage(scaledArmor + (card.amplifyBonus ?? 0), state);
          enqueuedActions.push({ type: 'DEAL_DAMAGE_TO_MONSTER', monsterId: monsters[0].id, damage: totalDamage, source: 'armor-strike', isSpellDamage: true });
          banner(sideEffects, `御甲破击造成 ${totalDamage} 点伤害（护甲 ${armorPct}%）。`);
          patch.lastPlayedCardCategory = getCardPlayCategory(card);
          enqueuedActions.push({ type: 'FINALIZE_MAGIC_CARD', card, dealtDamage: true });
          return applyPatch(state, patch, sideEffects, enqueuedActions);
        }
        const armorPcts = [100, 150];
        const armorPct = armorPcts[card.upgradeLevel ?? 0] ?? 150;
        const rawArmor = computeSlotArmorValuePure(state, slotId);
        const scaledArmor = Math.floor(rawArmor * armorPct / 100);
        patch.pendingMagicAction = {
          card,
          effect: 'armor-strike',
          step: 'monster-select',
          slotId,
          pendingDamage: scaledArmor,
          prompt: `选择一个怪物，承受 ${getSpellDamage(scaledArmor + (card.amplifyBonus ?? 0), state)} 点护甲伤害。`,
        } as any;
        patch.heroSkillBanner = '选择一个怪物承受你的护甲一击。';
        return applyPatch(state, patch, sideEffects);
      }
      patch.pendingMagicAction = {
        card,
        effect: 'armor-strike',
        step: 'slot-select',
        prompt: '选择一个盾牌槽，将其护甲值转化为伤害。',
      } as any;
      patch.heroSkillBanner = '选择一个盾牌，将护甲值转化为伤害。';
      return applyPatch(state, patch, sideEffects);
    }

    case 'armor-double-strike': {
      const shieldSlots = getEquippedSlots(state).filter(s =>
        s.item.type === 'shield' || s.item.type === 'monster',
      );
      if (shieldSlots.length === 0) {
        banner(sideEffects, '没有可用的护盾。');
        patch.lastPlayedCardCategory = getCardPlayCategory(card);
        enqueuedActions.push({ type: 'FINALIZE_MAGIC_CARD', card, dealtDamage: false });
        return applyPatch(state, patch, sideEffects, enqueuedActions);
      }
      // Auto-pick when only one shield is equipped (mirrors armor-strike).
      if (shieldSlots.length === 1) {
        return executeArmorDoubleStrike(state, card, shieldSlots[0].id, sideEffects, patch, enqueuedActions);
      }
      patch.pendingMagicAction = {
        card,
        effect: 'armor-double-strike',
        step: 'slot-select',
        prompt: '选择一面护盾，对随机 2 个怪物各造成 50% 护甲值伤害（耐久 -1）。',
      } as PendingMagicAction;
      patch.heroSkillBanner = '盾影双噬：选择一面护盾。';
      return applyPatch(state, patch, sideEffects);
    }

    case 'three-card-thunder': {
      // 三牌惊雷 (Perm 2): if backpack has exactly 3 cards, deal 9 spell damage
      // to every monster in the active row. Otherwise the card is consumed
      // (full-cost no-op) with no damage.
      const REQUIRED_BACKPACK_COUNT = 3;
      const PER_MONSTER_DAMAGE = 9;
      const backpackCount = (state.backpackItems ?? []).length;
      patch.lastPlayedCardCategory = getCardPlayCategory(card);

      if (backpackCount !== REQUIRED_BACKPACK_COUNT) {
        log(sideEffects, 'magic', `三牌惊雷：需要背包恰好 3 张牌（当前 ${backpackCount} 张），效果落空。`);
        banner(sideEffects, `三牌惊雷：背包必须恰好 3 张牌（当前 ${backpackCount}）。`);
        enqueuedActions.push({ type: 'FINALIZE_MAGIC_CARD', card, dealtDamage: false });
        return applyPatch(state, patch, sideEffects, enqueuedActions);
      }

      const monsters = flattenActiveRowSlots(state.activeCards as ActiveRowSlots).filter(isDamageableTarget);
      if (monsters.length === 0) {
        log(sideEffects, 'magic', '三牌惊雷：激活行没有怪物，效果落空。');
        banner(sideEffects, '三牌惊雷：激活行没有怪物。');
        enqueuedActions.push({ type: 'FINALIZE_MAGIC_CARD', card, dealtDamage: false });
        return applyPatch(state, patch, sideEffects, enqueuedActions);
      }

      const dmg = getSpellDamage(PER_MONSTER_DAMAGE + (card.amplifyBonus ?? 0), state);
      for (const target of monsters) {
        ensureEngagedLocal(state, target, enqueuedActions);
        enqueuedActions.push({
          type: 'DEAL_DAMAGE_TO_MONSTER',
          monsterId: target.id,
          damage: dmg,
          source: 'three-card-thunder',
          isSpellDamage: true,
        });
      }
      log(sideEffects, 'magic', `三牌惊雷：背包 3 张牌触发，对 ${monsters.length} 个怪物各造成 ${dmg} 点法术伤害。`);
      banner(sideEffects, `三牌惊雷：全场 ${dmg} 点法术伤害！`);
      enqueuedActions.push({ type: 'FINALIZE_MAGIC_CARD', card, dealtDamage: true });
      return applyPatch(state, patch, sideEffects, enqueuedActions);
    }

    case 'reorganize-backpack': {
      // 整顿背囊 (Perm 2): permanently +1 backpack capacity, then prompt the
      // player to pick up to 3 cards from hand / amulets / equipment slots and
      // push them onto the top of the backpack. Selection cap is further
      // bounded by the new backpack's free room (so we never overflow).
      const MAX_PICK_REQUESTED = 3;
      const newCapacityModifier = state.backpackCapacityModifier + 1;
      const newCapacity = Math.max(1, BASE_BACKPACK_CAPACITY + newCapacityModifier);
      const currentCount = (state.backpackItems ?? []).length;
      const room = Math.max(0, newCapacity - currentCount);
      const maxSelections = Math.min(MAX_PICK_REQUESTED, room);

      patch.backpackCapacityModifier = newCapacityModifier;
      log(sideEffects, 'magic', `整顿背囊：背包上限 +1（${BASE_BACKPACK_CAPACITY + state.backpackCapacityModifier} → ${newCapacity}）。`);

      if (maxSelections === 0) {
        // No room left even after the +1 — finalize immediately, skip selection.
        banner(sideEffects, '整顿背囊：背包上限 +1（已满，无放回机会）。');
        patch.lastPlayedCardCategory = getCardPlayCategory(card);
        enqueuedActions.push({ type: 'FINALIZE_MAGIC_CARD', card, dealtDamage: false });
        return applyPatch(state, patch, sideEffects, enqueuedActions);
      }

      patch.pendingMagicAction = {
        card,
        effect: 'reorganize-backpack',
        step: 'multi-select',
        maxSelections,
        prompt: `选择至多 ${maxSelections} 张牌（手牌 / 护符 / 装备）放回背包顶部。`,
      } as PendingMagicAction;
      patch.heroSkillBanner = `整顿背囊：选择至多 ${maxSelections} 张牌放回背包顶部。`;
      return applyPatch(state, patch, sideEffects);
    }

    case 'honor-sweep': {
      const equipSlots = getEquippedSlots(state);
      if (equipSlots.length === 0) {
        banner(sideEffects, '没有装备可选择。');
        patch.lastPlayedCardCategory = getCardPlayCategory(card);
        enqueuedActions.push({ type: 'FINALIZE_MAGIC_CARD', card, dealtDamage: false });
        return applyPatch(state, patch, sideEffects, enqueuedActions);
      }
      patch.pendingMagicAction = {
        card,
        effect: 'honor-sweep',
        step: 'slot-select',
        prompt: '选择一个装备栏进行荣誉横扫。',
      } as any;
      patch.heroSkillBanner = '荣誉横扫：选择一个装备栏。';
      return applyPatch(state, patch, sideEffects);
    }

    case 'weapon-sweep': {
      const weaponSlots = getEquippedSlots(state).filter(s =>
        s.item.type === 'weapon' || s.item.type === 'monster',
      );
      if (weaponSlots.length === 0) {
        banner(sideEffects, '没有武器可选择。');
        patch.lastPlayedCardCategory = getCardPlayCategory(card);
        enqueuedActions.push({ type: 'FINALIZE_MAGIC_CARD', card, dealtDamage: false });
        return applyPatch(state, patch, sideEffects, enqueuedActions);
      }
      patch.pendingMagicAction = {
        card,
        effect: 'weapon-sweep',
        step: 'slot-select',
        prompt: '选择一个武器栏进行武器横扫。',
      } as any;
      patch.heroSkillBanner = '武器横扫：选择一个武器栏。';
      return applyPatch(state, patch, sideEffects);
    }

    case 'missing-hp-smite': {
      const monsters = flattenActiveRowSlots(state.activeCards).filter(isDamageableTarget);
      if (monsters.length === 0) {
        banner(sideEffects, '没有怪物可攻击。');
        patch.lastPlayedCardCategory = getCardPlayCategory(card);
        enqueuedActions.push({ type: 'FINALIZE_MAGIC_CARD', card, dealtDamage: false });
        return applyPatch(state, patch, sideEffects, enqueuedActions);
      }
      const maxHp = computeMaxHp(state);
      const missingHp = Math.max(0, maxHp - state.hp);
      const totalDmg = getSpellDamage(missingHp + (card.amplifyBonus ?? 0), state);
      if (monsters.length === 1) {
        enqueuedActions.push({ type: 'DEAL_DAMAGE_TO_MONSTER', monsterId: monsters[0].id, damage: totalDmg, source: 'missing-hp-smite', isSpellDamage: true });
        banner(sideEffects, `血怒裁决：损失生命 ${missingHp} → ${totalDmg} 点伤害！`);
        patch.lastPlayedCardCategory = getCardPlayCategory(card);
        enqueuedActions.push({ type: 'FINALIZE_MAGIC_CARD', card, dealtDamage: true });
        return applyPatch(state, patch, sideEffects, enqueuedActions);
      }
      patch.pendingMagicAction = {
        card,
        effect: 'missing-hp-smite',
        step: 'monster-select',
        prompt: `选择一个怪物，造成 ${totalDmg} 点伤害（已损失生命 ${missingHp}）。`,
      } as any;
      patch.heroSkillBanner = `血怒裁决：选择目标怪物（伤害 ${totalDmg}）。`;
      return applyPatch(state, patch, sideEffects);
    }

    case 'blood-sacrifice-strike': {
      const hpCost = Math.floor(state.hp / 2);
      if (hpCost < 1) {
        banner(sideEffects, '生命值不足，无法使用血祭裁决。');
        return applyPatch(state, patch, sideEffects);
      }
      const monsters = flattenActiveRowSlots(state.activeCards).filter(isDamageableTarget);
      if (monsters.length === 0) {
        banner(sideEffects, '没有怪物可攻击。');
        patch.lastPlayedCardCategory = getCardPlayCategory(card);
        enqueuedActions.push({ type: 'FINALIZE_MAGIC_CARD', card, dealtDamage: false });
        return applyPatch(state, patch, sideEffects, enqueuedActions);
      }
      enqueuedActions.push({ type: 'APPLY_DAMAGE', amount: hpCost, source: 'blood-sacrifice', selfInflicted: true });
      const totalDmg = getSpellDamage(hpCost * 2 + (card.amplifyBonus ?? 0), state);
      if (monsters.length === 1) {
        enqueuedActions.push({ type: 'DEAL_DAMAGE_TO_MONSTER', monsterId: monsters[0].id, damage: totalDmg, source: 'blood-sacrifice', isSpellDamage: true });
        banner(sideEffects, `血祭裁决：失去 ${hpCost} HP，造成 ${totalDmg} 点伤害！`);
        patch.lastPlayedCardCategory = getCardPlayCategory(card);
        enqueuedActions.push({ type: 'FINALIZE_MAGIC_CARD', card, dealtDamage: true });
        return applyPatch(state, patch, sideEffects, enqueuedActions);
      }
      patch.pendingMagicAction = {
        card,
        effect: 'blood-sacrifice-strike',
        step: 'monster-select',
        pendingDamage: totalDmg,
        hpLost: hpCost,
        prompt: `选择一个怪物，造成 ${totalDmg} 点伤害。`,
      } as any;
      patch.heroSkillBanner = `血祭裁决：选择目标怪物（伤害 ${totalDmg}）。`;
      return applyPatch(state, patch, sideEffects);
    }

    case 'blood-draw': {
      enqueuedActions.push({ type: 'APPLY_DAMAGE', amount: 1 * echoMultiplier, source: 'blood-draw', selfInflicted: true });
      const bloodDrawCount = ([3, 4, 5][card.upgradeLevel ?? 0] ?? 5) * echoMultiplier;
      const drawState = { ...state, ...patch } as GameState;
      const drawResult = drawMultipleFromBackpack(drawState, bloodDrawCount);
      if (drawResult.cards.length > 0) {
        mergePatch(patch, drawResult.patch);
        for (const d of drawResult.cards) {
          sideEffects.push({ event: 'card:drawnToHand', payload: { cardId: d.id, source: 'backpack' } });
        }
      }
      const drawnMsg = drawResult.cards.length > 0
        ? `抽了 ${drawResult.cards.length} 张牌`
        : '背包为空';
      log(sideEffects, 'magic', `鲜血汲取：失去 ${1 * echoMultiplier} 生命，${drawnMsg}`);
      banner(sideEffects, `鲜血汲取：-${1 * echoMultiplier} 生命，${drawnMsg}。${isEchoTriggered ? '（回响×2）' : ''}`);
      patch.lastPlayedCardCategory = getCardPlayCategory(card);
      enqueuedActions.push({ type: 'FINALIZE_MAGIC_CARD', card, dealtDamage: false });
      return applyPatch(state, patch, sideEffects, enqueuedActions);
    }

    case 'flip-back-active': {
      // 血誓回卷：失去 3 HP，选择 active row 一张「已翻转」卡（带 _flipBackCard
      // 且不是当前可翻转源即 !flipTarget）将其翻回原始形态。
      // 即使没有合法目标也按用户要求 play_full_cost_noop：仍然消耗（自损 + 进墓地）。
      const hpCost = 3 * echoMultiplier;
      enqueuedActions.push({ type: 'APPLY_DAMAGE', amount: hpCost, source: 'flip-back-active', selfInflicted: true });

      const activeCards = state.activeCards as (GameCardData | null)[];
      const flippedTargets = activeCards.filter((c): c is GameCardData =>
        Boolean(c && c._flipBackCard && !c.flipTarget),
      );

      if (flippedTargets.length === 0) {
        log(sideEffects, 'magic', `血誓回卷：失去 ${hpCost} 生命，但当前行没有已翻转的卡牌可逆转。`);
        banner(sideEffects, `血誓回卷：失去 ${hpCost} 生命，无可逆转目标。${isEchoTriggered ? '（回响×2）' : ''}`);
        patch.lastPlayedCardCategory = getCardPlayCategory(card);
        enqueuedActions.push({ type: 'FINALIZE_MAGIC_CARD', card, dealtDamage: false });
        return applyPatch(state, patch, sideEffects, enqueuedActions);
      }

      if (flippedTargets.length === 1) {
        const target = flippedTargets[0];
        const idx = activeCards.findIndex(c => c?.id === target.id);
        const original = target._flipBackCard as GameCardData;
        const restored: GameCardData = { ...original };
        const newActive = [...activeCards] as typeof activeCards;
        newActive[idx] = restored;
        patch.activeCards = newActive as any;
        sideEffects.push({
          event: 'card:flippedInCell',
          payload: { cellIndex: idx, fromCard: target, toCard: restored, message: `${target.name} → ${restored.name}` },
        });
        log(sideEffects, 'magic', `血誓回卷：失去 ${hpCost} 生命，${target.name} 翻回 ${restored.name}。`);
        banner(sideEffects, `血誓回卷：${target.name} → ${restored.name}！${isEchoTriggered ? '（回响×2）' : ''}`);
        patch.lastPlayedCardCategory = getCardPlayCategory(card);
        enqueuedActions.push({ type: 'FINALIZE_MAGIC_CARD', card, dealtDamage: false });
        return applyPatch(state, patch, sideEffects, enqueuedActions);
      }

      patch.pendingMagicAction = {
        card,
        effect: 'flip-back-active',
        step: 'dungeon-select',
        prompt: '选择当前行一张已翻转的卡牌，将其翻回原始形态。',
      } as any;
      patch.heroSkillBanner = `血誓回卷：失去 ${hpCost} 生命，选择一张已翻转卡牌。`;
      return applyPatch(state, patch, sideEffects, enqueuedActions);
    }

    case 'recall-equipment': {
      const equippedSlots = getEquippedSlots(state);
      const amuletSlots = state.amuletSlots ?? [];
      const hasEquip = equippedSlots.length > 0;
      const hasAmulet = amuletSlots.length > 0;
      if (!hasEquip && !hasAmulet) {
        banner(sideEffects, '没有可回手的装备或护符。');
        return applyPatch(state, patch, sideEffects);
      }
      const hpCost = 2;
      enqueuedActions.push({ type: 'APPLY_DAMAGE', amount: hpCost, source: 'recall-equipment', selfInflicted: true });

      type RecallOption = { id: string; label: string; description: string; slotType: string };
      const options: RecallOption[] = [];
      if (state.equipmentSlot1) {
        const item = state.equipmentSlot1;
        const typeLabel = item.type === 'weapon' ? `${item.value}攻` : item.type === 'shield' ? `${item.value}防` : `${item.value}`;
        const durLabel = typeof item.durability === 'number' && typeof item.maxDurability === 'number' ? `，耐久 ${item.durability}/${item.maxDurability}` : '';
        options.push({ id: 'equipmentSlot1', label: `左装备栏 — ${item.name}`, description: `${typeLabel}${durLabel}`, slotType: 'equipment' });
      }
      if (state.equipmentSlot2) {
        const item = state.equipmentSlot2;
        const typeLabel = item.type === 'weapon' ? `${item.value}攻` : item.type === 'shield' ? `${item.value}防` : `${item.value}`;
        const durLabel = typeof item.durability === 'number' && typeof item.maxDurability === 'number' ? `，耐久 ${item.durability}/${item.maxDurability}` : '';
        options.push({ id: 'equipmentSlot2', label: `右装备栏 — ${item.name}`, description: `${typeLabel}${durLabel}`, slotType: 'equipment' });
      }
      if (amuletSlots.length > 0) {
        const topAmulet = amuletSlots[amuletSlots.length - 1] as GameCardData;
        options.push({ id: 'amulet', label: `护符栏 — ${topAmulet.name}`, description: '最上层护符', slotType: 'amulet' });
      }

      if (options.length === 1) {
        const chosen = options[0];
        if (chosen.slotType === 'equipment') {
          const slotId = chosen.id as 'equipmentSlot1' | 'equipmentSlot2';
          const slotItem = state[slotId];
          if (slotItem) {
            (patch as any)[slotId] = null;
            patch.handCards = [...state.handCards, sanitizeCardMetadata(slotItem as GameCardData)];
          }
        } else if (chosen.slotType === 'amulet') {
          const topAmulet = amuletSlots[amuletSlots.length - 1] as GameCardData;
          (patch as any).amuletSlots = amuletSlots.slice(0, -1);
          patch.handCards = [...state.handCards, sanitizeCardMetadata(topAmulet)];
        }
        enqueuedActions.push({ type: 'DRAW_FROM_BACKPACK', count: 1 } as GameAction);
        const itemName = options[0].label.split(' — ')[1] ?? '装备';
        banner(sideEffects, `紧急回收：失去 ${hpCost} HP，${itemName} 已回到手牌！`);
        log(sideEffects, 'magic', `紧急回收：失去 ${hpCost} HP，${itemName} 回到手牌`);
        patch.lastPlayedCardCategory = getCardPlayCategory(card);
        enqueuedActions.push({ type: 'FINALIZE_MAGIC_CARD', card, dealtDamage: false });
        return applyPatch(state, patch, sideEffects, enqueuedActions);
      }

      patch.pendingMagicAction = {
        card,
        effect: 'recall-equipment',
        step: 'slot-select',
        prompt: '选择一个位置，将装备/护符回收到手牌。',
        data: { options, hpCost },
      } as any;
      patch.heroSkillBanner = '紧急回收：选择一个位置回手。';
      sideEffects.push({
        event: 'card:recallEquipmentSelect' as any,
        payload: { card, options },
      });
      return applyPatch(state, patch, sideEffects, enqueuedActions);
    }

    case 'armor-stun-convert': {
      const shieldSlots = getEquippedSlots(state).filter(s =>
        s.item.type === 'shield' || s.item.type === 'monster',
      );
      if (shieldSlots.length === 0) {
        banner(sideEffects, '没有护盾可供选择。');
        patch.lastPlayedCardCategory = getCardPlayCategory(card);
        enqueuedActions.push({ type: 'FINALIZE_MAGIC_CARD', card, dealtDamage: false });
        return applyPatch(state, patch, sideEffects, enqueuedActions);
      }
      patch.pendingMagicAction = {
        card,
        effect: 'armor-stun-convert',
        step: 'slot-select',
        prompt: '选择一个护盾，将其护甲值转化为击晕上限。',
      } as any;
      patch.heroSkillBanner = '选择一个护盾，将护甲值转化为击晕上限。';
      return applyPatch(state, patch, sideEffects);
    }

    case 'stat-swap': {
      const monsters = flattenActiveRowSlots(state.activeCards).filter(isDamageableTarget);
      if (monsters.length === 0) {
        banner(sideEffects, '颠倒乾坤无效（没有怪物）。');
        patch.lastPlayedCardCategory = getCardPlayCategory(card);
        enqueuedActions.push({ type: 'FINALIZE_MAGIC_CARD', card, dealtDamage: false });
        return applyPatch(state, patch, sideEffects, enqueuedActions);
      }
      if (monsters.length === 1) {
        enqueuedActions.push({ type: 'RESOLVE_STAT_SWAP', card, targetMonsterId: monsters[0].id, isFlank: !!isFlank });
        return applyPatch(state, patch, sideEffects, enqueuedActions);
      }
      patch.pendingMagicAction = {
        card,
        effect: 'stat-swap',
        step: 'monster-select',
        isFlank: !!isFlank,
        prompt: '选择一个怪物，将其攻击和血量上限对换。',
      } as any;
      patch.heroSkillBanner = '颠倒乾坤：选择目标怪物。';
      return applyPatch(state, patch, sideEffects);
    }

    case 'temp-attack-strike': {
      const equipSlots = getEquippedSlots(state);
      if (equipSlots.length === 0) {
        banner(sideEffects, '没有装备可选择。');
        patch.lastPlayedCardCategory = getCardPlayCategory(card);
        enqueuedActions.push({ type: 'FINALIZE_MAGIC_CARD', card, dealtDamage: false });
        return applyPatch(state, patch, sideEffects, enqueuedActions);
      }
      patch.pendingMagicAction = {
        card,
        effect: 'temp-attack-strike',
        step: 'slot-select',
        isFlank: !!isFlank,
        prompt: '选择一个装备栏，将其临时攻击转化为伤害。',
      } as any;
      patch.heroSkillBanner = '锋刃侧击：选择一个装备栏。';
      return applyPatch(state, patch, sideEffects);
    }

    case 'flank-fortify': {
      const equipSlots = getEquippedSlots(state);
      if (equipSlots.length === 0) {
        banner(sideEffects, '没有装备可选择。');
        patch.lastPlayedCardCategory = getCardPlayCategory(card);
        enqueuedActions.push({ type: 'FINALIZE_MAGIC_CARD', card, dealtDamage: false });
        return applyPatch(state, patch, sideEffects, enqueuedActions);
      }
      patch.pendingMagicAction = {
        card,
        effect: 'flank-fortify',
        step: 'slot-select',
        isFlank: !!isFlank,
        prompt: '选择一个装备栏，赋予临时护甲。',
      } as any;
      patch.heroSkillBanner = '固壁侧守：选择一个装备栏。';
      return applyPatch(state, patch, sideEffects);
    }

    case 'transform-repair': {
      const equipSlots = getEquippedSlots(state);
      if (equipSlots.length === 0) {
        banner(sideEffects, '没有装备可选择。');
        patch.lastPlayedCardCategory = getCardPlayCategory(card);
        enqueuedActions.push({ type: 'FINALIZE_MAGIC_CARD', card, dealtDamage: false });
        return applyPatch(state, patch, sideEffects, enqueuedActions);
      }
      patch.pendingMagicAction = {
        card,
        effect: 'transform-repair',
        step: 'slot-select',
        prompt: '选择一个装备，恢复 1 耐久。',
      } as any;
      patch.heroSkillBanner = '蜕变修复：选择一个装备。';
      return applyPatch(state, patch, sideEffects);
    }

    case 'repair-enrage-dice': {
      const equipSlots = getEquippedSlots(state);
      if (equipSlots.length === 0) {
        banner(sideEffects, '没有装备可选择。');
        patch.lastPlayedCardCategory = getCardPlayCategory(card);
        enqueuedActions.push({ type: 'FINALIZE_MAGIC_CARD', card, dealtDamage: false });
        return applyPatch(state, patch, sideEffects, enqueuedActions);
      }
      patch.pendingMagicAction = {
        card,
        effect: 'repair-enrage-dice',
        step: 'slot-select',
        prompt: '选择一个装备栏。',
      } as any;
      patch.heroSkillBanner = '锻造赌运：选择一个装备栏。';
      return applyPatch(state, patch, sideEffects);
    }

    case 'essence-extract': {
      const eligibleHand = state.handCards.filter(c => c.id !== card.id);
      if (eligibleHand.length === 0) {
        banner(sideEffects, '手牌中没有可移除的卡牌。');
        patch.lastPlayedCardCategory = getCardPlayCategory(card);
        enqueuedActions.push({ type: 'FINALIZE_MAGIC_CARD', card, dealtDamage: false });
        return applyPatch(state, patch, sideEffects, enqueuedActions);
      }
      patch.permGrantModal = { sourceCardId: card.id, sourceType: 'essence-extract' as const };
      patch.pendingMagicAction = { card, effect: 'essence-extract', step: 'perm-grant-select' } as any;
      patch.heroSkillBanner = '精华萃取：选择一张手牌移除。';
      return applyPatch(state, patch, sideEffects);
    }

    case 'recycle-flare': {
      const drawCounts = [2, 3, 4];
      const drawCount = drawCounts[card.upgradeLevel ?? 0] ?? 2;
      const recycled = state.permanentMagicRecycleBag;
      if (recycled.length > 0) {
        const recycleResult = processRecycleBag({ ...state, ...patch } as GameState);
        mergePatch(patch, recycleResult.patch);
        log(sideEffects, 'magic', `回收灵焰：${recycleResult.restored.length} 张牌洗回背包`);
      } else {
        log(sideEffects, 'magic', '回收灵焰：回收袋为空');
      }
      const drawState = { ...state, ...patch } as GameState;
      const drawResult = drawMultipleFromBackpack(drawState, drawCount);
      if (drawResult.cards.length > 0) {
        mergePatch(patch, drawResult.patch);
        for (const d of drawResult.cards) {
          sideEffects.push({ event: 'card:drawnToHand', payload: { cardId: d.id, source: 'backpack' } });
        }
      }
      const recycleMsg = recycled.length > 0 ? '回收袋洗回背包，' : '';
      const drawMsg = drawResult.cards.length > 0
        ? `抽了 ${drawResult.cards.length} 张牌`
        : '背包为空';
      banner(sideEffects, `回收灵焰：${recycleMsg}${drawMsg}！`);
      patch.lastPlayedCardCategory = getCardPlayCategory(card);
      enqueuedActions.push({ type: 'FINALIZE_MAGIC_CARD', card, dealtDamage: false });
      return applyPatch(state, patch, sideEffects, enqueuedActions);
    }

    // 弃装重铸 (Perm 2): destroy all equipment; for each piece destroyed
    // (revival does NOT count as destroyed) push one class-deck discover onto
    // the queue so the player gets one popup per destroyed equipment, in
    // sequence. Last-words and revive trigger normally via
    // computeEquipmentBreakEffects, mirroring monster-doom's destruction loop.
    case 'discard-rebuild': {
      type SlotEntry = { id: EquipmentSlotId; item: GameCardData };
      const slotsToDestroy: SlotEntry[] = [];
      for (const sid of ['equipmentSlot1', 'equipmentSlot2'] as EquipmentSlotId[]) {
        const item = sid === 'equipmentSlot1' ? state.equipmentSlot1 : state.equipmentSlot2;
        if (item) slotsToDestroy.push({ id: sid, item });
      }

      const survivedSlots: Record<EquipmentSlotId, EquipmentItem | null> = {
        equipmentSlot1: null,
        equipmentSlot2: null,
      };
      let destroyedCount = 0;

      const amuletEffects = computeAmuletEffects(state.amuletSlots as GameCardData[]) ?? createEmptyAmuletEffects();

      for (const { id: sid, item } of slotsToDestroy) {
        const isMonsterEquip = item.type === 'monster';
        const nativeRevive = isMonsterEquip && item.hasRevive && !item.reviveUsed;
        const equipRevive = item.hasEquipmentRevive && !item.equipmentReviveUsed;

        if (nativeRevive || equipRevive) {
          const revived = nativeRevive
            ? { ...item, durability: 1, reviveUsed: true }
            : { ...item, durability: 1, equipmentReviveUsed: true };
          survivedSlots[sid] = revived as EquipmentItem;
          sideEffects.push({
            event: 'log:entry',
            payload: { type: 'equip', message: `${item.name} 复生！以 1 耐久复活！` },
          });
        } else {
          const breakResult = computeEquipmentBreakEffects(state, sid, item, amuletEffects);
          sideEffects.push(...breakResult.sideEffects);
          Object.assign(patch, breakResult.patch);
          patch.rng = breakResult.rng;
          if (breakResult.drawFromBackpack > 0) {
            enqueuedActions.push({ type: 'DRAW_FROM_BACKPACK', count: breakResult.drawFromBackpack });
          }
          if (breakResult.classCardDraw > 0) {
            sideEffects.push({
              event: 'equipment:classCardDraw',
              payload: { count: breakResult.classCardDraw, source: item.name },
            });
          }
          enqueuedActions.push({ type: 'ADD_TO_GRAVEYARD', card: item });
          destroyedCount++;
        }
      }

      patch.equipmentSlot1 = survivedSlots.equipmentSlot1;
      patch.equipmentSlot2 = survivedSlots.equipmentSlot2;

      if (destroyedCount > 0) {
        log(
          sideEffects,
          'magic',
          `${card.name}：摧毁 ${destroyedCount} 件装备，将发现 ${destroyedCount} 张专属牌！`,
        );
        banner(
          sideEffects,
          `${card.name}：摧毁 ${destroyedCount} 件装备，发现 ${destroyedCount} 张专属牌…`,
        );

        // Trigger one discover immediately, queue the rest. Each modal close
        // will dequeue the next one via SET_DISCOVER_MODAL { open: false }.
        const classDeck = state.classDeck ?? [];
        if (classDeck.length > 0) {
          enqueuedActions.push({
            type: 'BEGIN_DISCOVER',
            source: 'discard-rebuild',
            pool: classDeck,
            sourceLabel: card.name,
          });
          if (destroyedCount > 1) {
            const remaining = destroyedCount - 1;
            const queueAddition = Array.from({ length: remaining }, () => ({
              source: 'discard-rebuild',
              sourceLabel: card.name,
            }));
            patch.pendingClassDiscoverQueue = [
              ...state.pendingClassDiscoverQueue,
              ...queueAddition,
            ];
          }
        } else {
          log(sideEffects, 'magic', `${card.name}：专属牌堆已空，无法发现。`);
        }
      } else {
        log(sideEffects, 'magic', `${card.name}：没有装备可摧毁。`);
        banner(sideEffects, `${card.name}：没有装备可摧毁。`);
      }

      patch.lastPlayedCardCategory = getCardPlayCategory(card);
      enqueuedActions.push({ type: 'FINALIZE_MAGIC_CARD', card, dealtDamage: false });
      return applyPatch(state, patch, sideEffects, enqueuedActions);
    }

    case 'fate-sight': {
      const monsters = flattenActiveRowSlots(state.activeCards).filter(isDamageableTarget);
      if (monsters.length === 0) {
        banner(sideEffects, '天眼审判无效（没有怪物）。');
        patch.lastPlayedCardCategory = getCardPlayCategory(card);
        enqueuedActions.push({ type: 'FINALIZE_MAGIC_CARD', card, dealtDamage: false });
        return applyPatch(state, patch, sideEffects, enqueuedActions);
      }
      if (monsters.length === 1) {
        patch.pendingMagicAction = {
          card,
          effect: 'fate-sight',
          step: 'monster-select',
          prompt: `对 ${monsters[0].name} 造成伤害并翻看牌堆。`,
        } as any;
        enqueuedActions.push({ type: 'RESOLVE_MAGIC_MONSTER_SELECTION', magicId: card.id, monsterId: monsters[0].id });
        return applyPatch(state, patch, sideEffects, enqueuedActions);
      }
      patch.pendingMagicAction = {
        card,
        effect: 'fate-sight',
        step: 'monster-select',
        prompt: '选择一个怪物，造成伤害并翻看牌堆。',
      } as any;
      patch.heroSkillBanner = '天眼审判：选择目标怪物。';
      return applyPatch(state, patch, sideEffects);
    }

    default:
      return null;
  }
}

// ---------------------------------------------------------------------------
// Specific effect resolvers
// ---------------------------------------------------------------------------

export function resolveStormVolley(
  state: GameState,
  card: GameCardData,
  sideEffects: SideEffect[],
  patch: Partial<GameState>,
  enqueuedActions: GameAction[],
  echoMultiplier: number,
  isEchoTriggered: boolean,
): ReduceResult {
  const monsters = flattenActiveRowSlots(state.activeCards).filter(isDamageableTarget);
  if (monsters.length === 0) {
    banner(sideEffects, '风暴箭雨无效（没有怪物）。');
    patch.lastPlayedCardCategory = getCardPlayCategory(card);
    enqueuedActions.push({ type: 'FINALIZE_MAGIC_CARD', card, dealtDamage: false });
    return applyPatch(state, patch, sideEffects, enqueuedActions);
  }
  const volleyDamage = getSpellDamage(3 + (card.amplifyBonus ?? 0), state) * echoMultiplier;
  for (const monster of monsters) {
    enqueuedActions.push({ type: 'DEAL_DAMAGE_TO_MONSTER', monsterId: monster.id, damage: volleyDamage, source: 'storm-volley', isSpellDamage: true });
  }
  if (monsters.length >= 3) {
    // Transform to 箭雨余韵
    let rng = state.rng;
    let flipId: string;
    [flipId, rng] = nextId(rng, 'flip-storm-volley');
    patch.rng = rng;
    const flippedCard: GameCardData = {
      id: flipId,
      type: 'magic',
      name: '箭雨余韵',
      value: 0,
      image: skillScrollImage,
      magicType: 'permanent',
      magicEffect: 'storm-volley-recycle',
      description: '对激活行所有怪物造成 1 点伤害，每击中一个怪物，从回收袋随机抽 1 张牌加入手牌。',
    } as GameCardData;
    log(sideEffects, 'magic', `风暴箭雨命中 ${monsters.length} 只怪物，翻转为「箭雨余韵」！`);
    banner(sideEffects, `风暴箭雨命中 ${monsters.length} 只怪物，对每只造成 ${volleyDamage} 点伤害！翻转为「箭雨余韵」！`);
    sideEffects.push({ event: 'card:stormVolleyTransformed', payload: { card } });
    mergePatch(patch, addCardToBackpackPure({ ...state, ...patch } as GameState, flippedCard));
    patch.pendingMagicAction = null;
    patch.lastPlayedCardCategory = getCardPlayCategory(card);
    enqueuedActions.push({ type: 'FINALIZE_MAGIC_CARD', card, dealtDamage: true });
    return applyPatch(state, patch, sideEffects, enqueuedActions);
  }
  banner(sideEffects, `风暴箭雨对每只怪物造成 ${volleyDamage} 点伤害！${isEchoTriggered ? '（回响×2）' : ''}`);
  patch.lastPlayedCardCategory = getCardPlayCategory(card);
  enqueuedActions.push({ type: 'FINALIZE_MAGIC_CARD', card, dealtDamage: true });
  return applyPatch(state, patch, sideEffects, enqueuedActions);
}

export function resolveFountainHand(
  state: GameState,
  card: GameCardData,
  sideEffects: SideEffect[],
  patch: Partial<GameState>,
  enqueuedActions: GameAction[],
): ReduceResult {
  enqueuedActions.push({ type: 'HEAL', amount: 8, source: 'fountain-hand' });
  const handSize = state.handCards.filter(c => c.id !== card.id).length;
  const limit = getEffectiveHandLimit(state);
  const deficit = Math.max(0, limit - handSize);
  if (deficit <= 0 || state.backpackItems.length === 0) {
    log(sideEffects, 'magic', '涌泉满手：恢复 8 点生命，手牌已满或背包为空。');
    banner(sideEffects, '涌泉满手：恢复 8 点生命，手牌已满或背包为空。');
    patch.lastPlayedCardCategory = getCardPlayCategory(card);
    enqueuedActions.push({ type: 'FINALIZE_MAGIC_CARD', card, dealtDamage: false });
    return applyPatch(state, patch, sideEffects, enqueuedActions);
  }
  const drawCount = Math.min(deficit, state.backpackItems.length);
  const drawResult = drawMultipleFromBackpack(state, drawCount);
  if (drawResult.cards.length > 0) {
    mergePatch(patch, drawResult.patch);
    for (const d of drawResult.cards) {
      sideEffects.push({ event: 'card:drawnToHand', payload: { cardId: d.id, source: 'backpack' } });
    }
  }
  log(sideEffects, 'magic', `涌泉满手：恢复 8 点生命，从背包抽取 ${drawResult.cards.length} 张牌补充手牌。`);
  banner(sideEffects, `涌泉满手：恢复 8 点生命，从背包抽了 ${drawResult.cards.length} 张牌。`);
  patch.lastPlayedCardCategory = getCardPlayCategory(card);
  enqueuedActions.push({ type: 'FINALIZE_MAGIC_CARD', card, dealtDamage: false });
  return applyPatch(state, patch, sideEffects, enqueuedActions);
}

export function resolveEmberEcho(
  state: GameState,
  card: GameCardData,
  sideEffects: SideEffect[],
  patch: Partial<GameState>,
  enqueuedActions: GameAction[],
  echoMultiplier: number,
  isEchoTriggered: boolean,
): ReduceResult {
  patch.permanentSpellDamageBonus = (state.permanentSpellDamageBonus ?? 0) + echoMultiplier;
  const drawState = { ...state, ...patch } as GameState;
  const drawResult = drawMultipleFromBackpack(drawState, echoMultiplier);
  if (drawResult.cards.length > 0) {
    mergePatch(patch, drawResult.patch);
    for (const d of drawResult.cards) {
      sideEffects.push({ event: 'card:drawnToHand', payload: { cardId: d.id, source: 'backpack' } });
    }
  }
  const parts: string[] = [`法术伤害永久 +${echoMultiplier}。`];
  if (drawResult.cards.length > 0) {
    parts.push(`抽了 ${drawResult.cards.length} 张牌。`);
  }
  if (isEchoTriggered) parts.push('（回响×2）');
  banner(sideEffects, parts.join(' '));
  patch.lastPlayedCardCategory = getCardPlayCategory(card);
  enqueuedActions.push({ type: 'FINALIZE_MAGIC_CARD', card, dealtDamage: false });
  return applyPatch(state, patch, sideEffects, enqueuedActions);
}

// ---------------------------------------------------------------------------
// resolveEchoBag — discard hand → discover from graveyard → draw from backpack
// ---------------------------------------------------------------------------

function resolveEchoBag(
  state: GameState,
  card: GameCardData,
  sideEffects: SideEffect[],
  patch: Partial<GameState>,
  enqueuedActions: GameAction[],
  echoMultiplier: number,
  isEchoTriggered: boolean,
): ReduceResult {
  const discardCount = 2 * echoMultiplier;
  const discoverCount = 2 * echoMultiplier;
  const drawCount = 2 * echoMultiplier;
  const echoTag = isEchoTriggered ? '（回响×2）' : '';

  // Step 1: randomly discard up to discardCount hand cards to graveyard
  const playable = state.handCards.filter((c: GameCardData) => c.id !== card.id);
  const actualDiscard = Math.min(playable.length, discardCount);
  if (actualDiscard > 0) {
    let rng = patch.rng ?? state.rng;
    const [discarded, rngAfter] = pickRandomHandCardsForDiscardPreferGraveyard(playable, actualDiscard, rng);
    patch.rng = rngAfter;
    const discardIds = new Set(discarded.map((c: GameCardData) => c.id));
    patch.handCards = state.handCards.filter((c: GameCardData) => !discardIds.has(c.id));
    for (const dc of discarded) {
      enqueuedActions.push({ type: 'ADD_TO_GRAVEYARD', card: dc });
    }
    log(sideEffects, 'magic', `回响行囊：弃回 ${discarded.map((c: GameCardData) => c.name).join('、')}`);
  }

  // Step 2: check graveyard for discover candidates
  // Include cards being enqueued for ADD_TO_GRAVEYARD (they haven't been drained yet)
  const currentGraveyardSize = (state.discardedCards ?? []).length;
  const graveyardSize = currentGraveyardSize + actualDiscard;

  if (graveyardSize > 0 && discoverCount > 0) {
    // Interactive flow: emit side effect for hook to open graveyard discover UI
    sideEffects.push({
      event: 'card:echoBagDiscover',
      payload: { card, discoverCount, drawCount },
    });
    log(sideEffects, 'magic', `回响行囊：从坟场发现 ${discoverCount} 张牌…`);
    banner(sideEffects, `回响行囊：弃回 ${actualDiscard} 张牌，从坟场发现…${echoTag}`);
    patch.lastPlayedCardCategory = getCardPlayCategory(card);
    return applyPatch(state, patch, sideEffects, enqueuedActions);
  }

  // No graveyard cards — skip discover, just draw from backpack
  const drawState = { ...state, ...patch } as GameState;
  const drawResult = drawMultipleFromBackpack(drawState, drawCount, { ignoreLimit: true });
  if (drawResult.cards.length > 0) {
    mergePatch(patch, drawResult.patch);
    for (const d of drawResult.cards) {
      sideEffects.push({ event: 'card:drawnToHand', payload: { cardId: d.id, source: 'backpack' } });
    }
  }
  const drawMsg = drawResult.cards.length > 0
    ? `抽了 ${drawResult.cards.length} 张牌`
    : '背包为空';
  banner(sideEffects, `回响行囊：弃回 ${actualDiscard} 张牌，坟场为空，${drawMsg}。${echoTag}`);
  patch.lastPlayedCardCategory = getCardPlayCategory(card);
  enqueuedActions.push({ type: 'FINALIZE_MAGIC_CARD', card, dealtDamage: false });
  return applyPatch(state, patch, sideEffects, enqueuedActions);
}

export function resolveBloodReckoning(
  state: GameState,
  card: GameCardData,
  sideEffects: SideEffect[],
  patch: Partial<GameState>,
  enqueuedActions: GameAction[],
  echoMultiplier: number,
  isEchoTriggered: boolean,
): ReduceResult {
  const monsters = flattenActiveRowSlots(state.activeCards).filter(isDamageableTarget);
  if (monsters.length === 0) {
    banner(sideEffects, '点金裁决无效（没有怪物）。');
    patch.lastPlayedCardCategory = getCardPlayCategory(card);
    enqueuedActions.push({ type: 'FINALIZE_MAGIC_CARD', card, dealtDamage: false });
    return applyPatch(state, patch, sideEffects, enqueuedActions);
  }
  const totalDamage = getSpellDamage(state.gold + (card.amplifyBonus ?? 0), state) * echoMultiplier;
  if (monsters.length === 1) {
    enqueuedActions.push({ type: 'DEAL_DAMAGE_TO_MONSTER', monsterId: monsters[0].id, damage: totalDamage, source: 'blood-reckoning', isSpellDamage: true });
    enqueuedActions.push({ type: 'HEAL', amount: totalDamage, source: 'blood-reckoning' });
    banner(sideEffects, `点金裁决造成 ${totalDamage} 点伤害！${isEchoTriggered ? '（回响×2）' : ''}`);
    patch.lastPlayedCardCategory = getCardPlayCategory(card);
    enqueuedActions.push({ type: 'FINALIZE_MAGIC_CARD', card, dealtDamage: true });
    return applyPatch(state, patch, sideEffects, enqueuedActions);
  }
  patch.pendingMagicAction = {
    card,
    effect: 'blood-reckoning',
    step: 'monster-select',
    echoMultiplier,
    prompt: `选择一个怪物，造成 ${totalDamage} 点伤害并恢复等量生命。${isEchoTriggered ? '（回响×2）' : ''}`,
  } as any;
  patch.heroSkillBanner = '点金裁决就绪，请选择目标怪物。';
  return applyPatch(state, patch, sideEffects);
}

export function resolveSoulSwap(
  state: GameState,
  card: GameCardData,
  sideEffects: SideEffect[],
  patch: Partial<GameState>,
  enqueuedActions: GameAction[],
): ReduceResult {
  const swapEquipSlots = getEquippedSlots(state).filter(slot =>
    (slot.item.type === 'weapon' || slot.item.type === 'shield') && (slot.item.durability ?? 0) > 0,
  );
  if (swapEquipSlots.length === 0) {
    banner(sideEffects, '等价交换无效（没有可用装备）。');
    patch.lastPlayedCardCategory = getCardPlayCategory(card);
    enqueuedActions.push({ type: 'FINALIZE_MAGIC_CARD', card, dealtDamage: false });
    return applyPatch(state, patch, sideEffects, enqueuedActions);
  }
  const swapMonsters = flattenActiveRowSlots(state.activeCards).filter(
    c => c.type === 'monster' && !c.bossPhase && !c.isFinalMonster,
  );
  if (swapMonsters.length === 0) {
    banner(sideEffects, '等价交换无效（没有可选的非Boss怪物）。');
    patch.lastPlayedCardCategory = getCardPlayCategory(card);
    enqueuedActions.push({ type: 'FINALIZE_MAGIC_CARD', card, dealtDamage: false });
    return applyPatch(state, patch, sideEffects, enqueuedActions);
  }
  if (swapEquipSlots.length === 1) {
    const slot = swapEquipSlots[0];
    const durability = slot.item.durability ?? 0;
    if (swapMonsters.length === 1) {
      const target = swapMonsters[0];
      const oldLayers = target.currentLayer ?? 1;
      const newMaxDur = Math.max(slot.item.maxDurability ?? durability, oldLayers);
      (patch as any)[slot.id] = { ...slot.item, durability: oldLayers, maxDurability: newMaxDur };
      const newActiveCards = (state.activeCards as (GameCardData | null)[]).map(c => {
        if (c?.id !== target.id) return c;
        return {
          ...c,
          currentLayer: durability,
          hp: c.maxHp ?? c.hp ?? 0,
          fury: Math.max(c.fury ?? 0, durability),
          hpLayers: Math.max(c.hpLayers ?? 0, durability),
        };
      }) as ActiveRowSlots;
      patch.activeCards = newActiveCards;
      banner(sideEffects, `等价交换：${slot.item.name} 耐久 ${durability}→${oldLayers}，${target.name} 血层 ${oldLayers}→${durability}。`);
      patch.lastPlayedCardCategory = getCardPlayCategory(card);
      enqueuedActions.push({ type: 'FINALIZE_MAGIC_CARD', card, dealtDamage: false });
      return applyPatch(state, patch, sideEffects, enqueuedActions);
    }
    patch.pendingMagicAction = {
      card,
      effect: 'soul-swap',
      step: 'monster-select',
      slotId: slot.id,
      slotDurability: durability,
      prompt: `选择一个非Boss怪物，与 ${slot.item.name}（耐久 ${durability}）互换血层。`,
    } as any;
    patch.heroSkillBanner = `等价交换：选择一个怪物与 ${slot.item.name} 互换。`;
    return applyPatch(state, patch, sideEffects);
  }
  patch.pendingMagicAction = {
    card,
    effect: 'soul-swap',
    step: 'slot-select',
    prompt: '选择一件装备进行等价交换。',
  } as any;
  patch.heroSkillBanner = '等价交换：选择一件装备。';
  return applyPatch(state, patch, sideEffects);
}

/**
 * 给一张手牌赋予 Perm 3 属性。
 * 若目标牌曾被「凡化咒」剥离（permStripped=true），则同时清除该标记，
 * 让原本的 magicType==='permanent' 重新生效；否则按非 perm 牌追加 recycleDelay。
 */
function grantPerm3(target: GameCardData): GameCardData {
  const next: GameCardData = { ...target, recycleDelay: 3 };
  if (next.permStripped) delete next.permStripped;
  return next;
}

export function resolvePermGrant(
  state: GameState,
  card: GameCardData,
  sideEffects: SideEffect[],
  patch: Partial<GameState>,
  enqueuedActions: GameAction[],
): ReduceResult {
  const eligible = state.handCards.filter(c => c.id !== card.id && !cardHasPermFlag(c));
  if (eligible.length === 0) {
    log(sideEffects, 'magic', '永恒铭刻：手牌中没有可赋予永恒属性的卡牌。');
    banner(sideEffects, '手牌中没有可赋予永恒属性的卡牌。');
    patch.lastPlayedCardCategory = getCardPlayCategory(card);
    enqueuedActions.push({ type: 'FINALIZE_MAGIC_CARD', card, dealtDamage: false });
    return applyPatch(state, patch, sideEffects, enqueuedActions);
  }
  if (eligible.length === 1) {
    const target = eligible[0];
    patch.handCards = state.handCards.map(c => c.id === target.id ? grantPerm3(c) : c);
    log(sideEffects, 'magic', `永恒铭刻：「${target.name}」获得 Perm 3 属性！`);
    banner(sideEffects, `「${target.name}」获得 Perm 3！被移除后将经 3 次瀑流返回背包。`);
    patch.lastPlayedCardCategory = getCardPlayCategory(card);
    enqueuedActions.push({ type: 'FINALIZE_MAGIC_CARD', card, dealtDamage: false });
    return applyPatch(state, patch, sideEffects, enqueuedActions);
  }
  patch.permGrantModal = { sourceCardId: card.id, sourceType: 'magic' as const };
  patch.pendingMagicAction = { card, effect: 'perm-grant', step: 'perm-grant-select' } as any;
  return applyPatch(state, patch, sideEffects);
}

export function resolveStripPermHand(
  state: GameState,
  card: GameCardData,
  sideEffects: SideEffect[],
  patch: Partial<GameState>,
  enqueuedActions: GameAction[],
): ReduceResult {
  let cleanedCount = 0;
  const newHand = state.handCards.map(c => {
    const stripped: GameCardData = { ...c };
    let changed = false;
    // NOTE: 不修改 magicType — 否则 perm 法术效果会被路由到 resolveInstantMagic 而失效。
    // 改为打 permStripped 标记；UI 显示/回收袋路由都改用 cardHasPermFlag 等中央判定来识别。
    if (stripped.magicType === 'permanent') {
      changed = true;
    }
    if (stripped.permEquipment) {
      stripped.permEquipment = false;
      changed = true;
    }
    if (stripped.isPermanentEvent) {
      stripped.isPermanentEvent = false;
      changed = true;
    }
    if (stripped.recycleDelay != null && stripped.recycleDelay > 0) {
      delete stripped.recycleDelay;
      changed = true;
    }
    if (changed) {
      stripped.permStripped = true;
      cleanedCount += 1;
      return stripped;
    }
    return c;
  });

  patch.handCards = newHand;
  patch.lastPlayedCardCategory = getCardPlayCategory(card);

  if (cleanedCount === 0) {
    log(sideEffects, 'magic', '凡化咒：手牌中没有具有 Perm 属性的卡牌。');
    banner(sideEffects, '手牌中没有具有 Perm 属性的卡牌。');
  } else {
    log(sideEffects, 'magic', `凡化咒：清除了 ${cleanedCount} 张手牌的 Perm 属性。`);
    banner(sideEffects, `凡化咒：${cleanedCount} 张手牌失去 Perm 属性。`);
  }

  enqueuedActions.push({ type: 'FINALIZE_MAGIC_CARD', card, dealtDamage: false });
  return applyPatch(state, patch, sideEffects, enqueuedActions);
}

export function resolveStormVolleyRecycle(
  state: GameState,
  card: GameCardData,
  sideEffects: SideEffect[],
  patch: Partial<GameState>,
  enqueuedActions: GameAction[],
  echoMultiplier: number,
  isEchoTriggered: boolean,
): ReduceResult {
  const monsters = flattenActiveRowSlots(state.activeCards).filter(isDamageableTarget);
  if (monsters.length === 0) {
    banner(sideEffects, '箭雨余韵无效（没有怪物）。');
    patch.lastPlayedCardCategory = getCardPlayCategory(card);
    enqueuedActions.push({ type: 'FINALIZE_MAGIC_CARD', card, dealtDamage: false });
    return applyPatch(state, patch, sideEffects, enqueuedActions);
  }
  const svDamage = getSpellDamage(1 + (card.amplifyBonus ?? 0), state) * echoMultiplier;
  for (const monster of monsters) {
    enqueuedActions.push({ type: 'DEAL_DAMAGE_TO_MONSTER', monsterId: monster.id, damage: svDamage, source: 'storm-volley-recycle', isSpellDamage: true });
  }
  const hitCount = svDamage > 0 ? monsters.length : 0;
  const availableBag = state.permanentMagicRecycleBag.filter(c => c.id !== card.id);
  const drawCount = Math.min(hitCount, availableBag.length);
  let rng = state.rng;
  let shuffled: typeof availableBag;
  [shuffled, rng] = rngShuffle(availableBag, rng);
  patch.rng = rng;
  const drawn = shuffled.slice(0, drawCount);
  if (drawn.length > 0) {
    const drawnIds = new Set(drawn.map(c => c.id));
    patch.permanentMagicRecycleBag = state.permanentMagicRecycleBag.filter(c => !drawnIds.has(c.id));
    patch.handCards = [...state.handCards, ...drawn];
    log(sideEffects, 'deck', `从回收袋抽取 ${drawn.length} 张牌：${drawn.map(c => c.name).join('、')}`);
  }
  const echoTag = isEchoTriggered ? '（回响×2）' : '';
  const bnr = drawn.length > 0
    ? `箭雨余韵命中 ${hitCount} 只怪物，造成 ${svDamage} 点伤害！从回收袋抽取：${drawn.map(c => c.name).join('、')}。${echoTag}`
    : `箭雨余韵命中 ${hitCount} 只怪物，造成 ${svDamage} 点伤害！回收袋无可抽取的牌。${echoTag}`;
  banner(sideEffects, bnr);
  patch.lastPlayedCardCategory = getCardPlayCategory(card);
  enqueuedActions.push({ type: 'FINALIZE_MAGIC_CARD', card, dealtDamage: true });
  return applyPatch(state, patch, sideEffects, enqueuedActions);
}

export function resolveArcaneStorm(
  state: GameState,
  card: GameCardData,
  sideEffects: SideEffect[],
  patch: Partial<GameState>,
  enqueuedActions: GameAction[],
  echoMultiplier: number,
  isEchoTriggered: boolean,
): ReduceResult {
  const magicCount = patch.magicCardsPlayedThisTurn ?? state.magicCardsPlayedThisTurn ?? 0;
  const baseDmg = Math.max(0, magicCount + (card.amplifyBonus ?? 0));
  const totalDmg = getSpellDamage(baseDmg, state) * echoMultiplier;
  const monsters = flattenActiveRowSlots(state.activeCards).filter(isDamageableTarget);
  if (monsters.length === 0 || totalDmg <= 0) {
    banner(sideEffects, `奥术风暴：本回合使用了 ${magicCount} 张魔法卡，但没有可攻击的目标。`);
    patch.lastPlayedCardCategory = getCardPlayCategory(card);
    enqueuedActions.push({ type: 'FINALIZE_MAGIC_CARD', card, dealtDamage: false });
    return applyPatch(state, patch, sideEffects, enqueuedActions);
  }
  if (monsters.length === 1) {
    enqueuedActions.push({ type: 'DEAL_DAMAGE_TO_MONSTER', monsterId: monsters[0].id, damage: totalDmg, source: 'arcane-storm', isSpellDamage: true });
    banner(sideEffects, `奥术风暴：${magicCount} 张魔法卡，对 ${monsters[0].name} 造成 ${totalDmg} 点伤害。${isEchoTriggered ? '（回响×2）' : ''}`);
    patch.lastPlayedCardCategory = getCardPlayCategory(card);
    enqueuedActions.push({ type: 'FINALIZE_MAGIC_CARD', card, dealtDamage: true });
    return applyPatch(state, patch, sideEffects, enqueuedActions);
  }
  patch.pendingMagicAction = {
    card,
    effect: 'arcane-storm',
    step: 'monster-select',
    pendingDamage: baseDmg,
    echoMultiplier,
    prompt: `奥术风暴：选择一个目标，造成 ${totalDmg} 点伤害（${magicCount} 张魔法卡）。`,
  } as any;
  patch.heroSkillBanner = `奥术风暴：${magicCount} 张魔法卡，选择目标造成 ${totalDmg} 点伤害。`;
  return applyPatch(state, patch, sideEffects);
}

export function resolveAmplifyTarget(
  state: GameState,
  card: GameCardData,
  sideEffects: SideEffect[],
  patch: Partial<GameState>,
  enqueuedActions: GameAction[],
): ReduceResult {
  const targetName = card._amplifyTargetName;

  // 仅在 targetName 缺失（卡牌结构异常）时拒绝。
  // 之前会按 _amplifyTargetCardId 校验"原始那张卡是否仍在装备栏/手牌"，
  // 但实际加成本就是按 NAME（AMPLIFY_CARDS_BY_NAME）应用到 amplifiedCardBonus
  // map + 所有同名卡（手牌/装备/背包/坟场/回收袋/抽牌堆/职业牌组/地下城/护符/储备）。
  // 用户场景：「增幅」magic 选中手牌中的「魔弹」生成 Perm 2 卡，
  // 期间把那张「魔弹」打掉了；后续打出「增幅：魔弹」时按 ID 校验失败 → 整个生效被吞掉。
  // 修复：移除 ID 校验，即使全场已无同名卡也照常记入 amplifiedCardBonus map，
  // 未来生成的同名卡（如 createMagicBoltCard）会通过 applyAmplifyOnCreate 自动获得累计加成。
  if (!targetName) {
    banner(sideEffects, '增幅：目标不存在。');
    patch.lastPlayedCardCategory = getCardPlayCategory(card);
    enqueuedActions.push({ type: 'FINALIZE_MAGIC_CARD', card, dealtDamage: false });
    return applyPatch(state, patch, sideEffects, enqueuedActions);
  }

  enqueuedActions.push({ type: 'AMPLIFY_CARDS_BY_NAME', cardName: targetName, amount: 2, source: '增幅' });
  banner(sideEffects, `增幅：所有「${targetName}」获得 +2 增幅！`);
  patch.lastPlayedCardCategory = getCardPlayCategory(card);
  enqueuedActions.push({ type: 'FINALIZE_MAGIC_CARD', card, dealtDamage: false });
  return applyPatch(state, patch, sideEffects, enqueuedActions);
}

export function resolveChaosStrike(
  state: GameState,
  card: GameCardData,
  sideEffects: SideEffect[],
  patch: Partial<GameState>,
  enqueuedActions: GameAction[],
  echoMultiplier: number,
  isEchoTriggered: boolean,
): ReduceResult {
  const monsters = flattenActiveRowSlots(state.activeCards).filter(isDamageableTarget);
  if (monsters.length === 0) {
    banner(sideEffects, '混沌冲击无效（没有怪物）。');
    patch.lastPlayedCardCategory = getCardPlayCategory(card);
    enqueuedActions.push({ type: 'FINALIZE_MAGIC_CARD', card, dealtDamage: false });
    return applyPatch(state, patch, sideEffects, enqueuedActions);
  }
  const chaosBase = 3 + (card.amplifyBonus ?? 0);
  if (monsters.length === 1 && echoMultiplier <= 1) {
    const target = monsters[0];
    const chaosDamage = getSpellDamage(chaosBase, state);
    const overkill = chaosStrikeHasOverkill(target, chaosDamage);
    enqueuedActions.push({ type: 'DEAL_DAMAGE_TO_MONSTER', monsterId: target.id, damage: chaosDamage, source: 'chaos-strike', isSpellDamage: true });
    if (overkill) {
      const drawResult = drawMultipleFromBackpack(state, 2, { ignoreLimit: true });
      if (drawResult.cards.length > 0) {
        mergePatch(patch, drawResult.patch);
        for (const d of drawResult.cards) {
          sideEffects.push({ event: 'card:drawnToHand', payload: { cardId: d.id, source: 'backpack' } });
        }
      }
      banner(sideEffects, `混沌冲击对 ${target.name} 造成 ${chaosDamage} 伤害，超杀！抽 ${drawResult.cards.length} 张牌。`);
    } else {
      banner(sideEffects, `混沌冲击对 ${target.name} 造成 ${chaosDamage} 点伤害。`);
    }
    patch.lastPlayedCardCategory = getCardPlayCategory(card);
    enqueuedActions.push({ type: 'FINALIZE_MAGIC_CARD', card, dealtDamage: true });
    return applyPatch(state, patch, sideEffects, enqueuedActions);
  }
  const chaosDamage = getSpellDamage(chaosBase, state);
  const echoLabel = echoMultiplier > 1 ? `（回响：第 1/${echoMultiplier} 次）` : '';
  patch.pendingMagicAction = {
    card,
    effect: 'chaos-strike',
    step: 'monster-select',
    prompt: `选择一个目标，对其造成 ${chaosDamage} 点伤害。超杀：抽 2 张牌。${echoLabel}`,
    data: {},
    echoRemaining: echoMultiplier,
  } as any;
  patch.heroSkillBanner = `选择一个目标，造成 ${chaosBase} 点伤害。超杀：抽 2 张牌。${echoLabel}`;
  return applyPatch(state, patch, sideEffects);
}

export function resolveOverkillUpgrade(
  state: GameState,
  card: GameCardData,
  sideEffects: SideEffect[],
  patch: Partial<GameState>,
  enqueuedActions: GameAction[],
  echoMultiplier: number,
  isEchoTriggered: boolean,
): ReduceResult {
  const monsters = flattenActiveRowSlots(state.activeCards).filter(isDamageableTarget);
  if (monsters.length === 0) {
    banner(sideEffects, '淬炼冲击无效（没有怪物）。');
    patch.lastPlayedCardCategory = getCardPlayCategory(card);
    enqueuedActions.push({ type: 'FINALIZE_MAGIC_CARD', card, dealtDamage: false });
    return applyPatch(state, patch, sideEffects, enqueuedActions);
  }
  const okBase = 3 + (card.amplifyBonus ?? 0);
  if (monsters.length === 1 && echoMultiplier <= 1) {
    const target = monsters[0];
    const okDamage = getSpellDamage(okBase, state);
    const overkill = chaosStrikeHasOverkill(target, okDamage);
    enqueuedActions.push({ type: 'DEAL_DAMAGE_TO_MONSTER', monsterId: target.id, damage: okDamage, source: 'overkill-upgrade', isSpellDamage: true });
    if (overkill) {
      patch.upgradeModalOpen = true;
      banner(sideEffects, `淬炼冲击对 ${target.name} 造成 ${okDamage} 伤害，超杀！选择一张牌升级。`);
    } else {
      banner(sideEffects, `淬炼冲击对 ${target.name} 造成 ${okDamage} 点伤害。`);
    }
    patch.lastPlayedCardCategory = getCardPlayCategory(card);
    enqueuedActions.push({ type: 'FINALIZE_MAGIC_CARD', card, dealtDamage: true });
    return applyPatch(state, patch, sideEffects, enqueuedActions);
  }
  const okDamage = getSpellDamage(okBase, state);
  const echoLabel = echoMultiplier > 1 ? `（回响：第 1/${echoMultiplier} 次）` : '';
  patch.pendingMagicAction = {
    card,
    effect: 'overkill-upgrade',
    step: 'monster-select',
    prompt: `选择一个目标，对其造成 ${okDamage} 点伤害。超杀：升级一张牌。${echoLabel}`,
    data: {},
    echoRemaining: echoMultiplier,
  } as any;
  patch.heroSkillBanner = `选择一个目标，造成 3 点伤害。超杀：升级一张牌。${echoLabel}`;
  return applyPatch(state, patch, sideEffects);
}

export function resolveRepairOne(
  state: GameState,
  card: GameCardData,
  sideEffects: SideEffect[],
  patch: Partial<GameState>,
  enqueuedActions: GameAction[],
  echoMultiplier: number,
  isEchoTriggered: boolean,
): ReduceResult {
  const repairUpgLvl = card.upgradeLevel ?? 0;
  const repairHpCosts = [2, 1, 1];
  const repairAmounts = [1, 2, 2];
  const repairHpCost = repairHpCosts[repairUpgLvl] ?? 1;
  const repairBaseAmt = repairAmounts[repairUpgLvl] ?? 2;
  const repairDrawCard = repairUpgLvl >= 2;

  if (repairHpCost > 0) {
    enqueuedActions.push({ type: 'APPLY_DAMAGE', amount: repairHpCost, source: 'repair-one', selfInflicted: true });
  }

  const repairableSlots = getRepairableSlots(state);
  const hpCostBanner = repairHpCost > 0 ? `失去 ${repairHpCost} 点生命，` : '';

  if (repairableSlots.length === 0) {
    if (repairDrawCard) {
      const drawState = { ...state, ...patch } as GameState;
      const { card: drawn, patch: drawPatch } = drawFromBackpackToHandPure(drawState);
      if (drawn) {
        mergePatch(patch, drawPatch);
        sideEffects.push({ event: 'card:drawnToHand', payload: { cardId: drawn.id, source: 'backpack' } });
      }
      const drawnMsg = drawn ? `抽到「${drawn.name}」` : '背包为空';
      banner(sideEffects, `${hpCostBanner}所有装备满耐久。${drawnMsg}。`);
    } else {
      banner(sideEffects, `${hpCostBanner}但所有装备都处于满耐久状态。`);
    }
    patch.lastPlayedCardCategory = getCardPlayCategory(card);
    enqueuedActions.push({ type: 'FINALIZE_MAGIC_CARD', card, dealtDamage: false });
    return applyPatch(state, patch, sideEffects, enqueuedActions);
  }

  if (repairableSlots.length === 1) {
    const repairAmount = repairBaseAmt * echoMultiplier;
    const slot = repairableSlots[0];
    const maxDur = slot.item.maxDurability ?? slot.item.durability ?? 0;
    const curDur = slot.item.durability ?? maxDur;
    (patch as any)[slot.id] = { ...slot.item, durability: Math.min(maxDur, curDur + repairAmount) };
    let drawMsg = '';
    if (repairDrawCard) {
      const drawState = { ...state, ...patch } as GameState;
      const { card: drawn, patch: drawPatch } = drawFromBackpackToHandPure(drawState);
      if (drawn) {
        mergePatch(patch, drawPatch);
        sideEffects.push({ event: 'card:drawnToHand', payload: { cardId: drawn.id, source: 'backpack' } });
        drawMsg = `，抽到「${drawn.name}」`;
      }
    }
    banner(sideEffects, `${hpCostBanner}${slot.item.name} 恢复了 ${repairAmount} 点耐久${drawMsg}。${isEchoTriggered ? '（回响×2）' : ''}`);
    patch.lastPlayedCardCategory = getCardPlayCategory(card);
    enqueuedActions.push({ type: 'FINALIZE_MAGIC_CARD', card, dealtDamage: false });
    return applyPatch(state, patch, sideEffects, enqueuedActions);
  }

  patch.pendingMagicAction = {
    card,
    effect: 'repair-one',
    step: 'slot-select',
    prompt: `${hpCostBanner}选择一件装备恢复 ${repairBaseAmt * echoMultiplier} 点耐久。`,
    echoMultiplier,
  } as any;
  patch.heroSkillBanner = `${hpCostBanner}选择一件装备恢复 ${repairBaseAmt * echoMultiplier} 点耐久。`;
  return applyPatch(state, patch, sideEffects);
}

export function resolveStunStrike(
  state: GameState,
  card: GameCardData,
  sideEffects: SideEffect[],
  patch: Partial<GameState>,
  enqueuedActions: GameAction[],
  echoMultiplier: number,
  isEchoTriggered: boolean,
): ReduceResult {
  const stunDmgPerHit = [1, 2, 3];
  const stunChances = [20, 40, 60];
  const hits = 2;
  const baseDmgPerHit = (stunDmgPerHit[card.upgradeLevel ?? 0] ?? 1) + (card.amplifyBonus ?? 0);
  const rawStunPct = stunChances[card.upgradeLevel ?? 0] ?? 10;
  const stunPct = Math.min(rawStunPct, state.stunCap ?? 10);
  const hitDmg = getSpellDamage(baseDmgPerHit, state) * echoMultiplier;
  const totalDmg = hitDmg * hits;
  const monsters = flattenActiveRowSlots(state.activeCards).filter(isDamageableTarget);

  if (monsters.length === 0) {
    banner(sideEffects, '没有怪物可攻击。');
    patch.lastPlayedCardCategory = getCardPlayCategory(card);
    enqueuedActions.push({ type: 'FINALIZE_MAGIC_CARD', card, dealtDamage: false });
    return applyPatch(state, patch, sideEffects, enqueuedActions);
  }

  if (monsters.length === 1) {
    enqueuedActions.push({ type: 'DEAL_DAMAGE_TO_MONSTER', monsterId: monsters[0].id, damage: totalDmg, source: 'stun-strike', isSpellDamage: true });
    log(sideEffects, 'magic', `雷震击：对 ${monsters[0].name} 造成 ${hitDmg}×${hits} 点法术伤害`);
    banner(sideEffects, `雷震击：对 ${monsters[0].name} 造成 ${hitDmg}×${hits} 点伤害！`);
    patch.lastPlayedCardCategory = getCardPlayCategory(card);
    enqueuedActions.push({ type: 'FINALIZE_MAGIC_CARD', card, dealtDamage: true });

    const threshold = Math.round((stunPct / 100) * 20);
    if (threshold > 0 && !monsters[0].isStunned) {
      let stunRoll: number;
      let stunRng: RngState;
      [stunRoll, stunRng] = nextInt(patch.rng ?? state.rng, 1, 20);
      patch.rng = stunRng;
      sideEffects.push({
        event: 'ui:requestDice' as any,
        payload: {
          title: monsters[0].name,
          subtitle: `雷震击晕判定 第1击（${stunPct}%）`,
          entries: [
            { id: 'stun', range: [1, threshold], label: '击晕成功！', effect: 'none' },
            { id: 'miss', range: [threshold + 1, 20], label: '未击晕', effect: 'none' },
          ],
          flowContext: {
            flowId: 'thunder-stun',
            monsterId: monsters[0].id,
            monsterName: monsters[0].name,
            hit: 1,
            maxHits: hits,
            stunPct,
            threshold,
            card,
          },
          predeterminedRoll: stunRoll,
        },
      });
    }
    return applyPatch(state, patch, sideEffects, enqueuedActions);
  }

  patch.pendingMagicAction = {
    card,
    effect: 'stun-strike',
    step: 'monster-select',
    prompt: `选择一个怪物，造成 ${hitDmg}×${hits} 点法术伤害（每击 ${stunPct}% 击晕）。`,
    echoMultiplier,
    data: { baseDmgPerHit, stunPct, hits },
  } as any;
  patch.heroSkillBanner = `选择一个怪物，造成 ${hitDmg}×${hits} 点伤害（每击 ${stunPct}% 击晕）。`;
  return applyPatch(state, patch, sideEffects);
}

export function resolveScalingDamage(
  state: GameState,
  card: GameCardData,
  sideEffects: SideEffect[],
  patch: Partial<GameState>,
  enqueuedActions: GameAction[],
  echoMultiplier: number,
  isEchoTriggered: boolean,
): ReduceResult {
  const strikeBase = card.scalingDamage!;
  const currentDamage = getSpellDamage(strikeBase, state) * echoMultiplier;
  const monsters = flattenActiveRowSlots(state.activeCards).filter(isDamageableTarget);
  if (monsters.length === 0) {
    banner(sideEffects, `${card.name}无效（没有怪物）。`);
    patch.lastPlayedCardCategory = getCardPlayCategory(card);
    enqueuedActions.push({ type: 'FINALIZE_MAGIC_CARD', card, dealtDamage: false });
    return applyPatch(state, patch, sideEffects, enqueuedActions);
  }
  const nextBase = strikeBase + 1;
  const updatedCard: GameCardData = {
    ...card,
    scalingDamage: nextBase,
    magicEffect: `下一击叠刺 ${nextBase}`,
  };
  if (monsters.length === 1) {
    enqueuedActions.push({ type: 'DEAL_DAMAGE_TO_MONSTER', monsterId: monsters[0].id, damage: currentDamage, source: 'scaling-damage', isSpellDamage: true });
    log(sideEffects, 'magic', `${card.name}：对 ${monsters[0].name} 造成 ${currentDamage} 点（下一击叠刺 ${nextBase}）`);
    banner(sideEffects, `${card.name} 下一击叠刺 ${nextBase}`);
    // Card goes to recycle bag with updated scaling
    enqueuedActions.push({ type: 'ADD_TO_RECYCLE_BAG', card: updatedCard });
    patch.lastPlayedCardCategory = getCardPlayCategory(card);
    return applyPatch(state, patch, sideEffects, enqueuedActions);
  }
  patch.pendingMagicAction = {
    card: updatedCard,
    effect: 'scaling-damage',
    step: 'monster-select',
    pendingDamage: strikeBase,
    echoMultiplier,
    prompt: `选择目标（本刺叠刺 ${strikeBase}）`,
  } as any;
  patch.heroSkillBanner = `${card.name} 请选择目标 · 本刺叠刺 ${strikeBase}`;
  return applyPatch(state, patch, sideEffects);
}

// ---------------------------------------------------------------------------
// applyCryptDeathwish — trigger equipment "last words" effects
// ---------------------------------------------------------------------------

function applyCryptDeathwish(
  state: GameState,
  card: GameCardData,
  slotId: EquipmentSlotId,
  sideEffects: SideEffect[],
  patch: Partial<GameState>,
  enqueuedActions: GameAction[],
): ReduceResult {
  const slotItem = state[slotId] as GameCardData | null;
  if (!slotItem) {
    banner(sideEffects, '墓语遗愿：目标装备已不存在。');
    patch.pendingMagicAction = null;
    patch.heroSkillBanner = null;
    patch.lastPlayedCardCategory = getCardPlayCategory(card);
    enqueuedActions.push({ type: 'FINALIZE_MAGIC_CARD', card, dealtDamage: false });
    return applyPatch(state, patch, sideEffects, enqueuedActions);
  }

  // Delegate to the canonical last-words computation so we cover both generic
  // equipment (onDestroy* fields) and monster equipment (lastWords,
  // skeletonLastWordsDiscard, wraithDeathHeal/Spread, etc.). Call it twice and
  // chain the patches so cumulative effects (slot bonuses, temp buffs, etc.)
  // stack correctly across the two triggers.
  const amuletFx = computeAmuletEffects(state.amuletSlots as GameCardData[]);
  let totalDrawFromBackpack = 0;
  let totalClassCardDraw = 0;
  let mergedPatch: Partial<GameState> = patch;
  for (let i = 0; i < 2; i++) {
    const lw = computeEquipmentDisplacementLastWords(state, slotId, slotItem, amuletFx, mergedPatch);
    mergedPatch = lw.patch;
    sideEffects.push(...lw.sideEffects);
    enqueuedActions.push(...lw.enqueuedActions);
    totalDrawFromBackpack += lw.drawFromBackpack;
    totalClassCardDraw += lw.classCardDraw;
  }
  Object.assign(patch, mergedPatch);
  if (totalDrawFromBackpack > 0) {
    enqueuedActions.push({ type: 'DRAW_FROM_BACKPACK', count: totalDrawFromBackpack } as GameAction);
  }
  if (totalClassCardDraw > 0) {
    enqueuedActions.push({ type: 'DRAW_CLASS_TO_BACKPACK', count: totalClassCardDraw } as GameAction);
  }
  enqueuedActions.push({ type: 'DRAW_FROM_BACKPACK', count: 1 } as GameAction);
  log(sideEffects, 'magic', `墓语遗愿：触发「${slotItem.name}」遗言 ×2，抽 1 张牌`);
  banner(sideEffects, `墓语遗愿：「${slotItem.name}」遗言触发 2 次！抽 1 张牌`);
  patch.pendingMagicAction = null;
  patch.heroSkillBanner = null;
  patch.lastPlayedCardCategory = getCardPlayCategory(card);
  enqueuedActions.push({ type: 'FINALIZE_MAGIC_CARD', card, dealtDamage: false });
  return applyPatch(state, patch, sideEffects, enqueuedActions);
}

// ---------------------------------------------------------------------------
// resolveMonsterFusion — deterministic fusion of same-type monster equipment
// ---------------------------------------------------------------------------

export function resolveMonsterFusion(
  state: GameState,
  card: GameCardData,
  sideEffects: SideEffect[],
  patch: Partial<GameState>,
  enqueuedActions: GameAction[],
): ReduceResult {
  type EquippedMonsterInfo = { card: GameCardData; slotId: EquipmentSlotId; isSurface: boolean };
  const allEquippedMonsters: EquippedMonsterInfo[] = [];
  for (const slotId of ['equipmentSlot1', 'equipmentSlot2'] as EquipmentSlotId[]) {
    const surface = state[slotId] as GameCardData | null;
    const reserve = (slotId === 'equipmentSlot1' ? state.equipmentSlot1Reserve : state.equipmentSlot2Reserve) ?? [];
    if (surface && surface.type === 'monster') {
      allEquippedMonsters.push({ card: surface, slotId, isSurface: true });
    }
    for (const r of reserve) {
      if ((r as GameCardData).type === 'monster') {
        allEquippedMonsters.push({ card: r as GameCardData, slotId, isSurface: false });
      }
    }
  }

  const typeGroups: Record<string, EquippedMonsterInfo[]> = {};
  allEquippedMonsters.forEach(m => {
    const key = (m.card as any).monsterType ?? m.card.name;
    if (!typeGroups[key]) typeGroups[key] = [];
    typeGroups[key].push(m);
  });
  const fusibleGroups = Object.entries(typeGroups).filter(([, g]) => g.length >= 2);
  if (fusibleGroups.length === 0) {
    banner(sideEffects, '没有可融合的同种怪物装备（需要至少 2 个同种族的怪物装备）。');
    return applyPatch(state, patch, sideEffects);
  }

  const [groupName, group] = fusibleGroups.reduce(
    (best, cur) => {
      if (cur[0] === 'Skeleton' && cur[1].length >= 3) return cur;
      if (best[0] === 'Skeleton' && best[1].length >= 3) return best;
      return cur[1].length >= best[1].length ? cur : best;
    },
    fusibleGroups[0],
  );

  const fusionIds = new Set(group.map(m => m.card.id));
  const discardedFromFusion: GameCardData[] = [];

  for (const slotId of ['equipmentSlot1', 'equipmentSlot2'] as EquipmentSlotId[]) {
    const surface = (patch[slotId] ?? state[slotId]) as GameCardData | null;
    const reserveKey = slotId === 'equipmentSlot1' ? 'equipmentSlot1Reserve' : 'equipmentSlot2Reserve';
    const reserve = ((patch as any)[reserveKey] ?? (state as any)[reserveKey] ?? []) as GameCardData[];
    const surfaceRemoved = surface && fusionIds.has(surface.id);
    const remainingReserve = reserve.filter(r => !fusionIds.has(r.id));
    const removedReserve = reserve.filter(r => fusionIds.has(r.id));

    if (surfaceRemoved) discardedFromFusion.push(surface);
    removedReserve.forEach(r => discardedFromFusion.push(r));

    if (surfaceRemoved) {
      if (remainingReserve.length > 0) {
        (patch as any)[slotId] = remainingReserve[0];
        (patch as any)[reserveKey] = remainingReserve.slice(1);
      } else {
        (patch as any)[slotId] = null;
        (patch as any)[reserveKey] = [];
      }
    } else if (removedReserve.length > 0) {
      (patch as any)[reserveKey] = remainingReserve;
    }
  }

  for (const dc of discardedFromFusion) {
    enqueuedActions.push({ type: 'ADD_TO_GRAVEYARD', card: dc } as GameAction);
  }

  const raceNameMap: Record<string, string> = {
    Dragon: '龙族', Skeleton: '骷髅', Goblin: '哥布林',
    Ogre: '食人魔', Wraith: '幽灵', Swarm: '虫群', Golem: '魔像',
  };
  const elitePropsMap: Record<string, Partial<GameCardData>> = {
    Dragon: { monsterSpecial: 'ember-fury', monsterSpecialDesc: '融合精英：流血（每失去1耐久攻击+3）+ 龙息庇护。', bleedEffect: 'attack+3' as any, eliteHealOtherMonster: true },
    Skeleton: { monsterSpecial: 'bone-regen', monsterSpecialDesc: '融合精英：虚骨再生（40%不消耗耐久）+ 复生。', hasRevive: true },
    Goblin: { monsterSpecial: 'goblin-elite', monsterSpecialDesc: '融合精英：攻击偷取8金币 + 窃宝。', goblinStealEquip: true, onAttackEffect: 'steal-gold-8' as any },
    Ogre: { monsterSpecial: 'ogre-crit', monsterSpecialDesc: '融合精英：攻击伤害翻倍 + 50%概率额外攻击一次。', eliteDoubleAttack: true, weaponExtraAttack: 1 },
    Wraith: { monsterSpecial: 'wraith-rebirth', monsterSpecialDesc: '融合精英：幽魂重生（耐久降至1时回满）+ 幽魂作祟遗言。', lastWords: 'wraith-haunt-4' as any },
    Swarm: { monsterSpecial: 'swarm-elite', monsterSpecialDesc: '融合精英：虫群繁殖 + 虫母（受伤时替换地城牌为小虫子）。', swarmSpawn: true },
    Golem: { monsterSpecial: 'golem-elite', monsterSpecialDesc: '融合精英：岩石护体（每次最多受5伤）+ 反魔。', maxDamagePerHit: 5, antiMagicReflect: 2 },
  };

  const totalAtk = group.reduce((s, m) => s + (m.card.attack ?? m.card.value), 0);
  const totalHp = group.reduce((s, m) => s + (m.card.hp ?? m.card.value), 0);
  let rng = patch.rng ?? state.rng;
  let fuseId: string;
  [fuseId, rng] = nextId(rng, groupName === 'Skeleton' && group.length >= 3 ? 'fusion-skeleton-king' : 'fusion-elite-equip');
  patch.rng = rng;

  const cnName = raceNameMap[groupName] ?? groupName;
  const eliteProps = elitePropsMap[groupName] ?? { monsterSpecial: 'fusion-elite', monsterSpecialDesc: '融合精英：由两个同种怪物装备融合而成。' };
  const isSkelKing = groupName === 'Skeleton' && group.length >= 3;
  const fusedName = isSkelKing ? '骷髅王' : `精英${cnName}`;
  const fusedAtk = isSkelKing ? 10 : totalAtk;
  const fusedHp = isSkelKing ? 10 : totalHp;

  const fusedEquip: GameCardData = {
    id: fuseId,
    type: 'monster',
    name: fusedName,
    monsterType: groupName,
    value: fusedAtk,
    attack: fusedAtk,
    hp: fusedHp,
    maxHp: fusedHp,
    baseAttack: fusedAtk,
    baseHp: fusedHp,
    durability: 4,
    maxDurability: 4,
    image: group[0].card.image,
    description: `融合精英怪物装备（Lv3），由${group.length}个${cnName}装备融合而成。`,
    upgradeLevel: 3,
    ...eliteProps,
  } as GameCardData;

  if (isSkelKing) {
    fusedEquip.hasRevive = true;
    fusedEquip.weaponExtraAttack = 4;
    fusedEquip.equipBlockDurabilityBonus = 4;
  }

  enqueuedActions.push({ type: 'ADD_CARD_TO_HAND', card: fusedEquip } as GameAction);
  const fusionBanner = isSkelKing
    ? `${group.length} 个 Skeleton 装备融合为「骷髅王」（Lv3）！已加入手牌。`
    : `2 个 ${groupName} 装备融合为「精英${cnName}」（Lv3）！已加入手牌。`;
  banner(sideEffects, fusionBanner);
  log(sideEffects, 'magic', fusionBanner);
  patch.lastPlayedCardCategory = getCardPlayCategory(card);
  enqueuedActions.push({ type: 'FINALIZE_MAGIC_CARD', card, dealtDamage: false });
  return applyPatch(state, patch, sideEffects, enqueuedActions);
}

// ---------------------------------------------------------------------------
// resolveTransformGrant — grant transform bonus to a hand card
// ---------------------------------------------------------------------------

export function resolveTransformGrant(
  state: GameState,
  card: GameCardData,
  sideEffects: SideEffect[],
  patch: Partial<GameState>,
  enqueuedActions: GameAction[],
): ReduceResult {
  const eligible = state.handCards.filter(c => c.id !== card.id && !(c as any).transformBonus);
  if (eligible.length === 0) {
    banner(sideEffects, '蜕变赋灵：手牌中没有可赋予转型的卡牌。');
    patch.lastPlayedCardCategory = getCardPlayCategory(card);
    enqueuedActions.push({ type: 'FINALIZE_MAGIC_CARD', card, dealtDamage: false });
    return applyPatch(state, patch, sideEffects, enqueuedActions);
  }
  if (eligible.length === 1) {
    const target = eligible[0];
    patch.handCards = state.handCards.map(c =>
      c.id === target.id
        ? { ...c, transformBonus: '失去 3 点生命，随机获得坟场一张魔法卡', transformEffect: 'graveyard-random-magic' } as GameCardData
        : c,
    );
    log(sideEffects, 'magic', `蜕变赋灵：「${target.name}」获得转型效果！`);
    banner(sideEffects, `「${target.name}」获得转型：失去 3 点生命，随机获得坟场一张魔法卡！`);
    patch.lastPlayedCardCategory = getCardPlayCategory(card);
    enqueuedActions.push({ type: 'FINALIZE_MAGIC_CARD', card, dealtDamage: false });
    return applyPatch(state, patch, sideEffects, enqueuedActions);
  }
  patch.pendingMagicAction = { card, effect: 'transform-grant', step: 'perm-grant-select' } as any;
  sideEffects.push({ event: 'card:transformGrantModal' as any, payload: { card } });
  return applyPatch(state, patch, sideEffects);
}

// ---------------------------------------------------------------------------
// resolveStunWave — stun all monsters with sequential dice rolls
// ---------------------------------------------------------------------------

function resolveStunWave(
  state: GameState,
  card: GameCardData,
  sideEffects: SideEffect[],
  patch: Partial<GameState>,
  enqueuedActions: GameAction[],
): ReduceResult {
  enqueuedActions.push({ type: 'MODIFY_STUN_CAP', delta: 10 } as GameAction);
  log(sideEffects, 'magic', '震慑领域：击晕上限 +10%');

  const monsters = flattenActiveRowSlots(state.activeCards)
    .filter(c => c.type === 'monster' && !c.isStunned);

  if (monsters.length === 0) {
    const newCap = Math.min(100, (state.stunCap ?? 10) + 10);
    banner(sideEffects, `震慑领域：击晕上限 +10%（当前 ${newCap}%）。没有可击晕的怪物。`);
    patch.lastPlayedCardCategory = getCardPlayCategory(card);
    enqueuedActions.push({ type: 'FINALIZE_MAGIC_CARD', card, dealtDamage: false });
    return applyPatch(state, patch, sideEffects, enqueuedActions);
  }

  const currentStunCap = (state.stunCap ?? 10) + 10;
  const stunPct = Math.min(60, currentStunCap);
  const threshold = Math.round((stunPct / 100) * 20);

  if (threshold > 0) {
    let domainRoll: number;
    let domainRng: RngState;
    [domainRoll, domainRng] = nextInt(patch.rng ?? state.rng, 1, 20);
    patch.rng = domainRng;
    sideEffects.push({
      event: 'ui:requestDice' as any,
      payload: {
        title: monsters[0].name,
        subtitle: `震慑领域击晕判定（${stunPct}%）`,
        entries: [
          { id: 'stun', range: [1, threshold], label: '击晕成功！', effect: 'none' },
          { id: 'miss', range: [threshold + 1, 20], label: '未击晕', effect: 'none' },
        ],
        flowContext: {
          flowId: 'stun-domain',
          card,
          monsterIndex: 0,
          monsters: monsters.map(m => ({ id: m.id, name: m.name })),
          stunPct,
          threshold,
          stunResults: [] as string[],
        },
        predeterminedRoll: domainRoll,
      },
    });
  } else {
    banner(sideEffects, `震慑领域：击晕上限 +10%，但击晕率为 0%。`);
    patch.lastPlayedCardCategory = getCardPlayCategory(card);
    enqueuedActions.push({ type: 'FINALIZE_MAGIC_CARD', card, dealtDamage: false });
  }
  return applyPatch(state, patch, sideEffects, enqueuedActions);
}

// ---------------------------------------------------------------------------
// resolveGraveyardDiscoverEquipAmulet — discover equip/amulet from graveyard
// ---------------------------------------------------------------------------

export function resolveGraveyardDiscoverEquipAmulet(
  state: GameState,
  card: GameCardData,
  sideEffects: SideEffect[],
  patch: Partial<GameState>,
  enqueuedActions: GameAction[],
): ReduceResult {
  const eligible = (state.discardedCards ?? []).filter(
    (c: GameCardData) => c.type === 'weapon' || c.type === 'shield' || c.type === 'amulet',
  );
  if (eligible.length === 0) {
    banner(sideEffects, '坟场中没有装备或护符。');
    patch.lastPlayedCardCategory = getCardPlayCategory(card);
    enqueuedActions.push({ type: 'FINALIZE_MAGIC_CARD', card, dealtDamage: false });
    return applyPatch(state, patch, sideEffects, enqueuedActions);
  }
  let rng = patch.rng ?? state.rng;
  let shuffled: GameCardData[];
  [shuffled, rng] = rngShuffle(eligible, rng);
  patch.rng = rng;
  const candidates = shuffled.slice(0, Math.min(3, shuffled.length));

  patch.pendingMagicAction = {
    card,
    effect: 'graveyard-discover-equip-amulet',
    step: 'discover',
    data: { candidates },
  } as any;
  sideEffects.push({
    event: 'card:graveyardDiscoverEquipAmulet' as any,
    payload: { card, candidates },
  });
  return applyPatch(state, patch, sideEffects);
}

// ---------------------------------------------------------------------------
// resolveMonsterRecruit — randomly take up to 2 monster cards from graveyard
// into hand (no player choice, no replacement)
// ---------------------------------------------------------------------------

export function resolveMonsterRecruit(
  state: GameState,
  card: GameCardData,
  sideEffects: SideEffect[],
  patch: Partial<GameState>,
  enqueuedActions: GameAction[],
): ReduceResult {
  const monsters = (state.discardedCards ?? []).filter((c: GameCardData) => c.type === 'monster');
  if (monsters.length === 0) {
    banner(sideEffects, '坟场中没有怪物牌。');
    patch.lastPlayedCardCategory = getCardPlayCategory(card);
    enqueuedActions.push({ type: 'FINALIZE_MAGIC_CARD', card, dealtDamage: false });
    return applyPatch(state, patch, sideEffects, enqueuedActions);
  }

  let rng = patch.rng ?? state.rng;
  let shuffled: GameCardData[];
  [shuffled, rng] = rngShuffle(monsters, rng);
  patch.rng = rng;

  const taken = shuffled.slice(0, Math.min(2, shuffled.length));
  const takenIds = new Set(taken.map(c => c.id));

  patch.discardedCards = (state.discardedCards ?? []).filter((c: GameCardData) => !takenIds.has(c.id));
  patch.handCards = [
    ...state.handCards,
    ...taken.map(c => sanitizeCardMetadata(c)),
  ];

  banner(
    sideEffects,
    `亡者之契：从坟场召唤了「${taken.map(c => c.name).join('」「')}」加入手牌！`,
  );
  patch.lastPlayedCardCategory = getCardPlayCategory(card);
  enqueuedActions.push({ type: 'FINALIZE_MAGIC_CARD', card, dealtDamage: false });
  return applyPatch(state, patch, sideEffects, enqueuedActions);
}

// ---------------------------------------------------------------------------
// resolvePendingMagic — handle user choices for interactive effects
// ---------------------------------------------------------------------------

export function resolvePendingMagic(
  state: GameState,
  action: GameAction,
): ReduceResult | null {
  if (action.type !== 'RESOLVE_EQUIPMENT_CHOICE' && action.type !== 'RESOLVE_MAGIC_CHOICE') {
    return null;
  }

  const pending = state.pendingMagicAction;
  if (!pending) return null;

  const sideEffects: SideEffect[] = [];
  const patch: Partial<GameState> = {};
  const enqueuedActions: GameAction[] = [];

  const pendingAny = pending as any;
  const effect = pendingAny.effect as string;
  const card = pendingAny.card as GameCardData;

  // --- Slot selection effects ---
  if (action.type === 'RESOLVE_EQUIPMENT_CHOICE') {
    const slotId = action.slotId as EquipmentSlotId;

    switch (effect) {
      case 'weapon-burst': {
        const echoMul = pendingAny.echoMultiplier ?? 1;
        const burstBase = 2 + 2 * (card.upgradeLevel ?? 0);
        const burstAmount = burstBase * echoMul;
        const newTempAttack = { ...(state.slotTempAttack ?? {}), [slotId]: ((state.slotTempAttack ?? {})[slotId] ?? 0) + burstAmount };
        patch.slotTempAttack = newTempAttack;
        log(sideEffects, 'magic', `武器爆发：${slotId === 'equipmentSlot1' ? '左' : '右'}装备栏临时攻击 +${burstAmount}`);
        banner(sideEffects, `武器爆发：临时攻击 +${burstAmount}！`);
        patch.pendingMagicAction = null;
        patch.heroSkillBanner = null;
        patch.lastPlayedCardCategory = getCardPlayCategory(card);
        enqueuedActions.push({ type: 'FINALIZE_MAGIC_CARD', card, dealtDamage: false });
        return applyPatch(state, patch, sideEffects, enqueuedActions);
      }

      case 'temp-armor': {
        const armorAmounts = [2, 3, 4];
        const armorAmt = armorAmounts[card.upgradeLevel ?? 0] ?? 2;
        const newTempArmor = { ...(state.slotTempArmor ?? {}), [slotId]: ((state.slotTempArmor ?? {})[slotId] ?? 0) + armorAmt };
        patch.slotTempArmor = newTempArmor;
        log(sideEffects, 'magic', `临时护甲：${slotId === 'equipmentSlot1' ? '左' : '右'}装备栏 +${armorAmt}`);
        banner(sideEffects, `临时护甲 +${armorAmt}！`);
        patch.pendingMagicAction = null;
        patch.heroSkillBanner = null;
        patch.lastPlayedCardCategory = getCardPlayCategory(card);
        enqueuedActions.push({ type: 'FINALIZE_MAGIC_CARD', card, dealtDamage: false });
        return applyPatch(state, patch, sideEffects, enqueuedActions);
      }

      case 'repair-one': {
        const echoMul = pendingAny.echoMultiplier ?? 1;
        const repairBaseAmt = (card.upgradeLevel ?? 0) >= 1 ? 2 : 1;
        const repairAmount = repairBaseAmt * echoMul;
        const slotItem = state[slotId] as GameCardData | null;
        if (slotItem) {
          const maxDur = slotItem.maxDurability ?? slotItem.durability ?? 0;
          const curDur = slotItem.durability ?? maxDur;
          (patch as any)[slotId] = { ...slotItem, durability: Math.min(maxDur, curDur + repairAmount) };
          banner(sideEffects, `${slotItem.name} 恢复了 ${repairAmount} 点耐久。`);
        }
        patch.pendingMagicAction = null;
        patch.heroSkillBanner = null;
        patch.lastPlayedCardCategory = getCardPlayCategory(card);
        enqueuedActions.push({ type: 'FINALIZE_MAGIC_CARD', card, dealtDamage: false });
        return applyPatch(state, patch, sideEffects, enqueuedActions);
      }

      case 'grant-revive': {
        const slotItem = state[slotId] as GameCardData | null;
        if (slotItem) {
          (patch as any)[slotId] = { ...slotItem, hasEquipmentRevive: true, equipmentReviveUsed: false };
          banner(sideEffects, `${slotItem.name} 获得了不灭赐福！失去 2 生命。`);
          log(sideEffects, 'magic', `不灭赐福：${slotItem.name} 获得复生能力，失去 2 生命`);
          enqueuedActions.push({ type: 'APPLY_DAMAGE', amount: 2, source: 'undying-blessing', selfInflicted: true });
        }
        patch.pendingMagicAction = null;
        patch.heroSkillBanner = null;
        patch.lastPlayedCardCategory = getCardPlayCategory(card);
        enqueuedActions.push({ type: 'FINALIZE_MAGIC_CARD', card, dealtDamage: false });
        return applyPatch(state, patch, sideEffects, enqueuedActions);
      }


      case 'crypt-deathwish':
        return applyCryptDeathwish(state, card, slotId, sideEffects, patch, enqueuedActions);

      default:
        break;
    }
  }

  // --- Magic choice effects ---
  if (action.type === 'RESOLVE_MAGIC_CHOICE') {
    const choiceId = action.choiceId as string;

    switch (effect) {
      case 'bulwark-choice': {
        if (choiceId === 'waterfall-armor') {
          const newStacks = (state.bulwarkPassiveActive ?? 0) + 1;
          patch.bulwarkPassiveActive = newStacks;
          if (!hasEternalRelic(state.eternalRelics ?? [], 'bulwark-attack')) {
            patch.eternalRelics = [...(state.eternalRelics ?? []), getEternalRelic('bulwark-attack')];
          }
          const stackLabel = newStacks > 1 ? `（×${newStacks}层）` : '';
          const tempGain = 2 * newStacks;
          log(sideEffects, 'magic', `获得永恒护符·瀑流铸剑${stackLabel}：之后每次攻击，该装备栏临时攻击 +${tempGain}`);
          banner(sideEffects, `获得永恒护符·瀑流铸剑${stackLabel}！每次攻击，该装备栏临时攻击 +${tempGain}。`);
        } else {
          const newStacks = (state.bulwarkTempArmorStacks ?? 0) + 1;
          patch.bulwarkTempArmorStacks = newStacks;
          if (!hasEternalRelic(state.eternalRelics ?? [], 'bulwark-armor')) {
            patch.eternalRelics = [...(state.eternalRelics ?? []), getEternalRelic('bulwark-armor')];
          }
          const stackLabel = newStacks > 1 ? `（×${newStacks}层）` : '';
          const tempGain = 2 * newStacks;
          log(sideEffects, 'magic', `获得永恒护符·格挡铸甲${stackLabel}：之后每次格挡，该装备栏临时护甲 +${tempGain}`);
          banner(sideEffects, `获得永恒护符·格挡铸甲${stackLabel}！每次格挡，该装备栏临时护甲 +${tempGain}。`);
        }
        patch.pendingMagicAction = null;
        patch.heroSkillBanner = null;
        patch.lastPlayedCardCategory = getCardPlayCategory(card);
        enqueuedActions.push({ type: 'FINALIZE_MAGIC_CARD', card, dealtDamage: false });
        return applyPatch(state, patch, sideEffects, enqueuedActions);
      }

      case 'recall-equipment': {
        const data = pendingAny.data ?? {};
        const hpCost = data.hpCost ?? 2;
        const options = data.options ?? [];
        const chosen = options.find((o: any) => o.id === choiceId) ?? options[0];
        if (!chosen) break;

        if (chosen.slotType === 'equipment') {
          const sid = chosen.id as 'equipmentSlot1' | 'equipmentSlot2';
          const slotItem = state[sid] as GameCardData | null;
          if (slotItem) {
            (patch as any)[sid] = null;
            patch.handCards = [...state.handCards, sanitizeCardMetadata(slotItem)];
          }
        } else if (chosen.slotType === 'amulet') {
          const amuletSlots = state.amuletSlots ?? [];
          const topAmulet = amuletSlots[amuletSlots.length - 1] as GameCardData | undefined;
          if (topAmulet) {
            (patch as any).amuletSlots = amuletSlots.slice(0, -1);
            patch.handCards = [...state.handCards, sanitizeCardMetadata(topAmulet)];
          }
        }
        enqueuedActions.push({ type: 'DRAW_FROM_BACKPACK', count: 1 } as GameAction);
        const itemName = chosen.label?.split(' — ')[1] ?? '装备';
        banner(sideEffects, `紧急回收：失去 ${hpCost} HP，${itemName} 已回到手牌！`);
        log(sideEffects, 'magic', `紧急回收：失去 ${hpCost} HP，${itemName} 回到手牌`);
        patch.pendingMagicAction = null;
        patch.heroSkillBanner = null;
        patch.lastPlayedCardCategory = getCardPlayCategory(card);
        enqueuedActions.push({ type: 'FINALIZE_MAGIC_CARD', card, dealtDamage: false });
        return applyPatch(state, patch, sideEffects, enqueuedActions);
      }

      case 'graveyard-discover-equip-amulet': {
        const data = pendingAny.data ?? {};
        const candidates = (data.candidates ?? []) as GameCardData[];
        const selected = candidates.find(c => c.id === choiceId);
        if (selected) {
          patch.discardedCards = (state.discardedCards ?? []).filter((c: GameCardData) => c.id !== selected.id);
          patch.handCards = [...state.handCards, sanitizeCardMetadata(selected)];
          log(sideEffects, 'magic', `破印遗物：从坟场发现了「${selected.name}」`);
          banner(sideEffects, `从坟场带回了「${selected.name}」！`);
        } else {
          banner(sideEffects, '未选择卡牌。');
        }
        patch.pendingMagicAction = null;
        patch.heroSkillBanner = null;
        patch.lastPlayedCardCategory = getCardPlayCategory(card);
        enqueuedActions.push({ type: 'FINALIZE_MAGIC_CARD', card, dealtDamage: false });
        return applyPatch(state, patch, sideEffects, enqueuedActions);
      }

      default:
        break;
    }
  }

  // For unhandled pending actions, delegate to UI
  sideEffects.push({ event: 'card:magicResolved', payload: { card } });
  return applyPatch(state, patch, sideEffects);
}
