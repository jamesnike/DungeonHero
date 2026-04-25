/**
 * On-Enter-Hand Effect Definitions (上手 keyword)
 *
 * Registers all on-enter-hand effects. Each handler receives the card that
 * just entered the hand and mutates patch / sideEffects / enqueuedActions.
 *
 * Triggers are dispatched automatically by the reducer post-process layer
 * when a card with `onEnterHandEffect` set (and without `_skipOnEnterHand`)
 * is detected as newly added to `state.handCards`.
 */

import type { OnEnterHandHandler } from '../on-enter-hand';
import { registerOnEnterHandAll } from '../on-enter-hand';
import type { EquipmentSlotId, ActiveRowSlots } from '@/components/game-board/types';
import { pickRandom } from '../../rng';
import { flattenActiveRowSlots, isDamageableTarget } from '../../helpers';

const defaultSlotState = { equipmentSlot1: 0, equipmentSlot2: 0 };

/**
 * 兵器谱 上手效果：随机一个装备栏临时攻击 +2。
 *
 * Picks uniformly from both slots regardless of whether they are filled
 * (per design: the bonus is bound to the slot, applies whether empty or not,
 * and will affect whatever weapon eventually occupies that slot during the
 * remainder of the turn).
 */
const weaponManualOnHand: OnEnterHandHandler = (state, card, patch, sideEffects) => {
  const slots: EquipmentSlotId[] = ['equipmentSlot1', 'equipmentSlot2'];
  const rng = patch.rng ?? state.rng;
  const [slotId, nextRng] = pickRandom(slots, rng);
  patch.rng = nextRng;

  const base = { ...(state.slotTempAttack ?? defaultSlotState), ...(patch.slotTempAttack ?? {}) };
  base[slotId] = (base[slotId] ?? 0) + 2;
  patch.slotTempAttack = base;

  const slotLabel = slotId === 'equipmentSlot1' ? '左装备栏' : '右装备栏';
  sideEffects.push({
    event: 'log:entry',
    payload: { type: 'magic', message: `${card.name} 上手：${slotLabel} 临时攻击 +2。` },
  });
  sideEffects.push({
    event: 'ui:banner',
    payload: { text: `${card.name} 上手：${slotLabel} 临时攻击 +2！` },
  });
};

/**
 * 血誓回卷 上手效果：恢复 1 HP（受 maxHp 上限限制，走标准 HEAL action
 * 以兼顾 amulet/equipmentSlotBonuses/totalHealed/healAccumulator 等所有钩子）。
 */
const bloodOathScrollOnHand: OnEnterHandHandler = (state, card, patch, sideEffects, enqueuedActions) => {
  enqueuedActions.push({ type: 'HEAL', amount: 1, source: 'blood-oath-scroll-onhand' });
  sideEffects.push({
    event: 'log:entry',
    payload: { type: 'magic', message: `${card.name} 上手：恢复 1 生命。` },
  });
  sideEffects.push({
    event: 'ui:banner',
    payload: { text: `${card.name} 上手：+1 生命！` },
  });
};

/**
 * 查阅动作 上手效果：随机一个装备栏 临时攻击 +N。
 * N 由 upgradeLevel 决定：[+1, +2]。
 *
 * 与「兵器谱」上手对齐：在两个装备栏中均匀随机，不要求该栏当前持有装备
 * （buff 绑定槽位本身，槽内换装备后仍然生效）。
 */
const surveyActionOnHand: OnEnterHandHandler = (state, card, patch, sideEffects) => {
  const buffByLevel = [1, 2];
  const bonus = buffByLevel[card.upgradeLevel ?? 0] ?? 1;

  const slots: EquipmentSlotId[] = ['equipmentSlot1', 'equipmentSlot2'];
  const rng = patch.rng ?? state.rng;
  const [slotId, nextRng] = pickRandom(slots, rng);
  patch.rng = nextRng;

  const base = { ...(state.slotTempAttack ?? defaultSlotState), ...(patch.slotTempAttack ?? {}) };
  base[slotId] = (base[slotId] ?? 0) + bonus;
  patch.slotTempAttack = base;

  const slotLabel = slotId === 'equipmentSlot1' ? '左装备栏' : '右装备栏';
  sideEffects.push({
    event: 'log:entry',
    payload: { type: 'magic', message: `${card.name} 上手：${slotLabel} 临时攻击 +${bonus}。` },
  });
  sideEffects.push({
    event: 'ui:banner',
    payload: { text: `${card.name} 上手：${slotLabel} 临时攻击 +${bonus}！` },
  });
};

/**
 * 三牌惊雷 上手效果：每次此牌进入手牌时，对当前激活行所有怪物各造成 1 点法术伤害。
 *
 * Damage routes through DEAL_DAMAGE_TO_MONSTER so it benefits from the standard
 * damage pipeline (engagement, last-words, kill effects, missile relics, …)
 * and is consistent with other knight spell-damage cards.
 *
 * Spell damage bonus from `state.permanentSpellDamageBonus` is applied at the
 * reducer side via the standard pipeline; we pass the base damage of 1 plus
 * any amplifyBonus carried on the card.
 */
const threeCardThunderOnHand: OnEnterHandHandler = (state, card, patch, sideEffects, enqueuedActions) => {
  const monsters = flattenActiveRowSlots(state.activeCards as ActiveRowSlots).filter(isDamageableTarget);
  if (monsters.length === 0) {
    sideEffects.push({
      event: 'log:entry',
      payload: { type: 'magic', message: `${card.name} 上手：当前行没有怪物，效果落空。` },
    });
    return;
  }

  const baseDamage = 1 + (card.amplifyBonus ?? 0);
  const totalDamage = Math.max(0, baseDamage + (state.permanentSpellDamageBonus ?? 0));

  for (const target of monsters) {
    if (!(state.combatState?.engagedMonsterIds ?? []).includes(target.id)) {
      enqueuedActions.push({ type: 'BEGIN_COMBAT', monster: target, initiator: 'hero' });
    }
    enqueuedActions.push({
      type: 'DEAL_DAMAGE_TO_MONSTER',
      monsterId: target.id,
      damage: totalDamage,
      source: 'three-card-thunder-onhand',
      isSpellDamage: true,
    });
  }

  sideEffects.push({
    event: 'log:entry',
    payload: { type: 'magic', message: `${card.name} 上手：对 ${monsters.length} 个怪物各造成 ${totalDamage} 点法术伤害。` },
  });
  sideEffects.push({
    event: 'ui:banner',
    payload: { text: `${card.name} 上手：全场 ${totalDamage} 点法术伤害！` },
  });
};

/**
 * 战狂诅咒 上手效果：随机一个装备栏获得 1 点临时攻击。
 *
 * 与「兵器谱」/「查阅动作」上手对齐：在两个装备栏中均匀随机，不要求该栏当前持有装备
 * （buff 绑定槽位本身，槽内换装备后仍然生效）。
 */
const frenzyCurseOnHand: OnEnterHandHandler = (state, card, patch, sideEffects) => {
  const slots: EquipmentSlotId[] = ['equipmentSlot1', 'equipmentSlot2'];
  const rng = patch.rng ?? state.rng;
  const [slotId, nextRng] = pickRandom(slots, rng);
  patch.rng = nextRng;

  const base = { ...(state.slotTempAttack ?? defaultSlotState), ...(patch.slotTempAttack ?? {}) };
  base[slotId] = (base[slotId] ?? 0) + 1;
  patch.slotTempAttack = base;

  const slotLabel = slotId === 'equipmentSlot1' ? '左装备栏' : '右装备栏';
  sideEffects.push({
    event: 'log:entry',
    payload: { type: 'magic', message: `${card.name} 上手：${slotLabel} 临时攻击 +1。` },
  });
  sideEffects.push({
    event: 'ui:banner',
    payload: { text: `${card.name} 上手：${slotLabel} 临时攻击 +1！` },
  });
};

/**
 * 翻转之契 option 5 — 「铭刻技艺」: each time this card enters hand, stunCap +3 (cap 100).
 * The bonus follows the card permanently (set on card.onEnterHandEffect via
 * RESOLVE_EVENT_GRANT_HAND_STUN_BONUS in rules/events.ts). Repeated grants are
 * idempotent (same card → still single +3 per entry).
 */
const stunCapBonus3OnHand: OnEnterHandHandler = (state, card, patch, sideEffects) => {
  const STUN_CAP_HARD_MAX = 100;
  const current = patch.stunCap ?? state.stunCap ?? 0;
  const target = Math.min(STUN_CAP_HARD_MAX, current + 3);
  if (target <= current) {
    sideEffects.push({
      event: 'log:entry',
      payload: { type: 'magic', message: `${card.name} 上手：击晕上限已达 ${STUN_CAP_HARD_MAX}%。` },
    });
    return;
  }
  patch.stunCap = target;
  sideEffects.push({
    event: 'log:entry',
    payload: { type: 'magic', message: `${card.name} 上手：击晕上限 ${current}% → ${target}%。` },
  });
  sideEffects.push({
    event: 'ui:banner',
    payload: { text: `${card.name} 上手：击晕上限 +3%！` },
  });
};

/**
 * 生长之刃 上手效果：每次此武器进入手牌时，按卡名累计增幅 +1
 * （等同于「增幅祭坛」一次发动），所有同名「生长之刃」与未来生成的同名卡
 * 都会同步获得 +1 攻击。
 */
const growthBladeOnHand: OnEnterHandHandler = (_state, card, _patch, sideEffects, enqueuedActions) => {
  enqueuedActions.push({
    type: 'AMPLIFY_CARDS_BY_NAME',
    cardName: card.name,
    amount: 1,
    source: `${card.name} 上手`,
  });
  sideEffects.push({
    event: 'log:entry',
    payload: { type: 'magic', message: `${card.name} 上手：增幅一次（+1 攻击）。` },
  });
  sideEffects.push({
    event: 'ui:banner',
    payload: { text: `${card.name} 上手：增幅一次！` },
  });
};

/**
 * 赋能神殿 「上手：恢复 1 HP」: each time this card enters hand, heal 1 HP.
 * Set on `card.onEnterHandEffect = 'on-hand-heal-1'` via the
 * `on-hand-heal-grant` PermGrant flow. Routed through HEAL action so that
 * standard hooks (amulet/equipmentSlotBonuses/totalHealed/healAccumulator)
 * fire consistently. Capped at maxHp like all other heals.
 */
const onHandHeal1: OnEnterHandHandler = (_state, card, _patch, sideEffects, enqueuedActions) => {
  enqueuedActions.push({ type: 'HEAL', amount: 1, source: 'on-hand-heal-1' });
  sideEffects.push({
    event: 'log:entry',
    payload: { type: 'magic', message: `${card.name} 上手：恢复 1 生命。` },
  });
  sideEffects.push({
    event: 'ui:banner',
    payload: { text: `${card.name} 上手：+1 生命！` },
  });
};

registerOnEnterHandAll([
  { id: 'weapon-manual-onhand', handler: weaponManualOnHand },
  { id: 'blood-oath-scroll-onhand', handler: bloodOathScrollOnHand },
  { id: 'survey-action-onhand', handler: surveyActionOnHand },
  { id: 'three-card-thunder-onhand', handler: threeCardThunderOnHand },
  { id: 'stun-cap-bonus-3', handler: stunCapBonus3OnHand },
  { id: 'frenzy-curse-onhand', handler: frenzyCurseOnHand },
  { id: 'growth-blade-onhand', handler: growthBladeOnHand },
  { id: 'on-hand-heal-1', handler: onHandHeal1 },
]);
