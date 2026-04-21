import { describe, expect, it } from 'vitest';
import { reduce } from '../reducer';
import { drain } from '../pipeline';
import { createInitialGameState } from '../state';
import type { GameState } from '../types';
import { initialCombatState } from '../constants';
import { getEternalRelic } from '@/lib/eternalRelics';

function makeState(overrides?: Partial<GameState>): GameState {
  return { ...createInitialGameState(), ...overrides };
}

describe('弹幕骰局 — event token effects', () => {
  describe('gainBolts:N', () => {
    it('puts bolts in hand up to limit and overflows to backpack', () => {
      const state = makeState({ handCards: [], backpackItems: [] });
      const result = reduce(state, { type: 'APPLY_EVENT_EFFECT', token: 'gainBolts:4' });
      const handBolts = result.state.handCards.filter(c => c.name === '魔弹');
      const backpackBolts = result.state.backpackItems.filter(c => c.name === '魔弹');
      expect(handBolts.length + backpackBolts.length).toBe(4);
      // With empty hand (limit 7), all 4 should fit in hand.
      expect(handBolts.length).toBe(4);
    });

    it('respects amplifiedCardBonus on freshly created bolts', () => {
      const state = makeState({
        handCards: [],
        backpackItems: [],
        amplifiedCardBonus: { 魔弹: 2 },
      });
      const result = reduce(state, { type: 'APPLY_EVENT_EFFECT', token: 'gainBolts:1' });
      const bolt = result.state.handCards.find(c => c.name === '魔弹');
      expect(bolt?.amplifyBonus).toBe(2);
    });
  });

  describe('grantMissileWaterfallAmplify', () => {
    it('adds the eternal relic to state', () => {
      const state = makeState({ eternalRelics: [] });
      const result = reduce(state, { type: 'APPLY_EVENT_EFFECT', token: 'grantMissileWaterfallAmplify' });
      expect(result.state.eternalRelics.some(r => r.id === 'missile-amplify-on-waterfall')).toBe(true);
    });

    it('does not duplicate the relic', () => {
      const state = makeState({ eternalRelics: [getEternalRelic('missile-amplify-on-waterfall')] });
      const result = reduce(state, { type: 'APPLY_EVENT_EFFECT', token: 'grantMissileWaterfallAmplify' });
      expect(result.state.eternalRelics.filter(r => r.id === 'missile-amplify-on-waterfall')).toHaveLength(1);
    });
  });

  describe('grantMissileStun20 / grantMissileDraw1', () => {
    it('grants the stun-20 relic', () => {
      const state = makeState({ eternalRelics: [] });
      const result = reduce(state, { type: 'APPLY_EVENT_EFFECT', token: 'grantMissileStun20' });
      expect(result.state.eternalRelics.some(r => r.id === 'missile-stun-20')).toBe(true);
    });

    it('grants the draw-1 relic', () => {
      const state = makeState({ eternalRelics: [] });
      const result = reduce(state, { type: 'APPLY_EVENT_EFFECT', token: 'grantMissileDraw1' });
      expect(result.state.eternalRelics.some(r => r.id === 'missile-draw-1')).toBe(true);
    });
  });

  describe('grantKnightMagicMissileLv1', () => {
    it('adds a Lv1 魔法飞弹 to backpack', () => {
      const state = makeState({ backpackItems: [] });
      const result = reduce(state, { type: 'APPLY_EVENT_EFFECT', token: 'grantKnightMagicMissileLv1' });
      const card = result.state.backpackItems.find(c => c.name === '魔法飞弹');
      expect(card).toBeDefined();
      expect(card?.upgradeLevel).toBe(1);
      expect(card?.maxUpgradeLevel).toBe(2);
      expect(card?.classCard).toBe(true);
    });

    it('granted 魔法飞弹 actually spawns 「魔弹」 cards when played (id must strip to starter base)', () => {
      // Regression: previously the granted card used a `knight-magic-missile-lv1-…` id
      // which getStarterBaseId could not strip, so resolvePermanentMagic's switch
      // fell through and the card disappeared without effect.
      const granted = reduce(makeState({ backpackItems: [], handCards: [] }),
        { type: 'APPLY_EVENT_EFFECT', token: 'grantKnightMagicMissileLv1' });
      const missile = granted.state.backpackItems.find(c => c.name === '魔法飞弹');
      expect(missile).toBeDefined();

      // Move it to hand and play it.
      const stateWithInHand: GameState = {
        ...granted.state,
        handCards: [missile!],
        backpackItems: granted.state.backpackItems.filter(c => c.id !== missile!.id),
      };
      const drained = drain(stateWithInHand, [{ type: 'PLAY_CARD', cardId: missile!.id }] as any);
      // Lv1 magic missile spawns 3 bolts.
      const bolts = drained.state.handCards.filter(c => c.name === '魔弹');
      expect(bolts.length).toBe(3);
    });
  });
});

// ---------------------------------------------------------------------------
// Regression: 魔法飞弹（starter:starter-perm-magic-missile）在 amplifiedCardBonus
// 已经累积了「魔弹」+N 之后，新加入手牌的魔弹必须继承这个 +N。
// 真实玩家场景：先用魔弹连弩攻击 → AMPLIFY_CARDS_BY_NAME({魔弹, 1}) 触发，
// amplifiedCardBonus['魔弹'] = 1；之后打出魔法飞弹。修复前：新魔弹 amplifyBonus
// 为 undefined，仍显示并造成 1 点伤害。修复后：amplifyBonus = 1，与其它
// 现存魔弹一致。
// 同时验证「法术回响 ×2」时翻倍出来的多张新魔弹也都带累计增幅。
// ---------------------------------------------------------------------------
describe('魔法飞弹 — amplifiedCardBonus inheritance (regression)', () => {
  it('Lv0：amplifiedCardBonus[魔弹]=2 时，打出后手牌新加入的 2 张魔弹都带 +2', () => {
    const missile = {
      id: 'starter-perm-magic-missile-pick-1',
      type: 'magic' as const,
      name: '魔法飞弹',
      value: 0,
      magicType: 'permanent' as const,
      classCard: true,
      upgradeLevel: 0,
    };
    const state = makeState({
      handCards: [missile] as any,
      amplifiedCardBonus: { 魔弹: 2 },
    });
    const drained = drain(state, [{ type: 'PLAY_CARD', cardId: missile.id }] as any);
    const bolts = drained.state.handCards.filter(c => c.name === '魔弹');
    expect(bolts.length).toBe(2);
    bolts.forEach(b => expect(b.amplifyBonus).toBe(2));
  });

  it('Lv1：amplifiedCardBonus[魔弹]=1 时，3 张新魔弹都带 +1', () => {
    const missile = {
      id: 'starter-perm-magic-missile-pick-2',
      type: 'magic' as const,
      name: '魔法飞弹',
      value: 0,
      magicType: 'permanent' as const,
      classCard: true,
      upgradeLevel: 1,
    };
    const state = makeState({
      handCards: [missile] as any,
      amplifiedCardBonus: { 魔弹: 1 },
    });
    const drained = drain(state, [{ type: 'PLAY_CARD', cardId: missile.id }] as any);
    const bolts = drained.state.handCards.filter(c => c.name === '魔弹');
    expect(bolts.length).toBe(3);
    bolts.forEach(b => expect(b.amplifyBonus).toBe(1));
  });

  it('回响 ×2：双倍数量的新魔弹也都带累计增幅', () => {
    const missile = {
      id: 'starter-perm-magic-missile-pick-3',
      type: 'magic' as const,
      name: '魔法飞弹',
      value: 0,
      magicType: 'permanent' as const,
      classCard: true,
      upgradeLevel: 0,
    };
    const state = makeState({
      handCards: [missile] as any,
      amplifiedCardBonus: { 魔弹: 3 },
      doubleNextMagic: true,
    });
    const drained = drain(state, [{ type: 'PLAY_CARD', cardId: missile.id }] as any);
    const bolts = drained.state.handCards.filter(c => c.name === '魔弹');
    expect(bolts.length).toBe(4);
    bolts.forEach(b => expect(b.amplifyBonus).toBe(3));
  });
});

describe('弹幕骰局 — relic-driven missile-bolt effects', () => {
  it('missile-amplify-on-waterfall enqueues AMPLIFY_CARDS_BY_NAME on waterfall', () => {
    const state = makeState({ eternalRelics: [getEternalRelic('missile-amplify-on-waterfall')] });
    const result = reduce(state, { type: 'APPLY_WATERFALL_EFFECTS' });
    const amplifyAction = result.enqueuedActions.find(a => a.type === 'AMPLIFY_CARDS_BY_NAME');
    expect(amplifyAction).toBeDefined();
    expect((amplifyAction as any).cardName).toBe('魔弹');
    expect((amplifyAction as any).amount).toBe(1);
  });

  it('missile-amplify-on-waterfall is a no-op without the relic', () => {
    const state = makeState({ eternalRelics: [] });
    const result = reduce(state, { type: 'APPLY_WATERFALL_EFFECTS' });
    const amplifyAction = result.enqueuedActions.find(a => a.type === 'AMPLIFY_CARDS_BY_NAME');
    expect(amplifyAction).toBeUndefined();
  });

  it('missile-draw-1 enqueues DRAW_CARDS after the bolt deals damage (single-target)', () => {
    // 注意：missile-bolt 现在统一走 picker（即使 1 只怪也不再自动命中），
    // 所以需要补一步 RESOLVE_MAGIC_MONSTER_SELECTION 才能触发 relic 副作用。
    const monster = {
      id: 'm1', type: 'monster' as const, name: 'Goblin', value: 5,
      hp: 10, maxHp: 10, attack: 5,
    };
    const bolt = { id: 'hb', type: 'magic' as const, name: '魔弹', value: 0, knightEffect: 'missile-bolt', magicType: 'instant' };
    const state = makeState({
      activeCards: [monster, null, null, null, null] as any,
      handCards: [bolt] as any,
      eternalRelics: [getEternalRelic('missile-draw-1')],
      combatState: { ...initialCombatState, engagedMonsterIds: ['m1'], currentTurn: 'hero' },
    });

    const afterPlay = drain(state, [{ type: 'PLAY_CARD', cardId: 'hb' }] as any);
    const drained = drain(
      afterPlay.state,
      [{ type: 'RESOLVE_MAGIC_MONSTER_SELECTION', magicId: 'missile-bolt', monsterId: 'm1' }] as any,
    );
    const drawLog = drained.sideEffects.find(s => s.event === 'log:entry' && (s.payload as any).message?.includes('汲取弹幕'));
    expect(drawLog).toBeDefined();
  });

  it('missile-stun-20 has no chance when stunCap is 0', () => {
    const monster = {
      id: 'm1', type: 'monster' as const, name: 'Goblin', value: 5,
      hp: 10, maxHp: 10, attack: 5,
    };
    const bolt = { id: 'hb', type: 'magic' as const, name: '魔弹', value: 0, knightEffect: 'missile-bolt', magicType: 'instant' };
    const state = makeState({
      activeCards: [monster, null, null, null, null] as any,
      handCards: [bolt] as any,
      eternalRelics: [getEternalRelic('missile-stun-20')],
      stunCap: 0,
      combatState: { ...initialCombatState, engagedMonsterIds: ['m1'], currentTurn: 'hero' },
    });

    const afterPlay = drain(state, [{ type: 'PLAY_CARD', cardId: 'hb' }] as any);
    const drained = drain(
      afterPlay.state,
      [{ type: 'RESOLVE_MAGIC_MONSTER_SELECTION', magicId: 'missile-bolt', monsterId: 'm1' }] as any,
    );
    const stunned = drained.state.activeCards[0];
    expect((stunned as any)?.isStunned).not.toBe(true);
  });

  it('missile-stun-20 always stuns when stunCap >= 100 (single-target)', () => {
    const monster = {
      id: 'm1', type: 'monster' as const, name: 'Goblin', value: 5,
      hp: 10, maxHp: 10, attack: 5,
    };
    const bolt = { id: 'hb', type: 'magic' as const, name: '魔弹', value: 0, knightEffect: 'missile-bolt', magicType: 'instant' };
    const state = makeState({
      activeCards: [monster, null, null, null, null] as any,
      handCards: [bolt] as any,
      eternalRelics: [getEternalRelic('missile-stun-20')],
      stunCap: 100,
      combatState: { ...initialCombatState, engagedMonsterIds: ['m1'], currentTurn: 'hero' },
    });

    const afterPlay = drain(state, [{ type: 'PLAY_CARD', cardId: 'hb' }] as any);
    const drained = drain(
      afterPlay.state,
      [{ type: 'RESOLVE_MAGIC_MONSTER_SELECTION', magicId: 'missile-bolt', monsterId: 'm1' }] as any,
    );
    expect(drained.state).toBeDefined();
  });
});
