/**
 * Magic Card Definitions — registers ALL magic effects with the card-schema registry.
 *
 * Each effectId maps to either:
 *   - A `resolver` function (for complex effects — delegates to the existing
 *     pure resolvers in rules/magic-effects.ts)
 *   - A declarative `effects` pipeline (for simple effects in the future)
 *
 * The engine's `executeMagicCardEffects` handles pre-processing (curse, counter,
 * echo) before looking up and invoking the definition. Curses are handled
 * entirely by the engine and don't need definitions here.
 */

import { registerCards } from '../registry';
import type { CardDefinition } from '../types';
import type { GameState } from '../../types';
import type { GameAction } from '../../actions';
import type { ReduceResult, SideEffect } from '../../reducer';
import { applyPatch } from '../../reducer';
import type { GameCardData } from '@/components/GameCard';
import { cardHasPermFlag } from '@/components/GameCard';
import type { EquipmentSlotId } from '@/components/game-board/types';
import type { ActiveRowSlots } from '@/components/game-board/types';
import {
  flattenActiveRowSlots,
  isDamageableTarget,
  sanitizeCardMetadata,
  getCardPlayCategory,
  isDamageMagic,
  applyAmplifyOnCreate,
} from '../../helpers';
import { createGreedCurseCard } from '@/lib/knightDeck';
import {
  drawFromBackpackToHandPure,
  drawMultipleFromBackpack,
  addCardToBackpackPure,
  getEffectiveHandLimit,
  getEffectiveBackpackCapacity,
} from '../../cards';
import { nextInt, pickRandom, nextBool, shuffle as rngShuffle, nextId } from '../../rng';
import { INITIAL_HP, PERSUADE_COST, MIN_PERSUADE_COST } from '../../constants';
import { computeAmuletEffects } from '../../equipment';
import { chaosStrikeHasOverkill } from '../../combat';
import { STARTER_CARD_IDS, skillScrollImage, createMagicBoltCard } from '../../deck';

import {
  getSpellDamage,
  computeMaxHp,
  log,
  banner,
  mergePatch,
  getRepairableSlots,
  getEquippedSlots,
  // Dedicated resolver functions
  resolveHeroMagicCard,
  resolveHonorBlood,
  resolveStormVolley,
  resolveFountainHand,
  resolveEmberEcho,
  resolveBloodReckoning,
  resolveSoulSwap,
  resolvePermGrant,
  resolveStripPermHand,
  resolveStormVolleyRecycle,
  resolveArcaneStorm,
  resolveAmplifyTarget,
  resolveChaosStrike,
  resolveOverkillUpgrade,
  resolveRepairOne,
  resolveStunStrike,
  resolveScalingDamage,
  // Routing resolvers for knight effects
  resolveKnightPermanentMagic,
  resolveMonsterFusion,
  resolveTransformGrant,
  resolveGraveyardDiscoverEquipAmulet,
  resolveMonsterRecruit,
  checkSwapUpgrade,
  applyMissileRelicEffects,
  requestOrAutoHandDiscard,
  finalizeAltarDiscardDiscover,
} from '../../rules/magic-effects';

// ============================================================================
// Hero Magic
// ============================================================================

const heroMagicGeneric: CardDefinition = {
  effectId: 'hero-magic:generic',
  effects: [],
  tags: ['hero-magic', 'interactive'],
  resolver: (state, card, sideEffects, patch, enqueuedActions) => {
    return resolveHeroMagicCard(state, card, sideEffects, patch, enqueuedActions);
  },
};

// ============================================================================
// Pre-routing magicEffects (checked before instant/permanent split)
// ============================================================================

const honorBlood: CardDefinition = {
  effectId: 'magic:honor-blood',
  effects: [],
  tags: ['magic', 'self-damage', 'repair'],
  resolver: resolveHonorBlood,
};

const activeRowDebuff: CardDefinition = {
  effectId: 'magic:active-row-monster-attack-debuff',
  effects: [],
  tags: ['magic', 'debuff'],
  resolver: (state, card, sideEffects, patch, enqueuedActions, echoMultiplier, isEchoTriggered) => {
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
  },
};

// 翻覆震慑 — Instant magic. Player picks a monster; sets state.flipDebuffMonsterId.
// On every subsequent APPLY_CARD_FLIP until next waterfall, that monster -1 attack.
// 0 valid monsters → no-op (still consumed).
// 1 valid → auto-resolve. 2+ → pendingMagicAction monster-select.
const flipMonsterDebuff: CardDefinition = {
  effectId: 'magic:flip-monster-debuff',
  effects: [],
  tags: ['magic', 'instant', 'debuff', 'interactive'],
  resolver: (state, card, sideEffects, patch, enqueuedActions, echoMultiplier) => {
    const monsters = (state.activeCards as (GameCardData | null)[]).filter(
      (c): c is GameCardData => Boolean(c && c.type === 'monster'),
    );
    if (monsters.length === 0) {
      log(sideEffects, 'magic', `${card.name}：激活行没有怪物。`);
      banner(sideEffects, `${card.name}：激活行没有怪物。`);
      patch.lastPlayedCardCategory = getCardPlayCategory(card);
      enqueuedActions.push({ type: 'FINALIZE_MAGIC_CARD', card, dealtDamage: false });
      return applyPatch(state, patch, sideEffects, enqueuedActions);
    }
    if (monsters.length === 1) {
      const target = monsters[0];
      patch.flipDebuffMonsterId = target.id;
      log(sideEffects, 'magic', `${card.name}：${target.name} 进入震慑（每翻转一张牌 -1 攻击，至下次瀑流）。`);
      banner(sideEffects, `${card.name}：${target.name} 进入震慑！`);
      patch.lastPlayedCardCategory = getCardPlayCategory(card);
      enqueuedActions.push({ type: 'FINALIZE_MAGIC_CARD', card, dealtDamage: false });
      return applyPatch(state, patch, sideEffects, enqueuedActions);
    }
    const echoLabel = (echoMultiplier ?? 1) > 1 ? `（回响：第 1/${echoMultiplier} 次）` : '';
    patch.pendingMagicAction = {
      card,
      effect: 'flip-monster-debuff',
      step: 'monster-select',
      prompt: `${card.name}：选择一个怪物，到下次瀑流前每翻转一张牌该怪物攻击力 -1。${echoLabel}`,
      echoRemaining: echoMultiplier,
    } as any;
    patch.heroSkillBanner = `${card.name}：选择一个怪物。${echoLabel}`;
    return applyPatch(state, patch, sideEffects);
  },
};

// ============================================================================
// Instant Magic Effects (by magicEffect)
// ============================================================================

const amplifyCard: CardDefinition = {
  effectId: 'magic:amplify-card',
  effects: [],
  tags: ['magic', 'instant', 'interactive', 'buff'],
  resolver: (state, card, sideEffects, patch, enqueuedActions, echoMultiplier, isEchoTriggered) => {
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
    const echoLabel = isEchoTriggered ? `（回响：第 1/${echoMultiplier} 次）` : '';
    patch.amplifyModal = { sourceCardId: card.id };
    patch.pendingMagicAction = {
      card,
      effect: 'amplify-card',
      step: 'modal-select',
      prompt: `增幅：选择一张牌进行增幅。${echoLabel}`,
      echoRemaining: echoMultiplier,
    } as any;
    patch.heroSkillBanner = `增幅：选择一张牌进行增幅。${echoLabel}`;
    return applyPatch(state, patch, sideEffects);
  },
};

const altarDiscardDiscover: CardDefinition = {
  effectId: 'magic:altar-discard-discover',
  effects: [],
  tags: ['magic', 'instant', 'interactive', 'discard'],
  resolver: (state, card, sideEffects, patch, enqueuedActions) => {
    // 走「玩家选择 / 自动随机」分流。可弃手牌（去诅咒/源卡牌）≥ 2 时弹窗，
    // 不足 2 张则把全部可弃手牌随机自动弃掉（也可能 0 张），随后立刻进入发现阶段。
    const promptText = '选择 2 张手牌弃回坟场（之后从职业魔法堆中发现 1 张）。';
    const result = requestOrAutoHandDiscard(state, patch, {
      sourceCardId: card.id,
      requiredCount: 2,
      title: '祭坛秘术',
      prompt: promptText,
      subEffect: 'altar-discover',
      context: { kind: 'altar-discover', cardSnapshot: card },
    });
    if (result.mode === 'modal') {
      banner(sideEffects, promptText);
      return applyPatch(state, patch, sideEffects, enqueuedActions);
    }
    return finalizeAltarDiscardDiscover(state, card, result.discarded, sideEffects, patch, enqueuedActions);
  },
};

// ============================================================================
// Instant Magic Effects (by card.name)
// ============================================================================

// 瀑流重置 — clear all non-ghost active-row cards (including stacks) to the
// bottom of the dungeon deck (preserving deck order). Ghost slots stay put.
// `postProcessActiveCards` auto-emits `waterfall:planReady` once the row is
// emptied so the UI animates the waterfall as usual.
//
// The card has no proper `magicEffect` routing key (the field holds a long
// description string), so it resolves via the `card:{name}` fallback in
// `getCardDefinition`. Without this resolver the card fell through to the
// "delegate to UI" branch which never enqueued FINALIZE_MAGIC_CARD, leaving
// the play state stuck mid-resolution.
const cascadeReset: CardDefinition = {
  effectId: 'card:瀑流重置',
  effects: [],
  tags: ['magic', 'instant', 'waterfall', 'deck-manipulation'],
  resolver: (state, card, sideEffects, patch, enqueuedActions, echoMultiplier) => {
    const activeCards = state.activeCards as (GameCardData | null)[];
    const activeStacks = state.activeCardStacks ?? {};

    // Walk every column. Ghost top cards stay in place (with their stack
    // intact); every other top card and every stacked card under it is
    // collected for the deck-bottom batch.
    const collected: GameCardData[] = [];
    const newActive: (GameCardData | null)[] = [...activeCards];
    const newStacks: Record<number, GameCardData[]> = {};

    for (let col = 0; col < activeCards.length; col++) {
      const top = activeCards[col];
      const stack = activeStacks[col] ?? [];

      if (top?.isGhost) {
        if (stack.length > 0) newStacks[col] = stack;
        continue;
      }

      if (top) {
        collected.push(top);
        newActive[col] = null;
      }
      // Preserve stack order so the bottom of each stack lands first in the
      // deck-bottom batch (matches the visual top→bottom layering).
      for (const stackedCard of stack) {
        if (!stackedCard.isGhost) collected.push(stackedCard);
      }
    }

    if (collected.length === 0) {
      banner(sideEffects, '瀑流重置：激活行没有可回收的卡牌。');
      log(sideEffects, 'magic', '瀑流重置：激活行无可回收的卡牌。');
      patch.lastPlayedCardCategory = getCardPlayCategory(card);
      enqueuedActions.push({ type: 'FINALIZE_MAGIC_CARD', card, dealtDamage: false });
      return applyPatch(state, patch, sideEffects, enqueuedActions);
    }

    patch.activeCards = newActive as ActiveRowSlots;
    patch.activeCardStacks = newStacks;
    patch.remainingDeck = [...(state.remainingDeck as GameCardData[]), ...collected];

    const echoTag = (echoMultiplier ?? 1) > 1
      ? `（回响×${echoMultiplier}：第二次激活行已为空，无额外效果）`
      : '';
    log(sideEffects, 'magic', `瀑流重置：${collected.length} 张卡牌置于牌堆底，触发瀑流。${echoTag}`);
    banner(sideEffects, `瀑流重置：${collected.length} 张卡牌置于牌堆底！${echoTag}`);

    patch.lastPlayedCardCategory = getCardPlayCategory(card);
    enqueuedActions.push({ type: 'FINALIZE_MAGIC_CARD', card, dealtDamage: false });
    return applyPatch(state, patch, sideEffects, enqueuedActions);
  },
};

const stormVolley: CardDefinition = {
  effectId: 'card:风暴箭雨',
  effects: [],
  tags: ['magic', 'instant', 'damage', 'aoe'],
  resolver: resolveStormVolley,
};

const fountainHand: CardDefinition = {
  effectId: 'card:涌泉满手',
  effects: [],
  tags: ['magic', 'instant', 'heal', 'draw'],
  resolver: (state, card, sideEffects, patch, enqueuedActions, echoMultiplier, isEchoTriggered) => {
    return resolveFountainHand(state, card, sideEffects, patch, enqueuedActions, echoMultiplier, isEchoTriggered);
  },
};

const emberEcho: CardDefinition = {
  effectId: 'card:余烬回响',
  effects: [],
  tags: ['magic', 'instant', 'buff', 'draw'],
  resolver: resolveEmberEcho,
};

const healSpell: CardDefinition = {
  effectId: 'card:治愈术',
  effects: [],
  tags: ['magic', 'instant', 'heal'],
  resolver: (state, card, sideEffects, patch, enqueuedActions, echoMultiplier, isEchoTriggered) => {
    const healAmounts = [5, 3, 5];
    const healBase = healAmounts[card.upgradeLevel ?? 0] ?? 5;
    const healAmt = healBase * echoMultiplier;
    const echoTag = isEchoTriggered ? '（回响×2）' : '';
    enqueuedActions.push({ type: 'HEAL', amount: healAmt, source: 'heal-magic' });
    log(sideEffects, 'magic', `治愈术：恢复 ${healAmt} 点生命`);
    banner(sideEffects, `治愈术：回复 ${healAmt} 点生命。${echoTag}`);
    patch.lastPlayedCardCategory = getCardPlayCategory(card);
    enqueuedActions.push({ type: 'FINALIZE_MAGIC_CARD', card, dealtDamage: false });
    return applyPatch(state, patch, sideEffects, enqueuedActions);
  },
};

const bloodReckoning: CardDefinition = {
  effectId: 'card:点金裁决',
  effects: [],
  tags: ['magic', 'instant', 'damage', 'interactive'],
  resolver: resolveBloodReckoning,
};

const soulSwap: CardDefinition = {
  effectId: 'card:等价交换',
  effects: [],
  tags: ['magic', 'instant', 'interactive'],
  resolver: (state, card, sideEffects, patch, enqueuedActions) => {
    return resolveSoulSwap(state, card, sideEffects, patch, enqueuedActions);
  },
};

const permGrant: CardDefinition = {
  effectId: 'card:永恒铭刻',
  effects: [],
  tags: ['magic', 'instant', 'interactive', 'buff'],
  resolver: (state, card, sideEffects, patch, enqueuedActions) => {
    return resolvePermGrant(state, card, sideEffects, patch, enqueuedActions);
  },
};

const upgradeScroll: CardDefinition = {
  effectId: 'card:升级卷轴',
  effects: [],
  tags: ['magic', 'instant', 'interactive', 'upgrade'],
  resolver: (state, card, sideEffects, patch, enqueuedActions) => {
    patch.upgradeModalOpen = true;
    banner(sideEffects, '升级卷轴：选择一张牌进行升级。');
    patch.lastPlayedCardCategory = getCardPlayCategory(card);
    enqueuedActions.push({ type: 'FINALIZE_MAGIC_CARD', card, dealtDamage: false });
    return applyPatch(state, patch, sideEffects, enqueuedActions);
  },
};

const arcaneRefine: CardDefinition = {
  effectId: 'card:秘法精炼',
  effects: [],
  tags: ['magic', 'instant', 'interactive', 'upgrade'],
  resolver: (state, card, sideEffects, patch, enqueuedActions) => {
    patch.handMagicUpgradeModal = { sourceCardId: card.id };
    banner(sideEffects, '秘法精炼：选择至多 2 张魔法牌进行升级。');
    patch.lastPlayedCardCategory = getCardPlayCategory(card);
    enqueuedActions.push({ type: 'FINALIZE_MAGIC_CARD', card, dealtDamage: false });
    return applyPatch(state, patch, sideEffects, enqueuedActions);
  },
};

const eventFortify: CardDefinition = {
  effectId: 'card:天机铸炼',
  effects: [],
  tags: ['magic', 'instant', 'interactive', 'equipment'],
  resolver: (state, card, sideEffects, patch, enqueuedActions, echoMultiplier) => {
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
      echoMultiplier,
    } as any;
    patch.heroSkillBanner = '天机铸炼：选择一件装备。';
    return applyPatch(state, patch, sideEffects);
  },
};

// ============================================================================
// Permanent Magic Effects (by magicEffect)
// ============================================================================

const doubleNextMagic: CardDefinition = {
  effectId: 'magic:double-next-magic',
  effects: [],
  tags: ['magic', 'permanent', 'buff'],
  resolver: (state, card, sideEffects, patch, enqueuedActions) => {
    patch.doubleNextMagic = true;
    log(sideEffects, 'magic', `${card.name}：下一张魔法牌效果翻倍！`);
    banner(sideEffects, '法术回响已激活！下一张法术的效果将触发两次。');
    patch.lastPlayedCardCategory = getCardPlayCategory(card);
    enqueuedActions.push({ type: 'FINALIZE_MAGIC_CARD', card, dealtDamage: false });
    return applyPatch(state, patch, sideEffects, enqueuedActions);
  },
};

const swapBackpackRecycle: CardDefinition = {
  effectId: 'magic:swap-backpack-recycle',
  effects: [],
  tags: ['magic', 'permanent'],
  resolver: (state, card, sideEffects, patch, enqueuedActions) => {
    patch.backpackItems = state.permanentMagicRecycleBag.map(c => sanitizeCardMetadata(c));
    patch.permanentMagicRecycleBag = state.backpackItems.map((c: GameCardData) => sanitizeCardMetadata(c));
    log(sideEffects, 'magic', `虚空置换：背包与回收袋对换（背包现 ${patch.backpackItems.length} 张，回收袋现 ${patch.permanentMagicRecycleBag.length} 张）。`);
    banner(sideEffects, '虚空置换：背包与永久魔法回收袋内容已对换。');
    enqueuedActions.push({ type: 'ENFORCE_BACKPACK_CAPACITY' });
    patch.lastPlayedCardCategory = getCardPlayCategory(card);
    enqueuedActions.push({ type: 'FINALIZE_MAGIC_CARD', card, dealtDamage: false });
    return applyPatch(state, patch, sideEffects, enqueuedActions);
  },
};

const guildHandRecycle: CardDefinition = {
  effectId: 'magic:guild-hand-recycle',
  effects: [],
  tags: ['magic', 'permanent', 'draw'],
  resolver: (state, card, sideEffects, patch, enqueuedActions) => {
    // Curses cannot be recycled — they remain in hand untouched.
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
  },
};

const guildRecycleReshuffle: CardDefinition = {
  effectId: 'magic:guild-recycle-reshuffle',
  effects: [],
  tags: ['magic', 'permanent', 'draw'],
  resolver: (state, card, sideEffects, patch, enqueuedActions) => {
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
  },
};

const crossroadsLeftSwap: CardDefinition = {
  effectId: 'magic:crossroads-left-swap',
  effects: [],
  tags: ['magic', 'instant'],
  resolver: (state, card, sideEffects, patch, enqueuedActions, echoMultiplier, isEchoTriggered) => {
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
    const echoTag = isEchoTriggered ? '（回响×2）' : '';
    const bannerText = echoMultiplier > 1
      ? `命运挪移 ×${echoMultiplier}：${firstCard.name} ↔ ${secondCard.name}（回响）`
      : `命运挪移：${firstCard.name} ↔ ${secondCard.name} 位置互换！`;
    log(sideEffects, 'magic', `命运挪移：${firstCard.name} 与 ${secondCard.name} 互换 ${echoMultiplier} 次。`);
    banner(sideEffects, bannerText);
    checkSwapUpgrade(state, patch, sideEffects, enqueuedActions);
    patch.lastPlayedCardCategory = getCardPlayCategory(card);
    enqueuedActions.push({ type: 'FINALIZE_MAGIC_CARD', card, dealtDamage: false });
    return applyPatch(state, patch, sideEffects, enqueuedActions);
  },
};

const persuadeBoostDraw: CardDefinition = {
  effectId: 'magic:persuade-boost-draw',
  effects: [],
  tags: ['magic', 'permanent', 'buff', 'draw'],
  resolver: (state, card, sideEffects, patch, enqueuedActions, echoMultiplier, isEchoTriggered) => {
    const echoTag = isEchoTriggered ? '（回响×2）' : '';
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
  },
};

const bountySpellDamage: CardDefinition = {
  effectId: 'magic:bounty-spell-damage',
  effects: [],
  tags: ['magic', 'permanent', 'damage', 'gold'],
  resolver: (state, card, sideEffects, patch, enqueuedActions, echoMultiplier, isEchoTriggered) => {
    const echoTag = isEchoTriggered ? '（回响×2）' : '';
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
  },
};

const arcaneShieldStunCap: CardDefinition = {
  effectId: 'magic:arcane-shield-stun-cap',
  effects: [],
  tags: ['magic', 'permanent', 'buff'],
  resolver: (state, card, sideEffects, patch, enqueuedActions, echoMultiplier, isEchoTriggered) => {
    const echoTag = isEchoTriggered ? '（回响×2）' : '';
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
  },
};

const stormVolleyRecycle: CardDefinition = {
  effectId: 'magic:storm-volley-recycle',
  effects: [],
  tags: ['magic', 'permanent', 'damage', 'draw'],
  resolver: resolveStormVolleyRecycle,
};

const arcaneStormMagicCount: CardDefinition = {
  effectId: 'magic:arcane-storm-magic-count',
  effects: [],
  tags: ['magic', 'permanent', 'damage'],
  resolver: resolveArcaneStorm,
};

const equipmentEnchantDiscard: CardDefinition = {
  effectId: 'magic:equipment-enchant-discard',
  effects: [],
  tags: ['magic', 'instant', 'interactive'],
  resolver: (state, card, sideEffects, patch, enqueuedActions, echoMultiplier) => {
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
    patch.pendingMagicAction = { card, effect: 'equipment-enchant-discard', step: 'perm-grant-select', echoRemaining: echoMultiplier } as any;
    patch.heroSkillBanner = '选择一张手牌中的装备进行附魔。';
    return applyPatch(state, patch, sideEffects);
  },
};

const amplifyTarget: CardDefinition = {
  effectId: 'magic:amplify-target',
  effects: [],
  tags: ['magic', 'permanent', 'buff'],
  resolver: (state, card, sideEffects, patch, enqueuedActions, echoMultiplier, isEchoTriggered) => {
    return resolveAmplifyTarget(state, card, sideEffects, patch, enqueuedActions, echoMultiplier, isEchoTriggered);
  },
};

const altarDiscoverClassMagic: CardDefinition = {
  effectId: 'magic:altar-discover-class-magic',
  effects: [],
  tags: ['magic', 'permanent', 'interactive'],
  resolver: (state, card, sideEffects, patch, enqueuedActions) => {
    sideEffects.push({ event: 'card:magicResolved', payload: { card } });
    patch.lastPlayedCardCategory = getCardPlayCategory(card);
    enqueuedActions.push({ type: 'FINALIZE_MAGIC_CARD', card, dealtDamage: false });
    return applyPatch(state, patch, sideEffects, enqueuedActions);
  },
};

const equalizeAttackArmor: CardDefinition = {
  effectId: 'magic:equalize-temp-attack-armor',
  effects: [],
  tags: ['magic', 'permanent', 'interactive', 'buff'],
  resolver: (state, card, sideEffects, patch, enqueuedActions, echoMultiplier) => {
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
      echoMultiplier,
    } as any;
    patch.heroSkillBanner = '时空镜像：选择一个装备栏。';
    return applyPatch(state, patch, sideEffects);
  },
};

const cryptDeathwish: CardDefinition = {
  effectId: 'magic:crypt-deathwish',
  effects: [],
  tags: ['magic', 'instant', 'interactive'],
  resolver: (state, card, sideEffects, patch) => {
    sideEffects.push({ event: 'card:magicResolved', payload: { card } });
    return applyPatch(state, patch, sideEffects);
  },
};

// 兵器谱：选择一个装备栏，本回合该装备栏攻击次数 +2（即使该栏为空也会保留到装备进入栏后生效，与全局 extraAttackCharges 独立）。
const weaponManual: CardDefinition = {
  effectId: 'magic:weapon-manual',
  effects: [],
  tags: ['magic', 'instant', 'interactive', 'buff'],
  resolver: (state, card, sideEffects, patch, _enqueuedActions, echoMultiplier) => {
    const bonus = 2 * echoMultiplier;
    patch.pendingMagicAction = {
      card,
      effect: 'weapon-manual',
      step: 'slot-select',
      prompt: `选择一个装备栏，本回合该装备栏攻击次数 +${bonus}。`,
      echoMultiplier,
    } as any;
    patch.heroSkillBanner = `兵器谱：选择一个装备栏，本回合攻击次数 +${bonus}。`;
    return applyPatch(state, patch, sideEffects);
  },
};

// ============================================================================
// Permanent Magic Effects (by card.name)
// ============================================================================

const chaosStrikeDef: CardDefinition = {
  effectId: 'card:混沌冲击',
  effects: [],
  tags: ['magic', 'permanent', 'damage'],
  resolver: resolveChaosStrike,
};

const overkillUpgradeDef: CardDefinition = {
  effectId: 'card:淬炼冲击',
  effects: [],
  tags: ['magic', 'permanent', 'damage', 'upgrade'],
  resolver: resolveOverkillUpgrade,
};

const dimensionWarpName: CardDefinition = {
  effectId: 'card:维度扭曲',
  effects: [],
  tags: ['magic', 'permanent', 'interactive'],
  resolver: (state, card, sideEffects, patch, enqueuedActions, echoMultiplier) => {
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
      echoRemaining: echoMultiplier,
    } as any;
    patch.heroSkillBanner = '选择地城行一张卡牌，与正上方预览行卡牌互换。';
    return applyPatch(state, patch, sideEffects);
  },
};

const goblinTrick: CardDefinition = {
  effectId: 'card:哥布林的戏法',
  effects: [],
  tags: ['magic', 'permanent', 'draw'],
  resolver: (state, card, sideEffects, patch, enqueuedActions, echoMultiplier) => {
    // Curses cannot leave hand via forced shuffle effects.
    const otherHandCards = state.handCards.filter(c => c.id !== card.id && c.type !== 'curse');
    const count = otherHandCards.length;
    if (count === 0) {
      banner(sideEffects, '手中没有其他牌可以刷新。');
      patch.lastPlayedCardCategory = getCardPlayCategory(card);
      enqueuedActions.push({ type: 'FINALIZE_MAGIC_CARD', card, dealtDamage: false });
      return applyPatch(state, patch, sideEffects, enqueuedActions);
    }

    // Phase 1: hand → backpack. Move the other hand cards into the backpack
    // immediately so the hand visually empties. The drawn cards stay parked
    // in the backpack until phase 2 (`GOBLIN_TRICK_DELIVER`) so that the
    // backpack→hand flight has real source positions to fly from.
    const movedIds = new Set(otherHandCards.map(c => c.id));
    patch.handCards = state.handCards.filter(c => !movedIds.has(c.id));

    // Wash the moved cards into the backpack, then shuffle the *entire* backpack
    // with the seeded RNG so that the resulting order is genuinely randomized
    // (not just the unmoved tail of the previous order). The first `count`
    // entries of the shuffled backpack become the drawn cards — equivalent to
    // "shuffle, then deal off the top".
    const combinedBackpack = [...state.backpackItems, ...otherHandCards];
    const [shuffledBackpack, rng] = rngShuffle(combinedBackpack, state.rng);
    const drawCardIds = shuffledBackpack.slice(0, count).map(c => c.id);
    patch.rng = rng;
    patch.backpackItems = shuffledBackpack;

    const echoTag = (echoMultiplier ?? 1) > 1
      ? `（回响×${echoMultiplier}：手牌已重洗，二次结算无额外效果）`
      : '';
    log(sideEffects, 'magic', `哥布林的戏法：${count} 张手牌洗入背包，将抽 ${drawCardIds.length} 张新牌。${echoTag}`);
    banner(sideEffects, `哥布林的戏法：刷新 ${count} 张手牌中…${echoTag}`);
    patch.lastPlayedCardCategory = getCardPlayCategory(card);

    // Hand off to the UI hook for animation sequencing. The hook listens for
    // `card:goblinTrickShuffled`, awaits the hand→backpack discard flights,
    // then dispatches `GOBLIN_TRICK_DELIVER` with `drawCardIds`.
    sideEffects.push({
      event: 'card:goblinTrickShuffled',
      payload: { shuffledCards: otherHandCards, drawCardIds },
    });

    enqueuedActions.push({ type: 'FINALIZE_MAGIC_CARD', card, dealtDamage: false });
    return applyPatch(state, patch, sideEffects, enqueuedActions);
  },
};

// ============================================================================
// Scaling Damage (permanent magic with scalingDamage field)
// ============================================================================

const scalingDamageDef: CardDefinition = {
  effectId: 'magic:scaling-damage',
  effects: [],
  tags: ['magic', 'permanent', 'damage'],
  resolver: resolveScalingDamage,
};

// ============================================================================
// Starter Card Effects
// ============================================================================

const starterWeaponBurst: CardDefinition = {
  effectId: `starter:${STARTER_CARD_IDS.weaponBurst}`,
  effects: [],
  tags: ['magic', 'permanent', 'interactive', 'buff'],
  resolver: (state, card, sideEffects, patch, enqueuedActions, echoMultiplier) => {
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
  },
};

const starterRepairOne: CardDefinition = {
  effectId: `starter:${STARTER_CARD_IDS.repairOne}`,
  effects: [],
  tags: ['magic', 'permanent', 'repair'],
  resolver: resolveRepairOne,
};

const starterTempArmor: CardDefinition = {
  effectId: `starter:${STARTER_CARD_IDS.tempArmor}`,
  effects: [],
  tags: ['magic', 'permanent', 'interactive', 'defense'],
  resolver: (state, card, sideEffects, patch, _enqueuedActions, echoMultiplier) => {
    // Note: actual armor amount is computed in the reducer (rules/hero.ts case 'temp-armor')
    // from card.upgradeLevel. We forward `echoMultiplier` via pendingMagicAction so the
    // reducer can multiply the bonus when this card was triggered by Spell Echo.
    const armorAmounts = [2, 4, 6];
    const armorBase = armorAmounts[card.upgradeLevel ?? 0] ?? 2;
    const armorAmt = armorBase * echoMultiplier;
    const echoLabel = echoMultiplier > 1 ? `（回响×${echoMultiplier}）` : '';
    patch.pendingMagicAction = {
      card,
      effect: 'temp-armor',
      step: 'slot-select',
      prompt: `选择一个装备栏，+${armorAmt} 临时护甲。${echoLabel}`,
      echoRemaining: echoMultiplier,
    } as any;
    patch.heroSkillBanner = `选择一个装备栏，+${armorAmt} 临时护甲。${echoLabel}`;
    return applyPatch(state, patch, sideEffects);
  },
};

const starterHealMagic: CardDefinition = {
  effectId: `starter:${STARTER_CARD_IDS.healMagic}`,
  effects: [],
  tags: ['magic', 'instant', 'heal'],
  resolver: (state, card, sideEffects, patch, enqueuedActions, echoMultiplier, isEchoTriggered) => {
    const healAmounts = [5, 3, 5];
    const healBase = healAmounts[card.upgradeLevel ?? 0] ?? 5;
    const healAmt = healBase * echoMultiplier;
    const echoTag = isEchoTriggered ? '（回响×2）' : '';
    enqueuedActions.push({ type: 'HEAL', amount: healAmt, source: 'heal-magic' });
    log(sideEffects, 'magic', `治愈术：恢复 ${healAmt} 点生命`);
    banner(sideEffects, `治愈术：回复 ${healAmt} 点生命。${echoTag}`);
    patch.lastPlayedCardCategory = getCardPlayCategory(card);
    enqueuedActions.push({ type: 'FINALIZE_MAGIC_CARD', card, dealtDamage: false });
    return applyPatch(state, patch, sideEffects, enqueuedActions);
  },
};

const starterHealEcho: CardDefinition = {
  effectId: `starter:${STARTER_CARD_IDS.healEcho}`,
  effects: [],
  tags: ['magic', 'permanent', 'heal'],
  resolver: (state, card, sideEffects, patch, enqueuedActions, echoMultiplier, isEchoTriggered) => {
    const echoTag = isEchoTriggered ? '（回响×2）' : '';
    const healAmt = 2 * echoMultiplier;
    enqueuedActions.push({ type: 'HEAL', amount: healAmt, source: 'heal-echo' });
    banner(sideEffects, `治愈余韵生效，恢复 ${healAmt} 点生命。${echoTag}`);
    patch.lastPlayedCardCategory = getCardPlayCategory(card);
    enqueuedActions.push({ type: 'FINALIZE_MAGIC_CARD', card, dealtDamage: false });
    return applyPatch(state, patch, sideEffects, enqueuedActions);
  },
};

const starterReshuffle: CardDefinition = {
  effectId: `starter:${STARTER_CARD_IDS.reshuffle}`,
  effects: [],
  tags: ['magic', 'permanent', 'interactive'],
  resolver: (state, card, sideEffects, patch, enqueuedActions, echoMultiplier) => {
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
  },
};

const starterDungeonSwap: CardDefinition = {
  effectId: `starter:${STARTER_CARD_IDS.dungeonSwap}`,
  effects: [],
  tags: ['magic', 'permanent'],
  resolver: (state, card, sideEffects, patch, enqueuedActions, echoMultiplier) => {
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
  },
};

// 乾坤一翻 — Perm 2. Flip an active-row card whose face can change.
// Eligibility: card.flipTarget (forward-flippable) OR card._flipBackCard (already
// flipped, can be flipped back). 0 valid → still consumed (play_full_cost_noop,
// mirroring 血誓回卷). 1 valid → auto-resolve. 2+ → player picks via
// pendingMagicAction (`flip-active-card` step), resolved in rules/hero.ts.
const starterActiveRowFlip: CardDefinition = {
  effectId: `starter:${STARTER_CARD_IDS.activeRowFlip}`,
  effects: [],
  tags: ['magic', 'permanent', 'interactive'],
  resolver: (state, card, sideEffects, patch, enqueuedActions, echoMultiplier) => {
    const cards = state.activeCards as (GameCardData | null)[];
    const targets = cards.filter((c): c is GameCardData =>
      Boolean(c && (c.flipTarget || c._flipBackCard)),
    );

    if (targets.length === 0) {
      log(sideEffects, 'magic', '乾坤一翻：当前行没有可翻转或已翻转的卡牌。');
      banner(sideEffects, '乾坤一翻：当前行没有可翻转的卡牌。');
      patch.lastPlayedCardCategory = getCardPlayCategory(card);
      enqueuedActions.push({ type: 'FINALIZE_MAGIC_CARD', card, dealtDamage: false });
      return applyPatch(state, patch, sideEffects, enqueuedActions);
    }

    if (targets.length === 1) {
      const target = targets[0];
      const idx = cards.findIndex(c => c?.id === target.id);
      if (target.flipTarget) {
        // Forward flip via APPLY_CARD_FLIP — triggers flip-zap / flip-gold amulets.
        enqueuedActions.push({ type: 'APPLY_CARD_FLIP', card: target, cellIndex: idx });
        log(sideEffects, 'magic', `乾坤一翻：${target.name} → ${target.flipTarget.toCard.name}。`);
        banner(sideEffects, `乾坤一翻：${target.name} → ${target.flipTarget.toCard.name}！`);
      } else if (target._flipBackCard) {
        // Back flip — direct patch + flippedInCell animation, mirroring 血誓回卷.
        const restored: GameCardData = { ...target._flipBackCard };
        const next = [...cards] as ActiveRowSlots;
        next[idx] = restored;
        patch.activeCards = next;
        sideEffects.push({
          event: 'card:flippedInCell',
          payload: { cellIndex: idx, fromCard: target, toCard: restored, message: `${target.name} → ${restored.name}` },
        });
        log(sideEffects, 'magic', `乾坤一翻:${target.name} 翻回 ${restored.name}。`);
        banner(sideEffects, `乾坤一翻：${target.name} → ${restored.name}！`);
      }
      patch.lastPlayedCardCategory = getCardPlayCategory(card);
      enqueuedActions.push({ type: 'FINALIZE_MAGIC_CARD', card, dealtDamage: false });
      return applyPatch(state, patch, sideEffects, enqueuedActions);
    }

    patch.pendingMagicAction = {
      card,
      effect: 'flip-active-card',
      step: 'dungeon-select',
      prompt: '选择当前行一张可翻转或已翻转的卡牌，将其翻转。',
      echoRemaining: echoMultiplier,
    } as any;
    patch.heroSkillBanner = '乾坤一翻：选择一张要翻转的卡牌。';
    return applyPatch(state, patch, sideEffects);
  },
};

const starterFateSwapDeep: CardDefinition = {
  effectId: `starter:${STARTER_CARD_IDS.fateSwapDeep}`,
  effects: [],
  tags: ['magic', 'permanent', 'interactive'],
  resolver: (state, card, sideEffects, patch, enqueuedActions, echoMultiplier) => {
    const depth = 5;
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
      echoRemaining: echoMultiplier,
    } as any;
    patch.heroSkillBanner = `选择地城行一张牌，与牌堆顶 ${depth} 张中随机一张交换。`;
    return applyPatch(state, patch, sideEffects);
  },
};

const starterDimensionWarp: CardDefinition = {
  effectId: `starter:${STARTER_CARD_IDS.dimensionWarp}`,
  effects: [],
  tags: ['magic', 'permanent', 'interactive'],
  resolver: (state, card, sideEffects, patch, enqueuedActions, echoMultiplier) => {
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
      echoRemaining: echoMultiplier,
    } as any;
    patch.heroSkillBanner = '选择地城行一张卡牌，与正上方预览行卡牌互换。';
    return applyPatch(state, patch, sideEffects);
  },
};

const starterUndyingBlessing: CardDefinition = {
  effectId: `starter:${STARTER_CARD_IDS.undyingBlessing}`,
  effects: [],
  tags: ['magic', 'permanent', 'interactive', 'buff'],
  resolver: (state, card, sideEffects, patch, enqueuedActions, echoMultiplier) => {
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
      echoRemaining: echoMultiplier,
    } as any;
    patch.heroSkillBanner = '选择一个装备赋予复生。';
    return applyPatch(state, patch, sideEffects);
  },
};

const starterMagicMissile: CardDefinition = {
  effectId: `starter:${STARTER_CARD_IDS.magicMissile}`,
  effects: [],
  tags: ['magic', 'permanent', 'summon'],
  resolver: (state, card, sideEffects, patch, enqueuedActions, echoMultiplier, isEchoTriggered) => {
    const boltCounts = [2, 3, 4];
    const boltBase = boltCounts[card.upgradeLevel ?? 0] ?? 2;
    const boltCount = boltBase * echoMultiplier;
    const echoTag = isEchoTriggered ? '（回响×2）' : '';
    // 走 createMagicBoltCard + applyAmplifyOnCreate 与魔弹连弩 / 投石手 gainBolts 一致，
    // 让新生成的「魔弹」继承当前 amplifiedCardBonus['魔弹'] 累计值；不要内联构造，
    // 否则任何已激活的魔弹增幅都不会作用到这批新魔弹上（典型 bug：先用魔弹连弩攻击
    // 触发 +1 增幅，再打魔法飞弹，得到的魔弹仍然显示 1 点法术伤害）。
    const bolts: GameCardData[] = [];
    let rng = state.rng;
    for (let i = 0; i < boltCount; i++) {
      let rawBolt: GameCardData;
      [rawBolt, rng] = createMagicBoltCard(rng);
      bolts.push(applyAmplifyOnCreate({ ...rawBolt, image: card.image }, state.amplifiedCardBonus));
    }
    patch.rng = rng;
    patch.handCards = [...state.handCards, ...bolts];
    log(sideEffects, 'magic', `魔法飞弹：加入 ${boltCount} 张「魔弹」到手牌`);
    banner(sideEffects, `魔法飞弹：${boltCount} 张「魔弹」已加入手牌！${echoTag}`);
    patch.lastPlayedCardCategory = getCardPlayCategory(card);
    enqueuedActions.push({ type: 'FINALIZE_MAGIC_CARD', card, dealtDamage: false });
    return applyPatch(state, patch, sideEffects, enqueuedActions);
  },
};

const starterStunStrike: CardDefinition = {
  effectId: `starter:${STARTER_CARD_IDS.stunStrike}`,
  effects: [],
  tags: ['magic', 'permanent', 'damage', 'stun'],
  resolver: resolveStunStrike,
};

const starterGamblerGambit: CardDefinition = {
  effectId: `starter:${STARTER_CARD_IDS.gamblerGambit}`,
  effects: [],
  tags: ['magic', 'permanent', 'self-damage', 'gold', 'draw'],
  resolver: (state, card, sideEffects, patch, enqueuedActions, echoMultiplier, isEchoTriggered) => {
    const goldAmounts = [1, 2, 3];
    const drawAmounts = [1, 2, 3];
    const echoTag = isEchoTriggered ? '（回响×2）' : '';
    const goldAmt = (goldAmounts[card.upgradeLevel ?? 0] ?? 1) * echoMultiplier;
    const drawAmt = (drawAmounts[card.upgradeLevel ?? 0] ?? 1) * echoMultiplier;
    const damageAmt = 1 * echoMultiplier;
    enqueuedActions.push({ type: 'APPLY_DAMAGE', amount: damageAmt, source: 'gambler-gambit', selfInflicted: true });
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
    log(sideEffects, 'magic', `赌徒之计：失去 ${damageAmt} 生命，+${goldAmt} 金币${drawnMsg}`);
    banner(sideEffects, `赌徒之计：-${damageAmt} 生命，+${goldAmt} 金币${drawnMsg}。${echoTag}`);
    patch.lastPlayedCardCategory = getCardPlayCategory(card);
    enqueuedActions.push({ type: 'FINALIZE_MAGIC_CARD', card, dealtDamage: false });
    return applyPatch(state, patch, sideEffects, enqueuedActions);
  },
};

const starterRecycleDrawMagic: CardDefinition = {
  effectId: `starter:${STARTER_CARD_IDS.recycleDrawMagic}`,
  effects: [],
  tags: ['magic', 'permanent', 'recycle'],
  resolver: (state, card, sideEffects, patch, enqueuedActions, echoMultiplier) => {
    const recycled = state.permanentMagicRecycleBag ?? [];
    const echoTag = (echoMultiplier ?? 1) > 1
      ? `（回响×${echoMultiplier}：第二次结算时回收袋已结算，无额外效果）`
      : '';
    if (recycled.length > 0) {
      // Decrement-first semantics: cards with _recycleWaits === 1 become 0 → ready.
      // Matches CARD_POOL_REFERENCE.md "回收袋洗回背包" definition.
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
      log(sideEffects, 'magic', `回收余韵：${detail}${echoTag}`);
      banner(sideEffects, `回收余韵：${detail}！${echoTag}`);
    } else {
      log(sideEffects, 'magic', `回收余韵：回收袋为空${echoTag}`);
      banner(sideEffects, `回收余韵：回收袋为空。${echoTag}`);
    }
    patch.lastPlayedCardCategory = getCardPlayCategory(card);
    enqueuedActions.push({ type: 'FINALIZE_MAGIC_CARD', card, dealtDamage: false });
    return applyPatch(state, patch, sideEffects, enqueuedActions);
  },
};

const starterGuildBloodGold: CardDefinition = {
  effectId: 'starter:guild-blood-gold',
  effects: [],
  tags: ['magic', 'permanent', 'self-damage', 'gold'],
  resolver: (state, card, sideEffects, patch, enqueuedActions, echoMultiplier, isEchoTriggered) => {
    const echoTag = isEchoTriggered ? '（回响×2）' : '';
    enqueuedActions.push({ type: 'APPLY_DAMAGE', amount: 1 * echoMultiplier, source: 'guild-blood-gold', selfInflicted: true });
    enqueuedActions.push({ type: 'MODIFY_GOLD', delta: 2 * echoMultiplier, source: 'guild-blood-gold' });
    log(sideEffects, 'magic', `血金术：受到 ${1 * echoMultiplier} 点伤害，获得 ${2 * echoMultiplier} 金币`);
    banner(sideEffects, `血金术：以 ${1 * echoMultiplier} 点生命换取 ${2 * echoMultiplier} 金币。${echoTag}`);
    patch.lastPlayedCardCategory = getCardPlayCategory(card);
    enqueuedActions.push({ type: 'FINALIZE_MAGIC_CARD', card, dealtDamage: false });
    return applyPatch(state, patch, sideEffects, enqueuedActions);
  },
};

// ============================================================================
// Knight Instant Effects
// ============================================================================

const knightBloodGreed: CardDefinition = {
  effectId: 'knight:blood-greed',
  effects: [],
  tags: ['knight', 'instant', 'gold'],
  resolver: (state, card, sideEffects, patch, enqueuedActions, echoMultiplier, isEchoTriggered) => {
    const maxHp = computeMaxHp(state);
    const baseGold = Math.max(0, maxHp - state.hp);
    const goldEarned = baseGold * echoMultiplier;
    const echoTag = isEchoTriggered ? '（回响×2）' : '';
    if (goldEarned > 0) {
      enqueuedActions.push({ type: 'MODIFY_GOLD', delta: goldEarned, source: 'blood-greed-card' });
    }

    const rng = patch.rng ?? state.rng;
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

    sideEffects.push({ event: 'card:magicResolved', payload: { card } });
    const baseBanner = goldEarned > 0
      ? `嗜血贪欲让你获得 ${goldEarned} 金币（已损失生命），并将"贪婪"塞入背包。${echoTag}`
      : `当前满血，贪欲只留下"贪婪"。${echoTag}`;
    banner(sideEffects, shopOpened ? `${baseBanner}商店已开启！` : baseBanner);
    patch.lastPlayedCardCategory = getCardPlayCategory(card);
    enqueuedActions.push({ type: 'FINALIZE_MAGIC_CARD', card, dealtDamage: false });
    return applyPatch(state, patch, sideEffects, enqueuedActions);
  },
};

const knightBerserkGambit: CardDefinition = {
  effectId: 'knight:berserk-gambit',
  effects: [],
  tags: ['knight', 'instant', 'buff', 'self-damage'],
  resolver: (state, card, sideEffects, patch, enqueuedActions, echoMultiplier, isEchoTriggered) => {
    const hpLoss = Math.max(0, state.hp - 1);
    if (hpLoss > 0) {
      enqueuedActions.push({ type: 'APPLY_DAMAGE', amount: hpLoss, source: 'berserk-gambit', selfInflicted: true });
    }
    const lvl = card.upgradeLevel ?? 0;
    const buffAmounts = [0, 4, 8, 8];
    const baseExtraPerSlot = lvl >= 3 ? 2 : 1;
    const extraPerSlot = baseExtraPerSlot * echoMultiplier;
    const buffAmt = (buffAmounts[lvl] ?? 8) * echoMultiplier;
    const echoTag = isEchoTriggered ? '（回响×2）' : '';
    if (buffAmt > 0) {
      enqueuedActions.push({ type: 'ADD_BERSERK_BUFF', amount: buffAmt });
    }
    enqueuedActions.push({ type: 'SET_COMBAT_FLAG', flag: 'gambitExtraActive', value: true });
    enqueuedActions.push({ type: 'SET_GAMBIT_STATE', extraPerSlot });
    const parts: string[] = [];
    if (buffAmt > 0) parts.push(`本回合装备 +${buffAmt} 伤害`);
    parts.push(extraPerSlot > 1 ? `每个武器栏可多攻击 ${extraPerSlot} 次` : '每个武器栏可多攻击一次');
    banner(sideEffects, `狂血豪赌发动：${parts.join('，')}。${echoTag}`);
    patch.lastPlayedCardCategory = getCardPlayCategory(card);
    enqueuedActions.push({ type: 'FINALIZE_MAGIC_CARD', card, dealtDamage: false });
    return applyPatch(state, patch, sideEffects, enqueuedActions);
  },
};

const knightBattleSpirit: CardDefinition = {
  effectId: 'knight:battle-spirit',
  effects: [],
  tags: ['knight', 'instant', 'buff', 'interactive'],
  resolver: (state, card, sideEffects, patch, enqueuedActions, echoMultiplier) => {
    const lvl = card.upgradeLevel ?? 0;
    const bonusAmt = (lvl >= 1 ? 2 : 1) * echoMultiplier;
    if (!state.equipmentSlot1 && !state.equipmentSlot2) {
      banner(sideEffects, '战意激发：没有可激发的装备栏。');
      patch.lastPlayedCardCategory = getCardPlayCategory(card);
      enqueuedActions.push({ type: 'FINALIZE_MAGIC_CARD', card, dealtDamage: false });
      return applyPatch(state, patch, sideEffects, enqueuedActions);
    }
    const echoTag = echoMultiplier > 1 ? `（回响×${echoMultiplier}）` : '';
    patch.pendingMagicAction = {
      card,
      effect: 'battle-spirit',
      step: 'slot-select',
      prompt: `选择一个装备栏：每英雄回合可多攻击 ${bonusAmt} 次，且每怪物回合格挡耐久上限 +${bonusAmt}（持续到下次瀑流）。${echoTag}`,
      echoMultiplier,
    } as any;
    patch.heroSkillBanner = `选择一个装备栏：每英雄回合可多攻击 ${bonusAmt} 次，且每怪物回合格挡耐久上限 +${bonusAmt}（持续到下次瀑流）。${echoTag}`;
    return applyPatch(state, patch, sideEffects);
  },
};

const knightPersuadeDiscount: CardDefinition = {
  effectId: 'knight:persuade-discount',
  effects: [],
  tags: ['knight', 'instant', 'buff'],
  resolver: (state, card, sideEffects, patch, enqueuedActions, echoMultiplier, isEchoTriggered) => {
    const costDiscount = 2 * ((card.upgradeLevel ?? 0) + 1) * echoMultiplier;
    const rateBonus = 10 * ((card.upgradeLevel ?? 0) + 1) * echoMultiplier;
    const echoTag = isEchoTriggered ? '（回响×2）' : '';
    const currentMod = state.persuadeCostModifier ?? 0;
    const currentCost = PERSUADE_COST + currentMod;
    let actualDiscount = 0;
    if (currentCost > MIN_PERSUADE_COST) {
      actualDiscount = Math.min(costDiscount, currentCost - MIN_PERSUADE_COST);
      patch.persuadeCostModifier = currentMod - actualDiscount;
    }
    patch.persuadeDiscount = { costReduction: 0, rateBonus };
    const costMsg = actualDiscount > 0 ? `劝降费用永久 -${actualDiscount}` : '劝降费用已达下限';
    banner(sideEffects, `怀柔令发动：${costMsg}，下次劝降成功率 +${rateBonus}%！${echoTag}`);
    patch.lastPlayedCardCategory = getCardPlayCategory(card);
    enqueuedActions.push({ type: 'FINALIZE_MAGIC_CARD', card, dealtDamage: false });
    return applyPatch(state, patch, sideEffects, enqueuedActions);
  },
};

const knightRecycleRandomToHand: CardDefinition = {
  effectId: 'knight:recycle-random-to-hand',
  effects: [],
  tags: ['knight', 'instant', 'draw'],
  resolver: (state, card, sideEffects, patch, enqueuedActions, echoMultiplier, isEchoTriggered) => {
    const echoTag = isEchoTriggered ? '（回响×2）' : '';
    let workingBag = state.permanentMagicRecycleBag.filter(c => c.id !== card.id);
    if (workingBag.length === 0) {
      banner(sideEffects, `归袋抽引：回收袋为空。${echoTag}`);
      patch.lastPlayedCardCategory = getCardPlayCategory(card);
      enqueuedActions.push({ type: 'FINALIZE_MAGIC_CARD', card, dealtDamage: false });
      return applyPatch(state, patch, sideEffects, enqueuedActions);
    }
    let rng = state.rng;
    const picks: GameCardData[] = [];
    let workingHand = [...state.handCards];
    const picksToMake = Math.min(echoMultiplier, workingBag.length);
    for (let i = 0; i < picksToMake; i++) {
      let pick: GameCardData;
      [pick, rng] = pickRandom(workingBag, rng);
      workingBag = workingBag.filter(c => c.id !== pick.id);
      workingHand = [...workingHand, pick];
      picks.push(pick);
    }
    patch.rng = rng;
    patch.permanentMagicRecycleBag = state.permanentMagicRecycleBag.filter(c => !picks.some(p => p.id === c.id));
    patch.handCards = workingHand;
    const picksMsg = picks.map(p => `「${p.name}」`).join('、');
    log(sideEffects, 'deck', `归袋抽引：从回收袋抽取${picksMsg}。`);
    banner(sideEffects, `归袋抽引：从回收袋抽取${picksMsg}！${echoTag}`);
    patch.lastPlayedCardCategory = getCardPlayCategory(card);
    enqueuedActions.push({ type: 'FINALIZE_MAGIC_CARD', card, dealtDamage: false });
    return applyPatch(state, patch, sideEffects, enqueuedActions);
  },
};

const knightAmuletExpand: CardDefinition = {
  effectId: 'knight:amulet-expand',
  effects: [],
  tags: ['knight', 'instant', 'buff'],
  resolver: (state, card, sideEffects, patch, enqueuedActions, echoMultiplier, isEchoTriggered) => {
    const expand = 1 * echoMultiplier;
    const echoTag = isEchoTriggered ? '（回响×2）' : '';
    patch.maxAmuletSlots = (state.maxAmuletSlots ?? 2) + expand;
    const newMax = patch.maxAmuletSlots;
    log(sideEffects, 'magic', `符位开辟：护符栏上限 +${expand}（当前上限 ${newMax}）`);
    banner(sideEffects, `护符栏上限提升至 ${newMax}！${echoTag}`);
    patch.lastPlayedCardCategory = getCardPlayCategory(card);
    enqueuedActions.push({ type: 'FINALIZE_MAGIC_CARD', card, dealtDamage: false });
    return applyPatch(state, patch, sideEffects, enqueuedActions);
  },
};

const knightGraveNova: CardDefinition = {
  effectId: 'knight:grave-nova',
  effects: [],
  tags: ['knight', 'instant'],
  resolver: (state, card, sideEffects, patch, enqueuedActions) => {
    patch.lastPlayedCardCategory = getCardPlayCategory(card);
    enqueuedActions.push({ type: 'FINALIZE_MAGIC_CARD', card, dealtDamage: false });
    return applyPatch(state, patch, sideEffects, enqueuedActions);
  },
};

const knightMissileBolt: CardDefinition = {
  effectId: 'knight:missile-bolt',
  effects: [],
  tags: ['knight', 'instant', 'damage'],
  resolver: (state, card, sideEffects, patch, enqueuedActions, echoMultiplier, isEchoTriggered) => {
    const monsters = flattenActiveRowSlots(state.activeCards).filter(isDamageableTarget);
    const echoTag = isEchoTriggered ? '（回响×2）' : '';
    if (monsters.length === 0) {
      banner(sideEffects, `魔弹无效（没有怪物）。${echoTag}`);
      patch.lastPlayedCardCategory = getCardPlayCategory(card);
      enqueuedActions.push({ type: 'FINALIZE_MAGIC_CARD', card, dealtDamage: false });
      return applyPatch(state, patch, sideEffects, enqueuedActions);
    }
    const boltDmg = getSpellDamage(1 + (card.amplifyBonus ?? 0), state);
    if (monsters.length === 1) {
      const target = monsters[0];
      const totalHits = echoMultiplier;
      const totalDmg = boltDmg * totalHits;
      enqueuedActions.push({ type: 'DEAL_DAMAGE_TO_MONSTER', monsterId: target.id, damage: totalDmg, source: 'missile-bolt', isSpellDamage: true });
      log(sideEffects, 'magic', `魔弹：对 ${target.name} 造成 ${boltDmg}${totalHits > 1 ? `×${totalHits}` : ''} 点法术伤害`);
      banner(sideEffects, `魔弹：对 ${target.name} 造成 ${totalDmg} 点伤害！${echoTag}`);
      applyMissileRelicEffects(state, patch, sideEffects, enqueuedActions, target);
      patch.lastPlayedCardCategory = getCardPlayCategory(card);
      enqueuedActions.push({ type: 'FINALIZE_MAGIC_CARD', card, dealtDamage: true });
      return applyPatch(state, patch, sideEffects, enqueuedActions);
    }
    patch.pendingMagicAction = {
      card,
      effect: 'missile-bolt',
      step: 'monster-select',
      prompt: `选择一个怪物，造成 ${boltDmg} 点法术伤害。${echoTag}`,
      echoRemaining: echoMultiplier,
    } as any;
    patch.heroSkillBanner = `选择一个怪物，造成 ${boltDmg} 点法术伤害。${echoTag}`;
    return applyPatch(state, patch, sideEffects);
  },
};

const knightMissileStorm: CardDefinition = {
  effectId: 'knight:missile-storm',
  effects: [],
  tags: ['knight', 'instant', 'damage', 'graveyard'],
  resolver: (state, card, sideEffects, patch, enqueuedActions) => {
    const monsters = flattenActiveRowSlots(state.activeCards).filter(isDamageableTarget);
    if (monsters.length === 0) {
      banner(sideEffects, '魔弹风暴：激活行没有怪物。');
      log(sideEffects, 'magic', '魔弹风暴：激活行没有怪物，效果落空。');
      patch.lastPlayedCardCategory = getCardPlayCategory(card);
      enqueuedActions.push({ type: 'FINALIZE_MAGIC_CARD', card, dealtDamage: false });
      return applyPatch(state, patch, sideEffects, enqueuedActions);
    }
    const graveyardBolts = (state.discardedCards ?? []).filter(
      (c: GameCardData) => c.type === 'magic' && c.name === '魔弹',
    );
    if (graveyardBolts.length === 0) {
      banner(sideEffects, '魔弹风暴：坟场没有「魔弹」。');
      log(sideEffects, 'magic', '魔弹风暴：坟场中没有「魔弹」，效果落空。');
      patch.lastPlayedCardCategory = getCardPlayCategory(card);
      enqueuedActions.push({ type: 'FINALIZE_MAGIC_CARD', card, dealtDamage: false });
      return applyPatch(state, patch, sideEffects, enqueuedActions);
    }
    // 每一发魔弹的伤害在 resolver 阶段固化（保留每发 amplifyBonus 差异），
    // 但目标在 FIRE_MISSILE_STORM_BOLT 真正发射时才挑选——这样:
    //   - 前一发若击杀怪物，下一发会重新挑一个仍存活的怪物（不再浪费在尸体上）；
    //   - 若怪物触发复生（MONSTER_DEFEATED Branch B 在两发之间运行），后续魔弹仍可命中；
    //   - 若全场已无怪物，剩余魔弹熄灭并打日志。
    const totalBolts = graveyardBolts.length;
    for (let i = 0; i < totalBolts; i++) {
      const bolt = graveyardBolts[i];
      const boltDmg = getSpellDamage(1 + (bolt.amplifyBonus ?? 0), state);
      enqueuedActions.push({
        type: 'FIRE_MISSILE_STORM_BOLT',
        damage: boltDmg,
        boltIndex: i,
        totalBolts,
      });
    }
    banner(sideEffects, `魔弹风暴：从坟场调动 ${totalBolts} 枚「魔弹」连射！`);
    patch.lastPlayedCardCategory = getCardPlayCategory(card);
    enqueuedActions.push({ type: 'FINALIZE_MAGIC_CARD', card, dealtDamage: true });
    return applyPatch(state, patch, sideEffects, enqueuedActions);
  },
};

const knightDeathWard: CardDefinition = {
  effectId: 'knight:death-ward',
  effects: [],
  tags: ['knight', 'instant', 'passive'],
  resolver: (state, card, sideEffects, patch) => {
    patch.heroSkillBanner = '命悬一线会在你受到致死伤害时自动触发，无需主动打出。';
    return applyPatch(state, patch, sideEffects);
  },
};

const knightFortuneWheel: CardDefinition = {
  effectId: 'knight:fortune-wheel',
  effects: [],
  tags: ['knight', 'instant', 'interactive', 'dice'],
  resolver: (state, card, sideEffects, patch, _enqueued, echoMultiplier) => {
    patch.pendingMagicAction = {
      card,
      effect: 'fortune-wheel',
      step: 'dice',
      echoMultiplier,
    } as any;
    const [fwRoll, fwRng] = nextInt(patch.rng ?? state.rng, 1, 20);
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
  },
};

const knightChaosDice: CardDefinition = {
  effectId: 'knight:chaos-dice',
  effects: [],
  tags: ['knight', 'instant', 'interactive', 'dice'],
  resolver: (state, card, sideEffects, patch, _enqueued, echoMultiplier) => {
    patch.pendingMagicAction = {
      card,
      effect: 'chaos-dice',
      step: 'dice',
      echoMultiplier,
    } as any;
    const [chaosRoll, chaosRng] = nextInt(patch.rng ?? state.rng, 1, 20);
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
  },
};

// ---------------------------------------------------------------------------
// Knight instant effects — full implementations (NOT delegated to UI / legacy).
// Each resolver below either calls a real implementation in
// rules/magic-effects.ts or inlines the same logic, so the schema engine is
// the authoritative path. Previously these were stubs that only pushed
// `card:magicResolved` (an event the hook ignored for non-hero-magic),
// which left the card in limbo with no graveyard recall, no FINALIZE, etc.
// ---------------------------------------------------------------------------

const knightGraveyardRecall: CardDefinition = {
  effectId: 'knight:graveyard-recall',
  effects: [],
  tags: ['knight', 'instant', 'interactive'],
  resolver: (state, card, sideEffects, patch, enqueuedActions, echoMultiplier, isEchoTriggered) => {
    const recallCounts = [3, 4, 5, 6];
    const maxRecall = (recallCounts[card.upgradeLevel ?? 0] ?? 6) * echoMultiplier;
    const echoTag = isEchoTriggered ? '（回响×2）' : '';
    const eligible = (state.discardedCards ?? []).filter(
      (c: GameCardData) => c.id !== card.id,
    );
    let rng = patch.rng ?? state.rng;
    let shuffled: GameCardData[];
    [shuffled, rng] = rngShuffle(eligible, rng);
    patch.rng = rng;
    const recalled = shuffled.slice(0, Math.min(maxRecall, shuffled.length));
    const recalledIds = new Set(recalled.map(c => c.id));
    patch.discardedCards = (state.discardedCards ?? []).filter(
      (c: GameCardData) => !recalledIds.has(c.id),
    );
    let patchedState = { ...state, ...patch } as GameState;
    for (const rc of recalled) {
      mergePatch(patch, addCardToBackpackPure(patchedState, rc));
      patchedState = { ...patchedState, ...patch } as GameState;
    }
    const recallBanner = recalled.length > 0
      ? `冥途拾遗从坟场召回了 ${recalled.length} 张牌：${recalled.map(c => c.name).join('、')}${echoTag}`
      : `坟场中没有可召回的卡牌。${echoTag}`;
    log(sideEffects, 'magic', `魔法：${card.name} — ${recallBanner}`);
    banner(sideEffects, recallBanner);
    if (recalled.length > 0) {
      sideEffects.push({ event: 'card:graveyardRecalled' as any, payload: { cards: recalled } });
    }
    patch.lastPlayedCardCategory = getCardPlayCategory(card);
    enqueuedActions.push({ type: 'FINALIZE_MAGIC_CARD', card, dealtDamage: false });
    return applyPatch(state, patch, sideEffects, enqueuedActions);
  },
};

const knightGraveyardDiscoverEquipAmulet: CardDefinition = {
  effectId: 'knight:graveyard-discover-equip-amulet',
  effects: [],
  tags: ['knight', 'instant', 'interactive'],
  resolver: (state, card, sideEffects, patch, enqueuedActions) => {
    return resolveGraveyardDiscoverEquipAmulet(state, card, sideEffects, patch, enqueuedActions);
  },
};

const knightMonsterRecruit: CardDefinition = {
  effectId: 'knight:monster-recruit',
  effects: [],
  tags: ['knight', 'instant'],
  resolver: (state, card, sideEffects, patch, enqueuedActions) => {
    return resolveMonsterRecruit(state, card, sideEffects, patch, enqueuedActions);
  },
};

const knightMonsterFusion: CardDefinition = {
  effectId: 'knight:monster-fusion',
  effects: [],
  tags: ['knight', 'instant', 'interactive'],
  resolver: (state, card, sideEffects, patch, enqueuedActions) => {
    return resolveMonsterFusion(state, card, sideEffects, patch, enqueuedActions);
  },
};

const knightMirrorCopy: CardDefinition = {
  effectId: 'knight:mirror-copy',
  effects: [],
  tags: ['knight', 'instant', 'interactive'],
  resolver: (state, card, sideEffects, patch, enqueuedActions, echoMultiplier) => {
    const hasEquip = Boolean(state.equipmentSlot1) || Boolean(state.equipmentSlot2);
    const hasAmulets = (state.amuletSlots ?? []).length > 0;
    const hasHand = state.handCards.length > 0;
    if (!hasEquip && !hasAmulets && !hasHand) {
      banner(sideEffects, '镜影摹形：没有可选的牌（装备栏、护符栏与手牌皆空）。');
      patch.lastPlayedCardCategory = getCardPlayCategory(card);
      enqueuedActions.push({ type: 'FINALIZE_MAGIC_CARD', card, dealtDamage: false });
      return applyPatch(state, patch, sideEffects, enqueuedActions);
    }
    patch.pendingMagicAction = {
      card,
      effect: 'mirror-copy',
      step: 'modal-select',
      prompt: '镜影摹形：选择一张牌进行复制。',
      echoRemaining: echoMultiplier,
    } as any;
    sideEffects.push({ event: 'card:mirrorCopyRequested' as any, payload: { card } });
    return applyPatch(state, patch, sideEffects);
  },
};

// knight:deck-judge-delete — already had a correct schema resolver
// (identical to legacy `case 'deck-judge-delete'`); kept unchanged below.
const knightDeckJudgeDelete: CardDefinition = {
  effectId: 'knight:deck-judge-delete',
  effects: [],
  tags: ['knight', 'instant', 'interactive'],
  resolver: (state, card, sideEffects, patch) => {
    sideEffects.push({ event: 'card:deckJudgeRequested' as any, payload: { card } });
    return applyPatch(state, patch, sideEffects);
  },
};

const knightTransformGrant: CardDefinition = {
  effectId: 'knight:transform-grant',
  effects: [],
  tags: ['knight', 'instant', 'interactive'],
  resolver: (state, card, sideEffects, patch, enqueuedActions) => {
    return resolveTransformGrant(state, card, sideEffects, patch, enqueuedActions);
  },
};

const knightStripPermHand: CardDefinition = {
  effectId: 'knight:strip-perm-hand',
  effects: [],
  tags: ['knight', 'instant', 'utility'],
  resolver: (state, card, sideEffects, patch, enqueuedActions) =>
    resolveStripPermHand(state, card, sideEffects, patch, enqueuedActions),
};

// knight:stun-wave — not registered; falls through to legacy resolveStunWave
// which handles sequential dice rolls and stun cap logic.

// ============================================================================
// Knight Permanent Effects
// ============================================================================

const knightArmorStrike: CardDefinition = {
  effectId: 'knight:armor-strike',
  effects: [],
  tags: ['knight', 'permanent', 'damage', 'interactive'],
  resolver: resolveKnightPermanentMagic,
};

const knightArmorDoubleStrike: CardDefinition = {
  effectId: 'knight:armor-double-strike',
  effects: [],
  tags: ['knight', 'permanent', 'damage', 'interactive'],
  resolver: resolveKnightPermanentMagic,
};

const knightThreeCardThunder: CardDefinition = {
  effectId: 'knight:three-card-thunder',
  effects: [],
  tags: ['knight', 'permanent', 'damage', 'aoe', 'on-enter-hand'],
  resolver: resolveKnightPermanentMagic,
};

const knightReorganizeBackpack: CardDefinition = {
  effectId: 'knight:reorganize-backpack',
  effects: [],
  tags: ['knight', 'permanent', 'interactive', 'backpack', 'capacity'],
  resolver: resolveKnightPermanentMagic,
};

const knightHonorSweep: CardDefinition = {
  effectId: 'knight:honor-sweep',
  effects: [],
  tags: ['knight', 'permanent', 'interactive'],
  resolver: resolveKnightPermanentMagic,
};

const knightWeaponSweep: CardDefinition = {
  effectId: 'knight:weapon-sweep',
  effects: [],
  tags: ['knight', 'permanent', 'interactive'],
  resolver: resolveKnightPermanentMagic,
};

const knightMissingHpSmite: CardDefinition = {
  effectId: 'knight:missing-hp-smite',
  effects: [],
  tags: ['knight', 'permanent', 'damage'],
  resolver: resolveKnightPermanentMagic,
};

const knightBloodSacrificeStrike: CardDefinition = {
  effectId: 'knight:blood-sacrifice-strike',
  effects: [],
  tags: ['knight', 'permanent', 'damage', 'self-damage'],
  resolver: resolveKnightPermanentMagic,
};

const knightBloodDraw: CardDefinition = {
  effectId: 'knight:blood-draw',
  effects: [],
  tags: ['knight', 'permanent', 'self-damage', 'draw'],
  resolver: resolveKnightPermanentMagic,
};

const knightRecallEquipment: CardDefinition = {
  effectId: 'knight:recall-equipment',
  effects: [],
  tags: ['knight', 'permanent', 'interactive'],
  resolver: resolveKnightPermanentMagic,
};

const knightDiscardRebuild: CardDefinition = {
  effectId: 'knight:discard-rebuild',
  effects: [],
  tags: ['knight', 'permanent', 'destroy', 'discover', 'interactive'],
  resolver: resolveKnightPermanentMagic,
};

const knightArmorStunConvert: CardDefinition = {
  effectId: 'knight:armor-stun-convert',
  effects: [],
  tags: ['knight', 'permanent', 'interactive'],
  resolver: resolveKnightPermanentMagic,
};

// 锋芒倍增 — Perm 1. Select an equipment slot (empty allowed); apply temp
// attack +2, then double the resulting temp attack on that slot.
// Example: slot at +3 → +5 → ×2 = 10. Echo doubles the additive bonus before
// the multiplicative step (matches 时空镜像 pattern).
const knightTempAttackDouble: CardDefinition = {
  effectId: 'knight:temp-attack-double',
  effects: [],
  tags: ['knight', 'permanent', 'interactive', 'buff'],
  resolver: (state, card, sideEffects, patch, _enqueuedActions, echoMultiplier) => {
    patch.pendingMagicAction = {
      card,
      effect: 'temp-attack-double',
      step: 'slot-select',
      prompt: '锋芒倍增：选择一个装备栏，临时攻击 +2 后翻倍。',
      echoMultiplier,
    } as any;
    patch.heroSkillBanner = '锋芒倍增：选择一个装备栏。';
    return applyPatch(state, patch, sideEffects);
  },
};

// 连环转律 — Starter Perm. Deal X spell damage to a chosen monster, where X
// equals the number of consecutive different-category cards played in a row
// up to and INCLUDING this card. Same-category-as-previous breaks the chain
// → X = 0. Player selects target via pendingMagicAction → RESOLVE_MAGIC_MONSTER_SELECTION.
function computePredictedTransformStreak(state: GameState, card: GameCardData): number {
  const curCat = getCardPlayCategory(card);
  const prevChainCat = state.transformChainPrevCategory ?? null;
  const prevStreak = state.consecutiveTransformStreak ?? 0;
  if (prevChainCat == null) return 1;
  if (prevChainCat === curCat) return 0;
  return prevStreak + 1;
}

const starterTransformStreakStrike: CardDefinition = {
  effectId: `starter:${STARTER_CARD_IDS.transformStreakStrike}`,
  effects: [],
  tags: ['magic', 'permanent', 'damage'],
  resolver: (state, card, sideEffects, patch, enqueuedActions, echoMultiplier) => {
    const predictedStreak = computePredictedTransformStreak(state, card);
    const baseDmg = predictedStreak;
    const dmg = getSpellDamage(baseDmg, state) * echoMultiplier;
    const monsters = flattenActiveRowSlots(state.activeCards).filter(isDamageableTarget);

    if (monsters.length === 0) {
      banner(sideEffects, `${card.name}：没有可攻击的怪物（连续转型 ${predictedStreak}）。`);
      patch.lastPlayedCardCategory = getCardPlayCategory(card);
      enqueuedActions.push({ type: 'FINALIZE_MAGIC_CARD', card, dealtDamage: false });
      return applyPatch(state, patch, sideEffects, enqueuedActions);
    }

    if (predictedStreak === 0) {
      banner(sideEffects, `${card.name}：连续转型断链，造成 0 点伤害。`);
      log(sideEffects, 'magic', `${card.name}：上张牌同类型，连续转型断链 → 0 点伤害。`);
      patch.lastPlayedCardCategory = getCardPlayCategory(card);
      enqueuedActions.push({ type: 'FINALIZE_MAGIC_CARD', card, dealtDamage: false });
      return applyPatch(state, patch, sideEffects, enqueuedActions);
    }

    if (monsters.length === 1) {
      const target = monsters[0];
      enqueuedActions.push({
        type: 'DEAL_DAMAGE_TO_MONSTER',
        monsterId: target.id,
        damage: dmg,
        source: 'transform-streak-strike',
        isSpellDamage: true,
        landedLogMessage: `${card.name}：连续转型 ${predictedStreak}，对 ${target.name} 造成 ${dmg} 点法术伤害。`,
      });
      banner(sideEffects, `${card.name}：连续转型 ${predictedStreak} → ${dmg} 点伤害！`);
      patch.lastPlayedCardCategory = getCardPlayCategory(card);
      enqueuedActions.push({ type: 'FINALIZE_MAGIC_CARD', card, dealtDamage: true });
      return applyPatch(state, patch, sideEffects, enqueuedActions);
    }

    patch.pendingMagicAction = {
      card,
      effect: 'transform-streak-strike',
      step: 'monster-select',
      prompt: `${card.name}：选择一个怪物，对其释放 ${dmg} 点法术伤害（连续转型 ${predictedStreak}）。`,
      data: { damage: dmg, streak: predictedStreak },
    } as any;
    patch.heroSkillBanner = `${card.name}：选择一个怪物（连续转型 ${predictedStreak} → ${dmg} 伤害）。`;
    return applyPatch(state, patch, sideEffects);
  },
};

// 锐意鼓舞 — Starter Perm. Apply +3 (or +5 at upgrade level 1) temp attack
// to slot 1 (left) by default; on flank, INSTEAD apply to slot 2 (right).
const starterFlankSlotTempAttack: CardDefinition = {
  effectId: `starter:${STARTER_CARD_IDS.flankSlotTempAttack}`,
  effects: [],
  tags: ['magic', 'permanent', 'buff'],
  resolver: (state, card, sideEffects, patch, enqueuedActions, echoMultiplier, _isEcho, _target, isFlank) => {
    const baseAmounts = [3, 5];
    const baseAmount = baseAmounts[card.upgradeLevel ?? 0] ?? 3;
    const totalAmount = baseAmount * echoMultiplier;
    const targetSlot: EquipmentSlotId = isFlank ? 'equipmentSlot2' : 'equipmentSlot1';
    const slotLabel = targetSlot === 'equipmentSlot1' ? '左' : '右';
    const baseSlotState = { equipmentSlot1: 0, equipmentSlot2: 0 };
    const merged = { ...(state.slotTempAttack ?? baseSlotState), ...(patch.slotTempAttack ?? {}) };
    merged[targetSlot] = (merged[targetSlot] ?? 0) + totalAmount;
    patch.slotTempAttack = merged;
    const flankSuffix = isFlank ? '（侧击触发）' : '';
    log(sideEffects, 'magic', `${card.name}：${slotLabel}装备栏 +${totalAmount} 临时攻击${flankSuffix}。`);
    banner(sideEffects, `${card.name}：${slotLabel}装备栏 +${totalAmount} 临时攻击${flankSuffix}！`);
    patch.lastPlayedCardCategory = getCardPlayCategory(card);
    enqueuedActions.push({ type: 'FINALIZE_MAGIC_CARD', card, dealtDamage: false });
    return applyPatch(state, patch, sideEffects, enqueuedActions);
  },
};

// 运势博弈 — Starter Perm. Player picks one card from the active row;
// swap it with the top of the dungeon draw deck (state.remainingDeck[0]).
// If both share the same play-category → +10 gold; otherwise -1 gold.
const starterDeckTopSwapGold: CardDefinition = {
  effectId: `starter:${STARTER_CARD_IDS.deckTopSwapGold}`,
  effects: [],
  tags: ['magic', 'permanent', 'interactive', 'gold'],
  resolver: (state, card, sideEffects, patch, enqueuedActions, echoMultiplier) => {
    const deck = state.remainingDeck as GameCardData[];
    const activeHasCards = (state.activeCards as (GameCardData | null)[]).some(c => c != null);

    if (deck.length === 0) {
      banner(sideEffects, `${card.name}：牌堆已空，无法交换。`);
      log(sideEffects, 'magic', `${card.name}：牌堆已空，未发生交换。`);
      patch.lastPlayedCardCategory = getCardPlayCategory(card);
      enqueuedActions.push({ type: 'FINALIZE_MAGIC_CARD', card, dealtDamage: false });
      return applyPatch(state, patch, sideEffects, enqueuedActions);
    }
    if (!activeHasCards) {
      banner(sideEffects, `${card.name}：当前行无卡牌，无法交换。`);
      log(sideEffects, 'magic', `${card.name}：当前行为空，未发生交换。`);
      patch.lastPlayedCardCategory = getCardPlayCategory(card);
      enqueuedActions.push({ type: 'FINALIZE_MAGIC_CARD', card, dealtDamage: false });
      return applyPatch(state, patch, sideEffects, enqueuedActions);
    }

    patch.pendingMagicAction = {
      card,
      effect: 'deck-top-swap-gold',
      step: 'dungeon-select',
      prompt: `${card.name}：选择当前行一张牌，与牌堆顶交换。`,
      echoRemaining: echoMultiplier,
    } as any;
    patch.heroSkillBanner = `${card.name}：选择当前行一张牌。`;
    return applyPatch(state, patch, sideEffects);
  },
};

// Knight curse (instant, checked before magicType routing)
const knightGreedCurse: CardDefinition = {
  effectId: 'knight:greed-curse',
  effects: [],
  tags: ['knight', 'curse'],
  resolver: (state, card, sideEffects, patch, enqueuedActions) => {
    enqueuedActions.push({ type: 'MODIFY_GOLD', delta: -3, source: 'greed-curse' });
    log(sideEffects, 'magic', '贪婪诅咒消耗了 3 金币。');
    banner(sideEffects, '贪婪诅咒消耗了 3 金币。');
    enqueuedActions.push({ type: 'FINALIZE_MAGIC_CARD', card, dealtDamage: false });
    return applyPatch(state, patch, sideEffects, enqueuedActions);
  },
};

// ============================================================================
// Registration
// ============================================================================

const allMagicDefinitions: CardDefinition[] = [
  // Hero magic
  heroMagicGeneric,
  // Pre-routing
  honorBlood,
  activeRowDebuff,
  flipMonsterDebuff,
  // Instant magicEffect
  amplifyCard,
  altarDiscardDiscover,
  // Instant card.name
  cascadeReset,
  stormVolley,
  fountainHand,
  emberEcho,
  healSpell,
  bloodReckoning,
  soulSwap,
  permGrant,
  upgradeScroll,
  arcaneRefine,
  eventFortify,
  // Permanent magicEffect
  doubleNextMagic,
  swapBackpackRecycle,
  guildHandRecycle,
  guildRecycleReshuffle,
  crossroadsLeftSwap,
  persuadeBoostDraw,
  bountySpellDamage,
  arcaneShieldStunCap,
  stormVolleyRecycle,
  arcaneStormMagicCount,
  equipmentEnchantDiscard,
  amplifyTarget,
  altarDiscoverClassMagic,
  equalizeAttackArmor,
  cryptDeathwish,
  weaponManual,
  // Permanent card.name
  chaosStrikeDef,
  overkillUpgradeDef,
  dimensionWarpName,
  goblinTrick,
  // Scaling damage
  scalingDamageDef,
  // Starter effects
  starterWeaponBurst,
  starterRepairOne,
  starterTempArmor,
  starterHealMagic,
  starterHealEcho,
  starterReshuffle,
  starterDungeonSwap,
  starterActiveRowFlip,
  starterFateSwapDeep,
  starterDimensionWarp,
  starterUndyingBlessing,
  starterMagicMissile,
  starterStunStrike,
  starterGamblerGambit,
  starterRecycleDrawMagic,
  starterGuildBloodGold,
  starterTransformStreakStrike,
  starterFlankSlotTempAttack,
  starterDeckTopSwapGold,
  // Knight instant
  knightBloodGreed,
  knightBerserkGambit,
  knightBattleSpirit,
  knightPersuadeDiscount,
  knightRecycleRandomToHand,
  knightAmuletExpand,
  knightGraveNova,
  knightMissileBolt,
  knightMissileStorm,
  knightDeathWard,
  knightFortuneWheel,
  knightChaosDice,
  knightGraveyardRecall,
  knightGraveyardDiscoverEquipAmulet,
  knightMonsterRecruit,
  knightMonsterFusion,
  knightMirrorCopy,
  knightDeckJudgeDelete,
  knightTransformGrant,
  knightStripPermHand,
  // knightStunWave — excluded; falls through to legacy resolveStunWave
  // Knight permanent
  knightArmorStrike,
  knightArmorDoubleStrike,
  knightThreeCardThunder,
  knightReorganizeBackpack,
  knightHonorSweep,
  knightWeaponSweep,
  knightMissingHpSmite,
  knightBloodSacrificeStrike,
  knightBloodDraw,
  knightRecallEquipment,
  knightArmorStunConvert,
  knightTempAttackDouble,
  knightDiscardRebuild,
  knightGreedCurse,
];

registerCards(allMagicDefinitions);
