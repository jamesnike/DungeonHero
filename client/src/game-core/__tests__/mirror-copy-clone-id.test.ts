/**
 * 镜影摹形 (mirror-copy) — 复制 starter-routed 卡的 clone id 必须能 strip 回 starter base id
 *
 * Regression：旧实现用 `nextId(rng, 'mirror')` 给克隆卡分配 id，结果是 `mirror-{base36}`，
 * 这个 id 不匹配 `getStarterBaseId` 的任何 strip 后缀（`-pick-N` / `-evt-N` / `-disc-N`），
 * 所以 starter-routed 卡（如 魔法飞弹 / 战斗鼓舞 / 铸甲术 / 雷震击 / ...）的复制版被打出时，
 * `resolveEffectId` 返回 `starter:mirror-{base36}` 没有匹配的 registered handler，
 * 也没有 `magicEffect` / `knightEffect` 兜底，**legacy fallback 的 `getStarterBaseId(id)` switch
 * 也不会匹配**，最终卡被消耗但效果完全不发生。
 *
 * 修复：改用 `cloneClassCardWithFreshId`（`cardClone.ts`）—— 它生成
 * `${baseId}-pick-1-{base36}` 形式的 id，能正确 strip 回原 starter base id。
 *
 * 这条测试覆盖端到端流程：mirror-copy → clone 进 handCards → PLAY_CARD 克隆 → 验证效果。
 *
 * 相关规则：
 * - `.cursor/rules/event-grant-card-id-suffix.mdc`（id 后缀必须能 strip）
 * - `client/src/game-core/cardClone.ts`（cloneClassCardWithFreshId 文档注释）
 */
import { describe, expect, it } from 'vitest';
import { drain } from '../pipeline';
import { reduce } from '../reducer';
import { createInitialGameState } from '../state';
import type { GameState } from '../types';
import type { GameCardData } from '@/components/GameCard';
import { STARTER_CARD_IDS, getStarterBaseId } from '../deck';

function makeState(overrides?: Partial<GameState>): GameState {
  return { ...createInitialGameState(), phase: 'playerInput', ...overrides };
}

function makeMirrorCopyCard(id = 'mirror-copy-1'): GameCardData {
  return {
    id,
    type: 'magic',
    name: '镜影摹形',
    value: 0,
    image: '',
    magicType: 'instant',
    classCard: true,
    knightEffect: 'mirror-copy',
  } as GameCardData;
}

function makeMagicMissile(id = 'starter-perm-magic-missile-pick-1'): GameCardData {
  return {
    id,
    type: 'magic',
    name: '魔法飞弹',
    value: 0,
    image: '',
    magicType: 'permanent',
    classCard: true,
    upgradeLevel: 0,
    maxUpgradeLevel: 2,
  } as GameCardData;
}

function makeWeaponBurst(id = 'starter-perm-weapon-burst-pick-1'): GameCardData {
  return {
    id,
    type: 'magic',
    name: '战斗鼓舞',
    value: 0,
    image: '',
    magicType: 'permanent',
    classCard: true,
    upgradeLevel: 0,
  } as GameCardData;
}

describe('mirror-copy: cloned starter-routed magic must remain playable', () => {
  it('clone of 魔法飞弹 strips back to STARTER_CARD_IDS.magicMissile', () => {
    const missile = makeMagicMissile();
    const mirrorCard = makeMirrorCopyCard();
    const state = makeState({
      handCards: [missile],
      pendingMagicAction: { card: mirrorCard, effect: 'mirror-copy', step: 'modal-select' } as any,
      mirrorCopyModal: { sourceCardId: mirrorCard.id },
    });

    const result = reduce(state, {
      type: 'RESOLVE_MIRROR_COPY',
      selection: { kind: 'hand', cardId: missile.id },
    });

    const clones = result.state.handCards.filter(c => c.name === '魔法飞弹' && c.id !== missile.id);
    expect(clones.length).toBe(1);
    const clone = clones[0]!;
    expect(getStarterBaseId(clone.id)).toBe(STARTER_CARD_IDS.magicMissile);
    expect((clone as any)._skipOnEnterHand).toBe(true);
  });

  it('clone of 魔法飞弹 actually spawns 2 bolts when played (Lv0)', () => {
    const missile = makeMagicMissile();
    const mirrorCard = makeMirrorCopyCard();
    const state = makeState({
      handCards: [missile],
      pendingMagicAction: { card: mirrorCard, effect: 'mirror-copy', step: 'modal-select' } as any,
      mirrorCopyModal: { sourceCardId: mirrorCard.id },
    });

    // RESOLVE_MIRROR_COPY is dispatched top-level by the hook in the real game
    // (engine.dispatch → _processAction → reduce() bypasses the
    // isInputContinuation gate for top-level actions), so we use `reduce`
    // directly then `drain` the play of the clone — which is what the user
    // actually does after the modal closes.
    const afterClone = reduce(state, {
      type: 'RESOLVE_MIRROR_COPY',
      selection: { kind: 'hand', cardId: missile.id },
    });

    const cloneCard = afterClone.state.handCards.find(
      c => c.name === '魔法飞弹' && c.id !== missile.id,
    );
    expect(cloneCard).toBeDefined();

    // The bug pre-fix: clone id was `mirror-{base36}`, getStarterBaseId did not
    // strip it back to `starter-perm-magic-missile`, so resolveEffectId returned
    // an unregistered `starter:mirror-{base36}`, the schema engine returned null,
    // legacy `resolveAllMagicEffects` fell through the starter-id switch, and
    // the card silently no-op'd → 0 bolts spawned.
    const afterPlay = drain(afterClone.state, [
      { type: 'PLAY_CARD', cardId: cloneCard!.id } as any,
    ]);

    const bolts = afterPlay.state.handCards.filter(c => c.name === '魔弹');
    expect(bolts.length).toBe(2);
  });

  it('clone of 战斗鼓舞 strips back to STARTER_CARD_IDS.weaponBurst (also fully starter-id routed)', () => {
    const burst = makeWeaponBurst();
    const mirrorCard = makeMirrorCopyCard();
    const state = makeState({
      handCards: [burst],
      pendingMagicAction: { card: mirrorCard, effect: 'mirror-copy', step: 'modal-select' } as any,
      mirrorCopyModal: { sourceCardId: mirrorCard.id },
    });

    const result = reduce(state, {
      type: 'RESOLVE_MIRROR_COPY',
      selection: { kind: 'hand', cardId: burst.id },
    });

    const clone = result.state.handCards.find(
      c => c.name === '战斗鼓舞' && c.id !== burst.id,
    );
    expect(clone).toBeDefined();
    expect(getStarterBaseId(clone!.id)).toBe(STARTER_CARD_IDS.weaponBurst);
  });

  it('clone preserves card identity fields (name / type / upgradeLevel) and drops fromSlot', () => {
    const missile = { ...makeMagicMissile(), upgradeLevel: 1, fromSlot: 'equipmentSlot1' };
    const mirrorCard = makeMirrorCopyCard();
    const state = makeState({
      handCards: [missile as any],
      pendingMagicAction: { card: mirrorCard, effect: 'mirror-copy', step: 'modal-select' } as any,
      mirrorCopyModal: { sourceCardId: mirrorCard.id },
    });

    const result = reduce(state, {
      type: 'RESOLVE_MIRROR_COPY',
      selection: { kind: 'hand', cardId: missile.id },
    });

    const clone = result.state.handCards.find(
      c => c.name === '魔法飞弹' && c.id !== missile.id,
    ) as any;
    expect(clone).toBeDefined();
    expect(clone.type).toBe('magic');
    expect(clone.upgradeLevel).toBe(1);
    // `fromSlot` should be stripped via `sanitizeCardMetadata` to avoid stale slot
    // metadata polluting the hand card (per card-fromslot-bookkeeping-on-move.mdc).
    expect(clone.fromSlot).toBeUndefined();
  });
});
