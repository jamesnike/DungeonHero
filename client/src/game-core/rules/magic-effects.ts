/**
 * Magic Effects — full magic card resolution logic for the game reducer.
 *
 * Handles ALL magic/hero-magic effects in a pure, deterministic manner.
 * Interactive effects set `pendingMagicAction` and pause; non-interactive
 * effects compute state patches and enqueue follow-up actions directly.
 *
 * The reducer's `reduceResolveMagic` in `rules/cards.ts` delegates here.
 *
 * ===========================================================================
 * 法术回响（Spell Echo）AUDIT TABLE
 * ===========================================================================
 * `state.doubleNextMagic` is set by 法术回响 (`double-next-magic`). The next
 * non-self magic card consumes it and `echoMultiplier = 2` is passed into the
 * resolver. Each card has ONE of three echo behaviours:
 *
 *   A — NUMERIC: multiply numeric outputs (damage, heal, draw count, gold,
 *       buff stacks, repair amount, etc.) by `echoMultiplier`.
 *   B — MODAL: re-trigger the same modal twice. Stored via
 *       `pendingMagicAction.echoRemaining = 2`; the corresponding hero.ts
 *       reducer (RESOLVE_MAGIC_*_SELECTION) calls `maybeRepromptEcho()` to
 *       re-prompt the second selection rather than finalize.
 *   C — STRUCTURAL: card has no useful numeric knob (e.g. cascade reset,
 *       backpack swap). When echoed, the entire effect runs twice (the second
 *       run is often a no-op) and a banner notes "回响：二次结算无额外效果".
 *   B* — UI-DELEGATED MODAL (HISTORICAL): discover/upgrade modals owned by the
 *        UI layer used to only open once on echo. As of Phase 1 + Phase 2,
 *        every B* card has been upgraded to a real B with one of three
 *        mechanisms:
 *          - `pendingClassDiscoverQueue` (Phase 1): STARTER discover-class-to-hand,
 *            altar-discover-class-magic, altar-discard-discover. Re-prompts
 *            the same discover modal (echoMultiplier − 1) extra times.
 *          - `upgradeModalMaxCount` / modal `maxSelect` field (Phase 2):
 *            升级卷轴 sets `upgradeModalMaxCount = echoMultiplier` so the
 *            existing CardUpgradeModal stays open for N consecutive picks;
 *            秘法精炼 sets `handMagicUpgradeModal.maxSelect = 2N` so the
 *            HandMagicUpgradeModal accepts up to 2N selections in one shot.
 *          - hook-driven loop on side-effect (Phase 2):
 *            KNIGHT graveyard-discover-equip-amulet — side effect carries
 *            `echoRemaining: N`, hook (`useCardPlayHandlers.ts`) runs the
 *            requestGraveyardSelection loop N times. Same shape as
 *            `card:cleanseDrawRequested`.
 *
 *        No B* entries remain in the table below.
 *
 * ┌──────────────────────────────────┬─────┬───────────────────────────────┐
 * │ Card / effectId                  │ Cat │ Notes                         │
 * ├──────────────────────────────────┼─────┼───────────────────────────────┤
 * │ honor-blood (战血之印)           │ A/B │ self-dmg fixed; repair ×N     │
 * │ active-row-monster-attack-debuff │ A   │ -atk amount ×N                │
 * │ flip-monster-debuff              │ B   │ second pick → second monster  │
 * │ amplify-card                     │ B   │ open modal twice              │
 * │ altar-discard-discover           │ B   │ queue (N-1) extra discovers   │
 * │ cascade-reset (瀑流重置)         │ C   │ second pass = no-op + banner  │
 * │ storm-volley (风暴箭雨)          │ A   │ damage ×N                     │
 * │ fountain-hand (涌泉满手)         │ A   │ heal & draw ×N                │
 * │ ember-echo (余烬回响)            │ A   │ buff/draw ×N                  │
 * │ heal (治愈术)                    │ A   │ healAmt ×N                    │
 * │ blood-reckoning (点金裁决)       │ A/B │ damage ×N + modal re-prompt   │
 * │ soul-swap (等价交换)             │ B   │ pick slot+monster twice       │
 * │ perm-grant (永恒铭刻)            │ B   │ pick card twice               │
 * │ upgrade-scroll                   │ B   │ upgradeModalMaxCount = N      │
 * │ arcane-refine (秘法精炼)         │ B   │ modal maxSelect = 2N          │
 * │ event-fortify (天机铸炼)         │ B   │ pick slot twice (peek twice)  │
 * │ double-next-magic                │ —   │ engine guards: never echoed   │
 * │ swap-backpack-recycle            │ C   │ swap-back-and-forth = no-op   │
 * │ guild-hand-recycle               │ A   │ draw ×N                       │
 * │ guild-recycle-reshuffle          │ A   │ draw ×N                       │
 * │ crossroads-left-swap             │ A   │ swap×N (even N = no-op)       │
 * │ persuade-boost-draw              │ A   │ +%/draw ×N                    │
 * │ bounty-spell-damage              │ A/B │ dmg ×N + modal re-prompt      │
 * │ arcane-shield-stun-cap           │ A   │ stunCap gain ×N               │
 * │ storm-volley-recycle             │ A   │ damage ×N                     │
 * │ arcane-storm-magic-count         │ A   │ damage ×N                     │
 * │ equipment-enchant-discard        │ B   │ pick equip twice              │
 * │ amplify-target                   │ A   │ amplify amount ×N             │
 * │ altar-discover-class-magic       │ B   │ queue (N-1) extra discovers   │
 * │ equalize-attack-armor            │ A/B │ +2 atk ×N + modal re-prompt   │
 * │ crypt-deathwish                  │ B   │ delegated UI re-prompt        │
 * │ weapon-manual                    │ A/B │ +bonus ×N + modal re-prompt   │
 * │ chaos-strike (混沌冲击)          │ B   │ existing echoRemaining        │
 * │ overkill-upgrade (淬炼冲击)      │ B   │ existing echoRemaining        │
 * │ dimension-warp (维度扭曲)        │ B   │ pick swap twice               │
 * │ goblin-trick (哥布林的戏法)      │ C   │ second shuffle = no-op        │
 * │ scaling-damage                   │ A   │ damage ×N                     │
 * │ STARTER weapon-burst             │ A   │ +atk ×N                       │
 * │ STARTER repair-one               │ A   │ repair ×N                     │
 * │ STARTER temp-armor               │ A   │ armor ×N                      │
 * │ STARTER heal-magic               │ A   │ healAmt ×N                    │
 * │ STARTER heal-echo                │ A   │ heal ×N                       │
 * │ STARTER discover-class-to-hand   │ B   │ queue (N-1) extra discovers   │
 * │ STARTER reshuffle                │ B   │ existing echoRemaining        │
 * │ STARTER dungeon-swap             │ A   │ swap×N (even N = no-op)       │
 * │ STARTER active-row-flip          │ B   │ pick flip twice               │
 * │ STARTER fate-swap-deep           │ B   │ pick swap twice               │
 * │ STARTER dimension-warp           │ B   │ pick swap twice               │
 * │ STARTER undying-blessing         │ B   │ pick slot twice               │
 * │ STARTER magic-missile            │ A   │ bolt count ×N                 │
 * │ STARTER stun-strike              │ A/B │ dmg ×N + modal re-prompt      │
 * │ STARTER gambler-gambit           │ A   │ gold/draw ×N                  │
 * │ STARTER recycle-draw-magic       │ C   │ second pass = no-op           │
 * │ STARTER guild-blood-gold         │ A   │ dmg/gold ×N                   │
 * │ STARTER transform-streak-strike  │ A/B │ dmg ×N + modal re-prompt      │
 * │ STARTER flank-slot-temp-attack   │ A   │ +atk ×N                       │
 * │ STARTER deck-top-swap-gold       │ A/B │ pick swap twice + draw ×N     │
 * │ KNIGHT blood-greed               │ A   │ gold delta ×N (curse fixed)   │
 * │ KNIGHT berserk-gambit            │ A   │ buff stacks ×N                │
 * │ KNIGHT battle-spirit             │ B   │ pick slot twice               │
 * │ KNIGHT persuade-discount         │ A   │ discount/rate ×N              │
 * │ KNIGHT recycle-random-to-hand    │ A   │ pick count ×N                 │
 * │ KNIGHT amulet-expand             │ A   │ +slots ×N                     │
 * │ KNIGHT grave-nova                │ A   │ damage ×N                     │
 * │ KNIGHT missile-bolt              │ A/B │ dmg ×N + modal re-prompt      │
 * │ KNIGHT missile-storm             │ A   │ damage ×N (bolts repeat)      │
 * │ KNIGHT death-ward                │ —   │ passive — echo no-op + banner │
 * │ KNIGHT fate-sight (天眼审判)     │ C   │ peek+grant once + echo banner │
 * │ KNIGHT fortune-wheel             │ B   │ dice re-roll twice            │
 * │ KNIGHT chaos-dice                │ B   │ dice re-roll twice            │
 * │ KNIGHT graveyard-recall          │ A   │ recall count ×N               │
 * │ KNIGHT graveyard-discover-equip  │ B   │ hook loop: discover ×N        │
 * │ KNIGHT monster-recruit           │ A   │ recruit count ×N              │
 * │ KNIGHT monster-fusion            │ C   │ fusion not stackable; banner  │
 * │ KNIGHT mirror-copy               │ B   │ pick card twice               │
 * │ KNIGHT deck-judge-delete         │ B   │ pick delete twice             │
 * │ KNIGHT transform-grant           │ B   │ transform pick twice          │
 * │ KNIGHT strip-perm-hand           │ C   │ strips all; echo banner only  │
 * │ KNIGHT armor-strike              │ A   │ damage ×N                     │
 * │ KNIGHT armor-double-strike       │ A   │ damage ×N                     │
 * │ KNIGHT three-card-thunder        │ A   │ damage ×N                     │
 * │ KNIGHT reorganize-backpack       │ A   │ +cap ×N                       │
 * │ KNIGHT honor-sweep               │ A   │ damage ×N                     │
 * │ KNIGHT weapon-sweep              │ A   │ damage ×N                     │
 * │ KNIGHT missing-hp-smite          │ A   │ damage ×N                     │
 * │ KNIGHT blood-sacrifice-strike    │ A   │ damage ×N                     │
 * │ KNIGHT blood-draw                │ A   │ draw ×N                       │
 * │ KNIGHT hand-purge-redraw         │ A/C │ discard once + draw ×N        │
 * │ KNIGHT gear-rift-draw            │ A   │ draw ×N (slot resolved hero)  │
 * │ KNIGHT quake-stun-draw           │ A   │ HP loss ×N + draw ×N          │
 * │ KNIGHT recall-equipment          │ B   │ pick equipment twice          │
 * │ KNIGHT cleanse-draw (净册涌泉)   │ B   │ pick + draw twice (hook loop) │
 * │ KNIGHT recycle-tide (洗册归川)   │ C   │ second tick = no-op + banner  │
 * │ KNIGHT persuade-to-temp-attack    │ C   │ run ×N; perm bonus may carry │
 * │ KNIGHT discard-rebuild           │ A   │ discover queue ×N             │
 * │ KNIGHT armor-stun-convert        │ B   │ pick slot twice               │
 * │ KNIGHT stun-cap-strike           │ A/B │ damage ×N + draw ×N + 1 dice  │
 * │ KNIGHT backpack-bolt             │ A   │ damage ×N (single-target)     │
 * │ KNIGHT recycle-bolt              │ A   │ damage ×N (single-target)     │
 * │ KNIGHT lay-mine                  │ A   │ spawn N mines (distinct slots)│
 * │ KNIGHT temp-attack-double        │ A/B │ +atk ×N + modal re-prompt     │
 * └──────────────────────────────────┴─────┴───────────────────────────────┘
 *
 * Hero magic (法力槽) and curses (`type: 'curse'`) are OUT OF SCOPE — Spell
 * Echo never applies to them (engine guard at engine.ts).
 *
 * ---------------------------------------------------------------------------
 * 自伤目标（Self-Damage Target）AUDIT NOTE
 * ---------------------------------------------------------------------------
 * 单目标伤害 magic 在 setup 阶段会把 `pendingMagicAction.allowsHeroTarget = true`，
 * 表示这个 spell 允许玩家把伤害打回自己。这个 flag 现在含义已经扩展为：
 *   1) 玩家可以选 Hero Cell（targetType: 'hero'）→ 整额走 APPLY_DAMAGE
 *      selfInflicted（触发 血怒战符 / 复生赐福 / self-damage-draw / totalDamageTaken）；
 *   2) 玩家可以选**装备槽里的盾**（targetType: 'shield-slot'，见
 *      `rules/shield-self-damage.ts` 的 `applyShieldSlotSelfDamage`）→ 盾 armor 先
 *      吃伤，溢出再以 selfInflicted 走 APPLY_DAMAGE，并消耗 1 点 durability，但
 *      **不**计入 `combatState.slotDurabilityUsedThisTurn` 的"格挡耐久次数上限"，
 *      也**不**触发任何 RESOLVE_BLOCK 专属机制（reflect / dual-guard / autoEvolve /
 *      bone-regen / bulwark passive 等）。
 * 选盾路径允许 `type === 'shield'` 或 `type === 'monster'`（怪物装备既可当武器也可
 * 当盾）且 `armor > 0` 的装备槽。两种装备共用 RESOLVE_BLOCK 同款的 armor 公式；自伤
 * 路径同样跳过所有 RESOLVE_BLOCK 专属机制（含 bone-regen / 怪物盾自动恢复）。所有
 * `allowsHeroTarget: true` 的卡（missile-bolt、
 * bounty-spell-damage、blood-strike、blood-reckoning、honor-blood、armor-strike、
 * armor-double-strike、stun-strike、overkill-upgrade、chaos-strike、berserk-gambit、
 * midas-judgment、arcane-storm、repair-enrage-dice 等 ~14 张）共用同一
 * setup → reducer → finalize 路径，不需要每张卡分别注册 self-shield 行为。
 * ===========================================================================
 */

import type { GameState } from '../types';
import type { GameAction } from '../actions';
import type { ReduceResult, SideEffect } from '../reducer';
import { applyPatch, noChange } from '../reducer';
import type { GameCardData } from '@/components/GameCard';
import { cardHasPermFlag } from '@/components/GameCard';
import type {
  EquipmentSlotId,
  EquipmentItem,
  PendingMagicAction,
  HandDiscardSelectionState,
  HandDiscardContinuation,
} from '@/components/game-board/types';
import {
  flattenActiveRowSlots,
  isDamageableTarget,
  sanitizeCardMetadata,
  getCardPlayCategory,
  isDamageMagic,
  pickRandomHandCardsForDiscardPreferGraveyard,
  getEligibleHandDiscardCards,
  applyAmplifyOnCreate,
  computeSlotArmorValuePure,
  isRecyclableFromHand,
  isCurseCard,
} from '../helpers';
import {
  drawFromBackpackToHandPure,
  drawMultipleFromBackpack,
  addToGraveyardPure,
  addToRecycleBag,
  addCardToBackpackPure,
  processRecycleBag,
  pushRecycleRestoreSideEffects,
  getEffectiveHandLimit,
  getEffectiveBackpackCapacity,
} from '../cards';
import { nextInt, pickRandom, nextBool, shuffle as rngShuffle, nextId } from '../rng';
import type { RngState } from '../rng';
import { DURABILITY_CAP, clampMaxDurability } from '../constants';
import { pickGraveyardCardExcluding, computeEquipmentBreakEffects, computeEquipmentDisplacementLastWords, shouldRouteEquipmentToPermRecycle, accumulateMineDamageBoost } from './equipment-effects';
import { maybeEnqueueStunGold } from './economy';
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
import { maybeTriggerDeleteDrawForDestroy } from '../deleteDrawTrigger';
import { chaosStrikeHasOverkill } from '../combat';
import { hasEternalRelic, getEternalRelic } from '@/lib/eternalRelics';
import { markSkillUsedPure } from '../hero';
import { STARTER_CARD_IDS, getStarterBaseId, skillScrollImage, createMagicBoltCard } from '../deck';
import skeletonKingImage from '@assets/generated_images/skeleton_king_monster.png';
import { createGreedCurseCard, createMineBuilding } from '@/lib/knightDeck';
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
    const ae = computeAmuletEffects(state.amuletSlots as GameCardData[]);
    const stunPct = Math.min(20 + (ae.stunRateBoost ?? 0), state.stunCap ?? 0);
    if (stunPct > 0) {
      const [roll, nextRng] = nextInt(patch.rng ?? state.rng, 1, 100);
      patch.rng = nextRng;
      if (roll <= stunPct) {
        enqueuedActions.push({ type: 'UPDATE_MONSTER_CARD', monsterId: target.id, patch: { isStunned: true } });
        log(sideEffects, 'magic', `永恒护符·震荡弹幕：${target.name} 被击晕了！`);
        maybeEnqueueStunGold(state, enqueuedActions, sideEffects, target.id, target.name);
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
 * 「玩家自选弃回」流程的统一入口。
 *
 * - 当可弃手牌（排除诅咒、源卡牌）数量 >= requiredCount 且 requiredCount > 0：
 *   写入 patch.pendingHandDiscardSelection，返回 { mode: 'modal' } 给调用者，
 *   调用者必须立即 return（**不要** finalize 卡牌、**不要** 入队后续动作），
 *   等玩家在 HandDiscardSelectionModal 里点击确认后由 RESOLVE_HAND_DISCARD_SELECTION
 *   接着跑后续逻辑。
 *
 * - 否则（可弃手牌不足 / requiredCount 为 0）：跳过弹窗，直接把所有可弃手牌
 *   按「优先坟场、其次回收袋」的现有顺序自动弃完，返回 { mode: 'auto', discarded }
 *   给调用者继续在本帧内完成全部后续效果。
 */
export function requestOrAutoHandDiscard(
  state: GameState,
  patch: Partial<GameState>,
  opts: {
    sourceCardId: string | null;
    requiredCount: number;
    title: string;
    prompt: string;
    subEffect: HandDiscardSelectionState['subEffect'];
    context: HandDiscardContinuation;
  },
): { mode: 'modal' } | { mode: 'auto'; discarded: GameCardData[] } {
  const eligible = getEligibleHandDiscardCards(state.handCards as GameCardData[], opts.sourceCardId);
  if (opts.requiredCount > 0 && eligible.length >= opts.requiredCount) {
    patch.pendingHandDiscardSelection = {
      subEffect: opts.subEffect,
      count: opts.requiredCount,
      sourceCardId: opts.sourceCardId,
      prompt: opts.prompt,
      title: opts.title,
      context: opts.context,
    };
    return { mode: 'modal' };
  }
  // 自动弃掉「可弃手牌不足 requiredCount」的全部牌（也可能是 0 张）。
  // 注意把源卡牌排除——它在 PLAY_CARD 后通常已不在手牌，但部分流程仍会保留，
  // 这里用 eligible（已剔除源 + 诅咒）作为 pickRandom 的输入，避免选到自己。
  const autoCount = Math.min(eligible.length, opts.requiredCount);
  if (autoCount <= 0) return { mode: 'auto', discarded: [] };
  const rng = patch.rng ?? state.rng;
  const [discarded, rngAfter] = pickRandomHandCardsForDiscardPreferGraveyard(eligible, autoCount, rng);
  patch.rng = rngAfter;
  return { mode: 'auto', discarded };
}

// ---------------------------------------------------------------------------
// 弃回后续效果 — 由触发方（自动分支）和 RESOLVE_HAND_DISCARD_SELECTION（玩家
// 选择分支）共用。所有 finalize* 都假定 `discarded` 已是「需要弃掉的卡牌列表」，
// 不会再做诅咒/源卡牌过滤；它们负责：
//   1. 把 discarded 从 handCards 中移除（写入 patch.handCards）
//   2. 把 discarded 入队到 ADD_TO_RECYCLE_BAG / ADD_TO_GRAVEYARD（按效果定）
//   3. 写日志/banner、设置 lastPlayedCardCategory、入队 FINALIZE_MAGIC_CARD
//   4. 完成各自后续效果（抽牌、发现、职业抽牌等）
// ---------------------------------------------------------------------------

export function finalizeDiscardDraw(
  state: GameState,
  card: GameCardData,
  discarded: GameCardData[],
  drawCount: number,
  echoTag: string,
  sideEffects: SideEffect[],
  patch: Partial<GameState>,
  enqueuedActions: GameAction[],
): ReduceResult {
  if (discarded.length > 0) {
    const discardIds = new Set(discarded.map(c => c.id));
    patch.handCards = (state.handCards as GameCardData[]).filter(c => !discardIds.has(c.id));
    for (const dc of discarded) {
      enqueuedActions.push({ type: 'DISCARD_OWNED_CARD', card: dc, owner: 'player', forceRecycleBag: true });
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
  const drawMsg = drawResult.cards.length > 0 ? `抽了 ${drawResult.cards.length} 张牌` : '背包为空';
  banner(sideEffects, `汰旧迎新：移回 ${discarded.length} 张牌，${drawMsg}。${echoTag}`);
  patch.lastPlayedCardCategory = getCardPlayCategory(card);
  enqueuedActions.push({ type: 'FINALIZE_MAGIC_CARD', card, dealtDamage: false });
  return applyPatch(state, patch, sideEffects, enqueuedActions);
}

export function finalizeAltarDiscardDiscover(
  state: GameState,
  card: GameCardData,
  discarded: GameCardData[],
  sideEffects: SideEffect[],
  patch: Partial<GameState>,
  enqueuedActions: GameAction[],
  echoMultiplier: number = 1,
): ReduceResult {
  const discardCount = discarded.length;
  if (discardCount > 0) {
    const discardIds = new Set(discarded.map(c => c.id));
    patch.handCards = (state.handCards as GameCardData[]).filter(c => !discardIds.has(c.id));
    for (const dc of discarded) {
      enqueuedActions.push({ type: 'DISCARD_OWNED_CARD', card: dc, owner: 'player' });
    }
    log(sideEffects, 'magic', `祭坛秘术：弃回 ${discarded.map(c => c.name).join('、')}`);
  }
  const classDeck = patch.classDeck ?? state.classDeck ?? [];
  const discoverPool = classDeck.filter((c: GameCardData) => c.type === 'magic' || c.type === 'hero-magic');
  if (discoverPool.length > 0) {
    // Class deck is an infinite template — sample candidates without
    // removing from `classDeck`. The chosen card will be cloned with a
    // fresh id at RESOLVE_DISCOVER_SELECTION time.
    let drng = patch.rng ?? state.rng;
    let shuffled: GameCardData[];
    [shuffled, drng] = rngShuffle(discoverPool, drng);
    patch.rng = drng;
    const candidates = shuffled.slice(0, Math.min(3, discoverPool.length));
    sideEffects.push({
      event: 'card:discoverRequested' as any,
      payload: { source: 'altar-discard-discover', candidates, sourceLabel: card.name },
    });
    // Spell Echo (B) — queue (echoMultiplier - 1) extra discovers.
    const echoExtras = Math.max(0, echoMultiplier - 1);
    if (echoExtras > 0) {
      const queueExtras = Array.from({ length: echoExtras }, () => ({
        source: 'altar-discard-discover',
        sourceLabel: card.name,
        magicOnly: true,
      }));
      patch.pendingClassDiscoverQueue = [
        ...(patch.pendingClassDiscoverQueue ?? state.pendingClassDiscoverQueue),
        ...queueExtras,
      ];
    }
    const echoSuffix = echoMultiplier > 1 ? `（回响×${echoMultiplier}：将连续发现 ${echoMultiplier} 张）` : '';
    banner(sideEffects, `祭坛秘术：弃回 ${discardCount} 张牌，发现专属魔法卡…${echoSuffix}`);
  } else {
    log(sideEffects, 'magic', '祭坛秘术：专属牌堆中没有魔法卡。');
    banner(sideEffects, `祭坛秘术：弃回 ${discardCount} 张牌，但专属牌堆中没有魔法卡。`);
  }
  patch.lastPlayedCardCategory = getCardPlayCategory(card);
  enqueuedActions.push({ type: 'FINALIZE_MAGIC_CARD', card, dealtDamage: false });
  return applyPatch(state, patch, sideEffects, enqueuedActions);
}

export function finalizeClassSummon(
  state: GameState,
  card: GameCardData,
  discarded: GameCardData[],
  sideEffects: SideEffect[],
  patch: Partial<GameState>,
  enqueuedActions: GameAction[],
): ReduceResult {
  const discardCount = discarded.length;
  if (discardCount > 0) {
    const discardIds = new Set(discarded.map(c => c.id));
    patch.handCards = (state.handCards as GameCardData[]).filter(c => !discardIds.has(c.id));
    for (const dc of discarded) {
      enqueuedActions.push({ type: 'DISCARD_OWNED_CARD', card: dc, owner: 'player' });
    }
    log(sideEffects, 'magic', `专属召唤：弃回 ${discarded.map(c => c.name).join('、')}`);
  }
  // 抽 1 张职业专属卡到背包：仅 enqueue 一次。
  // 历史 bug：曾经同时 enqueue DRAW_CLASS_TO_BACKPACK + push card:classDrawRequested
  // side effect，而 useCardPlayHandlers 的 'card:classDrawRequested' 监听又会
  // dispatch 一次 DRAW_CLASS_TO_BACKPACK，导致每次专属召唤实际抽 2 张职业卡。
  // 玩家观感会随背包剩余空位变化（可见 0/1/2 张），看似"有时不获得 / 有时多 1 张"。
  // 抽牌动画走 reduceDrawClassToBackpack 自带的 cards:classDrawn side effect。
  enqueuedActions.push({ type: 'DRAW_CLASS_TO_BACKPACK', count: 1 });
  banner(sideEffects, `专属召唤：弃回 ${discardCount} 张牌，获得一张职业专属卡！`);
  patch.lastPlayedCardCategory = getCardPlayCategory(card);
  enqueuedActions.push({ type: 'FINALIZE_MAGIC_CARD', card, dealtDamage: false });
  return applyPatch(state, patch, sideEffects, enqueuedActions);
}

export function finalizeEchoBag(
  state: GameState,
  card: GameCardData,
  discarded: GameCardData[],
  discoverCount: number,
  drawCount: number,
  echoTag: string,
  sideEffects: SideEffect[],
  patch: Partial<GameState>,
  enqueuedActions: GameAction[],
): ReduceResult {
  const actualDiscard = discarded.length;
  let newToGraveyard = 0;
  if (actualDiscard > 0) {
    const discardIds = new Set(discarded.map(c => c.id));
    patch.handCards = (state.handCards as GameCardData[]).filter(c => !discardIds.has(c.id));
    for (const dc of discarded) {
      enqueuedActions.push({ type: 'DISCARD_OWNED_CARD', card: dc, owner: 'player' });
      if (!isRecyclableFromHand(dc)) newToGraveyard += 1;
    }
    log(sideEffects, 'magic', `回响行囊：弃回 ${discarded.map(c => c.name).join('、')}`);
  }
  // 坟场计数：现有 + 本次入队的非永久卡（永久卡走回收袋，不进坟场）。
  const currentGraveyardSize = (state.discardedCards ?? []).length;
  const graveyardSize = currentGraveyardSize + newToGraveyard;
  if (graveyardSize > 0 && discoverCount > 0) {
    sideEffects.push({
      event: 'card:echoBagDiscover',
      payload: { card, discoverCount, drawCount },
    });
    log(sideEffects, 'magic', `回响行囊：从坟场发现 ${discoverCount} 张牌…`);
    banner(sideEffects, `回响行囊：弃回 ${actualDiscard} 张牌，从坟场发现…${echoTag}`);
    patch.lastPlayedCardCategory = getCardPlayCategory(card);
    return applyPatch(state, patch, sideEffects, enqueuedActions);
  }
  // 坟场为空：跳过发现，直接补抽。
  const drawState = { ...state, ...patch } as GameState;
  const drawResult = drawMultipleFromBackpack(drawState, drawCount, { ignoreLimit: true });
  if (drawResult.cards.length > 0) {
    mergePatch(patch, drawResult.patch);
    for (const d of drawResult.cards) {
      sideEffects.push({ event: 'card:drawnToHand', payload: { cardId: d.id, source: 'backpack' } });
    }
  }
  const drawMsg = drawResult.cards.length > 0 ? `抽了 ${drawResult.cards.length} 张牌` : '背包为空';
  banner(sideEffects, `回响行囊：弃回 ${actualDiscard} 张牌，坟场为空，${drawMsg}。${echoTag}`);
  patch.lastPlayedCardCategory = getCardPlayCategory(card);
  enqueuedActions.push({ type: 'FINALIZE_MAGIC_CARD', card, dealtDamage: false });
  return applyPatch(state, patch, sideEffects, enqueuedActions);
}

/**
 * 噬血砺锋（discard-empower 英雄技能）的弃回后续：把选中的 1 张手牌移入坟场，
 * 触发 lastWordsDiscard 动画；如果只装备了 1 件武器/盾，立刻给该装备挂上「下次
 * 攻击 +2 + 吸血」并标记技能已用；否则切到 pendingHeroSkillAction（slot-select），
 * 由后续 RESOLVE_HERO_SKILL_TARGET 完成。
 */
export function finalizeDiscardEmpower(
  state: GameState,
  discarded: GameCardData[],
  skillId: string,
  sideEffects: SideEffect[],
  patch: Partial<GameState>,
  enqueuedActions: GameAction[],
): ReduceResult {
  const dc = discarded[0];
  if (!dc) return applyPatch(state, patch, sideEffects, enqueuedActions);
  patch.handCards = (state.handCards as GameCardData[]).filter(c => c.id !== dc.id);
  // 走 DISCARD_OWNED_CARD：永久卡 → 回收袋；非永久 → 坟场；并触发 onDiscard* 等弃置副作用。
  enqueuedActions.push({ type: 'DISCARD_OWNED_CARD', card: dc, owner: 'player' });
  sideEffects.push({
    event: 'log:entry',
    payload: { type: 'skill', message: `噬血砺锋：弃置「${dc.name}」` },
  });
  sideEffects.push({
    event: 'combat:lastWordsDiscard',
    payload: { cards: [dc], monsterName: '噬血砺锋' },
  });
  const eq1 = state.equipmentSlot1 as GameCardData | null;
  const eq2 = state.equipmentSlot2 as GameCardData | null;
  const equippedSlots: EquipmentSlotId[] = [];
  if (eq1) equippedSlots.push('equipmentSlot1');
  if (eq2) equippedSlots.push('equipmentSlot2');
  if (equippedSlots.length === 1) {
    const slotId = equippedSlots[0];
    const slotItem = slotId === 'equipmentSlot1' ? eq1 : eq2;
    patch.slotAttackBursts = { ...(state.slotAttackBursts ?? {}), [slotId]: 2 };
    patch.nextAttackLifestealSlot = slotId;
    Object.assign(patch, markSkillUsedPure(state, skillId as any));
    patch.heroSkillBanner = `${slotItem!.name} 的下次攻击 +2 伤害 且 吸血！`;
    sideEffects.push({
      event: 'log:entry',
      payload: { type: 'skill', message: `噬血砺锋：${slotItem!.name} 下次攻击 +2 且吸血` },
    });
  } else {
    patch.pendingHeroSkillAction = { skillId: skillId as any, type: 'slot' };
    patch.heroSkillBanner = '选择一个装备：下次攻击 +2 伤害 且 吸血。';
    sideEffects.push({
      event: 'hero:skillRequiresTarget',
      payload: { skillId, targetType: 'slot' },
    });
  }
  return applyPatch(state, patch, sideEffects, enqueuedActions);
}

/**
 * 唤回秘药·转型（discard-recycle-to-hand:N）的弃回后续：
 *
 * 1. 把玩家选中的 1 张手牌（discarded[0]）通过 DISCARD_OWNED_CARD 弃回
 *    （Perm 进回收袋、非 Perm 进坟场，并触发 onDiscardDraw / catapult 等弃置联动）。
 *    若 discarded 为空（auto-skip 路径：手牌没有可弃的牌），则跳过弃回步骤。
 * 2. 从 permanentMagicRecycleBag 随机取 N 张到手牌（排除转型源卡 id 防御性自我过滤）。
 *    若回收袋为空，仅记录「回收袋为空」banner，**仍允许步骤 1 的弃回完成**
 *    （用户已确认：discard_anyway）。
 *
 * 与 reduceApplyTransformCategory 的 'recycle-to-hand:' 旧分支一致地不 enqueue
 * FINALIZE_MAGIC_CARD —— 转型源卡（持有 transformEffect 的那张牌）已经在它自己
 * 的 PLAY_CARD/RESOLVE_MAGIC 链里 finalize 过了，APPLY_TRANSFORM_CATEGORY 只是
 * 它的 follow-up，不需要再 finalize。
 */
export function finalizeTransformDiscardRecycle(
  state: GameState,
  transformCard: GameCardData,
  discarded: GameCardData[],
  recycleDrawCount: number,
  sideEffects: SideEffect[],
  patch: Partial<GameState>,
  enqueuedActions: GameAction[],
): ReduceResult {
  let discardName: string | null = null;
  if (discarded.length > 0) {
    const discardIds = new Set(discarded.map(c => c.id));
    patch.handCards = (state.handCards as GameCardData[]).filter(c => !discardIds.has(c.id));
    for (const dc of discarded) {
      enqueuedActions.push({ type: 'DISCARD_OWNED_CARD', card: dc, owner: 'player' });
    }
    discardName = discarded.map(c => `「${c.name}」`).join('、');
    log(sideEffects, 'magic', `转型触发：弃回${discardName}`);
  }

  const excludeIds = new Set<string>([transformCard.id, ...discarded.map(c => c.id)]);
  const bag = state.permanentMagicRecycleBag.filter(c => !excludeIds.has(c.id));
  let rng = patch.rng ?? state.rng;
  const handAfterDiscard = patch.handCards ?? state.handCards;

  if (bag.length > 0 && recycleDrawCount > 0) {
    const [shuffled, rng2] = rngShuffle(bag, rng);
    rng = rng2;
    patch.rng = rng;
    const picks = shuffled.slice(0, Math.min(recycleDrawCount, bag.length));
    const pickIds = new Set(picks.map(p => p.id));
    patch.permanentMagicRecycleBag = state.permanentMagicRecycleBag.filter(c => !pickIds.has(c.id));
    patch.handCards = [...handAfterDiscard, ...picks];
    for (const pick of picks) {
      sideEffects.push({ event: 'card:queueToHand', payload: { card: pick } });
    }
    const names = picks.map(p => `「${p.name}」`).join('、');
    log(sideEffects, 'magic', `转型触发：从回收袋取回${names}！`);
    if (discardName) {
      banner(sideEffects, `转型触发！弃回${discardName}，从回收袋取回${names}！`);
    } else {
      banner(sideEffects, `转型触发！手牌无可弃，从回收袋取回${names}！`);
    }
  } else {
    log(sideEffects, 'magic', '转型触发：回收袋为空。');
    if (discardName) {
      banner(sideEffects, `转型触发！弃回${discardName}，但回收袋为空。`);
    } else {
      banner(sideEffects, '转型触发！但手牌无可弃且回收袋为空。');
    }
  }

  return applyPatch(state, patch, sideEffects, enqueuedActions);
}

// ---------------------------------------------------------------------------
// RESOLVE_HAND_DISCARD_SELECTION — 玩家在 HandDiscardSelectionModal 点击「确认弃回」
// 后由该 reducer 接力。负责：校验选择、清空 pendingHandDiscardSelection、按
// subEffect 调用对应 finalize* 完成后续效果。
//
// 与「自动分支」共用 finalize*；最终落到同一组日志/侧效产物。
// ---------------------------------------------------------------------------

export function resolveHandDiscardSelection(
  state: GameState,
  action: Extract<GameAction, { type: 'RESOLVE_HAND_DISCARD_SELECTION' }>,
): ReduceResult {
  const pending = state.pendingHandDiscardSelection;
  if (!pending) return noChange(state);

  const sideEffects: SideEffect[] = [];
  const enqueuedActions: GameAction[] = [];
  const patch: Partial<GameState> = {};

  if (action.cardIds.length !== pending.count) {
    return noChange(state);
  }
  const eligibleCards = getEligibleHandDiscardCards(
    state.handCards as GameCardData[],
    pending.sourceCardId,
  );
  const eligibleById = new Map(eligibleCards.map(c => [c.id, c]));
  const discarded: GameCardData[] = [];
  const seen = new Set<string>();
  for (const cardId of action.cardIds) {
    if (seen.has(cardId)) return noChange(state);
    seen.add(cardId);
    const c = eligibleById.get(cardId);
    if (!c) return noChange(state);
    discarded.push(c);
  }

  patch.pendingHandDiscardSelection = null;

  switch (pending.context.kind) {
    case 'discard-draw':
      return finalizeDiscardDraw(
        state,
        pending.context.cardSnapshot,
        discarded,
        pending.context.drawCount,
        pending.context.echoTag,
        sideEffects,
        patch,
        enqueuedActions,
      );
    case 'altar-discover':
      return finalizeAltarDiscardDiscover(
        state,
        pending.context.cardSnapshot,
        discarded,
        sideEffects,
        patch,
        enqueuedActions,
        pending.context.echoMultiplier ?? 1,
      );
    case 'class-summon':
      return finalizeClassSummon(
        state,
        pending.context.cardSnapshot,
        discarded,
        sideEffects,
        patch,
        enqueuedActions,
      );
    case 'echo-bag':
      return finalizeEchoBag(
        state,
        pending.context.cardSnapshot,
        discarded,
        pending.context.discoverCount,
        pending.context.drawCount,
        pending.context.echoTag,
        sideEffects,
        patch,
        enqueuedActions,
      );
    case 'discard-empower':
      return finalizeDiscardEmpower(
        state,
        discarded,
        pending.context.skillId,
        sideEffects,
        patch,
        enqueuedActions,
      );
    case 'transform-discard-recycle':
      return finalizeTransformDiscardRecycle(
        state,
        pending.context.cardSnapshot,
        discarded,
        pending.context.recycleDrawCount,
        sideEffects,
        patch,
        enqueuedActions,
      );
    default: {
      const _exhaustive: never = pending.context;
      void _exhaustive;
      return noChange(state);
    }
  }
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
  if (ae.swapUpgradeCount <= 0) return false;
  // Each equipped 流转之符 advances the shared progress counter once per swap.
  // Equivalent to N independent counters with synchronised ticks (still
  // triggers at the 3-progress threshold, just N× as often).
  const inc = ae.swapUpgradeCount;
  const baseProg = (patch.swapUpgradeProgress ?? state.swapUpgradeProgress ?? 0);
  const prog = baseProg + inc;
  if (prog >= 3) {
    patch.swapUpgradeProgress = prog % 3;
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
      enqueuedActions.push({ type: 'APPLY_DAMAGE', amount: 1, source: 'frenzy-curse', selfInflicted: true });
      enqueuedActions.push({ type: 'DRAW_FROM_BACKPACK', count: 1 } as GameAction);
      log(sideEffects, 'magic', '战狂诅咒：失去 1 生命，抽 1 张牌。');
      banner(sideEffects, '战狂诅咒：失去 1 生命，抽 1 张牌！');
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
    // arcane-storm 专用累计：不含奥术风暴自身那张（与 engine.ts 同步）。
    if (card.magicEffect !== 'arcane-storm-magic-count') {
      patch.arcaneStormMagicCount = (state.arcaneStormMagicCount ?? 0) + 1;
    }
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
    const reduction = 3 * echoMultiplier;
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
    case '混沌冲击':
      return resolveChaosStrike(state, card, sideEffects, patch, enqueuedActions, echoMultiplier, isEchoTriggered);

    case '风暴箭雨':
      return resolveStormVolley(state, card, sideEffects, patch, enqueuedActions, echoMultiplier, isEchoTriggered);

    case '涌泉满手':
      return resolveFountainHand(state, card, sideEffects, patch, enqueuedActions);

    case '余烬回响':
      return resolveEmberEcho(state, card, sideEffects, patch, enqueuedActions, echoMultiplier, isEchoTriggered);

    case '治愈术': {
      const healAmounts = [5, 3, 5];
      const healBase = healAmounts[card.upgradeLevel ?? 0] ?? 5;
      const healAmt = healBase * echoMultiplier;
      const echoTagH = isEchoTriggered ? `（回响×${echoMultiplier}）` : '';
      enqueuedActions.push({ type: 'HEAL', amount: healAmt, source: 'heal-magic' });
      log(sideEffects, 'magic', `治愈术：恢复 ${healAmt} 点生命${echoTagH}`);
      banner(sideEffects, `治愈术：回复 ${healAmt} 点生命。${echoTagH}`);
      patch.lastPlayedCardCategory = getCardPlayCategory(card);
      enqueuedActions.push({ type: 'FINALIZE_MAGIC_CARD', card, dealtDamage: false });
      return applyPatch(state, patch, sideEffects, enqueuedActions);
    }

    case '点金裁决':
      return resolveBloodReckoning(state, card, sideEffects, patch, enqueuedActions, echoMultiplier, isEchoTriggered);

    case '等价交换':
      return resolveSoulSwap(state, card, sideEffects, patch, enqueuedActions, echoMultiplier);

    case '永恒铭刻':
      return resolvePermGrant(state, card, sideEffects, patch, enqueuedActions, echoMultiplier);

    case '专属召唤': {
      const promptText = '选择 2 张手牌弃回（之后获得一张职业专属卡）。';
      const result = requestOrAutoHandDiscard(state, patch, {
        sourceCardId: card.id,
        requiredCount: 2,
        title: '专属召唤',
        prompt: promptText,
        subEffect: 'class-summon',
        context: { kind: 'class-summon', cardSnapshot: card },
      });
      if (result.mode === 'modal') {
        banner(sideEffects, promptText);
        return applyPatch(state, patch, sideEffects, enqueuedActions);
      }
      return finalizeClassSummon(state, card, result.discarded, sideEffects, patch, enqueuedActions);
    }

    case '升级卷轴': {
      patch.upgradeModalOpen = true;
      // 法术回响（B）：用 upgradeModalMaxCount 让升级模态保持打开 N 次，
      // 玩家连续选 N 张牌升级，模态在第 N 次升级后或玩家手动关闭时关闭。
      // 没有回响时保持原行为（maxCount=undefined → 选 1 张后关闭）。
      if (echoMultiplier > 1) {
        patch.upgradeModalMaxCount = echoMultiplier;
      }
      banner(sideEffects, echoMultiplier > 1
        ? `升级卷轴：回响 ×${echoMultiplier}——可连续选择 ${echoMultiplier} 张牌升级。`
        : '升级卷轴：选择一张牌进行升级。');
      patch.lastPlayedCardCategory = getCardPlayCategory(card);
      enqueuedActions.push({ type: 'FINALIZE_MAGIC_CARD', card, dealtDamage: false });
      return applyPatch(state, patch, sideEffects, enqueuedActions);
    }

    case '秘法精炼': {
      // 法术回响（B）：原行为最多选 2 张；回响 ×N 时上限改为 2N，
      // 让玩家在同一弹窗里多选几张（不重开模态，避免 UI 状态污染）。
      const maxSelect = 2 * Math.max(1, echoMultiplier);
      patch.handMagicUpgradeModal = { sourceCardId: card.id, maxSelect };
      banner(sideEffects, echoMultiplier > 1
        ? `秘法精炼：回响 ×${echoMultiplier}——可选择至多 ${maxSelect} 张魔法牌升级。`
        : '秘法精炼：选择至多 2 张魔法牌进行升级。');
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
    const promptText = '选择 2 张手牌弃回坟场（之后从职业魔法堆中发现 1 张）。';
    const result = requestOrAutoHandDiscard(state, patch, {
      sourceCardId: card.id,
      requiredCount: 2,
      title: '祭坛秘术',
      prompt: promptText,
      subEffect: 'altar-discover',
      context: { kind: 'altar-discover', cardSnapshot: card, echoMultiplier },
    });
    if (result.mode === 'modal') {
      banner(sideEffects, promptText);
      return applyPatch(state, patch, sideEffects, enqueuedActions);
    }
    return finalizeAltarDiscardDiscover(state, card, result.discarded, sideEffects, patch, enqueuedActions, echoMultiplier);
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
    // 结构类（C）：执行 echoMultiplier 次置换。两次置换 = 还原 = 无额外效果。
    // 对于偶数 echo (=2)，第二次置换抵消第一次；显式提示「二次结算无额外效果」。
    let curBackpack = state.backpackItems as GameCardData[];
    let curRecycle = state.permanentMagicRecycleBag as GameCardData[];
    for (let i = 0; i < echoMultiplier; i++) {
      const newBackpack = curRecycle.map(c => sanitizeCardMetadata(c));
      const newRecycle = curBackpack.map(c => sanitizeCardMetadata(c));
      curBackpack = newBackpack;
      curRecycle = newRecycle;
    }
    // 「置顶」关键词：奇数次置换后，新 backpack（来源是旧 recycle bag）里的置顶卡
    // 要 prepend 到 backpackItems[0]（第 1 格）。偶数次置换净结果还原，无 recycle→
    // backpack 位移，不触发置顶。
    const isOddSwap = echoMultiplier % 2 === 1;
    let restoredToBackpackTop: GameCardData[] = [];
    if (isOddSwap) {
      const toBackpack: GameCardData[] = [];
      for (const c of curBackpack) {
        if (c.topOnRecycleRestore) restoredToBackpackTop.push(c);
        else toBackpack.push(c);
      }
      curBackpack = [...restoredToBackpackTop, ...toBackpack];
    }
    patch.backpackItems = curBackpack;
    patch.permanentMagicRecycleBag = curRecycle;
    // 仅当净结果是「奇数次置换」（即真的有原回收袋的卡进了背包）时触发动画。
    // 偶数次（含 echo×2 的常见情况）净结果还原，无视觉位移，不播绿环。
    // 同步参考：rules/waterfall.ts、rules/magic-effects.ts 的 STARTER_CARD_IDS.recycleDrawMagic、
    // card-schema/definitions/magic.ts 的 swap-backpack-recycle、rules/turn.ts 幽魂净化。
    if (isOddSwap && (state.permanentMagicRecycleBag?.length ?? 0) > 0) {
      sideEffects.push({
        event: 'waterfall:recycleRestored',
        payload: {
          count: state.permanentMagicRecycleBag.length,
          cards: state.permanentMagicRecycleBag as GameCardData[],
        },
      });
      if (restoredToBackpackTop.length > 0) {
        sideEffects.push({
          event: 'card:promotedToDeckTop',
          payload: { count: restoredToBackpackTop.length, cards: restoredToBackpackTop },
        });
      }
    }
    log(sideEffects, 'magic', `虚空置换：背包与回收袋对换（背包现 ${patch.backpackItems.length} 张，回收袋现 ${patch.permanentMagicRecycleBag.length} 张）${echoTag}${echoMultiplier > 1 && echoMultiplier % 2 === 0 ? '；回响：二次结算还原状态' : ''}。`);
    banner(sideEffects, echoMultiplier > 1
      ? `虚空置换：执行 ${echoMultiplier} 次（${echoMultiplier % 2 === 0 ? '回响：二次结算无额外效果' : '回响：累计奇数次置换'}）。`
      : '虚空置换：背包与永久魔法回收袋内容已对换。');
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
        patch.backpackItems = [...state.backpackItems, ...toAdd];
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
    let leftIdx = -1;
    let rightIdx = -1;
    for (let i = 0; i < cards.length; i++) {
      if (cards[i] != null) {
        if (leftIdx === -1) leftIdx = i;
        rightIdx = i;
      }
    }
    if (leftIdx === -1 || leftIdx === rightIdx) {
      log(sideEffects, 'magic', '命运挪移无效（地城行剩余卡牌不足 2 张）。');
      banner(sideEffects, '命运挪移无效（地城行剩余卡牌不足 2 张）。');
      patch.lastPlayedCardCategory = getCardPlayCategory(card);
      enqueuedActions.push({ type: 'FINALIZE_MAGIC_CARD', card, dealtDamage: false });
      return applyPatch(state, patch, sideEffects, enqueuedActions);
    }
    const leftCard = cards[leftIdx]!;
    const rightCard = cards[rightIdx]!;
    const next = [...cards] as ActiveRowSlots;
    for (let swapI = 0; swapI < echoMultiplier; swapI++) {
      const tmp = next[leftIdx];
      next[leftIdx] = next[rightIdx];
      next[rightIdx] = tmp;
    }
    patch.activeCards = next;
    if (echoMultiplier % 2 === 1) {
      sideEffects.push({
        event: 'magic:activeRowSwap',
        payload: { leftSlotIdx: leftIdx, rightSlotIdx: rightIdx, leftCard, rightCard },
      });
    }
    const bannerText = echoMultiplier > 1
      ? `命运挪移 ×${echoMultiplier}：${leftCard.name} ↔ ${rightCard.name}（回响）`
      : `命运挪移：${leftCard.name} ↔ ${rightCard.name} 位置互换！`;
    log(sideEffects, 'magic', `命运挪移：${leftCard.name} 与 ${rightCard.name} 互换 ${echoMultiplier} 次。`);
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
    // 单目标伤害 magic：始终弹出 picker（包含 hero 自伤路径）。
    // 不再因为没有怪物 / 只有一个怪物就 fizzle / 自动选；玩家可以选 Hero Cell 自伤。
    const baseDmg = 5 + (card.amplifyBonus ?? 0);
    const totalDmg = getSpellDamage(baseDmg, state) * echoMultiplier;
    patch.pendingMagicAction = {
      card,
      effect: 'bounty-spell-damage',
      step: 'monster-select',
      echoMultiplier,
      prompt: `选择一个目标，造成 ${totalDmg} 点法术伤害并获得等量金币。${echoTag}`,
      allowsHeroTarget: true,
    } as any;
    patch.heroSkillBanner = '赏金裁决：选择目标。';
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
    // Spell Echo (B) — first discover fires immediately; (echoMultiplier - 1)
    // additional discovers are queued via `pendingClassDiscoverQueue` and
    // re-prompted as the player closes each modal.
    const classDeck = state.classDeck ?? [];
    const pool = classDeck.filter((c: GameCardData) => c.type === 'magic' || c.type === 'hero-magic');
    if (pool.length === 0) {
      log(sideEffects, 'magic', '祭坛秘术：专属牌堆中没有魔法卡。');
      banner(sideEffects, '祭坛秘术：专属牌堆中没有魔法卡。');
    } else {
      // Class deck is an infinite template — candidates are sampled without
      // mutating `classDeck`; the chosen card is cloned at selection time.
      let rng = patch.rng ?? state.rng;
      let shuffled: GameCardData[];
      [shuffled, rng] = rngShuffle(pool, rng);
      patch.rng = rng;
      const candidates = shuffled.slice(0, Math.min(3, pool.length));
      sideEffects.push({ event: 'card:discoverRequested' as any, payload: { source: 'altar-discover-class-magic', candidates, sourceLabel: card.name } });
      const echoExtras = Math.max(0, echoMultiplier - 1);
      if (echoExtras > 0) {
        const queueExtras = Array.from({ length: echoExtras }, () => ({
          source: 'altar-discover-class-magic',
          sourceLabel: card.name,
          magicOnly: true,
        }));
        patch.pendingClassDiscoverQueue = [
          ...(patch.pendingClassDiscoverQueue ?? state.pendingClassDiscoverQueue),
          ...queueExtras,
        ];
      }
      const echoSuffix = isEchoTriggered ? `（回响×${echoMultiplier}：将连续发现 ${echoMultiplier} 张）` : '';
      banner(sideEffects, `祭坛秘术：发现专属魔法卡…${echoSuffix}`);
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
      const discards = [1, 1, 1];
      const draws = [2, 3, 4];
      const discardCount = discards[card.upgradeLevel ?? 0] ?? 1;
      const drawCount = draws[card.upgradeLevel ?? 0] ?? 2;
      const promptText = `选择 ${discardCount} 张手牌移回回收袋（之后从背包抽 ${drawCount} 张）。`;
      const result = requestOrAutoHandDiscard(state, patch, {
        sourceCardId: card.id,
        requiredCount: discardCount,
        title: '汰旧迎新',
        prompt: promptText,
        subEffect: 'discard-draw',
        context: { kind: 'discard-draw', cardSnapshot: card, drawCount, echoTag },
      });
      if (result.mode === 'modal') {
        // 等待玩家在弹窗里选择；finalize 由 RESOLVE_HAND_DISCARD_SELECTION 完成。
        banner(sideEffects, promptText);
        return applyPatch(state, patch, sideEffects, enqueuedActions);
      }
      // 自动分支：可弃手牌不足，按现有顺序自动弃完，剩下的逻辑与玩家选择路径共用。
      return finalizeDiscardDraw(state, card, result.discarded, drawCount, echoTag, sideEffects, patch, enqueuedActions);
    }

    case STARTER_CARD_IDS.tempArmor: {
      const armorAmounts = [2, 4, 6];
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

    case STARTER_CARD_IDS.discoverClassToHand: {
      // 「专属感召」(Perm 1)：发现一张专属牌，直接进手牌。
      // Spell Echo (B) — when echoMultiplier > 1, queue (echoMultiplier - 1)
      // additional discover prompts via `pendingClassDiscoverQueue`. The first
      // discover fires immediately via `card:discoverRequested`; each queued
      // entry re-opens the modal after the previous selection (handled in
      // `reduceResolveDiscoverSelection` and `SET_DISCOVER_MODAL` close path).
      const classDeck = state.classDeck ?? [];
      if (classDeck.length === 0) {
        banner(sideEffects, '专属感召：专属牌堆为空。');
        log(sideEffects, 'magic', '专属感召：专属牌堆为空。');
        patch.lastPlayedCardCategory = getCardPlayCategory(card);
        enqueuedActions.push({ type: 'FINALIZE_MAGIC_CARD', card, dealtDamage: false });
        return applyPatch(state, patch, sideEffects, enqueuedActions);
      }
      let drng = patch.rng ?? state.rng;
      let shuffled: GameCardData[];
      [shuffled, drng] = rngShuffle(classDeck, drng);
      patch.rng = drng;
      const candidates = shuffled.slice(0, Math.min(3, classDeck.length));
      sideEffects.push({
        event: 'card:discoverRequested',
        payload: {
          source: 'starter-discover-class-to-hand',
          candidates,
          sourceLabel: card.name,
          delivery: 'hand-first',
        },
      });
      const echoExtras = Math.max(0, echoMultiplier - 1);
      if (echoExtras > 0) {
        const queueExtras = Array.from({ length: echoExtras }, () => ({
          source: 'starter-discover-class-to-hand',
          sourceLabel: card.name,
          delivery: 'hand-first' as const,
        }));
        patch.pendingClassDiscoverQueue = [
          ...(patch.pendingClassDiscoverQueue ?? state.pendingClassDiscoverQueue),
          ...queueExtras,
        ];
      }
      const echoSuffix = isEchoTriggered ? `（回响×${echoMultiplier}：将连续发现 ${echoMultiplier} 张）` : '';
      banner(sideEffects, `专属感召：发现一张专属牌，直接进入手牌。${echoSuffix}`);
      log(sideEffects, 'magic', `专属感召：候选 ${candidates.map(c => `「${c.name}」`).join('、')}`);
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
        const slotIdx = (state.activeCards as (GameCardData | null)[]).findIndex(c => c?.id === target.id);
        const newActive = (state.activeCards as (GameCardData | null)[]).map(c => c?.id === target.id ? null : c) as ActiveRowSlots;
        patch.activeCards = newActive;
        patch.remainingDeck = [...state.remainingDeck, sanitizeCardMetadata(target)];
        if (slotIdx !== -1) {
          sideEffects.push({
            event: 'magic:returnToDeck',
            payload: { slotIdx, card: target },
          });
        }
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
      let firstIdx = -1;
      let secondIdx = -1;
      for (let i = 0; i < cards.length; i++) {
        if (cards[i] != null) {
          if (firstIdx === -1) firstIdx = i;
          else if (secondIdx === -1) { secondIdx = i; break; }
        }
      }
      if (firstIdx === -1 || secondIdx === -1) {
        banner(sideEffects, '乾坤挪移无效（地城行剩余卡牌不足 2 张）。');
        patch.lastPlayedCardCategory = getCardPlayCategory(card);
        enqueuedActions.push({ type: 'FINALIZE_MAGIC_CARD', card, dealtDamage: false });
        return applyPatch(state, patch, sideEffects, enqueuedActions);
      }
      const next = [...cards] as ActiveRowSlots;
      for (let swapI = 0; swapI < echoMultiplier; swapI++) {
        const tmp = next[firstIdx];
        next[firstIdx] = next[secondIdx];
        next[secondIdx] = tmp;
      }
      patch.activeCards = next;
      const firstCard = cards[firstIdx]!;
      const secondCard = cards[secondIdx]!;
      if (echoMultiplier % 2 === 1) {
        sideEffects.push({
          event: 'magic:activeRowSwap',
          payload: { leftSlotIdx: firstIdx, rightSlotIdx: secondIdx, leftCard: firstCard, rightCard: secondCard },
        });
      }
      const bnr = echoMultiplier > 1
        ? `乾坤挪移 ×${echoMultiplier}：${firstCard.name} ↔ ${secondCard.name}（回响）`
        : `${firstCard.name} ↔ ${secondCard.name} 位置互换！`;
      log(sideEffects, 'magic', `乾坤挪移：${firstCard.name} 与 ${secondCard.name} 互换 ${echoMultiplier} 次。`);
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
      // 走 createMagicBoltCard + applyAmplifyOnCreate（与魔弹连弩 / gainBolts 一致），
      // 让新生成的「魔弹」继承 amplifiedCardBonus['魔弹'] 的累计增幅。
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
      // 语义：从回收袋**随机**选 N 张牌（N = 1/2/3，按 upgradeLevel），
      // 对这 N 张牌的 _recycleWaits -= 1。减到 0 的 ready 牌进背包；剩下的留回收袋。
      // **未被选中的牌完全不变**。
      // 注意：本卡不再有"被回收时抽牌"效果（曾经的 onDiscardDraw 已删除）。
      // 此 switch 是 fallback：实际生产路径走 card-schema/definitions/magic.ts
      // 的 starter:recycleDrawMagic resolver。两份必须保持同步
      // （rule: shared-effect-id-impact-check）。
      const recycleCounts = [1, 2, 3];
      const N = recycleCounts[card.upgradeLevel ?? 0] ?? 3;
      const recycled = ((patch.permanentMagicRecycleBag ?? state.permanentMagicRecycleBag) ?? []) as GameCardData[];
      if (recycled.length > 0) {
        let rng = patch.rng ?? state.rng;
        const pickCount = Math.min(N, recycled.length);
        const remainingIndices = recycled.map((_, i) => i);
        const pickedIndices = new Set<number>();
        for (let k = 0; k < pickCount; k++) {
          const [pos, rng2] = nextInt(rng, 0, remainingIndices.length - 1);
          rng = rng2;
          pickedIndices.add(remainingIndices[pos]);
          remainingIndices.splice(pos, 1);
        }
        patch.rng = rng;

        const readyCards: GameCardData[] = [];
        const newRecycleBag: GameCardData[] = [];
        const pickedNames: string[] = [];
        recycled.forEach((c, idx) => {
          if (!pickedIndices.has(idx)) {
            newRecycleBag.push(c as GameCardData);
            return;
          }
          pickedNames.push(`「${(c as GameCardData).name}」`);
          const newWaits = ((c as GameCardData & { _recycleWaits?: number })._recycleWaits ?? 1) - 1;
          if (newWaits <= 0) {
            const { _recycleWaits, ...clean } = c as GameCardData & { _recycleWaits?: number };
            readyCards.push(clean as GameCardData);
          } else {
            newRecycleBag.push({ ...c, _recycleWaits: newWaits } as GameCardData);
          }
        });

        const cap = getEffectiveBackpackCapacity({ ...state, ...patch } as GameState);
        const currentBackpack = (patch.backpackItems ?? state.backpackItems) as GameCardData[];
        const available = Math.max(0, cap - currentBackpack.length);
        const toAdd = readyCards.slice(0, available);
        const overflow = readyCards.slice(available);

        if (toAdd.length > 0) {
          // 「置顶」关键词：toAdd 切两半，置顶 → backpackItems[0]（prepend），
          // 其余 → backpackItems 末尾（append）。两组都进背包，**不再**走 remainingDeck。
          // 这条路径不走 processRecycleBag（自己手写了 _recycleWaits 递减 + 容量切片），
          // 所以手动复刻 cards.ts processRecycleBag 的分流逻辑。
          const restoredToBackpackTop: GameCardData[] = [];
          const restoredToBackpack: GameCardData[] = [];
          for (const c of toAdd) {
            if (c.topOnRecycleRestore) restoredToBackpackTop.push(c);
            else restoredToBackpack.push(c);
          }
          patch.backpackItems = [...restoredToBackpackTop, ...currentBackpack, ...restoredToBackpack];
          // 跟 waterfall 路径保持同样的 UI 通知：触发 BackpackZone 的绿色回收环动画 +
          // 「置顶」卡的二段反馈。同步参考：rules/waterfall.ts、card-schema/definitions/magic.ts
          // 的 starter:recycleDrawMagic。
          sideEffects.push({
            event: 'waterfall:recycleRestored',
            payload: { count: toAdd.length, cards: toAdd },
          });
          if (restoredToBackpackTop.length > 0) {
            sideEffects.push({
              event: 'card:promotedToDeckTop',
              payload: { count: restoredToBackpackTop.length, cards: restoredToBackpackTop },
            });
          }
        }
        patch.permanentMagicRecycleBag = [...newRecycleBag, ...overflow];

        const parts: string[] = [];
        parts.push(`随机选 ${pickCount} 张牌瀑流 -1（${pickedNames.join('、')}）`);
        if (toAdd.length > 0) parts.push(`${toAdd.length} 张就绪进背包`);
        if (overflow.length > 0) parts.push(`${overflow.length} 张就绪但背包已满留在回收袋`);
        const detail = parts.join('，');
        log(sideEffects, 'magic', `回收余韵：${detail}`);
        banner(sideEffects, `回收余韵：${detail}！`);
      } else {
        log(sideEffects, 'magic', '回收余韵:回收袋为空');
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
    case '淬炼冲击':
      return resolveOverkillUpgrade(state, card, sideEffects, patch, enqueuedActions, echoMultiplier, isEchoTriggered);

    case '专属召唤': {
      const promptText = '选择 2 张手牌弃回（之后获得一张职业专属卡）。';
      const result = requestOrAutoHandDiscard(state, patch, {
        sourceCardId: card.id,
        requiredCount: 2,
        title: '专属召唤',
        prompt: promptText,
        subEffect: 'class-summon',
        context: { kind: 'class-summon', cardSnapshot: card },
      });
      if (result.mode === 'modal') {
        banner(sideEffects, promptText);
        return applyPatch(state, patch, sideEffects, enqueuedActions);
      }
      return finalizeClassSummon(state, card, result.discarded, sideEffects, patch, enqueuedActions);
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
      return applyCryptDeathwish(state, card, slots[0].id, sideEffects, patch, enqueuedActions, echoMultiplier);
    }
    patch.pendingMagicAction = {
      card,
      effect: 'crypt-deathwish',
      step: 'slot-select',
      prompt: `选择一个装备，触发其遗言效果 ${2 * echoMultiplier} 次`,
      echoMultiplier,
    } as any;
    patch.heroSkillBanner = `墓语遗愿：选择一个装备触发遗言 ${2 * echoMultiplier} 次。`;
    sideEffects.push({ event: 'card:cryptDeathwishSelect' as any, payload: { card, echoMultiplier } });
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
      // 单目标伤害 magic：始终弹出 picker（包含 hero 自伤路径）。
      const boltDmg = getSpellDamage(1 + (card.amplifyBonus ?? 0), state);
      patch.pendingMagicAction = {
        card,
        effect: 'missile-bolt',
        step: 'monster-select',
        prompt: `选择一个目标，造成 ${boltDmg} 点法术伤害。`,
        allowsHeroTarget: true,
      } as any;
      patch.heroSkillBanner = `选择一个目标，造成 ${boltDmg} 点法术伤害。`;
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
            { id: 'fw-delete', range: [11, 15], label: '至多删除 1 张牌', effect: 'none' },
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
      return resolveMonsterFusion(state, card, sideEffects, patch, enqueuedActions, echoMultiplier);

    case 'transform-grant':
      return resolveTransformGrant(state, card, sideEffects, patch, enqueuedActions, echoMultiplier);

    case 'stun-wave':
      return resolveStunWave(state, card, sideEffects, patch, enqueuedActions);

    case 'graveyard-discover-equip-amulet':
      return resolveGraveyardDiscoverEquipAmulet(state, card, sideEffects, patch, enqueuedActions, echoMultiplier);

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
      patch.pendingMagicAction = { card, effect: 'mirror-copy', step: 'mirror-copy-select', echoRemaining: echoMultiplier } as any;
      sideEffects.push({ event: 'card:mirrorCopyRequested' as any, payload: { card, echoRemaining: echoMultiplier } });
      if (echoMultiplier > 1) banner(sideEffects, `镜影摹形：回响触发，本次将选择 ${echoMultiplier} 张目标。`);
      return applyPatch(state, patch, sideEffects);
    }

    case 'deck-judge-delete': {
      patch.pendingMagicAction = { card, effect: 'deck-judge-delete', step: 'deck-judge-select', echoRemaining: echoMultiplier } as any;
      sideEffects.push({ event: 'card:deckJudgeRequested' as any, payload: { card, echoRemaining: echoMultiplier } });
      if (echoMultiplier > 1) banner(sideEffects, `判牌：回响触发，将连续删除 ${echoMultiplier} 张牌。`);
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
  echoMultiplier: number = 1,
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
  const perTargetDamage = getSpellDamage(scaledArmor + ampBonus, state) * echoMultiplier;
  const echoTagADS = echoMultiplier > 1 ? `（回响×${echoMultiplier}）` : '';

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
      ensureMonsterEngaged(state, target, enqueuedActions);
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
      `盾影双噬：${slotItem.name} 护甲 ${rawArmor} → 伤害 ${perTargetDamage}（${armorPct}%），命中 ${targets.length} 个怪物。${echoTagADS}`);
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
    ? `盾影双噬：每目标 ${perTargetDamage} 伤害，护盾耐久 -1。${echoTagADS}`
    : `盾影双噬：护盾耐久 -1。${echoTagADS}`;
  patch.lastPlayedCardCategory = getCardPlayCategory(card);
  enqueuedActions.push({ type: 'FINALIZE_MAGIC_CARD', card, dealtDamage });
  return applyPatch(state, patch, sideEffects, enqueuedActions);
}

/**
 * 确保被法术伤害命中的怪物进入交战（被激怒）。
 * 普通武器攻击会在 `PERFORM_HERO_ATTACK` 里把目标加入 `engagedMonsterIds`，
 * 但 `DEAL_DAMAGE_TO_MONSTER` 自身不做这件事——所以任何"非武器攻击"路径
 * （魔弹 / 魔弹风暴 / 弧能之符 / 弃牌雷击 / 各类 spell-damage 法术）
 * 在打前都需要主动 enqueue `BEGIN_COMBAT`，否则会出现"打了没激怒"的 bug。
 *
 * 同名 helper 在 `hero.ts` 也有一份本地副本（`ensureEngaged`），改动时记得同步行为。
 */
export function ensureMonsterEngaged(state: GameState, monster: GameCardData, enqueuedActions: GameAction[]): void {
  if (!(state.combatState?.engagedMonsterIds ?? []).includes(monster.id)) {
    enqueuedActions.push({ type: 'BEGIN_COMBAT', monster, initiator: 'hero' });
  }
}

/**
 * 单目标伤害 magic 的统一"伤害落点"路由：
 *  - target.type === 'monster'  → ensureMonsterEngaged + DEAL_DAMAGE_TO_MONSTER（isSpellDamage），并触发 onMonsterHit 回调
 *  - target.type === 'hero'     → APPLY_DAMAGE { selfInflicted: true }（自伤路径，自动触发血怒战符 / 复生赐福 / 力量护符）
 *
 * 选 hero 时跳过所有 monster-only 的 on-hit 副作用（overkill / lifesteal / 金币 / streak 等都属于"打中怪物才生效"的，
 * 通过不调用 onMonsterHit 来天然跳过）。bloodrage / revive-blessing 由 reduceApplyDamage + computeDamage 自动接通。
 *
 * 添加新单目标伤害 magic 时请走这个 helper，不要自己 enqueue DEAL_DAMAGE_TO_MONSTER。
 */
export type SpellDamageTarget =
  | { type: 'monster'; monster: GameCardData }
  | { type: 'hero' };

export function resolveSpellDamageHit(
  state: GameState,
  target: SpellDamageTarget,
  damage: number,
  source: string,
  sideEffects: SideEffect[],
  enqueuedActions: GameAction[],
  opts?: {
    /** 命中怪物时执行的额外效果（missile relic / 金币 / streak / persuade 等）。选 hero 时不会被调用。 */
    onMonsterHit?: (monster: GameCardData) => void;
    /** 用于 log/banner 的卡牌名；缺省 '法术'。 */
    cardName?: string;
    /** 自定义 log/banner 文案；提供后将忽略 cardName 默认文案。 */
    selfHitLog?: string;
    selfHitBanner?: string;
  },
): void {
  if (target.type === 'hero') {
    if (damage > 0) {
      enqueuedActions.push({
        type: 'APPLY_DAMAGE',
        amount: damage,
        source,
        selfInflicted: true,
      });
    }
    const name = opts?.cardName ?? '法术';
    log(sideEffects, 'magic', opts?.selfHitLog ?? `${name}：对自己造成 ${damage} 点法术伤害`);
    banner(sideEffects, opts?.selfHitBanner ?? `${name}：对自己造成 ${damage} 点伤害！`);
    return;
  }
  ensureMonsterEngaged(state, target.monster, enqueuedActions);
  enqueuedActions.push({
    type: 'DEAL_DAMAGE_TO_MONSTER',
    monsterId: target.monster.id,
    damage,
    source,
    isSpellDamage: true,
  });
  opts?.onMonsterHit?.(target.monster);
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
        // 单目标伤害 magic：始终弹出 monster picker（包含 hero 自伤路径）。
        // 不再因为没有怪物 / 只有一个怪物就 fizzle / 自动选。
        const slotId = shieldSlots[0].id;
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
          prompt: `选择一个目标，承受 ${getSpellDamage(scaledArmor + (card.amplifyBonus ?? 0), state)} 点护甲伤害。`,
          echoMultiplier,
          allowsHeroTarget: true,
        } as any;
        patch.heroSkillBanner = '选择一个目标承受你的护甲一击。';
        return applyPatch(state, patch, sideEffects);
      }
      patch.pendingMagicAction = {
        card,
        effect: 'armor-strike',
        step: 'slot-select',
        prompt: '选择一个盾牌槽，将其护甲值转化为伤害。',
        echoMultiplier,
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
        return executeArmorDoubleStrike(state, card, shieldSlots[0].id, sideEffects, patch, enqueuedActions, echoMultiplier);
      }
      patch.pendingMagicAction = {
        card,
        effect: 'armor-double-strike',
        step: 'slot-select',
        prompt: '选择一面护盾，对随机 2 个怪物各造成 50% 护甲值伤害（耐久 -1）。',
        echoMultiplier,
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

      const dmg = getSpellDamage(PER_MONSTER_DAMAGE + (card.amplifyBonus ?? 0), state) * echoMultiplier;
      const echoTagTCT = echoMultiplier > 1 ? `（回响×${echoMultiplier}）` : '';
      for (const target of monsters) {
        ensureMonsterEngaged(state, target, enqueuedActions);
        enqueuedActions.push({
          type: 'DEAL_DAMAGE_TO_MONSTER',
          monsterId: target.id,
          damage: dmg,
          source: 'three-card-thunder',
          isSpellDamage: true,
        });
      }
      log(sideEffects, 'magic', `三牌惊雷：背包 3 张牌触发，对 ${monsters.length} 个怪物各造成 ${dmg} 点法术伤害。${echoTagTCT}`);
      banner(sideEffects, `三牌惊雷：全场 ${dmg} 点法术伤害！${echoTagTCT}`);
      enqueuedActions.push({ type: 'FINALIZE_MAGIC_CARD', card, dealtDamage: true });
      return applyPatch(state, patch, sideEffects, enqueuedActions);
    }

    case 'reorganize-backpack': {
      // 整顿背囊 (Perm 2): permanently +1 backpack capacity, then prompt the
      // player to pick up to 3 cards from hand / amulets / equipment slots and
      // push them onto the top of the backpack. Selection cap is further
      // bounded by the new backpack's free room (so we never overflow).
      const MAX_PICK_REQUESTED = 3 * echoMultiplier;
      const capacityBonus = 1 * echoMultiplier;
      const newCapacityModifier = state.backpackCapacityModifier + capacityBonus;
      const newCapacity = Math.max(1, BASE_BACKPACK_CAPACITY + newCapacityModifier);
      const currentCount = (state.backpackItems ?? []).length;
      const room = Math.max(0, newCapacity - currentCount);
      const maxSelections = Math.min(MAX_PICK_REQUESTED, room);
      const echoTagRB = isEchoTriggered ? `（回响×${echoMultiplier}）` : '';

      patch.backpackCapacityModifier = newCapacityModifier;
      log(sideEffects, 'magic', `整顿背囊：背包上限 +${capacityBonus}（${BASE_BACKPACK_CAPACITY + state.backpackCapacityModifier} → ${newCapacity}）${echoTagRB}。`);

      if (maxSelections === 0) {
        // No room left even after the bonus — finalize immediately, skip selection.
        banner(sideEffects, `整顿背囊：背包上限 +${capacityBonus}（已满，无放回机会）${echoTagRB}。`);
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
        echoMultiplier,
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
        echoMultiplier,
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
        echoMultiplier,
      } as any;
      patch.heroSkillBanner = '武器横扫：选择一个武器栏。';
      return applyPatch(state, patch, sideEffects);
    }

    case 'missing-hp-smite': {
      // 单目标伤害 magic：始终弹出 picker（包含 hero 自伤路径）。
      const maxHp = computeMaxHp(state);
      const missingHp = Math.max(0, maxHp - state.hp);
      const totalDmg = getSpellDamage(missingHp + (card.amplifyBonus ?? 0), state);
      patch.pendingMagicAction = {
        card,
        effect: 'missing-hp-smite',
        step: 'monster-select',
        prompt: `选择一个目标，造成 ${totalDmg} 点伤害（已损失生命 ${missingHp}）。`,
        echoMultiplier,
        allowsHeroTarget: true,
      } as any;
      patch.heroSkillBanner = `血怒裁决：选择目标（伤害 ${totalDmg}）。`;
      return applyPatch(state, patch, sideEffects);
    }

    case 'blood-sacrifice-strike': {
      const hpCost = Math.floor(state.hp / 2);
      if (hpCost < 1) {
        banner(sideEffects, '生命值不足，无法使用血祭裁决。');
        return applyPatch(state, patch, sideEffects);
      }
      // 单目标伤害 magic：始终弹出 picker（包含 hero 自伤路径）。
      // 注意：献祭 HP 成本统一在 reducer 的 monster-selection 分支里扣，
      // 不在 setup 阶段提前 push（避免 hero 路径下双扣不可控）。
      const totalDmg = getSpellDamage(hpCost * 2 + (card.amplifyBonus ?? 0), state);
      patch.pendingMagicAction = {
        card,
        effect: 'blood-sacrifice-strike',
        step: 'monster-select',
        pendingDamage: totalDmg,
        hpLost: hpCost,
        prompt: `选择一个目标，造成 ${totalDmg} 点伤害（将先献祭 ${hpCost} HP）。`,
        echoMultiplier,
        allowsHeroTarget: true,
      } as any;
      patch.heroSkillBanner = `血祭裁决：选择目标（献祭 ${hpCost} HP，伤害 ${totalDmg}）。`;
      return applyPatch(state, patch, sideEffects);
    }

    case 'blood-draw': {
      enqueuedActions.push({ type: 'APPLY_DAMAGE', amount: 3 * echoMultiplier, source: 'blood-draw', selfInflicted: true });
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
      log(sideEffects, 'magic', `鲜血汲取：失去 ${3 * echoMultiplier} 生命，${drawnMsg}`);
      banner(sideEffects, `鲜血汲取：-${3 * echoMultiplier} 生命，${drawnMsg}。${isEchoTriggered ? '（回响×2）' : ''}`);
      patch.lastPlayedCardCategory = getCardPlayCategory(card);
      enqueuedActions.push({ type: 'FINALIZE_MAGIC_CARD', card, dealtDamage: false });
      return applyPatch(state, patch, sideEffects, enqueuedActions);
    }

    case 'quake-stun-draw': {
      // 地震泉涌 (Perm 1)：失去 1 HP（自伤），从背包抽 floor(stunCap / 10) 张牌。
      // - HP 自伤走 APPLY_DAMAGE selfInflicted（与 blood-draw 同一管线）。
      // - Echo (A 类)：HP 损失与抽牌都 ×echoMultiplier，与 blood-draw 一致。
      // - stunCap < 10（公式 = 0）→ 仍消耗 magic、仍掉 HP、0 抽。
      // - 抽牌走 drawMultipleFromBackpack（受手牌上限约束）。
      const hpCost = 1 * echoMultiplier;
      enqueuedActions.push({ type: 'APPLY_DAMAGE', amount: hpCost, source: 'quake-stun-draw', selfInflicted: true });
      const curStunCap = state.stunCap ?? 0;
      const baseDraw = Math.floor(curStunCap / 10);
      const quakeDrawCount = baseDraw * echoMultiplier;
      let drawnCount = 0;
      if (quakeDrawCount > 0) {
        const drawState = { ...state, ...patch } as GameState;
        const drawResult = drawMultipleFromBackpack(drawState, quakeDrawCount);
        if (drawResult.cards.length > 0) {
          mergePatch(patch, drawResult.patch);
          for (const d of drawResult.cards) {
            sideEffects.push({ event: 'card:drawnToHand', payload: { cardId: d.id, source: 'backpack' } });
          }
        }
        drawnCount = drawResult.cards.length;
      }
      const echoTag = echoMultiplier > 1 ? `（回响×${echoMultiplier}）` : '';
      const formulaTag = echoMultiplier > 1
        ? `floor(${curStunCap}/10)=${baseDraw} × ${echoMultiplier} = ${quakeDrawCount}`
        : `floor(${curStunCap}/10) = ${quakeDrawCount}`;
      const drawnMsg = quakeDrawCount === 0
        ? '击晕上限不足 10，未抽到牌'
        : drawnCount === 0
          ? '背包为空'
          : `抽了 ${drawnCount} 张牌`;
      log(sideEffects, 'magic', `地震泉涌：失去 ${hpCost} 生命，${formulaTag}，${drawnMsg}${echoTag}`);
      banner(sideEffects, `地震泉涌：-${hpCost} 生命，${drawnMsg}。${echoTag}`);
      patch.lastPlayedCardCategory = getCardPlayCategory(card);
      enqueuedActions.push({ type: 'FINALIZE_MAGIC_CARD', card, dealtDamage: false });
      return applyPatch(state, patch, sideEffects, enqueuedActions);
    }

    case 'hand-purge-redraw': {
      // 清囊重启 (Perm 1)：弃回所有可弃手牌（curse 与源卡牌排除），然后从背包
      // 抽 N 张牌。N = [3,4,5][upgradeLevel] × echoMultiplier。
      // 弃回走标准 DISCARD_OWNED_CARD（perm-aware 路由）：非 Perm 入坟场,
      // Perm / 永恒铭刻过的入回收袋；同时正常触发 catapult / discard-zap /
      // onDiscardDraw / 雷霆符印 等弃置联动。
      // 法术回响：弃回是结构操作（C 类，二次回响时手牌已空，自动 no-op）；
      // 抽牌是数值操作（A 类，count × echoMultiplier）。
      const eligible = getEligibleHandDiscardCards(state.handCards as GameCardData[], card.id);
      if (eligible.length > 0) {
        const discardIds = new Set(eligible.map(c => c.id));
        patch.handCards = (state.handCards as GameCardData[]).filter(c => !discardIds.has(c.id));
        for (const dc of eligible) {
          enqueuedActions.push({ type: 'DISCARD_OWNED_CARD', card: dc, owner: 'player' });
        }
        log(sideEffects, 'magic', `清囊重启：弃回 ${eligible.map(c => c.name).join('、')}`);
      }
      const baseDraw = [3, 4, 5][card.upgradeLevel ?? 0] ?? 5;
      const drawCount = baseDraw * echoMultiplier;
      const drawState = { ...state, ...patch } as GameState;
      const drawResult = drawMultipleFromBackpack(drawState, drawCount);
      if (drawResult.cards.length > 0) {
        mergePatch(patch, drawResult.patch);
        for (const d of drawResult.cards) {
          sideEffects.push({ event: 'card:drawnToHand', payload: { cardId: d.id, source: 'backpack' } });
        }
      }
      const drawnMsg = drawResult.cards.length > 0
        ? `从背包抽了 ${drawResult.cards.length} 张牌`
        : '背包为空（或手牌已满）';
      const echoTagHPR = isEchoTriggered ? `（回响×${echoMultiplier}）` : '';
      banner(sideEffects, `清囊重启：弃回 ${eligible.length} 张手牌，${drawnMsg}。${echoTagHPR}`);
      patch.lastPlayedCardCategory = getCardPlayCategory(card);
      enqueuedActions.push({ type: 'FINALIZE_MAGIC_CARD', card, dealtDamage: false });
      return applyPatch(state, patch, sideEffects, enqueuedActions);
    }

    case 'hand-recycle-redraw': {
      // 洗册待回 (Perm 1)：把所有可回收手牌（curse 与源卡排除）洗入回收袋；从
      // 背包抽 X+N 张（X = 入回收袋的张数；N = [1, 2][upgradeLevel]）。
      //
      // 与 hand-purge-redraw 的关键不同：
      //  - 那张走 DISCARD_OWNED_CARD（非 Perm 进坟场、Perm 进回收袋），并触发
      //    catapult / discard-zap / onDiscardDraw / 雷霆符印 等"主动弃手牌"
      //    联动；
      //  - 本卡走 ADD_TO_RECYCLE_BAG，**强制**所有可回收手牌进回收袋，**不**
      //    触发上述弃置联动（这是"洗"不是"弃"）。这是设计意图：让手牌经
      //    waterfall 后能再回到背包，跟"弃 + 抽"的循环不同。
      //
      // 法术回响（C 类雪球，与卡面文案一致）：每次迭代重读 hand。
      //   iter 1: 移走 X1 → 抽 X1+N → 手牌现 X1+N
      //   iter 2: 移走 X1+N → 抽 X1+2N → 手牌现 X1+2N
      // resolver 内手动循环 echoMultiplier 次，模拟 hand/backpack/rng 演化；
      // 每张被移卡 enqueue 一条 ADD_TO_RECYCLE_BAG（reducer 会处理 _recycleWaits
      // / 积蓄之符 联动），最终 patch 写入累计的 hand / backpack / rng。
      //
      // ADD_TO_RECYCLE_BAG 已在 pipeline.ts isInputContinuation 白名单内，
      // 此 enqueue 在 phase=playerInput 下能正常 drain。
      const N = [1, 2][card.upgradeLevel ?? 0] ?? 1;

      let simulatedHand = (state.handCards as GameCardData[]).filter(c => c.id !== card.id);
      let simulatedBackpack = [...(state.backpackItems as GameCardData[])];
      let simulatedRng = state.rng;
      const allMovedNames: string[] = [];
      let totalMoved = 0;
      let totalDrawn = 0;
      const cursesInHand = simulatedHand.filter(c => isCurseCard(c));

      for (let iter = 0; iter < echoMultiplier; iter++) {
        const eligible = simulatedHand.filter(c => !isCurseCard(c));
        const eligibleIds = new Set(eligible.map(c => c.id));
        const X = eligible.length;
        const drawCount = X + N;

        for (const ec of eligible) {
          enqueuedActions.push({ type: 'ADD_TO_RECYCLE_BAG', card: sanitizeCardMetadata(ec) });
          allMovedNames.push(ec.name);
        }
        totalMoved += X;

        const handAfterMove = simulatedHand.filter(c => !eligibleIds.has(c.id));

        const draw = drawMultipleFromBackpack(
          { ...state, handCards: handAfterMove, backpackItems: simulatedBackpack, rng: simulatedRng } as GameState,
          drawCount,
        );
        const drawnThisIter = draw.cards;

        for (const dc of drawnThisIter) {
          sideEffects.push({ event: 'card:drawnToHand', payload: { cardId: dc.id, source: 'backpack' } });
        }

        if (drawnThisIter.length > 0) {
          simulatedHand = (draw.patch.handCards ?? handAfterMove) as GameCardData[];
          simulatedBackpack = (draw.patch.backpackItems ?? simulatedBackpack) as GameCardData[];
          simulatedRng = (draw.patch.rng ?? simulatedRng) as RngState;
        } else {
          simulatedHand = handAfterMove;
        }
        totalDrawn += drawnThisIter.length;
      }

      patch.handCards = simulatedHand;
      patch.backpackItems = simulatedBackpack;
      patch.rng = simulatedRng;

      const movedSummary = allMovedNames.length > 0 ? allMovedNames.join('、') : '无';
      log(sideEffects, 'magic', `洗册待回：${totalMoved} 张手牌洗入回收袋（${movedSummary}），从背包抽 ${totalDrawn} 张。`);
      const drawnMsgRR = totalDrawn > 0
        ? `从背包抽了 ${totalDrawn} 张牌`
        : '背包为空（或手牌已满）';
      const cursesRetained = cursesInHand.length > 0
        ? `（${cursesInHand.length} 张诅咒留在手牌）`
        : '';
      const echoTagRR = isEchoTriggered ? `（回响×${echoMultiplier}）` : '';
      banner(sideEffects, `洗册待回：${totalMoved} 张手牌入回收袋，${drawnMsgRR}${cursesRetained}。${echoTagRR}`);
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
        echoRemaining: echoMultiplier,
      } as any;
      patch.heroSkillBanner = '紧急回收：选择一个位置回手。';
      sideEffects.push({
        event: 'card:recallEquipmentSelect' as any,
        payload: { card, options },
      });
      return applyPatch(state, patch, sideEffects, enqueuedActions);
    }

    case 'cleanse-draw': {
      // 净册涌泉 — Perm 1. Pick 1 hand card → delete (kw='delete'); then draw
      // N cards from the backpack (N = 3/4/5 by upgrade level). Empty hand on
      // a given iteration → skip the picker but still draw.
      //
      // Echo (Category B): the hook re-opens the picker `echoMultiplier`
      // times, drawing N each time. We only emit the side-effect; the
      // hook owns the loop and dispatches FINALIZE_MAGIC_CARD when done.
      const drawCounts = [3, 4, 5];
      const drawCount = drawCounts[card.upgradeLevel ?? 0] ?? 3;
      const echoTagCD = isEchoTriggered ? `（回响×${echoMultiplier}）` : '';
      patch.pendingMagicAction = {
        card,
        effect: 'cleanse-draw',
        step: 'cleanse-draw-select',
        echoRemaining: echoMultiplier,
        data: { drawCount },
      } as any;
      patch.heroSkillBanner = echoMultiplier > 1
        ? `净册涌泉：将连续选择 ${echoMultiplier} 次手牌，每次从背包抽 ${drawCount} 张。${echoTagCD}`
        : `净册涌泉：选择一张手牌删除，从背包抽 ${drawCount} 张。`;
      sideEffects.push({
        event: 'card:cleanseDrawRequested' as any,
        payload: { card, drawCount, echoRemaining: echoMultiplier },
      });
      return applyPatch(state, patch, sideEffects);
    }

    case 'persuade-to-temp-attack': {
      // 辞剑相易 — Perm 1. Convert the player's "next persuade rate" buff
      // into temp attack on both equipment slots, then clear the temporary
      // part (mirroring what a persuade attempt does).
      //
      //   X            = persuadeAmuletBonus           (temp, cleared)
      //                + persuadeDiscount.rateBonus    (temp, cleared — same
      //                                                  semantics as
      //                                                  PERSUADE_MONSTER's
      //                                                  `persuadeDiscount = null`)
      //                + permanentPersuadeBonus        (perm, NOT cleared)
      //   per-slot     = Math.ceil(X / 3)
      //   slot1, slot2 each += per-slot temp attack
      //   Cleared "临时部分":
      //     - persuadeAmuletBonus → 0
      //     - persuadeDiscount.rateBonus → 0 (costReduction kept; we do NOT
      //       null the whole object so the player keeps any cost discount
      //       a separate buff granted)
      //
      // Echo (Category C, structural): runs `echoMultiplier` times. After
      // pass 1 the temp parts are 0, so pass 2's X = permanentPersuadeBonus
      // alone — if perm > 0, pass 2 still adds another ceil(perm/3) per slot
      // (per user spec). If X stays 0 across all passes, fizzle (still
      // consumed; no temp attack added).
      let totalAddedPerSlot = 0;
      let didFire = false;

      for (let pass = 0; pass < echoMultiplier; pass++) {
        const tempBonus = (patch.persuadeAmuletBonus ?? state.persuadeAmuletBonus ?? 0);
        const permBonus = (patch.permanentPersuadeBonus ?? state.permanentPersuadeBonus ?? 0);
        const currentDiscount = (patch.persuadeDiscount !== undefined
          ? patch.persuadeDiscount
          : state.persuadeDiscount) ?? null;
        const discountRateBonus = currentDiscount?.rateBonus ?? 0;
        const X = tempBonus + permBonus + discountRateBonus;
        if (X <= 0) continue;

        const perSlot = Math.ceil(X / 3);
        const prevTempAttack = patch.slotTempAttack ?? state.slotTempAttack ?? {};
        const tempAttack = { ...prevTempAttack };
        tempAttack.equipmentSlot1 = (tempAttack.equipmentSlot1 ?? 0) + perSlot;
        tempAttack.equipmentSlot2 = (tempAttack.equipmentSlot2 ?? 0) + perSlot;
        patch.slotTempAttack = tempAttack;
        patch.persuadeAmuletBonus = 0;
        // Clear only rateBonus; keep costReduction untouched.
        if (currentDiscount) {
          patch.persuadeDiscount = { ...currentDiscount, rateBonus: 0 };
        }

        totalAddedPerSlot += perSlot;
        didFire = true;
      }

      const echoSuffix = isEchoTriggered ? `（回响×${echoMultiplier}）` : '';
      if (didFire) {
        log(
          sideEffects,
          'magic',
          `辞剑相易：将下次劝降率转化为左右装备栏各 +${totalAddedPerSlot} 临时攻击${echoSuffix}。`,
        );
        banner(
          sideEffects,
          `辞剑相易：左右装备栏 +${totalAddedPerSlot} 临时攻击${echoSuffix}！`,
        );
      } else {
        log(
          sideEffects,
          'magic',
          `辞剑相易：当前没有「下次劝降」加成可转化${echoSuffix}。`,
        );
        banner(
          sideEffects,
          `辞剑相易：无下次劝降率加成，效果落空${echoSuffix}。`,
        );
      }
      patch.lastPlayedCardCategory = getCardPlayCategory(card);
      enqueuedActions.push({ type: 'FINALIZE_MAGIC_CARD', card, dealtDamage: false });
      return applyPatch(state, patch, sideEffects, enqueuedActions);
    }

    case 'recycle-tide': {
      // 洗册归川 — Perm 1. Move all backpack cards into the permanent-magic
      // recycle bag (tagged with `_recycleWaits = 1` so they round-trip),
      // then tick the entire bag's `_recycleWaits` by -1: cards that hit
      // ≤ 0 flush back to the backpack; cards with higher waits stay.
      //
      // Net effect:
      //   - Backpack cards: round-trip (no permanent change).
      //   - Existing recycle-bag cards: advance one waterfall step; those at
      //     `_recycleWaits = 1` flush back to backpack now.
      //
      // Echo (Category C, structural): a second pass would tick again on a
      // mostly-empty bag (the previous round-trip cards are already back in
      // backpack with no waits) — no meaningful additional effect. We run
      // the tick once and add a banner note when echoed.
      const backpack = state.backpackItems as GameCardData[];
      const movedCount = backpack.length;

      const mergedBag: GameCardData[] = [
        ...state.permanentMagicRecycleBag,
        ...backpack.map(c => ({ ...sanitizeCardMetadata(c), _recycleWaits: 1 } as GameCardData & { _recycleWaits: number })),
      ];

      const tickedState: GameState = {
        ...state,
        ...patch,
        backpackItems: [],
        permanentMagicRecycleBag: mergedBag,
      };
      const recycleResult = processRecycleBag(tickedState);
      mergePatch(patch, recycleResult.patch);

      // 真有牌从回收袋洗回背包才播动画（同步参考 waterfall / 幽魂净化 / 回收余韵 / 回收灵焰）。
      // pushRecycleRestoreSideEffects 已经处理「置顶」二段反馈。
      pushRecycleRestoreSideEffects(sideEffects, recycleResult);

      const echoTagRT = isEchoTriggered ? `（回响×${echoMultiplier}：二次结算无额外效果）` : '';
      log(
        sideEffects,
        'magic',
        `洗册归川：背包 ${movedCount} 张牌洗入回收袋（瀑流 -1），${recycleResult.restored.length} 张牌回到背包${echoTagRT}。`,
      );
      banner(
        sideEffects,
        echoMultiplier > 1
          ? `洗册归川：完成（回响：二次结算无额外效果）。`
          : `洗册归川：背包→回收袋；瀑流 -1，${recycleResult.restored.length} 张牌洗回背包。`,
      );
      patch.lastPlayedCardCategory = getCardPlayCategory(card);
      enqueuedActions.push({ type: 'FINALIZE_MAGIC_CARD', card, dealtDamage: false });
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
        echoMultiplier,
      } as any;
      patch.heroSkillBanner = '选择一个护盾，将护甲值转化为击晕上限。';
      return applyPatch(state, patch, sideEffects);
    }

    case 'backpack-bolt': {
      // 囊中惊雷：选择一个目标，造成 floor(背包剩余卡牌数 × pct%) 法术伤害。
      // pct 由升级等级决定：lvl 0 → 50%，lvl 1 → 75%，lvl 2 → 100%。
      // amplifyBonus 算入 base damage（与其它单目标伤害 magic 一致）。
      // 单目标伤害 magic：始终弹出 picker（包含 hero 自伤路径）。
      // Echo (A 类)：伤害单次结算 ×echoMultiplier，无模态重弹。
      const pcts = [50, 75, 100];
      const pct = pcts[card.upgradeLevel ?? 0] ?? pcts[pcts.length - 1];
      const backpackCount = state.backpackItems.length;
      const baseDmg = Math.floor((backpackCount * pct) / 100);
      const totalDmg = getSpellDamage(baseDmg + (card.amplifyBonus ?? 0), state) * echoMultiplier;
      const echoTag = isEchoTriggered ? `（回响×${echoMultiplier}）` : '';

      patch.pendingMagicAction = {
        card,
        effect: 'backpack-bolt',
        step: 'monster-select',
        prompt: `选择一个目标，造成 ${totalDmg} 点法术伤害（背包 ${backpackCount} 张 × ${pct}%）。${echoTag}`,
        echoMultiplier,
        data: { baseDmg, pct, backpackCount },
        allowsHeroTarget: true,
      } as any;
      patch.heroSkillBanner = `${card.name}：选择一个目标（${totalDmg} 法伤）。`;
      return applyPatch(state, patch, sideEffects);
    }

    case 'recycle-bolt': {
      // 池中惊雷：选择一个目标，造成 floor(回收袋卡牌数 × pct%) 法术伤害。
      // 与 backpack-bolt 同款 pattern，区别仅是数 state.permanentMagicRecycleBag 而不是
      // state.backpackItems。amplifyBonus 算入 base damage。
      // 单目标伤害 magic：始终弹出 picker（包含 hero 自伤路径）。
      // Echo (A 类)：伤害单次结算 ×echoMultiplier，无模态重弹。
      const pcts = [50, 75, 100];
      const pct = pcts[card.upgradeLevel ?? 0] ?? pcts[pcts.length - 1];
      const recycleCount = state.permanentMagicRecycleBag.length;
      const baseDmg = Math.floor((recycleCount * pct) / 100);
      const totalDmg = getSpellDamage(baseDmg + (card.amplifyBonus ?? 0), state) * echoMultiplier;
      const echoTag = isEchoTriggered ? `（回响×${echoMultiplier}）` : '';

      patch.pendingMagicAction = {
        card,
        effect: 'recycle-bolt',
        step: 'monster-select',
        prompt: `选择一个目标，造成 ${totalDmg} 点法术伤害（回收袋 ${recycleCount} 张 × ${pct}%）。${echoTag}`,
        echoMultiplier,
        data: { baseDmg, pct, recycleCount },
        allowsHeroTarget: true,
      } as any;
      patch.heroSkillBanner = `${card.name}：选择一个目标（${totalDmg} 法伤）。`;
      return applyPatch(state, patch, sideEffects);
    }

    case 'backpack-cap-stun': {
      // 囊量震慑：击晕上限 +floor(背包上限 / divisor) 个百分点。
      // - divisor = [4, 3][upgradeLevel] ?? 3。背包上限 12 时：Lv0 +3 / Lv1 +4。
      // - 「背包上限」= getEffectiveBackpackCapacity(state) = BASE (12) + modifier，
      //   不是当前 backpackItems.length。
      // - 全局 stunCap 100% cap，溢出静默吸收（与 眩晕药剂 / 奥术护盾 一致）。
      // - Echo (A 类)：×echoMultiplier 单次结算。本卡是 hand→recycleBag，背包上限
      //   在本次 reduce 步骤内不变，A/C 等价；用 A 类。
      const divisors = [4, 3];
      const lvl = card.upgradeLevel ?? 0;
      const divisor = divisors[lvl] ?? divisors[divisors.length - 1];
      const capacity = getEffectiveBackpackCapacity(state);
      const perTrigger = Math.floor(capacity / divisor);
      const totalGain = perTrigger * echoMultiplier;
      const oldCap = state.stunCap ?? 0;
      const newCap = Math.min(100, oldCap + totalGain);
      const actualGain = newCap - oldCap;
      const echoTag = isEchoTriggered ? `（回响×${echoMultiplier}）` : '';

      if (totalGain > 0) {
        patch.stunCap = newCap;
      }
      log(
        sideEffects,
        'magic',
        `囊量震慑：背包上限 ${capacity} ÷ ${divisor} = +${perTrigger}%${echoMultiplier > 1 ? ` ×${echoMultiplier} = +${totalGain}%` : ''}（实际 +${actualGain}%，当前 ${newCap}%）`,
      );
      banner(
        sideEffects,
        `囊量震慑：击晕上限 +${actualGain}%（当前 ${newCap}%）。${echoTag}`,
      );
      patch.lastPlayedCardCategory = getCardPlayCategory(card);
      enqueuedActions.push({ type: 'FINALIZE_MAGIC_CARD', card, dealtDamage: false });
      return applyPatch(state, patch, sideEffects, enqueuedActions);
    }

    case 'lay-mine': {
      // 布雷术：在 active row 的随机空 slot 生成 echoMultiplier 个「地雷」幽灵建筑。
      // 触发逻辑（怪物落到地雷 slot → 5 点纯陷阱伤害 + 地雷进坟场）由
      // rules/waterfall.ts:reduceApplyWaterfallDrop 处理（识别 displaced ghost
      // 的 mineDamage 字段后改走伤害分支，而不是塞回 activeCardStacks）。
      //
      // - 选位：仅"完全空"的 slot（activeCards[i] === null）。已经被 ghost
      //   building（含本卡之前布的地雷）占着的 slot 不算可用——避免一格摞两个
      //   ghost 引发 stack 顺序歧义。
      // - 全没空位 / 没足够位置时：剩下的地雷直接 fizzle 掉，banner 提示，magic
      //   本体仍照常进回收袋（用户已确认这条 fizzle 语义）。
      // - Echo (A 类)：放 echoMultiplier 个地雷在 echoMultiplier 个不同 slot；
      //   一次性挑选完毕，单次结算（不走 modal re-prompt）。
      const wantCount = Math.max(1, echoMultiplier);

      // 收集所有空 slot index
      const activeSlots = state.activeCards as (GameCardData | null)[];
      const emptyIdxs: number[] = [];
      for (let i = 0; i < activeSlots.length; i++) {
        if (activeSlots[i] === null) emptyIdxs.push(i);
      }

      if (emptyIdxs.length === 0) {
        banner(sideEffects, `${card.name}：激活行已满，无可用位置。`);
        log(sideEffects, 'magic', `${card.name}：激活行已满，地雷未能放置。`);
        patch.lastPlayedCardCategory = getCardPlayCategory(card);
        enqueuedActions.push({ type: 'FINALIZE_MAGIC_CARD', card, dealtDamage: false });
        return applyPatch(state, patch, sideEffects, enqueuedActions);
      }

      // 从可用空位里随机抽 min(wantCount, emptyIdxs.length) 个不重复 slot
      let rng = patch.rng ?? state.rng;
      const placeCount = Math.min(wantCount, emptyIdxs.length);
      const remaining = [...emptyIdxs];
      const chosenIdxs: number[] = [];
      for (let k = 0; k < placeCount; k++) {
        const [pickIdx, nextRng] = nextInt(rng, 0, remaining.length - 1);
        rng = nextRng;
        chosenIdxs.push(remaining[pickIdx]);
        remaining.splice(pickIdx, 1);
      }

      // 在选中的 slot 放地雷
      const newActive = [...activeSlots];
      const placedMines: { idx: number; mineId: string }[] = [];
      for (const slotIdx of chosenIdxs) {
        const [mine, nextRng] = createMineBuilding(rng);
        rng = nextRng;
        newActive[slotIdx] = mine;
        placedMines.push({ idx: slotIdx, mineId: mine.id });
      }
      patch.activeCards = newActive as ActiveRowSlots;
      patch.rng = rng;

      const echoTag = isEchoTriggered && wantCount > 1 ? `（回响×${wantCount}）` : '';
      const droppedCount = wantCount - placeCount;
      const droppedTag = droppedCount > 0 ? `；${droppedCount} 个地雷因空位不足丢失` : '';

      banner(sideEffects, `${card.name}：在 ${placeCount} 个随机位置布下地雷。${echoTag}${droppedTag}`);
      log(sideEffects, 'magic', `${card.name}：${placeCount} 个地雷布于槽 ${chosenIdxs.map(i => i + 1).join('、')}${droppedTag}`);

      sideEffects.push({
        event: 'magic:layMine',
        payload: { slots: placedMines, droppedCount },
      });

      patch.lastPlayedCardCategory = getCardPlayCategory(card);
      enqueuedActions.push({ type: 'FINALIZE_MAGIC_CARD', card, dealtDamage: false });
      return applyPatch(state, patch, sideEffects, enqueuedActions);
    }

    case 'stun-cap-strike': {
      // 雷涌一击：⌈stunCap / divisor⌉ 法伤 + 60% 击晕（受 stunCap 上限约束）+ 抽 1。
      // divisor 由升级等级决定（lvl 0 → 4，lvl 1 → 3）；amplifyBonus 算入 base damage。
      // Echo：伤害与抽牌都 ×N，但击晕掷骰仍只发生 1 次（与 stun-strike 同惯例）。
      // 单目标伤害 magic：始终弹出 picker（包含 hero 自伤路径）。
      const divisors = [4, 3];
      const divisor = divisors[card.upgradeLevel ?? 0] ?? 3;
      const stunCap = state.stunCap ?? 0;
      const baseDmg = Math.ceil(stunCap / divisor);
      const aeStunCap = computeAmuletEffects(state.amuletSlots as GameCardData[]);
      const stunPct = Math.min(60 + (aeStunCap.stunRateBoost ?? 0), stunCap);
      const totalDmg = getSpellDamage(baseDmg + (card.amplifyBonus ?? 0), state) * echoMultiplier;
      const drawCount = 1 * echoMultiplier;
      const echoTag = isEchoTriggered ? `（回响×${echoMultiplier}）` : '';

      patch.pendingMagicAction = {
        card,
        effect: 'stun-cap-strike',
        step: 'monster-select',
        prompt: `选择一个目标，造成 ${totalDmg} 点法术伤害（${stunPct}% 击晕），抽 ${drawCount} 张牌。${echoTag}`,
        echoMultiplier,
        data: { baseDmg, stunPct },
        allowsHeroTarget: true,
      } as any;
      patch.heroSkillBanner = `${card.name}：选择一个目标（${totalDmg} 法伤，${stunPct}% 晕）。`;
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
        echoRemaining: echoMultiplier,
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
        prompt: '选择一个装备栏，将其永久攻击+临时攻击转化为伤害。',
        echoMultiplier,
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
        echoMultiplier,
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
      // 转型判定必须在此刻完成：本卡的 RESOLVE_MAGIC 末尾会 enqueue
      // APPLY_TRANSFORM_CATEGORY，待玩家选择槽位后 hero.ts 再读时 lastPlayedCardCategory
      // 已被覆盖为本卡自身类别，故必须把 transformTriggered 与 echoMultiplier
      // 写入 pendingMagicAction 一并传递。
      const prevCategory = state.lastPlayedCardCategory;
      const curCategory = getCardPlayCategory(card);
      const transformTriggered = prevCategory != null && prevCategory !== curCategory;
      patch.pendingMagicAction = {
        card,
        effect: 'transform-repair',
        step: 'slot-select',
        prompt: '选择一个装备，恢复 1 耐久。',
        transformTriggered,
        echoMultiplier,
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
        // 同步参考 waterfall / 幽魂净化 / 回收余韵 / 洗册归川。
        // pushRecycleRestoreSideEffects 已经处理「置顶」二段反馈。
        pushRecycleRestoreSideEffects(sideEffects, recycleResult);
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

    // 弃装重铸 (Perm 2): act on **every stacked equipment piece** in
    // equipmentSlot1 / equipmentSlot2 — main slot AND every reserve item
    // counts independently. Each piece:
    //   - revive check (native monster revive OR hasEquipmentRevive)
    //     individually. Revived pieces stay in their original stack position
    //     at 1 durability. Non-revived pieces fire last-words, then route to
    //     graveyard / recycle bag.
    //   - counts as 1 discover regardless of outcome (revive / destroy /
    //     perm-recycle). Player gets one class-deck popup per piece.
    // After processing, the surviving items are compacted top-down so the
    // visual stack invariant holds (reserve.length > 0 ⇒ main != null).
    // 招灵书印 (delete-draw) hook still uses `destroyedCards` (excludes
    // revived) — that hook is about actual destruction, not "acted on".
    case 'discard-rebuild': {
      type StackPiece = { item: GameCardData; slotId: EquipmentSlotId; isMain: boolean };
      // Collect per-slot stacks. `stack` is top-to-bottom (visual order):
      //   index 0 = main, index 1 = reserve[len-1] (top of reserve), ...
      // Reserve convention: reserve[reserve.length - 1] = topmost / next-to-promote.
      const slotStacks: { slotId: EquipmentSlotId; stack: StackPiece[] }[] = [];
      for (const sid of ['equipmentSlot1', 'equipmentSlot2'] as EquipmentSlotId[]) {
        const main = sid === 'equipmentSlot1' ? state.equipmentSlot1 : state.equipmentSlot2;
        if (!main) continue;
        const reserve = (sid === 'equipmentSlot1'
          ? state.equipmentSlot1Reserve
          : state.equipmentSlot2Reserve) as EquipmentItem[];
        const stack: StackPiece[] = [{ item: main, slotId: sid, isMain: true }];
        for (let i = reserve.length - 1; i >= 0; i--) {
          stack.push({ item: reserve[i] as GameCardData, slotId: sid, isMain: false });
        }
        slotStacks.push({ slotId: sid, stack });
      }

      let actedOnCount = 0;
      let destroyedCount = 0;
      let revivedCount = 0;
      const destroyedCards: GameCardData[] = [];

      const amuletEffects = computeAmuletEffects(state.amuletSlots as GameCardData[]) ?? createEmptyAmuletEffects();

      for (const { slotId: sid, stack } of slotStacks) {
        // Survivors in top-to-bottom order (matching the original stack).
        const survivorsTopDown: GameCardData[] = [];

        for (const { item } of stack) {
          actedOnCount++;
          const isMonsterEquip = item.type === 'monster';
          const nativeRevive = isMonsterEquip && item.hasRevive && !item.reviveUsed;
          const equipRevive = item.hasEquipmentRevive && !item.equipmentReviveUsed;

          if (nativeRevive || equipRevive) {
            const revived = nativeRevive
              ? { ...item, durability: 1, reviveUsed: true }
              : { ...item, durability: 1, equipmentReviveUsed: true };
            survivorsTopDown.push(revived);
            sideEffects.push({
              event: 'log:entry',
              payload: { type: 'equip', message: `${item.name} 复生！以 1 耐久复活！` },
            });
            revivedCount++;
          } else {
            // Trigger last-words without slot mutation (we own the slot
            // reconstruction below). Pass current `patch` so accumulated
            // mutations (gold, slot bonuses, etc.) compose correctly across
            // multiple destroyed pieces in the same cast.
            const lwResult = computeEquipmentDisplacementLastWords(
              state,
              sid,
              item,
              amuletEffects,
              { ...patch, rng: patch.rng ?? state.rng },
            );
            sideEffects.push(...lwResult.sideEffects);
            Object.assign(patch, lwResult.patch);
            patch.rng = lwResult.rng;
            if (lwResult.drawFromBackpack > 0) {
              enqueuedActions.push({ type: 'DRAW_FROM_BACKPACK', count: lwResult.drawFromBackpack });
            }
            if (lwResult.classCardDraw > 0) {
              sideEffects.push({
                event: 'equipment:classCardDraw',
                payload: { count: lwResult.classCardDraw, source: item.name },
              });
            }
            // Perm-flagged equipment routes to the recycle bag, not the
            // graveyard. Mirrors DISPOSE_EQUIPMENT_CARD's routing decision so
            // 永恒铭刻 装备 被弃装重铸摧毁后仍能回到回收袋。
            if (shouldRouteEquipmentToPermRecycle(item)) {
              enqueuedActions.push({ type: 'ADD_TO_RECYCLE_BAG', card: item });
            } else {
              enqueuedActions.push({ type: 'ADD_TO_GRAVEYARD', card: item });
            }
            destroyedCount++;
            destroyedCards.push(item);
          }
        }

        // Rebuild slot from survivors. Compact top-down to preserve the UI
        // invariant: reserve.length > 0 ⇒ main != null. Top survivor → main,
        // rest → reserve in storage order (reserve[len-1] = next-to-promote =
        // 2nd survivor from top).
        const reserveKey: 'equipmentSlot1Reserve' | 'equipmentSlot2Reserve' =
          sid === 'equipmentSlot1' ? 'equipmentSlot1Reserve' : 'equipmentSlot2Reserve';
        if (survivorsTopDown.length === 0) {
          patch[sid] = null as unknown as EquipmentItem;
          patch[reserveKey] = [] as EquipmentItem[];
        } else {
          patch[sid] = survivorsTopDown[0] as EquipmentItem;
          // survivorsTopDown.slice(1) is in top-to-bottom order; reserve
          // storage is bottom-to-top, so reverse.
          patch[reserveKey] = survivorsTopDown.slice(1).reverse() as EquipmentItem[];
        }
      }

      // Slots that started empty stay empty (don't write null over null) —
      // we only mutated the slots that had at least one item.

      // 招灵书印：弃装重铸摧毁装备 = 强制销毁。装备销毁不影响护符栏 →
      // surviving = state.amuletSlots。复生的装备不算 destroyed（招灵书印只在真正
      // 销毁时触发，跟下面的 discover 计数语义不同）。
      maybeTriggerDeleteDrawForDestroy({
        destroyedCards,
        survivingAmuletSlots: state.amuletSlots as GameCardData[],
        sideEffects,
        enqueuedActions,
        reasonLabel: '弃装重铸摧毁装备',
      });

      // Discover 触发条件：基于「作用了几件装备」（含主装备 + reserve 每一件）。
      // 复生 / 进回收袋 / 进坟场所有结局都算一次 discover。
      if (actedOnCount > 0) {
        // 法术回响：发现次数 = 作用件数 × echoMultiplier。
        const totalDiscoverCount = actedOnCount * echoMultiplier;
        const echoTagDR = echoMultiplier > 1 ? `（回响×${echoMultiplier}）` : '';
        const breakdown =
          revivedCount > 0
            ? `（摧毁 ${destroyedCount}，复生 ${revivedCount}）`
            : '';
        log(
          sideEffects,
          'magic',
          `${card.name}：作用 ${actedOnCount} 件装备${breakdown}，将发现 ${totalDiscoverCount} 张专属牌！${echoTagDR}`,
        );
        banner(
          sideEffects,
          `${card.name}：作用 ${actedOnCount} 件装备${breakdown}，发现 ${totalDiscoverCount} 张专属牌…${echoTagDR}`,
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
          if (totalDiscoverCount > 1) {
            const remaining = totalDiscoverCount - 1;
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
        log(sideEffects, 'magic', `${card.name}：没有装备可作用。`);
        banner(sideEffects, `${card.name}：没有装备可作用。`);
      }

      patch.lastPlayedCardCategory = getCardPlayCategory(card);
      enqueuedActions.push({ type: 'FINALIZE_MAGIC_CARD', card, dealtDamage: false });
      return applyPatch(state, patch, sideEffects, enqueuedActions);
    }

    case 'fate-sight': {
      // 天眼审判（Perm 1）：翻看主牌堆顶 4 张牌，若其中无怪物，则下次劝降成功率
      // +bonus%（lvl0 = 70, lvl1 = 100）。bonus 累加到 `state.persuadeAmuletBonus`，
      // 与翻印之符 / 怀柔之印 / 劝降之刃 等共享同一"下次劝降率"短期 buff——
      // 在任何劝降"启动"（PERSUADE_MONSTER）时被清零，符合卡面"下次"语义。
      //
      // 法术回响：结构性 (C) — 第二次结算翻看的还是同一批牌堆顶，结果相同；
      // 不重复 grant bonus，仅 banner 提示"回响：二次结算无额外效果"。
      const peekCount = 4;
      const persuadeBonuses = [70, 100];
      const persuadeBonus = persuadeBonuses[card.upgradeLevel ?? 0] ?? 70;

      const deck = state.remainingDeck;
      const peekedCards = deck.slice(0, Math.min(peekCount, deck.length));
      const monsterCount = peekedCards.filter(c => c.type === 'monster').length;
      const noMonster = peekedCards.length > 0 && monsterCount === 0;

      const echoTag = isEchoTriggered ? '（回响：二次结算无额外效果）' : '';

      let grantedBonus = 0;
      if (noMonster) {
        grantedBonus = persuadeBonus;
        patch.persuadeAmuletBonus = (state.persuadeAmuletBonus ?? 0) + persuadeBonus;
        sideEffects.push({
          event: 'log:entry',
          payload: {
            type: 'magic',
            message: `天眼审判：翻看牌堆顶 ${peekedCards.length} 张牌均非怪物，下次劝降成功率 +${persuadeBonus}%。${echoTag}`,
          },
        });
      } else if (peekedCards.length === 0) {
        sideEffects.push({
          event: 'log:entry',
          payload: { type: 'magic', message: `天眼审判：主牌堆已空，无效果。${echoTag}` },
        });
      } else {
        sideEffects.push({
          event: 'log:entry',
          payload: {
            type: 'magic',
            message: `天眼审判：翻看牌堆顶 ${peekedCards.length} 张含 ${monsterCount} 张怪物，无加成。${echoTag}`,
          },
        });
      }

      sideEffects.push({
        event: 'card:fateSightPeekReady',
        payload: {
          peekedCards,
          monsterCount,
          persuadeBonusGranted: grantedBonus,
          card,
        },
      });

      patch.lastPlayedCardCategory = getCardPlayCategory(card);
      // 注意：FINALIZE_MAGIC_CARD 由 hook 在 peek 弹窗关闭后 dispatch（卡的"使用"
      // 时机要等玩家看完 4 张牌再正式"消费"），与原 fate-sight 流程保持一致。
      return applyPatch(state, patch, sideEffects, enqueuedActions);
    }

    case 'eternal-vessel': {
      // 永恒之器（Perm 2）：失去 (3 × echo) HP，permanentMaxHpBonus += (3 × echo)。
      // 无目标、无中间步骤，立即 finalize。自伤走 APPLY_DAMAGE selfInflicted，
      // 跟 血誓回卷 / 血金术 / 紧急回收 一致：可被 shields 抵消、可被 death-ward
      // 救场、hp ≤ cost 时会致死（playable at any HP, may kill you 的标准约定）。
      //
      // Echo 行为：用户选了「全比例放大」—— echo×2 → -6 HP / +6 maxHp。
      // 等价于「打了 2 张永恒之器」，跟 血誓回卷 (-3 × echo) 同款。
      const hpCost = 3 * echoMultiplier;
      const hpBoost = 3 * echoMultiplier;
      enqueuedActions.push({
        type: 'APPLY_DAMAGE',
        amount: hpCost,
        source: 'eternal-vessel',
        selfInflicted: true,
      });
      patch.permanentMaxHpBonus = (state.permanentMaxHpBonus ?? 0) + hpBoost;

      const echoTag = isEchoTriggered ? `（回响×${echoMultiplier}）` : '';
      log(
        sideEffects,
        'magic',
        `永恒之器：失去 ${hpCost} 生命，生命上限永久 +${hpBoost}。`,
      );
      banner(
        sideEffects,
        `永恒之器：以 ${hpCost} 生命换取生命上限 +${hpBoost}！${echoTag}`,
      );

      patch.lastPlayedCardCategory = getCardPlayCategory(card);
      enqueuedActions.push({ type: 'FINALIZE_MAGIC_CARD', card, dealtDamage: false });
      return applyPatch(state, patch, sideEffects, enqueuedActions);
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
    ensureMonsterEngaged(state, monster, enqueuedActions);
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
  echoMultiplier: number = 1,
  isEchoTriggered: boolean = false,
): ReduceResult {
  const healAmount = 8 * echoMultiplier;
  const echoTag = isEchoTriggered ? '（回响×2）' : '';
  enqueuedActions.push({ type: 'HEAL', amount: healAmount, source: 'fountain-hand' });
  const handSize = state.handCards.filter(c => c.id !== card.id).length;
  const limit = getEffectiveHandLimit(state);
  const baseDeficit = Math.max(0, limit - handSize);
  // echo doubles the desired refill ceiling (capped by limit-handSize naturally),
  // ensuring the player gets up to 2x the normal "fill hand" effect when echoed.
  const desiredDraw = baseDeficit * echoMultiplier;
  if (desiredDraw <= 0 || state.backpackItems.length === 0) {
    log(sideEffects, 'magic', `涌泉满手：恢复 ${healAmount} 点生命，手牌已满或背包为空。`);
    banner(sideEffects, `涌泉满手：恢复 ${healAmount} 点生命，手牌已满或背包为空。${echoTag}`);
    patch.lastPlayedCardCategory = getCardPlayCategory(card);
    enqueuedActions.push({ type: 'FINALIZE_MAGIC_CARD', card, dealtDamage: false });
    return applyPatch(state, patch, sideEffects, enqueuedActions);
  }
  const drawCount = Math.min(desiredDraw, baseDeficit, state.backpackItems.length);
  const drawResult = drawMultipleFromBackpack(state, drawCount);
  if (drawResult.cards.length > 0) {
    mergePatch(patch, drawResult.patch);
    for (const d of drawResult.cards) {
      sideEffects.push({ event: 'card:drawnToHand', payload: { cardId: d.id, source: 'backpack' } });
    }
  }
  log(sideEffects, 'magic', `涌泉满手：恢复 ${healAmount} 点生命，从背包抽取 ${drawResult.cards.length} 张牌补充手牌。`);
  banner(sideEffects, `涌泉满手：恢复 ${healAmount} 点生命，从背包抽了 ${drawResult.cards.length} 张牌。${echoTag}`);
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

  // Step 1: randomly discard up to discardCount hand cards
  const playable = state.handCards.filter((c: GameCardData) => c.id !== card.id);
  const actualDiscard = Math.min(playable.length, discardCount);
  let newToGraveyard = 0;
  if (actualDiscard > 0) {
    let rng = patch.rng ?? state.rng;
    const [discarded, rngAfter] = pickRandomHandCardsForDiscardPreferGraveyard(playable, actualDiscard, rng);
    patch.rng = rngAfter;
    const discardIds = new Set(discarded.map((c: GameCardData) => c.id));
    patch.handCards = state.handCards.filter((c: GameCardData) => !discardIds.has(c.id));
    for (const dc of discarded) {
      enqueuedActions.push({ type: 'DISCARD_OWNED_CARD', card: dc, owner: 'player' });
      if (!isRecyclableFromHand(dc)) newToGraveyard += 1;
    }
    log(sideEffects, 'magic', `回响行囊：弃回 ${discarded.map((c: GameCardData) => c.name).join('、')}`);
  }

  // Step 2: check graveyard for discover candidates
  // 永久魔法被弃回时走回收袋，不计入坟场。
  const currentGraveyardSize = (state.discardedCards ?? []).length;
  const graveyardSize = currentGraveyardSize + newToGraveyard;

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
  // 单目标伤害 magic：始终弹出 picker（包含 hero 自伤路径）。
  const totalDamage = getSpellDamage(state.gold + (card.amplifyBonus ?? 0), state) * echoMultiplier;
  patch.pendingMagicAction = {
    card,
    effect: 'blood-reckoning',
    step: 'monster-select',
    echoMultiplier,
    prompt: `选择一个目标，造成 ${totalDamage} 点伤害并恢复等量生命。${isEchoTriggered ? '（回响×2）' : ''}`,
    allowsHeroTarget: true,
  } as any;
  patch.heroSkillBanner = '点金裁决就绪，请选择目标。';
  return applyPatch(state, patch, sideEffects);
}

export function resolveSoulSwap(
  state: GameState,
  card: GameCardData,
  sideEffects: SideEffect[],
  patch: Partial<GameState>,
  enqueuedActions: GameAction[],
  echoMultiplier: number = 1,
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
      const newMaxDur = clampMaxDurability(Math.max(slot.item.maxDurability ?? durability, oldLayers));
      const newDur = Math.min(oldLayers, newMaxDur);
      // Mine-damage-boost：等价交换可能让武器耐久下降。
      const soulSwapDurLost = Math.max(0, durability - newDur);
      if (soulSwapDurLost > 0) {
        accumulateMineDamageBoost(state, slot.item as GameCardData, soulSwapDurLost, patch, sideEffects);
      }
      (patch as any)[slot.id] = { ...slot.item, durability: newDur, maxDurability: newMaxDur };
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
      echoRemaining: echoMultiplier,
    } as any;
    patch.heroSkillBanner = `等价交换：选择一个怪物与 ${slot.item.name} 互换。`;
    return applyPatch(state, patch, sideEffects);
  }
  patch.pendingMagicAction = {
    card,
    effect: 'soul-swap',
    step: 'slot-select',
    prompt: '选择一件装备进行等价交换。',
    echoRemaining: echoMultiplier,
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
  echoMultiplier: number = 1,
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
  patch.pendingMagicAction = { card, effect: 'perm-grant', step: 'perm-grant-select', echoRemaining: echoMultiplier } as any;
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
    ensureMonsterEngaged(state, monster, enqueuedActions);
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
  const magicCount = patch.arcaneStormMagicCount ?? state.arcaneStormMagicCount ?? 0;
  const baseDmg = Math.max(0, magicCount + (card.amplifyBonus ?? 0));
  const totalDmg = getSpellDamage(baseDmg, state) * echoMultiplier;
  // 真零伤害仍 fizzle（与目标无关）。
  if (totalDmg <= 0) {
    banner(sideEffects, `奥术风暴：累计 ${magicCount} 张魔法卡，伤害为 0。${isEchoTriggered ? '（回响×2）' : ''}`);
    patch.lastPlayedCardCategory = getCardPlayCategory(card);
    // 「使用后计数清零」契约：fizzle 也算使用过，重置累计。
    patch.arcaneStormMagicCount = 0;
    enqueuedActions.push({ type: 'FINALIZE_MAGIC_CARD', card, dealtDamage: false });
    return applyPatch(state, patch, sideEffects, enqueuedActions);
  }
  // 单目标伤害 magic：始终弹出 picker（包含 hero 自伤路径）。
  patch.pendingMagicAction = {
    card,
    effect: 'arcane-storm',
    step: 'monster-select',
    pendingDamage: baseDmg,
    echoMultiplier,
    prompt: `奥术风暴：选择一个目标，造成 ${totalDmg} 点伤害（累计 ${magicCount} 张魔法卡）。`,
    allowsHeroTarget: true,
  } as any;
  patch.heroSkillBanner = `奥术风暴：累计 ${magicCount} 张魔法卡，选择目标造成 ${totalDmg} 点伤害。`;
  return applyPatch(state, patch, sideEffects);
}

export function resolveAmplifyTarget(
  state: GameState,
  card: GameCardData,
  sideEffects: SideEffect[],
  patch: Partial<GameState>,
  enqueuedActions: GameAction[],
  echoMultiplier: number = 1,
  isEchoTriggered: boolean = false,
): ReduceResult {
  const targetName = card._amplifyTargetName;
  const echoTag = isEchoTriggered ? '（回响×2）' : '';
  const amplifyAmount = 1 * echoMultiplier;

  // 仅在 targetName 缺失（卡牌结构异常）时拒绝。
  // 之前会按 _amplifyTargetCardId 校验"原始那张卡是否仍在装备栏/手牌"，
  // 但实际加成本就是按 NAME（AMPLIFY_CARDS_BY_NAME）应用到 amplifiedCardBonus
  // map + 所有同名卡（手牌/装备/背包/坟场/回收袋/抽牌堆/职业牌组/地下城/护符/储备）。
  // 用户场景：「增幅」magic 选中手牌中的「魔弹」生成 Perm 1 卡，
  // 期间把那张「魔弹」打掉了；后续打出「增幅：魔弹」时按 ID 校验失败 → 整个生效被吞掉。
  // 修复：移除 ID 校验，即使全场已无同名卡也照常记入 amplifiedCardBonus map，
  // 未来生成的同名卡（如 createMagicBoltCard）会通过 applyAmplifyOnCreate 自动获得累计加成。
  if (!targetName) {
    banner(sideEffects, '增幅：目标不存在。');
    patch.lastPlayedCardCategory = getCardPlayCategory(card);
    enqueuedActions.push({ type: 'FINALIZE_MAGIC_CARD', card, dealtDamage: false });
    return applyPatch(state, patch, sideEffects, enqueuedActions);
  }

  enqueuedActions.push({ type: 'AMPLIFY_CARDS_BY_NAME', cardName: targetName, amount: amplifyAmount, source: '增幅' });
  banner(sideEffects, `增幅：所有「${targetName}」获得 +${amplifyAmount} 增幅！${echoTag}`);
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
  // 单目标伤害 magic：始终弹出 picker（包含 hero 自伤路径）。
  // 选 hero 时不存在 overkill 概念（hero.ts 分支会跳过抽牌）。
  const chaosBase = 3 + (card.amplifyBonus ?? 0);
  const chaosDamage = getSpellDamage(chaosBase, state);
  const echoLabel = echoMultiplier > 1 ? `（回响：第 1/${echoMultiplier} 次）` : '';
  patch.pendingMagicAction = {
    card,
    effect: 'chaos-strike',
    step: 'monster-select',
    prompt: `选择一个目标，对其造成 ${chaosDamage} 点伤害。超杀：抽 2 张牌。${echoLabel}`,
    data: {},
    echoRemaining: echoMultiplier,
    allowsHeroTarget: true,
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
  // 单目标伤害 magic：始终弹出 picker（包含 hero 自伤路径）。
  // 选 hero 时不存在 overkill 概念（hero.ts 分支会跳过升级模态）。
  const okBase = 3 + (card.amplifyBonus ?? 0);
  const okDamage = getSpellDamage(okBase, state);
  const echoLabel = echoMultiplier > 1 ? `（回响：第 1/${echoMultiplier} 次）` : '';
  patch.pendingMagicAction = {
    card,
    effect: 'overkill-upgrade',
    step: 'monster-select',
    prompt: `选择一个目标，对其造成 ${okDamage} 点伤害。超杀：升级一张牌。${echoLabel}`,
    data: {},
    echoRemaining: echoMultiplier,
    allowsHeroTarget: true,
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
  const aeStunStrike = computeAmuletEffects(state.amuletSlots as GameCardData[]);
  const rawStunPct = (stunChances[card.upgradeLevel ?? 0] ?? 10) + (aeStunStrike.stunRateBoost ?? 0);
  const stunPct = Math.min(rawStunPct, state.stunCap ?? 10);
  const hitDmg = getSpellDamage(baseDmgPerHit, state) * echoMultiplier;
  // 单目标伤害 magic：始终弹出 picker（包含 hero 自伤路径）。
  // 选 hero 时不掷击晕骰（hero 不能被击晕）。
  patch.pendingMagicAction = {
    card,
    effect: 'stun-strike',
    step: 'monster-select',
    prompt: `选择一个目标，造成 ${hitDmg}×${hits} 点法术伤害（每击 ${stunPct}% 击晕）。`,
    echoMultiplier,
    data: { baseDmgPerHit, stunPct, hits },
    allowsHeroTarget: true,
  } as any;
  patch.heroSkillBanner = `选择一个目标，造成 ${hitDmg}×${hits} 点伤害（每击 ${stunPct}% 击晕）。`;
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
  const nextBase = strikeBase + 1;
  const updatedCard: GameCardData = {
    ...card,
    scalingDamage: nextBase,
    magicEffect: `下一击叠刺 ${nextBase}`,
  };
  // 单目标伤害 magic：始终弹出 picker（包含 hero 自伤路径）。
  patch.pendingMagicAction = {
    card: updatedCard,
    effect: 'scaling-damage',
    step: 'monster-select',
    pendingDamage: strikeBase,
    echoMultiplier,
    prompt: `选择目标（本刺叠刺 ${strikeBase}）`,
    allowsHeroTarget: true,
  } as any;
  patch.heroSkillBanner = `${card.name} 请选择目标 · 本刺叠刺 ${strikeBase}`;
  return applyPatch(state, patch, sideEffects);
}

// ---------------------------------------------------------------------------
// applyCryptDeathwish — trigger equipment "last words" effects
// ---------------------------------------------------------------------------

export function applyCryptDeathwish(
  state: GameState,
  card: GameCardData,
  slotId: EquipmentSlotId,
  sideEffects: SideEffect[],
  patch: Partial<GameState>,
  enqueuedActions: GameAction[],
  echoMultiplier: number = 1,
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
  const totalTriggers = 2 * echoMultiplier;
  for (let i = 0; i < totalTriggers; i++) {
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
  enqueuedActions.push({ type: 'DRAW_FROM_BACKPACK', count: 1 * echoMultiplier } as GameAction);
  const echoTagCD = echoMultiplier > 1 ? `（回响×${echoMultiplier}）` : '';
  log(sideEffects, 'magic', `墓语遗愿：触发「${slotItem.name}」遗言 ×${totalTriggers}，抽 ${echoMultiplier} 张牌${echoTagCD}`);
  banner(sideEffects, `墓语遗愿：「${slotItem.name}」遗言触发 ${totalTriggers} 次！抽 ${echoMultiplier} 张牌${echoTagCD}`);
  patch.pendingMagicAction = null;
  patch.heroSkillBanner = null;
  patch.lastPlayedCardCategory = getCardPlayCategory(card);
  enqueuedActions.push({ type: 'FINALIZE_MAGIC_CARD', card, dealtDamage: false });
  return applyPatch(state, patch, sideEffects, enqueuedActions);
}

// ---------------------------------------------------------------------------
// resolveMonsterFusion — deterministic fusion of same-type monster equipment
// ---------------------------------------------------------------------------

/**
 * 魔物融合产物模板：种族中文名 + 精英特殊属性表。
 *
 * 在 resolver 收集候选时不需要它们，但 reducer 在 RESOLVE_MONSTER_FUSION 时
 * 必须基于玩家选中的卡构建融合产物——所以两个表外加 skeletonKingImage 用 export
 * 让 cards.ts 那边的 reducer 能直接复用，避免重复维护。
 */
export const MONSTER_FUSION_RACE_CN: Record<string, string> = {
  Dragon: '龙族', Skeleton: '骷髅', Goblin: '哥布林',
  Ogre: '食人魔', Wraith: '幽灵', Swarm: '虫群', Golem: '魔像',
};

export const MONSTER_FUSION_ELITE_PROPS: Record<string, Partial<GameCardData>> = {
  Dragon: { monsterSpecial: 'ember-fury', monsterSpecialDesc: '融合精英：流血（每失去1耐久攻击+3）+ 庇护。', bleedEffect: 'attack+3' as any, eliteHealOtherMonster: true },
  Skeleton: { monsterSpecial: 'bone-regen', monsterSpecialDesc: '融合精英：骸生（40%不消耗耐久）+ 复生。', hasRevive: true },
  Goblin: { monsterSpecial: 'goblin-elite', monsterSpecialDesc: '融合精英：攻击偷取8金币 + 窃宝。', goblinStealEquip: true, onAttackEffect: 'steal-gold-8' as any },
  Ogre: { monsterSpecial: 'ogre-crit', monsterSpecialDesc: '融合精英：攻击伤害翻倍 + 50%概率额外攻击一次。', eliteDoubleAttack: true, weaponExtraAttack: 1 },
  Wraith: { monsterSpecial: 'wraith-rebirth', monsterSpecialDesc: '融合精英：重生（耐久降至1时回满）+ 幽魂作祟遗言。', lastWords: 'wraith-haunt-4' as any },
  Swarm: { monsterSpecial: 'swarm-elite', monsterSpecialDesc: '融合精英：虫群繁殖 + 虫母（受伤时替换地城牌为小虫子）。', swarmSpawn: true },
  Golem: { monsterSpecial: 'golem-elite', monsterSpecialDesc: '融合精英：护体（每次最多受5伤）+ 反魔。', maxDamagePerHit: 5, antiMagicReflect: 2 },
};

export const MONSTER_FUSION_SKELETON_KING_IMAGE = skeletonKingImage;

export function resolveMonsterFusion(
  state: GameState,
  card: GameCardData,
  sideEffects: SideEffect[],
  patch: Partial<GameState>,
  enqueuedActions: GameAction[],
  echoMultiplier: number = 1,
): ReduceResult {
  // 法术回响（结构类）：融合操作不可拆分；当 echo>1 时只算一次。
  void echoMultiplier;

  // ---------- 候选收集：装备栏 surface/reserve + 手牌 + 背包 ----------
  // 注意：背包/手牌中的怪物已经走过 `primeMonsterAsEquipment`，
  // 因此都是装备形态（带 durability/maxDurability + monsterType）。
  const candidateMonsters: GameCardData[] = [];

  for (const slotId of ['equipmentSlot1', 'equipmentSlot2'] as EquipmentSlotId[]) {
    const surface = state[slotId] as GameCardData | null;
    if (surface && surface.type === 'monster') candidateMonsters.push(surface);
    const reserve = (slotId === 'equipmentSlot1' ? state.equipmentSlot1Reserve : state.equipmentSlot2Reserve) ?? [];
    for (const r of reserve) {
      if ((r as GameCardData).type === 'monster') candidateMonsters.push(r as GameCardData);
    }
  }
  for (const c of state.handCards) {
    if (c.type === 'monster') candidateMonsters.push(c);
  }
  for (const c of state.backpackItems) {
    if (c.type === 'monster') candidateMonsters.push(c as GameCardData);
  }

  // ---------- 可融合性判定：必须存在某个 monsterType 的同族 ≥ 2 张 ----------
  const typeGroups: Record<string, GameCardData[]> = {};
  for (const m of candidateMonsters) {
    const key = (m as any).monsterType ?? m.name;
    if (!typeGroups[key]) typeGroups[key] = [];
    typeGroups[key].push(m);
  }
  const hasFusibleGroup = Object.values(typeGroups).some(g => g.length >= 2);

  if (!hasFusibleGroup) {
    banner(
      sideEffects,
      '魔物融合：装备栏 / 手牌 / 背包 中没有同种族 ≥ 2 张的怪物装备，无法融合。',
    );
    patch.lastPlayedCardCategory = getCardPlayCategory(card);
    enqueuedActions.push({ type: 'FINALIZE_MAGIC_CARD', card, dealtDamage: false });
    return applyPatch(state, patch, sideEffects, enqueuedActions);
  }

  // ---------- 弹窗 → 等玩家 RESOLVE_MONSTER_FUSION / CANCEL_MONSTER_FUSION ----------
  patch.pendingMagicAction = {
    card,
    effect: 'monster-fusion',
    step: 'monster-fusion-select',
    echoRemaining: echoMultiplier,
  } as any;
  patch.monsterFusionModal = { sourceCardId: card.id };
  sideEffects.push({ event: 'card:monsterFusionRequested', payload: { card } });
  if (echoMultiplier > 1) {
    banner(sideEffects, '魔物融合：回响触发，但融合操作不可叠加（仅结算一次）。');
  }
  return applyPatch(state, patch, sideEffects);
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
  echoMultiplier: number = 1,
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
  patch.pendingMagicAction = { card, effect: 'transform-grant', step: 'perm-grant-select', echoRemaining: echoMultiplier } as any;
  sideEffects.push({ event: 'card:transformGrantModal' as any, payload: { card, echoRemaining: echoMultiplier } });
  if (echoMultiplier > 1) banner(sideEffects, `蜕变赋灵：回响触发，将连续选择 ${echoMultiplier} 张目标。`);
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
  enqueuedActions.push({ type: 'MODIFY_STUN_CAP', delta: 5 } as GameAction);
  log(sideEffects, 'magic', '震慑领域：击晕上限 +5%');

  const monsters = flattenActiveRowSlots(state.activeCards)
    .filter(c => c.type === 'monster' && !c.isStunned);

  if (monsters.length === 0) {
    const newCap = Math.min(100, (state.stunCap ?? 10) + 5);
    banner(sideEffects, `震慑领域：击晕上限 +5%（当前 ${newCap}%）。没有可击晕的怪物。`);
    patch.lastPlayedCardCategory = getCardPlayCategory(card);
    enqueuedActions.push({ type: 'FINALIZE_MAGIC_CARD', card, dealtDamage: false });
    return applyPatch(state, patch, sideEffects, enqueuedActions);
  }

  const currentStunCap = (state.stunCap ?? 10) + 5;
  const aeStunDomain = computeAmuletEffects(state.amuletSlots as GameCardData[]);
  const stunPct = Math.min(60 + (aeStunDomain.stunRateBoost ?? 0), currentStunCap);
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
    banner(sideEffects, `震慑领域：击晕上限 +5%，但击晕率为 0%。`);
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
  echoMultiplier: number = 1,
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
  // Note: candidates are pre-rolled here as legacy bookkeeping for the choice
  // handler at `case 'graveyard-discover-equip-amulet'`. The current UI hook
  // (`useCardPlayHandlers.ts` `card:graveyardDiscoverEquipAmulet`) re-rolls
  // candidates on its own via `requestGraveyardSelection(3, …)`, so these
  // pre-rolled candidates are effectively unused — kept for compatibility.
  let rng = patch.rng ?? state.rng;
  let shuffled: GameCardData[];
  [shuffled, rng] = rngShuffle(eligible, rng);
  patch.rng = rng;
  const candidates = shuffled.slice(0, Math.min(3, shuffled.length));

  const echoRemaining = Math.max(1, echoMultiplier);

  patch.pendingMagicAction = {
    card,
    effect: 'graveyard-discover-equip-amulet',
    step: 'discover',
    data: { candidates },
    echoRemaining,
  } as any;
  if (echoMultiplier > 1) {
    banner(sideEffects, `破印遗物：回响 ×${echoMultiplier}——将连续从坟场发现 ${echoMultiplier} 张装备/护符。`);
  }
  sideEffects.push({
    event: 'card:graveyardDiscoverEquipAmulet' as any,
    payload: { card, candidates, echoRemaining },
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
        return applyCryptDeathwish(state, card, slotId, sideEffects, patch, enqueuedActions, (pending as any).echoMultiplier ?? 1);

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
