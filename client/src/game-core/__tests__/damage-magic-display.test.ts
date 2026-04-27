/**
 * computeDamageMagicDisplayPure — 伤害 magic 卡 UI 动态展示的 pure 测试。
 *
 * 覆盖：
 *   - Group B 固定 base + amp（魔弹 / 风暴箭雨 / 混沌冲击 / overkill-upgrade /
 *     bounty-spell-damage / 雷震击 / storm-volley-recycle / grave-nova）
 *   - Group C 状态相关 base + amp（点金裁决 / missing-hp-smite）
 *   - Group D 保留原描述、仅追加 (+N)（armor-strike / temp-attack-strike /
 *     weapon-sweep / blood-sacrifice-strike）→ suffix 模式
 *   - amp = 0 时仍返回正确 base 文案（调用方负责跳过 (+N) 渲染）
 *   - 非 magic 卡 / 非伤害 magic 卡 → null
 */
import { describe, expect, it } from 'vitest';
import { computeDamageMagicDisplayPure } from '../helpers';
import type { DamageMagicDisplayState } from '../helpers';
import type { GameCardData } from '@/components/GameCard';

const STATE: DamageMagicDisplayState = { hp: 20, maxHp: 30, gold: 7 };

function magic(overrides: Partial<GameCardData>): GameCardData {
  return {
    id: 'c1',
    type: 'magic',
    name: 'X',
    value: 0,
    ...overrides,
  } as GameCardData;
}

describe('computeDamageMagicDisplayPure — Group B (固定 base + amp)', () => {
  it('魔弹 (missile-bolt): base 1, amp 0 → "造成 1 点法术伤害"', () => {
    const r = computeDamageMagicDisplayPure(magic({ knightEffect: 'missile-bolt', name: '魔弹' }), STATE);
    expect(r).toEqual({ mode: 'replace', text: '选择一个怪物，造成 1 点法术伤害。', amplifyBonus: 0 });
  });

  it('魔弹 (missile-bolt): base 1, amp 2 → "造成 3 点法术伤害"', () => {
    const r = computeDamageMagicDisplayPure(magic({ knightEffect: 'missile-bolt', name: '魔弹', amplifyBonus: 2 }), STATE);
    expect(r?.mode).toBe('replace');
    if (r?.mode === 'replace') {
      expect(r.text).toBe('选择一个怪物，造成 3 点法术伤害。');
      expect(r.amplifyBonus).toBe(2);
    }
  });

  it('风暴箭雨: base 3, amp 4 → 7', () => {
    const r = computeDamageMagicDisplayPure(magic({ name: '风暴箭雨', amplifyBonus: 4 }), STATE);
    expect(r?.mode).toBe('replace');
    if (r?.mode === 'replace') {
      expect(r.text).toContain('造成 7 点伤害');
      expect(r.amplifyBonus).toBe(4);
    }
  });

  it('混沌冲击: base 3, amp 0 → 3', () => {
    const r = computeDamageMagicDisplayPure(magic({ name: '混沌冲击' }), STATE);
    expect(r?.mode).toBe('replace');
    if (r?.mode === 'replace') {
      expect(r.text).toContain('造成 3 点伤害');
      expect(r.text).toContain('超杀：抽 2 张牌');
    }
  });

  it('overkill-upgrade: base 3 + amp 1 → 4', () => {
    const r = computeDamageMagicDisplayPure(magic({ knightEffect: 'overkill-upgrade', amplifyBonus: 1 }), STATE);
    expect(r?.mode).toBe('replace');
    if (r?.mode === 'replace') {
      expect(r.text).toContain('造成 4 点伤害');
      expect(r.text).toContain('超杀：升级一张牌');
    }
  });

  it('grave-nova: base 3 + amp 2 → 5', () => {
    const r = computeDamageMagicDisplayPure(magic({ knightEffect: 'grave-nova', amplifyBonus: 2 }), STATE);
    expect(r?.mode).toBe('replace');
    if (r?.mode === 'replace') {
      expect(r.text).toContain('当前行所有怪物造成 5 点伤害');
    }
  });

  it('bounty-spell-damage (赏金裁决): base 5 + amp 3 → 8', () => {
    const r = computeDamageMagicDisplayPure(magic({ name: '赏金裁决', magicEffect: 'bounty-spell-damage', amplifyBonus: 3 }), STATE);
    expect(r?.mode).toBe('replace');
    if (r?.mode === 'replace') {
      expect(r.text).toContain('造成 8 点法术伤害');
    }
  });

  it('雷震击 lvl 0: per-hit 1, amp 2 → "造成 3 点法术伤害 2 次，每次有 20% 概率击晕"', () => {
    const r = computeDamageMagicDisplayPure(magic({ name: '雷震击', amplifyBonus: 2 }), STATE);
    expect(r?.mode).toBe('replace');
    if (r?.mode === 'replace') {
      expect(r.text).toBe('对一个怪物造成 3 点法术伤害 2 次，每次有 20% 概率击晕目标。');
    }
  });

  it('雷震击 lvl 2: per-hit 3, amp 0 → 3', () => {
    const r = computeDamageMagicDisplayPure(magic({ name: '雷震击', upgradeLevel: 2 }), STATE);
    expect(r?.mode).toBe('replace');
    if (r?.mode === 'replace') {
      expect(r.text).toContain('造成 3 点法术伤害 2 次');
      expect(r.text).toContain('60% 概率击晕');
    }
  });

  it('storm-volley-recycle (箭雨余韵): base 1 + amp 1 → 2', () => {
    const r = computeDamageMagicDisplayPure(magic({ name: '箭雨余韵', magicEffect: 'storm-volley-recycle', amplifyBonus: 1 }), STATE);
    expect(r?.mode).toBe('replace');
    if (r?.mode === 'replace') {
      expect(r.text).toContain('造成 2 点伤害');
    }
  });

  it('fate-sight: 不再属于伤害 magic（劝降率加成卡，不在 display）', () => {
    const r = computeDamageMagicDisplayPure(magic({ knightEffect: 'fate-sight', amplifyBonus: 1 }), STATE);
    expect(r).toBeNull();
  });
});

describe('computeDamageMagicDisplayPure — Group C (状态相关 base + amp)', () => {
  it('点金裁决 (blood-reckoning): base = state.gold (7) + amp 3 → 10', () => {
    const r = computeDamageMagicDisplayPure(magic({ name: '点金裁决', amplifyBonus: 3 }), STATE);
    expect(r?.mode).toBe('replace');
    if (r?.mode === 'replace') {
      expect(r.text).toContain('造成 10 点伤害');
      expect(r.text).toContain('恢复等量生命');
    }
  });

  it('missing-hp-smite lvl 0 (50%): missing 10 HP → base 5 + amp 1 → 6', () => {
    const r = computeDamageMagicDisplayPure(magic({ knightEffect: 'missing-hp-smite', amplifyBonus: 1 }), STATE);
    expect(r?.mode).toBe('replace');
    if (r?.mode === 'replace') {
      expect(r.text).toContain('造成 6 点伤害');
      expect(r.text).toContain('已损失生命 50%');
    }
  });

  it('missing-hp-smite lvl 1 (75%): missing 10 HP → base 7 + amp 0 → 7', () => {
    const r = computeDamageMagicDisplayPure(magic({ knightEffect: 'missing-hp-smite', upgradeLevel: 1 }), STATE);
    expect(r?.mode).toBe('replace');
    if (r?.mode === 'replace') {
      expect(r.text).toContain('造成 7 点伤害');
      expect(r.text).toContain('已损失生命 75%');
    }
  });

  it('missing-hp-smite lvl 2 (100%): missing 10 HP → base 10 + amp 0 → 10', () => {
    const r = computeDamageMagicDisplayPure(magic({ knightEffect: 'missing-hp-smite', upgradeLevel: 2 }), STATE);
    expect(r?.mode).toBe('replace');
    if (r?.mode === 'replace') {
      expect(r.text).toContain('造成 10 点伤害');
      expect(r.text).toContain('已损失生命 100%');
    }
  });

  it('missing-hp-smite: 满血时 base = 0', () => {
    const fullHp: DamageMagicDisplayState = { ...STATE, hp: 30 };
    const r = computeDamageMagicDisplayPure(magic({ knightEffect: 'missing-hp-smite' }), fullHp);
    if (r?.mode === 'replace') expect(r.text).toContain('造成 0 点伤害');
  });

});

describe('computeDamageMagicDisplayPure — Group D (保留原描述 → suffix-only)', () => {
  it('armor-strike: 返回 suffix 模式', () => {
    const r = computeDamageMagicDisplayPure(magic({ knightEffect: 'armor-strike', amplifyBonus: 4 }), STATE);
    expect(r).toEqual({ mode: 'suffix', amplifyBonus: 4 });
  });

  it('temp-attack-strike: amp 0 → suffix 模式 (调用方应跳过 (+N))', () => {
    const r = computeDamageMagicDisplayPure(magic({ knightEffect: 'temp-attack-strike' }), STATE);
    expect(r).toEqual({ mode: 'suffix', amplifyBonus: 0 });
  });

  it('weapon-sweep: amp 2 → suffix 模式', () => {
    const r = computeDamageMagicDisplayPure(magic({ knightEffect: 'weapon-sweep', amplifyBonus: 2 }), STATE);
    expect(r).toEqual({ mode: 'suffix', amplifyBonus: 2 });
  });

  it('blood-sacrifice-strike: amp 2 → suffix 模式（保留 shortDescription，不再动态替换）', () => {
    const r = computeDamageMagicDisplayPure(magic({ knightEffect: 'blood-sacrifice-strike', amplifyBonus: 2 }), { hp: 21, maxHp: 30, gold: 0 });
    expect(r).toEqual({ mode: 'suffix', amplifyBonus: 2 });
  });

  it('blood-sacrifice-strike: amp 0 → suffix 模式 (调用方应跳过 (+N))', () => {
    const r = computeDamageMagicDisplayPure(magic({ knightEffect: 'blood-sacrifice-strike' }), STATE);
    expect(r).toEqual({ mode: 'suffix', amplifyBonus: 0 });
  });
});

describe('computeDamageMagicDisplayPure — null cases', () => {
  it('非 magic 卡（武器）→ null', () => {
    const r = computeDamageMagicDisplayPure({ id: 'w', type: 'weapon', name: 'Sword', value: 3 } as GameCardData, STATE);
    expect(r).toBeNull();
  });

  it('非伤害 magic 卡（普通治疗等）→ null', () => {
    const r = computeDamageMagicDisplayPure(magic({ name: '治疗术', magicEffect: 'heal' }), STATE);
    expect(r).toBeNull();
  });

  it('hero-magic 不参与（已有专门渲染分支）→ null', () => {
    const r = computeDamageMagicDisplayPure({ id: 'hm', type: 'hero-magic', name: 'X', value: 0 } as GameCardData, STATE);
    expect(r).toBeNull();
  });
});
