/**
 * Regression: DISCARD_ALL_HAND must route every non-curse hand card through
 * the DISCARD_OWNED_CARD pipeline (graveyard or recycle bag), not just
 * filter-and-vanish.
 *
 * Bug history (2026-04): the reducer was implemented as
 *   `handCards: state.handCards.filter(c => c.type === 'curse')`
 * which removed non-curse cards from hand WITHOUT adding them anywhere.
 * Triggered by 诅咒骰局 waterfall (`destroyAllAmuletsAndDiscardHand`) and
 * any other consumer that enqueued the action directly.
 *
 * Both触发路径 are covered:
 *   1. Direct dispatch (formerly the hook + waterfall imperative path)
 *   2. 诅咒骰局 waterfall (full APPLY_WATERFALL_DISCARD_EFFECTS pipeline)
 */

import { describe, expect, it } from 'vitest';
import { drain } from '../pipeline';
import { createInitialGameState } from '../state';
import { computeWaterfallDropPlan } from '../rules/waterfall';
import type { GameState, GameCardData } from '../types';
import type { ActiveRowSlots } from '../../components/game-board/types';
import { DUNGEON_COLUMN_COUNT } from '../constants';

function makeState(overrides?: Partial<GameState>): GameState {
  return { ...createInitialGameState(), ...overrides };
}

const monsterCard = (id: string): GameCardData => ({
  id,
  type: 'monster',
  name: `怪物-${id}`,
  value: 3,
  attack: 3,
  hp: 3,
  maxHp: 3,
});

const eventCard = (id: string, name = '事件'): GameCardData => ({
  id,
  type: 'event',
  name: `${name}-${id}`,
  value: 0,
  description: 'placeholder',
});

const potionCard = (id: string): GameCardData => ({
  id,
  type: 'potion',
  name: `药水-${id}`,
  value: 0,
});

const curseCard = (id: string): GameCardData => ({
  id,
  type: 'curse',
  name: `诅咒-${id}`,
  value: 0,
});

const permMagicCard = (id: string): GameCardData => ({
  id,
  type: 'magic',
  magicType: 'permanent',
  name: `永久法术-${id}`,
  value: 0,
  recycleDelay: 2,
});

describe('DISCARD_ALL_HAND — 非 curse 手牌必须进坟场或回收袋', () => {
  it('直接 dispatch：普通手牌 → 坟场，curse 留在手里', () => {
    const potion = potionCard('p1');
    const evt = eventCard('e1');
    const curse = curseCard('c1');
    const state = makeState({
      handCards: [potion, evt, curse],
    });

    const result = drain(state, [{ type: 'DISCARD_ALL_HAND' }]);

    expect(result.state.handCards).toHaveLength(1);
    expect(result.state.handCards[0].id).toBe(curse.id);

    const graveIds = result.state.discardedCards.map(c => c.id);
    expect(graveIds).toContain(potion.id);
    expect(graveIds).toContain(evt.id);
    expect(graveIds).not.toContain(curse.id);
  });

  it('直接 dispatch：永久法术 → 回收袋（不进坟场）', () => {
    const perm = permMagicCard('perm1');
    const potion = potionCard('p1');
    const state = makeState({
      handCards: [perm, potion],
    });

    const result = drain(state, [{ type: 'DISCARD_ALL_HAND' }]);

    expect(result.state.handCards).toHaveLength(0);

    const graveIds = result.state.discardedCards.map(c => c.id);
    expect(graveIds).toContain(potion.id);
    expect(graveIds).not.toContain(perm.id);

    const recycleIds = result.state.permanentMagicRecycleBag.map(c => c.id);
    expect(recycleIds).toContain(perm.id);
  });

  it('空手牌或全是 curse：no-op', () => {
    const curse = curseCard('c1');
    const state = makeState({ handCards: [curse] });

    const result = drain(state, [{ type: 'DISCARD_ALL_HAND' }]);

    expect(result.state.handCards).toEqual([curse]);
    expect(result.state.discardedCards).toHaveLength(0);
  });

  it('诅咒骰局 waterfall 路径：手牌 + 护符 + 事件卡本身全部进坟场', () => {
    expect(DUNGEON_COLUMN_COUNT).toBe(4);

    const cursedDice: GameCardData = {
      id: 'event-cursed-dice',
      type: 'event',
      name: '诅咒骰局',
      value: 0,
      waterfallEffect: {
        type: 'destroyAllAmuletsAndDiscardHand',
        amount: 0,
        description: '被挤出时：摧毁所有护符，弃回所有手牌',
      },
    };

    const handPotion = potionCard('hand-potion');
    const handEvent = eventCard('hand-event', '手牌事件');
    const handCurse = curseCard('hand-curse');

    const activeCards: ActiveRowSlots = [
      null,
      monsterCard('m1'),
      monsterCard('m2'),
      monsterCard('m3'),
    ] as unknown as ActiveRowSlots;

    const previewCards: ActiveRowSlots = [
      eventCard('p0'),
      eventCard('p1'),
      eventCard('p2'),
      cursedDice,
    ] as unknown as ActiveRowSlots;

    const state = makeState({
      activeCards,
      previewCards,
      handCards: [handPotion, handEvent, handCurse],
      remainingDeck: [
        monsterCard('next-1'),
        eventCard('next-2'),
        monsterCard('next-3'),
        eventCard('next-4'),
      ],
    });

    const plan = computeWaterfallDropPlan(state, false);
    expect(plan).not.toBeNull();
    expect(plan!.discardCard?.id).toBe(cursedDice.id);

    const result = drain(
      { ...state, pendingWaterfallPlan: plan! },
      [
        {
          type: 'APPLY_WATERFALL_DISCARD_EFFECTS',
          discardCard: plan!.discardCard!,
          nextRemainingDeck: plan!.nextRemainingDeck,
          discardPreviewIndex: plan!.discardPreviewIndex,
        },
      ],
    );

    const finalState = result.state;
    const graveIds = finalState.discardedCards.map(c => c.id);

    expect(graveIds, '事件卡本身').toContain(cursedDice.id);
    expect(graveIds, '手牌中的药水').toContain(handPotion.id);
    expect(graveIds, '手牌中的事件').toContain(handEvent.id);
    expect(graveIds, 'curse 不应进坟场').not.toContain(handCurse.id);

    expect(finalState.handCards.map(c => c.id)).toEqual([handCurse.id]);
  });
});
