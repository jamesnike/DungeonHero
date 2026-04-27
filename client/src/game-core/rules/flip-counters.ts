/**
 * Flip Counters — shared "翻转计数" consumers.
 *
 * 抽出来给所有「触发了一次翻转」的路径共享调用，避免双轨：
 *   1. APPLY_CARD_FLIP（active-row 正向 flipTarget 翻转，rules/cards.ts → reduceApplyCardFlip）
 *   2. 乾坤一翻 直接翻 active-row `_flipBackCard` 卡（rules/hero.ts case 'flip-active-card'
 *      back-flip 分支，以及 starterActiveRowFlip resolver 的自动结算 back-flip 分支）
 *   3. 乾坤一翻 揭开 Preview Row 卡背（rules/hero.ts case 'flip-active-card' preview 分支
 *      与 starterActiveRowFlip resolver 的自动结算 preview 分支）
 *
 * 7 个消费方：
 *   - 熔炉之心 (flip-gold): +金币
 *   - 翻印之符 (persuade-on-flip): 下次劝降成功率 +10%/张
 *   - 翻覆震慑 (flipDebuffMonsterId): 目标怪 -1 攻击
 *   - 熔铸耐久 (_flipRepairBuff，含 reserve): 装备恢复 1 耐久
 *   - 翻血之符 (flip-overkill-lifesteal): 每 5 次翻转 → permanentSpellLifesteal +1
 *   - 弧能之符 (flip-zap): emit card:flipShock 让 UI 处理 zap
 *   - 生长之盾 (amplifyOnFlip): 同名卡 +1 增幅
 *
 * 单独成文件避免 `rules/cards.ts` ↔ `card-schema/definitions/magic.ts` 的循环依赖
 * （magic.ts 里的 starterActiveRowFlip resolver 需要在 resolver 内调用此函数）。
 *
 * patch 内已有的修改会被尊重（如 patch.activeCards 用于 flipDebuffMonsterId 的目标查找；
 * patch.gold/persuadeAmuletBonus/flipOverkillLifestealProgress/permanentSpellLifesteal
 * 都从 patch 优先读取）。
 */

import type { GameState } from '../types';
import type { GameAction } from '../actions';
import type { SideEffect } from '../reducer';
import type { GameCardData } from '@/components/GameCard';
import type { ActiveRowSlots, EquipmentItem } from '@/components/game-board/types';
import { computeAmuletEffectsForState, repairDurabilityPure } from '../equipment';
import { FLIP_GOLD_REWARD } from '../constants';

export function applyFlipCounters(
  state: GameState,
  patch: Partial<GameState>,
  sideEffects: SideEffect[],
  enqueuedActions: GameAction[],
): void {
  const amuletFx = computeAmuletEffectsForState(state);

  if (amuletFx.flipGoldCount > 0) {
    const goldGain = FLIP_GOLD_REWARD * amuletFx.flipGoldCount;
    patch.gold = (patch.gold ?? state.gold ?? 0) + goldGain;
    sideEffects.push({ event: 'log:entry', payload: { type: 'gold', message: `熔炉之心：卡牌翻转，获得 ${goldGain} 金币。` } });
  }

  const persuadeOnFlipAmulets = (state.amuletSlots as GameCardData[]).filter(
    s => s?.amuletEffect === 'persuade-on-flip',
  );
  if (persuadeOnFlipAmulets.length > 0) {
    const stackBonus = persuadeOnFlipAmulets.length * 10;
    patch.persuadeAmuletBonus = (patch.persuadeAmuletBonus ?? state.persuadeAmuletBonus ?? 0) + stackBonus;
    sideEffects.push({
      event: 'log:entry',
      payload: { type: 'amulet', message: `翻印之符：卡牌翻转，下次劝降成功率 +${stackBonus}%（当前 +${patch.persuadeAmuletBonus}%）` },
    });
  }

  if (state.flipDebuffMonsterId) {
    const baseActiveForLookup = (patch.activeCards ?? state.activeCards) as (GameCardData | null)[];
    const targetIdx = baseActiveForLookup.findIndex(c => c?.id === state.flipDebuffMonsterId);
    if (targetIdx >= 0) {
      const targetCard = baseActiveForLookup[targetIdx]!;
      if (targetCard.type === 'monster' || targetCard.attack != null) {
        const currentAtk = targetCard.attack ?? 0;
        const newAtk = Math.max(0, currentAtk - 1);
        if (newAtk !== currentAtk) {
          const updated = [...baseActiveForLookup] as ActiveRowSlots;
          updated[targetIdx] = { ...targetCard, attack: newAtk };
          patch.activeCards = updated;
          sideEffects.push({
            event: 'log:entry',
            payload: { type: 'event', message: `翻覆震慑：${targetCard.name} 攻击力 ${currentAtk} → ${newAtk}` },
          });
        }
      }
    } else {
      patch.flipDebuffMonsterId = null;
    }
  }

  const flipRepairTouches: string[] = [];
  const tryRepairEquip = (eq: GameCardData | null | undefined): GameCardData | null | undefined => {
    if (!eq || !eq._flipRepairBuff) return eq;
    if (typeof eq.durability !== 'number' || typeof eq.maxDurability !== 'number') return eq;
    if (eq.durability >= eq.maxDurability) return eq;
    const restored = repairDurabilityPure(eq, 1);
    flipRepairTouches.push(`${eq.name} → ${restored.durability}/${restored.maxDurability}`);
    return restored;
  };
  const slot1Cur = patch.equipmentSlot1 ?? state.equipmentSlot1;
  const slot2Cur = patch.equipmentSlot2 ?? state.equipmentSlot2;
  const repairedSlot1 = tryRepairEquip(slot1Cur);
  const repairedSlot2 = tryRepairEquip(slot2Cur);
  if (repairedSlot1 !== slot1Cur) patch.equipmentSlot1 = repairedSlot1 as any;
  if (repairedSlot2 !== slot2Cur) patch.equipmentSlot2 = repairedSlot2 as any;
  const reserve1Cur = patch.equipmentSlot1Reserve ?? state.equipmentSlot1Reserve;
  if (Array.isArray(reserve1Cur) && reserve1Cur.length > 0) {
    let changed = false;
    const next = reserve1Cur.map(eq => {
      const repaired = tryRepairEquip(eq);
      if (repaired !== eq) changed = true;
      return repaired as GameCardData;
    });
    if (changed) patch.equipmentSlot1Reserve = next as EquipmentItem[];
  }
  const reserve2Cur = patch.equipmentSlot2Reserve ?? state.equipmentSlot2Reserve;
  if (Array.isArray(reserve2Cur) && reserve2Cur.length > 0) {
    let changed = false;
    const next = reserve2Cur.map(eq => {
      const repaired = tryRepairEquip(eq);
      if (repaired !== eq) changed = true;
      return repaired as GameCardData;
    });
    if (changed) patch.equipmentSlot2Reserve = next as EquipmentItem[];
  }
  if (flipRepairTouches.length > 0) {
    sideEffects.push({
      event: 'log:entry',
      payload: { type: 'equip', message: `熔铸耐久：翻转触发，${flipRepairTouches.join('；')}` },
    });
  }

  const flipLifestealAmulets = (state.amuletSlots as GameCardData[]).filter(
    s => s?.amuletEffect === 'flip-overkill-lifesteal',
  );
  if (flipLifestealAmulets.length > 0) {
    const flipThreshold = 5;
    const flipProgress = (patch.flipOverkillLifestealProgress ?? state.flipOverkillLifestealProgress ?? 0) + flipLifestealAmulets.length;
    if (flipProgress >= flipThreshold) {
      patch.flipOverkillLifestealProgress = 0;
      patch.permanentSpellLifesteal = (patch.permanentSpellLifesteal ?? state.permanentSpellLifesteal ?? 0) + 1;
      sideEffects.push({
        event: 'log:entry',
        payload: { type: 'amulet', message: `${flipLifestealAmulets[0].name}：累计翻转 ${flipThreshold} 张牌，超杀吸血永久 +1！` },
      });
    } else {
      patch.flipOverkillLifestealProgress = flipProgress;
    }
  }

  if (amuletFx.flipZapCount > 0) {
    sideEffects.push({ event: 'card:flipShock', payload: { count: amuletFx.flipZapCount } });
  }

  // 「生长之盾」amplifyOnFlip：每次翻转给同名卡 +N 增幅。
  // 默认 amount=1（基础卡行为）；升级后通过 `amplifyOnFlipAmount` 字段覆盖（L1/L2 → 2）。
  // 同名两槽都装备时按 name 去重，amount 取较大值 —— 一槽 L0、一槽 L2 时按 +2 触发。
  const amplifyOnFlipMap = new Map<string, number>();
  const accumulate = (item: EquipmentItem | null | undefined): void => {
    if (!item?.amplifyOnFlip) return;
    const amount = (item as { amplifyOnFlipAmount?: number }).amplifyOnFlipAmount ?? 1;
    const existing = amplifyOnFlipMap.get(item.name);
    if (existing === undefined || amount > existing) {
      amplifyOnFlipMap.set(item.name, amount);
    }
  };
  accumulate(patch.equipmentSlot1 ?? state.equipmentSlot1);
  accumulate(patch.equipmentSlot2 ?? state.equipmentSlot2);
  for (const [name, amount] of amplifyOnFlipMap) {
    enqueuedActions.push({
      type: 'AMPLIFY_CARDS_BY_NAME',
      cardName: name,
      amount,
      source: `${name} 翻转增幅`,
    });
  }
}
