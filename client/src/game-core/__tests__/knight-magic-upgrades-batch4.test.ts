/**
 * Knight 专属 Magic 升级 — 第 4 批 3 张卡 × 多 consumer 路径覆盖
 *
 * 验证矩阵（per `shared-effect-id-impact-check.mdc`：每张卡的所有 consumer 路径都要测）：
 *
 *   锋芒倍增 (temp-attack-double):
 *     - 路径 A (handler，描述): upgrades.ts tempAttackDouble
 *     - 路径 B (resolver prompt): magic.ts knightTempAttackDouble (slot-select prompt)
 *     - 路径 C (slot-resolve): hero.ts case 'temp-attack-double' (addAmounts table)
 *     - "翻倍"步骤不变；空槽允许选；echo 仅作用于加值
 *
 *   淬铸迁位 (amplify-equipment-shift):
 *     - 路径 A (handler，描述): upgrades.ts amplifyEquipmentShift
 *     - 路径 B (resolver prompt): magic.ts knightAmplifyEquipmentShift
 *     - 路径 C (slot-resolve): hero.ts case 'amplify-equipment-shift' (amplifyAmounts table)
 *     - "搬到空位"步骤不变（仍最多 1 次）；空槽 reject 不变；echo 累计 amount
 *
 *   精华萃取 (essence-extract):
 *     - 路径 A (handler，描述): upgrades.ts essenceExtract
 *     - 路径 B (resolver): cards.ts reduceResolvePermGrant 'essence-extract' 分支
 *       (damageBonusByLevel + shieldBonusByLevel 双表)
 *     - 强行送坟场 / 不触发 onDiscardDraw 不变；只是数值随 upgradeLevel 浮动
 *
 * 参数表：
 *   - temp-attack-double:        addAmounts = [2, 3]              (maxUpgradeLevel = 1)
 *   - amplify-equipment-shift:   amplifyAmounts = [1, 2]          (maxUpgradeLevel = 1)
 *   - essence-extract:
 *       damageBonusByLevel = [1, 1, 2]   (magic / equipment 攻击路径)
 *       shieldBonusByLevel = [1, 2, 2]   (amulet / monster / potion 护甲路径)
 *                                                                  (maxUpgradeLevel = 2)
 */

import { describe, expect, it } from 'vitest';
import { drain } from '../pipeline';
import { reduce } from '../reducer';
import { createInitialGameState } from '../state';
import { resolveUpgradeEffectId } from '../card-schema';
import type { GameState } from '../types';
import type { GameAction } from '../actions';
import type { GameCardData } from '@/components/GameCard';
import '../card-schema';

function makeState(overrides?: Partial<GameState>): GameState {
  return { ...createInitialGameState(), ...(overrides ?? {}) };
}

// ===========================================================================
// 锋芒倍增 (temp-attack-double)
// ===========================================================================

describe('锋芒倍增 (temp-attack-double) — routing', () => {
  it('routes to knight:temp-attack-double via knightEffect field', () => {
    const card: GameCardData = {
      id: 'tad-route',
      type: 'magic',
      name: '锋芒倍增',
      value: 0,
      knightEffect: 'temp-attack-double',
    } as any;
    expect(resolveUpgradeEffectId(card)).toBe('knight:temp-attack-double');
  });
});

describe('锋芒倍增 (temp-attack-double) — handler description updates', () => {
  function tadL0(): GameCardData {
    return {
      id: 'tad-handler',
      type: 'magic',
      name: '锋芒倍增',
      value: 0,
      classCard: true,
      magicType: 'permanent' as any,
      description: '永久：选择一个装备栏，临时攻击 +1，然后该栏临时攻击翻倍。',
      shortDescription: '该栏临时攻击 +1 后翻倍',
      magicEffect: '临时攻击 +1 后翻倍。',
      knightEffect: 'temp-attack-double',
      recycleDelay: 1,
      maxUpgradeLevel: 1,
      upgradeLevel: 0,
    } as any;
  }

  it('L0 → L1: 加值 +1 → +2，翻倍步骤不变', () => {
    const card = tadL0();
    const state = makeState({ handCards: [card] });
    const result = reduce(state, { type: 'UPGRADE_CARD', cardId: card.id });
    const upgraded = result.state.handCards[0] as any;
    expect(upgraded.upgradeLevel).toBe(1);
    expect(upgraded.description).toContain('+2');
    expect(upgraded.description).not.toContain('+1');
    expect(upgraded.description).toContain('翻倍');
    expect(upgraded.shortDescription).toContain('+2');
    expect(upgraded.magicEffect).toContain('+2');
  });

  it('cannot upgrade past maxUpgradeLevel (1)', () => {
    const card = { ...tadL0(), upgradeLevel: 1 };
    const state = makeState({ handCards: [card as any] });
    const result = reduce(state, { type: 'UPGRADE_CARD', cardId: card.id });
    const upgraded = result.state.handCards[0] as any;
    expect(upgraded.upgradeLevel).toBe(1);
  });
});

describe('锋芒倍增 (temp-attack-double) — resolver applies +N then doubles', () => {
  function makeTadCard(level?: number): GameCardData {
    return {
      id: `tad-r-${level ?? 0}`,
      type: 'magic',
      name: '锋芒倍增',
      value: 0,
      classCard: true,
      magicType: 'permanent' as any,
      knightEffect: 'temp-attack-double',
      recycleDelay: 1,
      ...(level !== undefined ? { upgradeLevel: level } : {}),
    } as any;
  }

  it('L0: empty slot at +0 → (+1) → ×2 = 2', () => {
    const card = makeTadCard(0);
    const state = makeState({
      handCards: [card],
      equipmentSlot1: null,
      equipmentSlot2: null,
      pendingMagicAction: {
        card,
        effect: 'temp-attack-double',
        step: 'slot-select',
        prompt: '...',
      } as any,
    });
    const result = drain(state, [
      { type: 'RESOLVE_MAGIC_SLOT_SELECTION', magicId: 'temp-attack-double', slotId: 'equipmentSlot1' } as GameAction,
    ]);
    expect(result.state.slotTempAttack?.equipmentSlot1).toBe(2);
  });

  it('L1: empty slot at +0 → (+2) → ×2 = 4', () => {
    const card = makeTadCard(1);
    const state = makeState({
      handCards: [card],
      equipmentSlot1: null,
      equipmentSlot2: null,
      pendingMagicAction: {
        card,
        effect: 'temp-attack-double',
        step: 'slot-select',
        prompt: '...',
      } as any,
    });
    const result = drain(state, [
      { type: 'RESOLVE_MAGIC_SLOT_SELECTION', magicId: 'temp-attack-double', slotId: 'equipmentSlot1' } as GameAction,
    ]);
    expect(result.state.slotTempAttack?.equipmentSlot1).toBe(4);
  });

  it('L1 starting at +3: (3 + 2) × 2 = 10', () => {
    const card = makeTadCard(1);
    const state = makeState({
      handCards: [card],
      slotTempAttack: { equipmentSlot1: 3, equipmentSlot2: 0 },
      pendingMagicAction: {
        card,
        effect: 'temp-attack-double',
        step: 'slot-select',
        prompt: '...',
      } as any,
    });
    const result = drain(state, [
      { type: 'RESOLVE_MAGIC_SLOT_SELECTION', magicId: 'temp-attack-double', slotId: 'equipmentSlot1' } as GameAction,
    ]);
    expect(result.state.slotTempAttack?.equipmentSlot1).toBe(10);
  });

  it('L1 + Echo ×2: (1 + 2*2) × 2 = 10 (additive scales by echo, ×2 stays)', () => {
    const card = makeTadCard(1);
    const state = makeState({
      handCards: [card],
      slotTempAttack: { equipmentSlot1: 1, equipmentSlot2: 0 },
      pendingMagicAction: {
        card,
        effect: 'temp-attack-double',
        step: 'slot-select',
        prompt: '...',
        echoMultiplier: 2,
      } as any,
    });
    const result = drain(state, [
      { type: 'RESOLVE_MAGIC_SLOT_SELECTION', magicId: 'temp-attack-double', slotId: 'equipmentSlot1' } as GameAction,
    ]);
    expect(result.state.slotTempAttack?.equipmentSlot1).toBe(10);
  });
});

describe('锋芒倍增 (temp-attack-double) — prompt reflects upgradeLevel', () => {
  function makeTadCard(level: number): GameCardData {
    return {
      id: `tad-prompt-${level}`,
      type: 'magic',
      name: '锋芒倍增',
      value: 0,
      classCard: true,
      magicType: 'permanent' as any,
      knightEffect: 'temp-attack-double',
      recycleDelay: 1,
      upgradeLevel: level,
    } as any;
  }

  it('L0 prompt mentions +1', () => {
    const card = makeTadCard(0);
    const state = makeState({ handCards: [card], phase: 'playerInput' });
    const result = drain(state, [{ type: 'PLAY_CARD', cardId: card.id } as GameAction]);
    const pending = result.state.pendingMagicAction as any;
    expect(pending?.prompt).toContain('+1');
  });

  it('L1 prompt mentions +2', () => {
    const card = makeTadCard(1);
    const state = makeState({ handCards: [card], phase: 'playerInput' });
    const result = drain(state, [{ type: 'PLAY_CARD', cardId: card.id } as GameAction]);
    const pending = result.state.pendingMagicAction as any;
    expect(pending?.prompt).toContain('+2');
  });
});

// ===========================================================================
// 淬铸迁位 (amplify-equipment-shift)
// ===========================================================================

describe('淬铸迁位 (amplify-equipment-shift) — routing', () => {
  it('routes to knight:amplify-equipment-shift via knightEffect field', () => {
    const card: GameCardData = {
      id: 'aes-route',
      type: 'magic',
      name: '淬铸迁位',
      value: 0,
      knightEffect: 'amplify-equipment-shift',
    } as any;
    expect(resolveUpgradeEffectId(card)).toBe('knight:amplify-equipment-shift');
  });
});

describe('淬铸迁位 (amplify-equipment-shift) — handler description updates', () => {
  function aesL0(): GameCardData {
    return {
      id: 'aes-handler',
      type: 'magic',
      name: '淬铸迁位',
      value: 0,
      classCard: true,
      magicType: 'permanent' as any,
      description: '永久：选择一个装备栏的装备进行增幅一次（同名卡 +1）。若另一装备栏为空，将其换到空位。',
      shortDescription: '所选装备增幅 +1；空栏则换位',
      magicEffect: '永久魔法：所选装备栏的装备 +1 增幅（按卡名累计），若另一栏为空则换到空位。',
      knightEffect: 'amplify-equipment-shift',
      recycleDelay: 1,
      maxUpgradeLevel: 1,
      upgradeLevel: 0,
    } as any;
  }

  it('L0 → L1: 增幅 1 次 → 2 次（同名 +2）', () => {
    const card = aesL0();
    const state = makeState({ handCards: [card] });
    const result = reduce(state, { type: 'UPGRADE_CARD', cardId: card.id });
    const upgraded = result.state.handCards[0] as any;
    expect(upgraded.upgradeLevel).toBe(1);
    expect(upgraded.description).toContain('+2');
    expect(upgraded.description).toContain('2 次');
    // 移到空位的措辞保留
    expect(upgraded.description).toContain('换到空位');
    expect(upgraded.shortDescription).toContain('+2');
    expect(upgraded.magicEffect).toContain('+2');
  });

  it('cannot upgrade past maxUpgradeLevel (1)', () => {
    const card = { ...aesL0(), upgradeLevel: 1 };
    const state = makeState({ handCards: [card as any] });
    const result = reduce(state, { type: 'UPGRADE_CARD', cardId: card.id });
    const upgraded = result.state.handCards[0] as any;
    expect(upgraded.upgradeLevel).toBe(1);
  });
});

describe('淬铸迁位 (amplify-equipment-shift) — resolver scales amplify amount', () => {
  function makeAesCard(level?: number): GameCardData {
    return {
      id: `aes-r-${level ?? 0}`,
      type: 'magic',
      name: '淬铸迁位',
      value: 0,
      classCard: true,
      magicType: 'permanent' as any,
      knightEffect: 'amplify-equipment-shift',
      recycleDelay: 1,
      ...(level !== undefined ? { upgradeLevel: level } : {}),
    } as any;
  }

  function makeWeapon(name: string): GameCardData {
    return {
      id: `w-${name}`,
      type: 'weapon',
      name,
      value: 3,
      durability: 3,
      maxDurability: 3,
      fromSlot: 'equipmentSlot1',
    } as any;
  }

  it('L0: 同名装备 +1 增幅', () => {
    const card = makeAesCard(0);
    const weapon = makeWeapon('汰换之刃');
    const state = makeState({
      handCards: [card],
      equipmentSlot1: weapon as any,
      equipmentSlot2: null,
      phase: 'playerInput',
      pendingMagicAction: { card, effect: 'amplify-equipment-shift', step: 'slot-select', prompt: '...' } as any,
    });
    const result = drain(state, [
      { type: 'RESOLVE_MAGIC_SLOT_SELECTION', magicId: 'amplify-equipment-shift', slotId: 'equipmentSlot1' } as GameAction,
    ]);
    expect(result.state.amplifiedCardBonus['汰换之刃']).toBe(1);
  });

  it('L1: 同名装备 +2 增幅', () => {
    const card = makeAesCard(1);
    const weapon = makeWeapon('汰换之刃');
    const state = makeState({
      handCards: [card],
      equipmentSlot1: weapon as any,
      equipmentSlot2: null,
      phase: 'playerInput',
      pendingMagicAction: { card, effect: 'amplify-equipment-shift', step: 'slot-select', prompt: '...' } as any,
    });
    const result = drain(state, [
      { type: 'RESOLVE_MAGIC_SLOT_SELECTION', magicId: 'amplify-equipment-shift', slotId: 'equipmentSlot1' } as GameAction,
    ]);
    expect(result.state.amplifiedCardBonus['汰换之刃']).toBe(2);
    // 移到空位仍然发生
    expect((result.state.equipmentSlot2 as any)?.id).toBe('w-汰换之刃');
    expect(result.state.equipmentSlot1).toBeNull();
  });

  it('L1 + Echo ×2: 同名装备 +4 增幅（base ×echo），仅移动 1 次', () => {
    const card = makeAesCard(1);
    const weapon = makeWeapon('汰换之刃');
    const state = makeState({
      handCards: [card],
      equipmentSlot1: weapon as any,
      equipmentSlot2: null,
      phase: 'playerInput',
      pendingMagicAction: {
        card,
        effect: 'amplify-equipment-shift',
        step: 'slot-select',
        prompt: '...',
        echoMultiplier: 2,
      } as any,
    });
    const result = drain(state, [
      { type: 'RESOLVE_MAGIC_SLOT_SELECTION', magicId: 'amplify-equipment-shift', slotId: 'equipmentSlot1' } as GameAction,
    ]);
    expect(result.state.amplifiedCardBonus['汰换之刃']).toBe(4);
    // 仍然搬到空槽，且只发生 1 次（重要：echo 不重复 move）
    expect((result.state.equipmentSlot2 as any)?.id).toBe('w-汰换之刃');
    expect(result.state.equipmentSlot1).toBeNull();
  });

  it('L1: 空槽仍然 reject + 不消耗 magic（reject 不随升级变化）', () => {
    const card = makeAesCard(1);
    const state = makeState({
      handCards: [card],
      equipmentSlot1: null,
      equipmentSlot2: null,
      phase: 'playerInput',
      pendingMagicAction: { card, effect: 'amplify-equipment-shift', step: 'slot-select', prompt: '...' } as any,
    });
    const result = drain(state, [
      { type: 'RESOLVE_MAGIC_SLOT_SELECTION', magicId: 'amplify-equipment-shift', slotId: 'equipmentSlot1' } as GameAction,
    ]);
    expect(result.state.pendingMagicAction).not.toBeNull();
    expect(result.state.amplifiedCardBonus['汰换之刃']).toBeUndefined();
  });
});

describe('淬铸迁位 (amplify-equipment-shift) — prompt reflects upgradeLevel', () => {
  function makeAesCard(level: number): GameCardData {
    return {
      id: `aes-prompt-${level}`,
      type: 'magic',
      name: '淬铸迁位',
      value: 0,
      classCard: true,
      magicType: 'permanent' as any,
      knightEffect: 'amplify-equipment-shift',
      recycleDelay: 1,
      upgradeLevel: level,
    } as any;
  }

  it('L0 prompt mentions +1', () => {
    const card = makeAesCard(0);
    const state = makeState({ handCards: [card], phase: 'playerInput' });
    const result = drain(state, [{ type: 'PLAY_CARD', cardId: card.id } as GameAction]);
    const pending = result.state.pendingMagicAction as any;
    expect(pending?.prompt).toContain('+1');
  });

  it('L1 prompt mentions +2', () => {
    const card = makeAesCard(1);
    const state = makeState({ handCards: [card], phase: 'playerInput' });
    const result = drain(state, [{ type: 'PLAY_CARD', cardId: card.id } as GameAction]);
    const pending = result.state.pendingMagicAction as any;
    expect(pending?.prompt).toContain('+2');
  });
});

// ===========================================================================
// 精华萃取 (essence-extract)
// ===========================================================================

describe('精华萃取 (essence-extract) — routing', () => {
  it('routes to knight:essence-extract via knightEffect field', () => {
    const card: GameCardData = {
      id: 'ee-route',
      type: 'magic',
      name: '精华萃取',
      value: 0,
      knightEffect: 'essence-extract',
    } as any;
    expect(resolveUpgradeEffectId(card)).toBe('knight:essence-extract');
  });
});

describe('精华萃取 (essence-extract) — handler description updates', () => {
  function eeL0(): GameCardData {
    return {
      id: 'ee-handler',
      type: 'magic',
      name: '精华萃取',
      value: 0,
      classCard: true,
      magicType: 'permanent' as any,
      magicEffect: '永久魔法：删除一张手牌（送入坟场），根据该卡类型获得装备栏永久加成。',
      description: '删除一张手牌（送入坟场）。一次性魔法→左栏攻击+1；装备→右栏攻击+1；护符→右栏护甲+1；怪物/药水→左栏护甲+1。',
      shortDescription: '删除一张手牌，按类型获得装备栏永久加成',
      knightEffect: 'essence-extract',
      recycleDelay: 2,
      maxUpgradeLevel: 2,
      upgradeLevel: 0,
    } as any;
  }

  it('L0 → L1: 攻击路径不变 (+1)，护甲路径 +1 → +2', () => {
    const card = eeL0();
    const state = makeState({ handCards: [card] });
    const result = reduce(state, { type: 'UPGRADE_CARD', cardId: card.id });
    const upgraded = result.state.handCards[0] as any;
    expect(upgraded.upgradeLevel).toBe(1);
    // 攻击路径仍然 +1
    expect(upgraded.description).toContain('左栏攻击+1');
    expect(upgraded.description).toContain('右栏攻击+1');
    // 护甲路径升到 +2
    expect(upgraded.description).toContain('右栏护甲+2');
    expect(upgraded.description).toContain('左栏护甲+2');
    expect(upgraded.description).not.toContain('右栏护甲+1');
    expect(upgraded.description).not.toContain('左栏护甲+1');
  });

  it('L1 → L2: 攻击路径 +1 → +2，护甲路径已 +2 不变', () => {
    const card = { ...eeL0(), upgradeLevel: 1 };
    const state = makeState({ handCards: [card as any] });
    const result = reduce(state, { type: 'UPGRADE_CARD', cardId: card.id });
    const upgraded = result.state.handCards[0] as any;
    expect(upgraded.upgradeLevel).toBe(2);
    expect(upgraded.description).toContain('左栏攻击+2');
    expect(upgraded.description).toContain('右栏攻击+2');
    expect(upgraded.description).toContain('右栏护甲+2');
    expect(upgraded.description).toContain('左栏护甲+2');
    expect(upgraded.description).not.toContain('攻击+1');
  });

  it('cannot upgrade past maxUpgradeLevel (2)', () => {
    const card = { ...eeL0(), upgradeLevel: 2 };
    const state = makeState({ handCards: [card as any] });
    const result = reduce(state, { type: 'UPGRADE_CARD', cardId: card.id });
    const upgraded = result.state.handCards[0] as any;
    expect(upgraded.upgradeLevel).toBe(2);
  });
});

describe('精华萃取 (essence-extract) — resolver applies bonus by type × level', () => {
  function makeEeCard(level?: number): GameCardData {
    return {
      id: 'essence-extract-card',
      type: 'magic',
      name: '精华萃取',
      value: 0,
      classCard: true,
      magicType: 'permanent' as any,
      knightEffect: 'essence-extract',
      recycleDelay: 2,
      ...(level !== undefined ? { upgradeLevel: level } : {}),
    } as any;
  }

  function castAndPick(state: GameState, targetCardId: string): GameState {
    let r = reduce(state, { type: 'PLAY_CARD', cardId: 'essence-extract-card' });
    let next = drain(r.state, r.enqueuedActions ?? []).state;
    r = reduce(next, { type: 'RESOLVE_PERM_GRANT', targetCardId } as any);
    next = drain(r.state, r.enqueuedActions ?? []).state;
    return next;
  }

  function makeWeapon(id: string): GameCardData {
    return { id, type: 'weapon', name: 'Sword', value: 4, durability: 3, maxDurability: 3 } as any;
  }
  function makeAmulet(id: string): GameCardData {
    return { id, type: 'amulet', name: 'Charm', value: 0, amuletEffect: 'none' } as any;
  }
  function makeMonster(id: string): GameCardData {
    return { id, type: 'monster', name: 'Goblin', value: 2, hp: 4, maxHp: 4, attack: 1 } as any;
  }
  function makeInstantMagic(id: string): GameCardData {
    return { id, type: 'magic', name: 'Bolt', value: 0, magicType: 'instant' } as any;
  }
  function makePotion(id: string): GameCardData {
    return { id, type: 'potion', name: 'Healing Potion', value: 0 } as any;
  }

  // -------------------------------------------------------------------------
  // L0: damage +1 / shield +1
  // -------------------------------------------------------------------------

  it('L0 / instant magic → 左栏攻击 +1', () => {
    const target = makeInstantMagic('target-im');
    const state = makeState({
      handCards: [makeEeCard(0), target] as any,
      phase: 'playerInput',
    });
    const next = castAndPick(state, 'target-im');
    expect(next.equipmentSlotBonuses?.equipmentSlot1?.damage ?? 0).toBe(1);
    expect(next.equipmentSlotBonuses?.equipmentSlot1?.shield ?? 0).toBe(0);
  });

  it('L0 / weapon → 右栏攻击 +1', () => {
    const target = makeWeapon('target-w');
    const state = makeState({
      handCards: [makeEeCard(0), target] as any,
      phase: 'playerInput',
    });
    const next = castAndPick(state, 'target-w');
    expect(next.equipmentSlotBonuses?.equipmentSlot2?.damage ?? 0).toBe(1);
  });

  it('L0 / amulet → 右栏护甲 +1', () => {
    const target = makeAmulet('target-a');
    const state = makeState({
      handCards: [makeEeCard(0), target] as any,
      phase: 'playerInput',
    });
    const next = castAndPick(state, 'target-a');
    expect(next.equipmentSlotBonuses?.equipmentSlot2?.shield ?? 0).toBe(1);
  });

  it('L0 / monster → 左栏护甲 +1', () => {
    const target = makeMonster('target-m');
    const state = makeState({
      handCards: [makeEeCard(0), target] as any,
      phase: 'playerInput',
    });
    const next = castAndPick(state, 'target-m');
    expect(next.equipmentSlotBonuses?.equipmentSlot1?.shield ?? 0).toBe(1);
  });

  it('L0 / potion → 左栏护甲 +1', () => {
    const target = makePotion('target-p');
    const state = makeState({
      handCards: [makeEeCard(0), target] as any,
      phase: 'playerInput',
    });
    const next = castAndPick(state, 'target-p');
    expect(next.equipmentSlotBonuses?.equipmentSlot1?.shield ?? 0).toBe(1);
  });

  // -------------------------------------------------------------------------
  // L1: damage +1 (unchanged) / shield +2
  // -------------------------------------------------------------------------

  it('L1 / instant magic → 左栏攻击 +1（攻击路径不随 L0→L1 浮动）', () => {
    const target = makeInstantMagic('target-im-l1');
    const state = makeState({
      handCards: [makeEeCard(1), target] as any,
      phase: 'playerInput',
    });
    const next = castAndPick(state, 'target-im-l1');
    expect(next.equipmentSlotBonuses?.equipmentSlot1?.damage ?? 0).toBe(1);
  });

  it('L1 / weapon → 右栏攻击 +1（不变）', () => {
    const target = makeWeapon('target-w-l1');
    const state = makeState({
      handCards: [makeEeCard(1), target] as any,
      phase: 'playerInput',
    });
    const next = castAndPick(state, 'target-w-l1');
    expect(next.equipmentSlotBonuses?.equipmentSlot2?.damage ?? 0).toBe(1);
  });

  it('L1 / amulet → 右栏护甲 +2', () => {
    const target = makeAmulet('target-a-l1');
    const state = makeState({
      handCards: [makeEeCard(1), target] as any,
      phase: 'playerInput',
    });
    const next = castAndPick(state, 'target-a-l1');
    expect(next.equipmentSlotBonuses?.equipmentSlot2?.shield ?? 0).toBe(2);
  });

  it('L1 / monster → 左栏护甲 +2', () => {
    const target = makeMonster('target-m-l1');
    const state = makeState({
      handCards: [makeEeCard(1), target] as any,
      phase: 'playerInput',
    });
    const next = castAndPick(state, 'target-m-l1');
    expect(next.equipmentSlotBonuses?.equipmentSlot1?.shield ?? 0).toBe(2);
  });

  it('L1 / potion → 左栏护甲 +2', () => {
    const target = makePotion('target-p-l1');
    const state = makeState({
      handCards: [makeEeCard(1), target] as any,
      phase: 'playerInput',
    });
    const next = castAndPick(state, 'target-p-l1');
    expect(next.equipmentSlotBonuses?.equipmentSlot1?.shield ?? 0).toBe(2);
  });

  // -------------------------------------------------------------------------
  // L2: damage +2 / shield +2
  // -------------------------------------------------------------------------

  it('L2 / instant magic → 左栏攻击 +2', () => {
    const target = makeInstantMagic('target-im-l2');
    const state = makeState({
      handCards: [makeEeCard(2), target] as any,
      phase: 'playerInput',
    });
    const next = castAndPick(state, 'target-im-l2');
    expect(next.equipmentSlotBonuses?.equipmentSlot1?.damage ?? 0).toBe(2);
  });

  it('L2 / weapon → 右栏攻击 +2', () => {
    const target = makeWeapon('target-w-l2');
    const state = makeState({
      handCards: [makeEeCard(2), target] as any,
      phase: 'playerInput',
    });
    const next = castAndPick(state, 'target-w-l2');
    expect(next.equipmentSlotBonuses?.equipmentSlot2?.damage ?? 0).toBe(2);
  });

  it('L2 / amulet → 右栏护甲 +2 (与 L1 相同)', () => {
    const target = makeAmulet('target-a-l2');
    const state = makeState({
      handCards: [makeEeCard(2), target] as any,
      phase: 'playerInput',
    });
    const next = castAndPick(state, 'target-a-l2');
    expect(next.equipmentSlotBonuses?.equipmentSlot2?.shield ?? 0).toBe(2);
  });

  it('L2 / monster → 左栏护甲 +2', () => {
    const target = makeMonster('target-m-l2');
    const state = makeState({
      handCards: [makeEeCard(2), target] as any,
      phase: 'playerInput',
    });
    const next = castAndPick(state, 'target-m-l2');
    expect(next.equipmentSlotBonuses?.equipmentSlot1?.shield ?? 0).toBe(2);
  });

  // -------------------------------------------------------------------------
  // 不变的行为：force-grave 不受升级影响
  // -------------------------------------------------------------------------

  it('L2 / 目标仍然进坟场，不进回收袋（force-grave 语义不变）', () => {
    const target = makeWeapon('target-perm-l2');
    (target as any).recycleDelay = 2;
    const state = makeState({
      handCards: [makeEeCard(2), target] as any,
      phase: 'playerInput',
      discardedCards: [],
      permanentMagicRecycleBag: [],
    });
    const next = castAndPick(state, 'target-perm-l2');
    expect(next.discardedCards.find(c => c.id === 'target-perm-l2')).toBeDefined();
    expect(next.permanentMagicRecycleBag.find(c => c.id === 'target-perm-l2')).toBeUndefined();
  });
});

// ===========================================================================
// Static validation: knightDeck definitions
// ===========================================================================

describe('knightDeck definitions reflect upgrade paths', () => {
  it('锋芒倍增 has maxUpgradeLevel: 1 and knightEffect: temp-attack-double', async () => {
    const { generateKnightDeck } = await import('@/lib/knightDeck');
    const { createRng } = await import('@/game-core/rng');
    const [deck] = generateKnightDeck(createRng(1));
    const card = deck.find(c => c.name === '锋芒倍增');
    expect(card).toBeDefined();
    expect((card as any).knightEffect).toBe('temp-attack-double');
    expect((card as any).maxUpgradeLevel).toBe(1);
  });

  it('淬铸迁位 has maxUpgradeLevel: 1 and knightEffect: amplify-equipment-shift', async () => {
    const { generateKnightDeck } = await import('@/lib/knightDeck');
    const { createRng } = await import('@/game-core/rng');
    const [deck] = generateKnightDeck(createRng(1));
    const card = deck.find(c => c.name === '淬铸迁位');
    expect(card).toBeDefined();
    expect((card as any).knightEffect).toBe('amplify-equipment-shift');
    expect((card as any).maxUpgradeLevel).toBe(1);
  });

  it('精华萃取 has maxUpgradeLevel: 2 and knightEffect: essence-extract', async () => {
    const { generateKnightDeck } = await import('@/lib/knightDeck');
    const { createRng } = await import('@/game-core/rng');
    const [deck] = generateKnightDeck(createRng(1));
    const card = deck.find(c => c.name === '精华萃取');
    expect(card).toBeDefined();
    expect((card as any).knightEffect).toBe('essence-extract');
    expect((card as any).maxUpgradeLevel).toBe(2);
  });
});
