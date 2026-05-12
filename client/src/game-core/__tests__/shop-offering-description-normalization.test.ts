/**
 * Shop offering description normalization — regression for "shop sometimes
 * shows upgraded text description".
 *
 * Invariant: every offering that `generateShopOfferingsPure` returns has a
 * `description` / `shortDescription` / `magicEffect` that matches the
 * registered formatter's output at the card's actual `upgradeLevel`.
 *
 *   - Lv0 cards in classDeck (the vast majority) → Lv0 description.
 *   - Pre-upgraded templates (knight-deck Lv1 魔法飞弹) → Lv1 description.
 *   - Any future pre-upgraded entry → formatter-derived description matching
 *     its own upgradeLevel (no hardcoded id-based special-casing).
 *
 * Historical bug: the `description` field on classDeck cards is only set
 * once at deck construction via `applyDerivedCardText`. If any path mutates
 * it later (or a deck file authored stale text by hand), shop offerings
 * would display the stale text. Re-running `applyDerivedCardText` at shop
 * offering generation time fixes both the live data and any future
 * regression of the same shape.
 */

import { describe, expect, it } from 'vitest';
import type { GameCardData } from '@/components/GameCard';
import { generateShopOfferingsPure } from '../shop';
import { applyDerivedCardText } from '../card-schema/card-text';
import { STARTER_CARD_IDS } from '../deck';
import { createRng } from '../rng';
import dedupeStarterMagicMissileImage from '@assets/generated_images/card_starter_magic_missile.png';

import '../card-schema';

describe('shop offering description normalization', () => {
  it('Lv0 starter 魔法飞弹 offering shows Lv0 description (2 bolts), even if classDeck holds stale Lv1 text', () => {
    // Simulate a Lv0 starter 魔法飞弹 whose `description` field has been
    // somehow corrupted to upgraded ("3 bolts") text. The card is still
    // structurally Lv0 (upgradeLevel: 0 / undefined) — formatter should
    // re-derive "2 bolts" text.
    const staleStarter: GameCardData = {
      id: STARTER_CARD_IDS.magicMissile,
      type: 'magic',
      name: '魔法飞弹',
      value: 0,
      image: dedupeStarterMagicMissileImage,
      magicType: 'permanent',
      // Stale: text matches Lv1 (3 bolts) — bug scenario.
      description: '加入 3 张一次性「魔弹」到手牌（每张可对一个怪物造成 1 点法术伤害）。',
      shortDescription: '手上加入 3 张「魔弹」',
      maxUpgradeLevel: 2,
    } as GameCardData;

    const [offerings] = generateShopOfferingsPure(
      [staleStarter],
      0,
      createRng(1),
    );

    expect(offerings).toHaveLength(1);
    const offered = offerings[0].card;

    // Re-derived: Lv0 description (2 bolts), not the stale Lv1 text.
    expect(offered.description).toBe(
      '加入 2 张一次性「魔弹」到手牌（每张可对一个怪物造成 1 点法术伤害）。',
    );
    expect(offered.shortDescription).toBe('手上加入 2 张「魔弹」');
  });

  it('Lv1 knight 魔法飞弹 offering preserves Lv1 description (3 bolts)', () => {
    // The knight deck intentionally seeds a pre-upgraded Lv1 魔法飞弹
    // (`starter-perm-magic-missile-pick-901`, `upgradeLevel: 1`). The shop
    // must keep displaying the Lv1 text because the player actually receives
    // a Lv1 card on purchase.
    const lv1KnightMissile: GameCardData = {
      id: 'starter-perm-magic-missile-pick-901',
      type: 'magic',
      name: '魔法飞弹',
      value: 0,
      image: dedupeStarterMagicMissileImage,
      classCard: true,
      magicType: 'permanent',
      // Deliberately *missing* description to prove formatter populates it.
      upgradeLevel: 1,
      maxUpgradeLevel: 2,
    } as GameCardData;

    const [offerings] = generateShopOfferingsPure(
      [lv1KnightMissile],
      0,
      createRng(2),
    );

    expect(offerings).toHaveLength(1);
    const offered = offerings[0].card;

    expect(offered.upgradeLevel).toBe(1);
    expect(offered.description).toBe(
      '加入 3 张一次性「魔弹」到手牌（每张可对一个怪物造成 1 点法术伤害）。',
    );
    expect(offered.shortDescription).toBe('手上加入 3 张「魔弹」');
  });

  it('every generated offering has description === applyDerivedCardText(template).description (universal invariant)', () => {
    // Universal smoke test: regardless of which cards the RNG picks, every
    // offering must satisfy `offering.card.description ===
    // applyDerivedCardText(template).description`. Without normalization in
    // generateShopOfferingsPure, a card whose `description` was authored as
    // stale text in a deck file would slip through and bypass this property.
    const staleStarter: GameCardData = {
      id: STARTER_CARD_IDS.magicMissile,
      type: 'magic',
      name: '魔法飞弹',
      value: 0,
      image: dedupeStarterMagicMissileImage,
      magicType: 'permanent',
      description: '故意的脏数据：这条描述不应该出现在 shop 里。',
      shortDescription: '脏数据 short',
      maxUpgradeLevel: 2,
    } as GameCardData;

    const [offerings] = generateShopOfferingsPure(
      [staleStarter],
      0,
      createRng(7),
    );

    for (const off of offerings) {
      const expected = applyDerivedCardText(off.card);
      expect(off.card.description).toBe(expected.description);
      expect(off.card.shortDescription).toBe(expected.shortDescription);
      expect(off.card.magicEffect).toBe(expected.magicEffect);
    }
  });
});
