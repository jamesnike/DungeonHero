/**
 * Regression: events that grant starter permanent magics must produce a card
 * id that getStarterBaseId can strip back to the registered starter id, so the
 * resolvePermanentMagic switch can route the played card to its handler.
 *
 * 真实 bug：
 *   - Event "雷霆试炼" 用 grantStarterStunStrike 给玩家发一张「雷震击」。
 *   - 拖到 HeroRow 释放后什么都不发生（没有伤害日志、没有击晕掷骰）。
 *   - 根因：events.ts 给的 id 形如 `starter-perm-stun-strike-evt-XXXX`，
 *     getStarterBaseId 的 strip 正则要求 `-evt-\d+-[a-z0-9]+$`（必须先有
 *     数字段），所以剥离失败 → 永久魔法 switch 全部 fall-through。
 *   - 同代码块还影响：grantStarterWeaponBurst（战斗鼓舞）、
 *     grantStarterTempArmor（铸甲术）。
 *
 * 修复后：id 形如 `starter-perm-stun-strike-evt-1-XXXX`，能被 strip 回
 * `starter-perm-stun-strike`，switch 命中 resolveStunStrike。
 */
import { describe, expect, it } from 'vitest';
import { reduce } from '../reducer';
import { drain } from '../pipeline';
import { createInitialGameState } from '../state';
import type { GameState } from '../types';
import type { GameCardData } from '@/components/GameCard';
import { getStarterBaseId, STARTER_CARD_IDS } from '../deck';

function makeState(overrides?: Partial<GameState>): GameState {
  return { ...createInitialGameState(), ...overrides };
}

function makeMonster(id: string, hp = 10): GameCardData {
  return {
    id,
    type: 'monster',
    name: `测试怪物-${id}`,
    value: 3,
    image: '',
    hp,
    attack: 3,
    baseHp: hp,
    baseAttack: 3,
  } as any;
}

describe('Event grants for starter permanent magics — id must strip to starter base', () => {
  describe('grantStarterStunStrike → 雷震击', () => {
    it('grants a 雷震击 card whose id strips back to STARTER_CARD_IDS.stunStrike', () => {
      const state = makeState({ backpackItems: [], handCards: [] });
      const result = reduce(state, { type: 'APPLY_EVENT_EFFECT', token: 'grantStarterStunStrike' });
      const card = result.state.backpackItems.find(c => c.name === '雷震击');
      expect(card).toBeDefined();
      // The critical property: the id must be strippable so resolvePermanentMagic
      // can route it through the starter switch.
      expect(getStarterBaseId(card!.id)).toBe(STARTER_CARD_IDS.stunStrike);
    });

    it('granted 雷震击 actually deals damage when played onto the hero row', () => {
      const granted = reduce(makeState({ backpackItems: [], handCards: [] }),
        { type: 'APPLY_EVENT_EFFECT', token: 'grantStarterStunStrike' });
      const stunStrike = granted.state.backpackItems.find(c => c.name === '雷震击')!;

      const monster = makeMonster('m1', 10);
      const stateWithCardAndMonster: GameState = {
        ...granted.state,
        handCards: [stunStrike],
        backpackItems: granted.state.backpackItems.filter(c => c.id !== stunStrike.id),
        activeCards: [monster, null, null] as any,
      };

      const drained = drain(stateWithCardAndMonster, [{ type: 'PLAY_CARD', cardId: stunStrike.id }] as any);

      // 单目标伤害 magic 现在统一弹 picker — 显式选 m1 才结算
      expect((drained.state as any).pendingMagicAction).toBeTruthy();
      const final = drain({ ...drained.state, phase: 'idle' } as GameState, [
        { type: 'RESOLVE_MAGIC_MONSTER_SELECTION', magicId: 'stun-strike', monsterId: 'm1' } as any,
      ]);

      // Lv0 雷震击 deals 1×2 = 2 spell damage (per design — see CARD_POOL_REFERENCE).
      const monsterAfter = (final.state.activeCards as any[]).find(c => c?.id === 'm1');
      expect(monsterAfter).toBeDefined();
      expect(monsterAfter.hp).toBeLessThan(10);
    });
  });

  describe('grantStarterWeaponBurst → 战斗鼓舞', () => {
    it('grants a 战斗鼓舞 card whose id strips back to STARTER_CARD_IDS.weaponBurst', () => {
      const state = makeState({ backpackItems: [], handCards: [] });
      const result = reduce(state, { type: 'APPLY_EVENT_EFFECT', token: 'grantStarterWeaponBurst' });
      const card = result.state.backpackItems.find(c => c.name === '战斗鼓舞');
      expect(card).toBeDefined();
      expect(getStarterBaseId(card!.id)).toBe(STARTER_CARD_IDS.weaponBurst);
    });

    it('granted 战斗鼓舞 opens the slot-select prompt when played (proves the switch matched)', () => {
      const granted = reduce(makeState({ backpackItems: [], handCards: [] }),
        { type: 'APPLY_EVENT_EFFECT', token: 'grantStarterWeaponBurst' });
      const burst = granted.state.backpackItems.find(c => c.name === '战斗鼓舞')!;

      const stateWithInHand: GameState = {
        ...granted.state,
        handCards: [burst],
        backpackItems: granted.state.backpackItems.filter(c => c.id !== burst.id),
      };
      const drained = drain(stateWithInHand, [{ type: 'PLAY_CARD', cardId: burst.id }] as any);

      // The Lv0 weapon-burst handler sets pendingMagicAction { effect: 'weapon-burst', step: 'slot-select' }.
      const pending = (drained.state as any).pendingMagicAction;
      expect(pending).toBeDefined();
      expect(pending.effect).toBe('weapon-burst');
    });
  });

  describe('grantStarterTempArmor → 铸甲术', () => {
    it('grants a 铸甲术 card whose id strips back to STARTER_CARD_IDS.tempArmor', () => {
      const state = makeState({ backpackItems: [], handCards: [] });
      const result = reduce(state, { type: 'APPLY_EVENT_EFFECT', token: 'grantStarterTempArmor' });
      const card = result.state.backpackItems.find(c => c.name === '铸甲术');
      expect(card).toBeDefined();
      expect(getStarterBaseId(card!.id)).toBe(STARTER_CARD_IDS.tempArmor);
    });
  });

  // -------------------------------------------------------------------------
  // discoverStarterMagic — sibling bug discovered during audit. The seeded
  // discover candidates are produced with a `${c.id}-disc-1-{base36}` id (was
  // `${c.id}-disc-{base36}` before fix); the strip regex must handle `-disc`.
  // Without this, picking 连环转律 / 锐意鼓舞 / 运势博弈 etc. left the player
  // with a card that did absolutely nothing when played (those three cards
  // explicitly omit `magicEffect` to rely on starter-id routing).
  // -------------------------------------------------------------------------
  describe('discoverStarterMagic — discover candidates must have strippable ids', () => {
    it('every candidate id strips back to a STARTER_CARD_IDS value', () => {
      const state = makeState();
      let captured: { card: any }[] = [];
      const orig = (state as any).pendingEventEffects;
      void orig;
      // APPLY_EVENT_EFFECT for discoverStarterMagic emits an
      // 'event:requestEventInteraction' side effect carrying the candidate
      // pool; we read it directly from sideEffects instead of the modal.
      const result = reduce(state, { type: 'APPLY_EVENT_EFFECT', token: 'discoverStarterMagic' });
      const sideEffect = result.sideEffects.find(
        (se: any) => se.event === 'event:requestEventInteraction'
          && se.payload?.token === 'discoverStarterMagic',
      ) as any;
      expect(sideEffect).toBeDefined();
      const pool = sideEffect.payload.data.pool as any[];
      expect(pool.length).toBeGreaterThan(0);

      // Every candidate's id must strip cleanly to its underlying starter id
      // so that resolvePermanentMagic's switch can route the card.
      const validStarterIds = new Set<string>(Object.values(STARTER_CARD_IDS));
      for (const c of pool) {
        const stripped = getStarterBaseId(c.id);
        expect(validStarterIds.has(stripped)).toBe(true);
        captured.push({ card: c });
      }
    });
  });

  // -------------------------------------------------------------------------
  // discoverStarterEquipment / Potion / Amulet — opening fixed-row events.
  // Same routing rule as discoverStarterMagic: the seeded discover candidates
  // must have ids that strip back to STARTER_CARD_IDS via getStarterBaseId.
  // Even though equipment/potion/amulet cards don't strictly depend on starter
  // routing for their primary effects (weapons/shields equip by `type`,
  // potions by `potionEffect`, amulets by `amuletEffect`), keeping ids
  // strippable is the same convention and protects against future cards in
  // the starter pool that grow starter-id-dependent behavior.
  // -------------------------------------------------------------------------
  describe('discoverStarterEquipment — discover candidates are weapons/shields with strippable ids', () => {
    it('emits a 3-card discover pool of weapons or shields, each strippable', () => {
      const state = makeState();
      const result = reduce(state, { type: 'APPLY_EVENT_EFFECT', token: 'discoverStarterEquipment' });
      const sideEffect = result.sideEffects.find(
        (se: any) => se.event === 'event:requestEventInteraction'
          && se.payload?.token === 'discoverStarterEquipment',
      ) as any;
      expect(sideEffect).toBeDefined();
      const pool = sideEffect.payload.data.pool as GameCardData[];
      expect(pool.length).toBe(3);
      const validStarterIds = new Set<string>(Object.values(STARTER_CARD_IDS));
      for (const c of pool) {
        expect(c.type === 'weapon' || c.type === 'shield').toBe(true);
        expect(validStarterIds.has(getStarterBaseId(c.id))).toBe(true);
      }
    });
  });

  describe('discoverStarterPotion — discover candidates are potions with strippable ids', () => {
    it('emits a 3-card discover pool of potions, each strippable', () => {
      const state = makeState();
      const result = reduce(state, { type: 'APPLY_EVENT_EFFECT', token: 'discoverStarterPotion' });
      const sideEffect = result.sideEffects.find(
        (se: any) => se.event === 'event:requestEventInteraction'
          && se.payload?.token === 'discoverStarterPotion',
      ) as any;
      expect(sideEffect).toBeDefined();
      const pool = sideEffect.payload.data.pool as GameCardData[];
      expect(pool.length).toBe(3);
      const validStarterIds = new Set<string>(Object.values(STARTER_CARD_IDS));
      for (const c of pool) {
        expect(c.type).toBe('potion');
        expect(validStarterIds.has(getStarterBaseId(c.id))).toBe(true);
      }
    });
  });

  describe('discoverStarterAmulet — discover candidates are amulets with strippable ids', () => {
    it('emits a 3-card discover pool of amulets, each strippable', () => {
      const state = makeState();
      const result = reduce(state, { type: 'APPLY_EVENT_EFFECT', token: 'discoverStarterAmulet' });
      const sideEffect = result.sideEffects.find(
        (se: any) => se.event === 'event:requestEventInteraction'
          && se.payload?.token === 'discoverStarterAmulet',
      ) as any;
      expect(sideEffect).toBeDefined();
      const pool = sideEffect.payload.data.pool as GameCardData[];
      expect(pool.length).toBe(3);
      const validStarterIds = new Set<string>(Object.values(STARTER_CARD_IDS));
      for (const c of pool) {
        expect(c.type).toBe('amulet');
        expect(validStarterIds.has(getStarterBaseId(c.id))).toBe(true);
      }
    });
  });

  // -------------------------------------------------------------------------
  // grantStarterMagicTwo — used by the opening fixed-row 「魔法馈赠」 event.
  // Grants 2 random starter magic cards directly to the backpack (no UI
  // pick). Critical: the granted ids MUST strip back to STARTER_CARD_IDS.X
  // because most starter magics rely on starter-id routing in
  // resolvePermanentMagic — otherwise they're silently no-op when played.
  // (This is the exact bug class the event-grant-card-id-suffix rule
  // documents.)
  // -------------------------------------------------------------------------
  describe('grantStarterMagicTwo — grants 2 starter magics to backpack with strippable ids', () => {
    it('puts exactly 2 magic cards in the backpack', () => {
      const state = makeState({ backpackItems: [], handCards: [] });
      const result = reduce(state, { type: 'APPLY_EVENT_EFFECT', token: 'grantStarterMagicTwo' });
      const grantedMagics = result.state.backpackItems.filter(c => c.type === 'magic');
      expect(grantedMagics.length).toBe(2);
    });

    it('every granted card id strips back to a STARTER_CARD_IDS value', () => {
      const state = makeState({ backpackItems: [], handCards: [] });
      const result = reduce(state, { type: 'APPLY_EVENT_EFFECT', token: 'grantStarterMagicTwo' });
      const validStarterIds = new Set<string>(Object.values(STARTER_CARD_IDS));
      for (const c of result.state.backpackItems) {
        expect(validStarterIds.has(getStarterBaseId(c.id))).toBe(true);
      }
    });

    it('overflows to the recycle bag with _recycleWaits when backpack is full', () => {
      // Force backpack near capacity: cap = BASE (5) + modifier
      const filler: GameCardData = { id: 'filler', type: 'magic', name: 'filler', value: 0, image: '' } as any;
      const fullBackpack = Array.from({ length: 100 }, (_, i) => ({ ...filler, id: `filler-${i}` }));
      const state = makeState({ backpackItems: fullBackpack, handCards: [] });
      const result = reduce(state, { type: 'APPLY_EVENT_EFFECT', token: 'grantStarterMagicTwo' });
      // None of the new starter magics should have squeezed into backpack
      // (it was already over capacity). They should all sit in the recycle
      // bag with _recycleWaits set to their delay (defaults to 1).
      const recycle = result.state.permanentMagicRecycleBag;
      expect(recycle.length).toBeGreaterThanOrEqual(2);
      const newRecycleEntries = recycle.filter(c => c.type === 'magic' && getStarterBaseId(c.id) !== c.id);
      expect(newRecycleEntries.length).toBe(2);
      for (const c of newRecycleEntries) {
        expect((c as any)._recycleWaits).toBeGreaterThanOrEqual(1);
      }
    });
  });

  // -------------------------------------------------------------------------
  // flipToUndyingBlessing — sibling bug. Card has only a description-string
  // magicEffect (no knightEffect), so it relies on starter-id routing.
  // Pre-fix the id was `${id}-pick-{base36}` and the `-pick-\d+$` regex only
  // matched pure-digit suffixes, so ~99% of RNG runs left the card no-op.
  // -------------------------------------------------------------------------
  describe('flipToUndyingBlessing — flipped card must have a strippable id', () => {
    // We exercise the helper indirectly through its outer event
    // (`curse-def-blessing`). Since the helper isn't exported, we assert on
    // the regex behavior for the exact prefix shape used in production.
    it('the new -evt-1 prefix produces ids that strip to STARTER_CARD_IDS.undyingBlessing', () => {
      // Production now uses: nextId(rng, `${STARTER_CARD_IDS.undyingBlessing}-evt-1`)
      // which yields `${id}-evt-1-{base36}`.
      const sample = `${STARTER_CARD_IDS.undyingBlessing}-evt-1-1abc`;
      expect(getStarterBaseId(sample)).toBe(STARTER_CARD_IDS.undyingBlessing);
    });
  });

  // -------------------------------------------------------------------------
  // getStarterBaseId regex — defensive backstop. Confirm the relaxed pattern
  // strips all event-grant suffix shapes we use today AND keeps the
  // pre-existing collision guard (no false strip on `-discard-`, `-discover`,
  // etc. embedded inside non-card ids).
  // -------------------------------------------------------------------------
  describe('getStarterBaseId — relaxed strip pattern', () => {
    it('strips `-pick-{digits}` (pre-existing format)', () => {
      expect(getStarterBaseId(`${STARTER_CARD_IDS.weaponBurst}-pick-7`))
        .toBe(STARTER_CARD_IDS.weaponBurst);
    });
    it('strips `-pick-{digits}-{base36}` (relaxed)', () => {
      expect(getStarterBaseId(`${STARTER_CARD_IDS.weaponBurst}-pick-1-abc123`))
        .toBe(STARTER_CARD_IDS.weaponBurst);
    });
    it('strips `-evt-{digits}-{base36}` (pre-existing format)', () => {
      expect(getStarterBaseId(`${STARTER_CARD_IDS.stunStrike}-evt-1-abc`))
        .toBe(STARTER_CARD_IDS.stunStrike);
    });
    it('strips `-evt-{digits}` without base36 (relaxed)', () => {
      expect(getStarterBaseId(`${STARTER_CARD_IDS.stunStrike}-evt-7`))
        .toBe(STARTER_CARD_IDS.stunStrike);
    });
    it('strips `-disc-{digits}-{base36}` (newly added)', () => {
      expect(getStarterBaseId(`${STARTER_CARD_IDS.transformStreakStrike}-disc-1-xyz`))
        .toBe(STARTER_CARD_IDS.transformStreakStrike);
    });
    it('does NOT strip ids without a leading digit segment (false-positive guard)', () => {
      // Pre-fix `flipToUndyingBlessing` produced this shape and it should
      // remain unstripped — the digit guard keeps `getStarterBaseId` safe
      // against random card-id substrings that happen to contain `-pick-`.
      const noDigit = `${STARTER_CARD_IDS.undyingBlessing}-pick-abc`;
      expect(getStarterBaseId(noDigit)).toBe(noDigit);
    });
    it('does NOT strip embedded substrings like `-discard-` or `-discover`', () => {
      // Real ids in the wild: 'curse-discard-hand', 'amplify-discover'.
      // Even though they contain `-disc`, no `-disc-{digit}-` pattern, so
      // they pass through untouched.
      expect(getStarterBaseId('curse-discard-hand')).toBe('curse-discard-hand');
      expect(getStarterBaseId('amplify-discover')).toBe('amplify-discover');
    });
  });
});
