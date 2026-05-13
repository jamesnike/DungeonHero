import { describe, expect, it } from 'vitest';
import { reduce } from '../reducer';
import { createInitialGameState } from '../state';
import { resolveUpgradeEffectId } from '../card-schema';
import type { GameState } from '../types';
import type { GameCardData } from '@/components/GameCard';
import { STARTER_CARD_IDS } from '../deck';

// Importing the registry side-effect is critical: tests below assume all
// schema definitions have already been registered.
import '../card-schema';

function makeState(overrides?: Partial<GameState>): GameState {
  return { ...createInitialGameState(), ...(overrides ?? {}) };
}

describe('resolveUpgradeEffectId routing priority', () => {
  it('monster cards always route to monster:default regardless of other fields', () => {
    const monster: GameCardData = {
      id: 'm1',
      type: 'monster',
      name: 'Test Monster',
      value: 0,
      hp: 5,
      attack: 2,
    } as any;
    expect(resolveUpgradeEffectId(monster)).toBe('monster:default');
  });

  it('starter cards with registered handlers route to starter:{id}', () => {
    const card: GameCardData = {
      id: `${STARTER_CARD_IDS.weaponBurst}-pick-1-abc`,
      type: 'magic',
      name: '武器爆裂',
      value: 0,
    } as any;
    expect(resolveUpgradeEffectId(card)).toBe(`starter:${STARTER_CARD_IDS.weaponBurst}`);
  });

  it('starter perm amulet (loneCardAmulet) keeps starter routing despite having amuletEffect', () => {
    const card: GameCardData = {
      id: `${STARTER_CARD_IDS.loneCardAmulet}-pick-2`,
      type: 'amulet',
      name: '孤牌护符',
      value: 0,
      amuletEffect: 'lone-card',
    } as any;
    expect(resolveUpgradeEffectId(card)).toBe(`starter:${STARTER_CARD_IDS.loneCardAmulet}`);
  });

  it('knight cards (no registered starter handler) fall through to knight:{ke}', () => {
    const card: GameCardData = {
      id: 'knight-7',
      type: 'magic',
      name: '不灭守护',
      value: 0,
      knightEffect: 'death-ward',
    } as any;
    expect(resolveUpgradeEffectId(card)).toBe('knight:death-ward');
  });

  it('knight weapons with knightEffect fall through to knight:{ke}', () => {
    const card: GameCardData = {
      id: 'knight-0',
      type: 'weapon',
      name: '圣光之刃',
      value: 6,
      knightEffect: 'holy-blade',
    } as any;
    expect(resolveUpgradeEffectId(card)).toBe('knight:holy-blade');
  });

  it('non-starter amulet cards with no knightEffect fall through to amulet:{ae}', () => {
    const card: GameCardData = {
      id: 'random-amulet-id',
      type: 'amulet',
      name: 'Some Amulet',
      value: 0,
      amuletEffect: 'persuade-on-temp-attack',
    } as any;
    expect(resolveUpgradeEffectId(card)).toBe('amulet:persuade-on-temp-attack');
  });

  it('cards with no identifying field return null', () => {
    const card: GameCardData = {
      id: 'plain-equipment',
      type: 'weapon',
      name: 'Plain Sword',
      value: 2,
    } as any;
    expect(resolveUpgradeEffectId(card)).toBeNull();
  });
});

describe('Holy Blade (圣光之刃) upgrade handler', () => {
  function holyBladeL0(): GameCardData {
    return {
      id: 'knight-0',
      type: 'weapon',
      name: '圣光之刃',
      value: 6,
      image: '',
      classCard: true,
      description: '入场：恢复 3 点生命。每次攻击时恢复 2 点生命。',
      shortDescription: '入场+3生命；攻击+2生命',
      onEquipEffect: 'heal-3',
      healOnAttack: 2,
      durability: 2,
      maxDurability: 2,
      knightEffect: 'holy-blade',
      maxUpgradeLevel: 2,
      upgradeLevel: 0,
    } as any;
  }

  it('L0 → L1: onEquipEffect heal-3 → heal-4, healOnAttack 2 → 3, description updates', () => {
    const card = holyBladeL0();
    const state = makeState({ handCards: [card] });
    const result = reduce(state, { type: 'UPGRADE_CARD', cardId: card.id });
    const upgraded = result.state.handCards[0] as any;
    expect(upgraded.upgradeLevel).toBe(1);
    expect(upgraded.onEquipEffect).toBe('heal-4');
    expect(upgraded.healOnAttack).toBe(3);
    expect(upgraded.description).toBe('入场：恢复 4 点生命。每次攻击时恢复 3 点生命。');
    expect(upgraded.shortDescription).toBe('入场+4生命；攻击+3生命');
  });

  it('L1 → L2: onEquipEffect heal-4 → heal-5, healOnAttack 3 → 4, description updates', () => {
    const card = { ...holyBladeL0(), upgradeLevel: 1, onEquipEffect: 'heal-4', healOnAttack: 3 };
    const state = makeState({ handCards: [card as any] });
    const result = reduce(state, { type: 'UPGRADE_CARD', cardId: card.id });
    const upgraded = result.state.handCards[0] as any;
    expect(upgraded.upgradeLevel).toBe(2);
    expect(upgraded.onEquipEffect).toBe('heal-5');
    expect(upgraded.healOnAttack).toBe(4);
    expect(upgraded.description).toBe('入场：恢复 5 点生命。每次攻击时恢复 4 点生命。');
    expect(upgraded.shortDescription).toBe('入场+5生命；攻击+4生命');
  });

  it('cannot upgrade past maxUpgradeLevel (2)', () => {
    const card = { ...holyBladeL0(), upgradeLevel: 2, onEquipEffect: 'heal-5', healOnAttack: 4 };
    const state = makeState({ handCards: [card as any] });
    const result = reduce(state, { type: 'UPGRADE_CARD', cardId: card.id });
    const upgraded = result.state.handCards[0] as any;
    expect(upgraded.upgradeLevel).toBe(2);
    expect(upgraded.onEquipEffect).toBe('heal-5');
    expect(upgraded.healOnAttack).toBe(4);
  });
});

describe('Swift Dagger (疾风短剑) upgrade handler', () => {
  function swiftDaggerL0(): GameCardData {
    return {
      id: 'knight-1',
      type: 'weapon',
      name: '疾风短剑',
      value: 3,
      image: '',
      classCard: true,
      description: '入场：所有装备栏临时攻击 +2。用此武器杀死怪物时耐久度回满。',
      shortDescription: '入场全栏 +2 临时攻；杀怪回满耐久',
      onEquipEffect: 'all-temp-attack-2',
      durability: 2,
      maxDurability: 2,
      restoreDurabilityOnKill: true,
      knightEffect: 'swift-dagger',
      maxUpgradeLevel: 2,
      upgradeLevel: 0,
    } as any;
  }

  it('L0 → L1: onEquipEffect all-temp-attack-2 → all-temp-attack-4, description updates', () => {
    const card = swiftDaggerL0();
    const state = makeState({ handCards: [card] });
    const result = reduce(state, { type: 'UPGRADE_CARD', cardId: card.id });
    const upgraded = result.state.handCards[0] as any;
    expect(upgraded.upgradeLevel).toBe(1);
    expect(upgraded.onEquipEffect).toBe('all-temp-attack-4');
    expect(upgraded.description).toBe('入场：所有装备栏临时攻击 +4。用此武器杀死怪物时耐久度回满。');
    expect(upgraded.shortDescription).toBe('入场全栏 +4 临时攻；杀怪回满耐久');
    // Sanity: kill-restore behavior preserved across upgrades
    expect(upgraded.restoreDurabilityOnKill).toBe(true);
  });

  it('L1 → L2: onEquipEffect all-temp-attack-4 → all-temp-attack-6, description updates', () => {
    const card = { ...swiftDaggerL0(), upgradeLevel: 1, onEquipEffect: 'all-temp-attack-4' };
    const state = makeState({ handCards: [card as any] });
    const result = reduce(state, { type: 'UPGRADE_CARD', cardId: card.id });
    const upgraded = result.state.handCards[0] as any;
    expect(upgraded.upgradeLevel).toBe(2);
    expect(upgraded.onEquipEffect).toBe('all-temp-attack-6');
    expect(upgraded.description).toBe('入场：所有装备栏临时攻击 +6。用此武器杀死怪物时耐久度回满。');
    expect(upgraded.shortDescription).toBe('入场全栏 +6 临时攻；杀怪回满耐久');
    expect(upgraded.restoreDurabilityOnKill).toBe(true);
  });

  it('cannot upgrade past maxUpgradeLevel (2)', () => {
    const card = { ...swiftDaggerL0(), upgradeLevel: 2, onEquipEffect: 'all-temp-attack-6' };
    const state = makeState({ handCards: [card as any] });
    const result = reduce(state, { type: 'UPGRADE_CARD', cardId: card.id });
    const upgraded = result.state.handCards[0] as any;
    expect(upgraded.upgradeLevel).toBe(2);
    expect(upgraded.onEquipEffect).toBe('all-temp-attack-6');
  });
});

describe('Thunder Hammer (碎雷战锤) upgrade handler', () => {
  function thunderHammerL0(): GameCardData {
    return {
      id: 'knight-2',
      type: 'weapon',
      name: '碎雷战锤',
      value: 3,
      image: '',
      classCard: true,
      description: '每次攻击永久增加该装备栏 +1 伤害。',
      shortDescription: '每次攻击该栏永久 +1 伤害',
      weaponBonus: 1,
      durability: 1,
      maxDurability: 1,
      knightEffect: 'thunder-hammer',
      maxUpgradeLevel: 2,
      upgradeLevel: 0,
    } as any;
  }

  it('L0 → L1: maxDurability 1 → 2, durability follows (1 → 2)', () => {
    const card = thunderHammerL0();
    const state = makeState({ handCards: [card] });
    const result = reduce(state, { type: 'UPGRADE_CARD', cardId: card.id });
    const upgraded = result.state.handCards[0] as any;
    expect(upgraded.upgradeLevel).toBe(1);
    expect(upgraded.maxDurability).toBe(2);
    expect(upgraded.durability).toBe(2);
    // Static fields unchanged
    expect(upgraded.value).toBe(3);
    expect(upgraded.weaponBonus).toBe(1);
    expect(upgraded.description).toBe('每次攻击永久增加该装备栏 +1 伤害。');
  });

  it('L1 → L2: maxDurability 2 → 3, durability follows (2 → 3)', () => {
    const card = { ...thunderHammerL0(), upgradeLevel: 1, durability: 2, maxDurability: 2 };
    const state = makeState({ handCards: [card as any] });
    const result = reduce(state, { type: 'UPGRADE_CARD', cardId: card.id });
    const upgraded = result.state.handCards[0] as any;
    expect(upgraded.upgradeLevel).toBe(2);
    expect(upgraded.maxDurability).toBe(3);
    expect(upgraded.durability).toBe(3);
    expect(upgraded.value).toBe(3);
    expect(upgraded.weaponBonus).toBe(1);
  });

  it('upgrade preserves "broken amount": L1 with 0/2 → L2 becomes 1/3', () => {
    const card = { ...thunderHammerL0(), upgradeLevel: 1, durability: 0, maxDurability: 2 };
    const state = makeState({ handCards: [card as any] });
    const result = reduce(state, { type: 'UPGRADE_CARD', cardId: card.id });
    const upgraded = result.state.handCards[0] as any;
    expect(upgraded.maxDurability).toBe(3);
    expect(upgraded.durability).toBe(1);
  });

  it('cannot upgrade past maxUpgradeLevel (2)', () => {
    const card = { ...thunderHammerL0(), upgradeLevel: 2, durability: 3, maxDurability: 3 };
    const state = makeState({ handCards: [card as any] });
    const result = reduce(state, { type: 'UPGRADE_CARD', cardId: card.id });
    const upgraded = result.state.handCards[0] as any;
    expect(upgraded.upgradeLevel).toBe(2);
    expect(upgraded.maxDurability).toBe(3);
  });
});

describe('Persuade Hammer (感化之锤) upgrade handler', () => {
  function persuadeHammerL0(): GameCardData {
    return {
      id: 'knight-persuade-hammer-1',
      type: 'weapon',
      name: '感化之锤',
      value: 2,
      image: '',
      classCard: true,
      description: '每次攻击一次，下次劝降成功概率 +20%。',
      shortDescription: '每次攻击下次劝降率 +20%',
      persuadeBoostOnHit: 20,
      durability: 3,
      maxDurability: 3,
      knightEffect: 'persuade-hammer',
      maxUpgradeLevel: 1,
      upgradeLevel: 0,
    } as any;
  }

  it('L0 → L1: persuadeBoostOnHit 20 → 30, description / shortDescription updated', () => {
    const card = persuadeHammerL0();
    const state = makeState({ handCards: [card] });
    const result = reduce(state, { type: 'UPGRADE_CARD', cardId: card.id });
    const upgraded = result.state.handCards[0] as any;
    expect(upgraded.upgradeLevel).toBe(1);
    expect(upgraded.persuadeBoostOnHit).toBe(30);
    expect(upgraded.description).toBe('每次攻击一次，下次劝降成功概率 +30%。');
    expect(upgraded.shortDescription).toBe('每次攻击下次劝降率 +30%');
    // Static fields untouched
    expect(upgraded.value).toBe(2);
    expect(upgraded.maxDurability).toBe(3);
    expect(upgraded.durability).toBe(3);
  });

  it('cannot upgrade past maxUpgradeLevel (1)', () => {
    const card = { ...persuadeHammerL0(), upgradeLevel: 1, persuadeBoostOnHit: 30 };
    const state = makeState({ handCards: [card as any] });
    const result = reduce(state, { type: 'UPGRADE_CARD', cardId: card.id });
    const upgraded = result.state.handCards[0] as any;
    expect(upgraded.upgradeLevel).toBe(1);
    expect(upgraded.persuadeBoostOnHit).toBe(30);
  });
});

describe('Thunder Stun Hammer (雷击碎骨锤) upgrade handler', () => {
  function thunderStunHammerL0(): GameCardData {
    return {
      id: 'knight-thunder-stun-1',
      type: 'weapon',
      name: '雷击碎骨锤',
      value: 3,
      image: '',
      classCard: true,
      description: '入场：击晕上限 +5%。击晕率60%。攻击击晕的怪物时造成双倍伤害（先判定击晕，本次击晕也会触发翻倍）。',
      shortDescription: '入场击晕上限 +5%；击晕率 60%；击晕怪物伤害翻倍（含本次击晕）',
      weaponStunChance: 60,
      doubleDamageOnStunned: true,
      onEquipEffect: 'stunCap+5',
      durability: 2,
      maxDurability: 2,
      knightEffect: 'thunder-stun-hammer',
      maxUpgradeLevel: 2,
      upgradeLevel: 0,
    } as any;
  }

  it('L0 → L1: value 3 → 4, maxDurability 2 → 3, durability follows; stunCap effect unchanged at +5', () => {
    const card = thunderStunHammerL0();
    const state = makeState({ handCards: [card] });
    const result = reduce(state, { type: 'UPGRADE_CARD', cardId: card.id });
    const upgraded = result.state.handCards[0] as any;
    expect(upgraded.upgradeLevel).toBe(1);
    expect(upgraded.value).toBe(4);
    expect(upgraded.maxDurability).toBe(3);
    expect(upgraded.durability).toBe(3);
    expect(upgraded.onEquipEffect).toBe('stunCap+5');
    expect(upgraded.weaponStunChance).toBe(60);
    expect(upgraded.doubleDamageOnStunned).toBe(true);
    expect(upgraded.description).toBe(
      '入场：击晕上限 +5%。击晕率60%。攻击击晕的怪物时造成双倍伤害（先判定击晕，本次击晕也会触发翻倍）。',
    );
  });

  it('L1 → L2: value/durability stay at 4/3; onEquipEffect → stunCap+10; description updated', () => {
    const card = {
      ...thunderStunHammerL0(),
      upgradeLevel: 1,
      value: 4,
      durability: 3,
      maxDurability: 3,
    };
    const state = makeState({ handCards: [card as any] });
    const result = reduce(state, { type: 'UPGRADE_CARD', cardId: card.id });
    const upgraded = result.state.handCards[0] as any;
    expect(upgraded.upgradeLevel).toBe(2);
    expect(upgraded.value).toBe(4);
    expect(upgraded.maxDurability).toBe(3);
    expect(upgraded.durability).toBe(3);
    expect(upgraded.onEquipEffect).toBe('stunCap+10');
    expect(upgraded.weaponStunChance).toBe(60);
    expect(upgraded.doubleDamageOnStunned).toBe(true);
    expect(upgraded.description).toBe(
      '入场：击晕上限 +10%。击晕率60%。攻击击晕的怪物时造成双倍伤害（先判定击晕，本次击晕也会触发翻倍）。',
    );
    expect(upgraded.shortDescription).toBe('入场击晕上限 +10%；击晕率 60%；击晕怪物伤害翻倍（含本次击晕）');
  });

  it('upgrade preserves "broken amount" on durability bump: L0 with 1/2 → L1 becomes 2/3', () => {
    const card = { ...thunderStunHammerL0(), durability: 1, maxDurability: 2 };
    const state = makeState({ handCards: [card as any] });
    const result = reduce(state, { type: 'UPGRADE_CARD', cardId: card.id });
    const upgraded = result.state.handCards[0] as any;
    expect(upgraded.maxDurability).toBe(3);
    expect(upgraded.durability).toBe(2);
  });

  it('L0 → L1 → L2 chained: end state is 4 attack, 3/3, stunCap+10', () => {
    const card = thunderStunHammerL0();
    let state = makeState({ handCards: [card] });
    state = reduce(state, { type: 'UPGRADE_CARD', cardId: card.id }).state;
    state = reduce(state, { type: 'UPGRADE_CARD', cardId: card.id }).state;
    const upgraded = state.handCards[0] as any;
    expect(upgraded.upgradeLevel).toBe(2);
    expect(upgraded.value).toBe(4);
    expect(upgraded.maxDurability).toBe(3);
    expect(upgraded.durability).toBe(3);
    expect(upgraded.onEquipEffect).toBe('stunCap+10');
  });

  it('cannot upgrade past maxUpgradeLevel (2)', () => {
    const card = {
      ...thunderStunHammerL0(),
      upgradeLevel: 2,
      value: 4,
      durability: 3,
      maxDurability: 3,
      onEquipEffect: 'stunCap+10',
    };
    const state = makeState({ handCards: [card as any] });
    const result = reduce(state, { type: 'UPGRADE_CARD', cardId: card.id });
    const upgraded = result.state.handCards[0] as any;
    expect(upgraded.upgradeLevel).toBe(2);
    expect(upgraded.onEquipEffect).toBe('stunCap+10');
  });
});

describe('Soul Hunter Blade (噬魂猎刃) upgrade handler', () => {
  function soulHunterBladeL0(): GameCardData {
    return {
      id: 'knight-soul-hunter-1',
      type: 'weapon',
      name: '噬魂猎刃',
      value: 5,
      image: '',
      classCard: true,
      description: '超杀：将回收袋 2 张牌移到手上。',
      shortDescription: '超杀：回收袋 2 张牌入手',
      overkillRecycleToHand: 2,
      durability: 2,
      maxDurability: 2,
      knightEffect: 'soul-hunter-blade',
      maxUpgradeLevel: 2,
      upgradeLevel: 0,
    } as any;
  }

  it('L0 → L1: value stays 5, maxDurability 2 → 3, durability follows', () => {
    const card = soulHunterBladeL0();
    const state = makeState({ handCards: [card] });
    const result = reduce(state, { type: 'UPGRADE_CARD', cardId: card.id });
    const upgraded = result.state.handCards[0] as any;
    expect(upgraded.upgradeLevel).toBe(1);
    expect(upgraded.value).toBe(5);
    expect(upgraded.maxDurability).toBe(3);
    expect(upgraded.durability).toBe(3);
    expect(upgraded.overkillRecycleToHand).toBe(2);
    expect(upgraded.description).toBe('超杀：将回收袋 2 张牌移到手上。');
  });

  it('L1 → L2: value 5 → 6, maxDurability 3 → 4 (at cap)', () => {
    const card = { ...soulHunterBladeL0(), upgradeLevel: 1, durability: 3, maxDurability: 3 };
    const state = makeState({ handCards: [card as any] });
    const result = reduce(state, { type: 'UPGRADE_CARD', cardId: card.id });
    const upgraded = result.state.handCards[0] as any;
    expect(upgraded.upgradeLevel).toBe(2);
    expect(upgraded.value).toBe(6);
    expect(upgraded.maxDurability).toBe(4);
    expect(upgraded.durability).toBe(4);
    expect(upgraded.overkillRecycleToHand).toBe(2);
    expect(upgraded.description).toBe('超杀：将回收袋 2 张牌移到手上。');
  });

  it('upgrade preserves "broken amount": L1 with 1/3 → L2 becomes 2/4', () => {
    const card = { ...soulHunterBladeL0(), upgradeLevel: 1, durability: 1, maxDurability: 3 };
    const state = makeState({ handCards: [card as any] });
    const result = reduce(state, { type: 'UPGRADE_CARD', cardId: card.id });
    const upgraded = result.state.handCards[0] as any;
    expect(upgraded.maxDurability).toBe(4);
    expect(upgraded.durability).toBe(2);
  });

  it('L0 → L1 → L2 chained: end state is 6 attack, 4/4', () => {
    const card = soulHunterBladeL0();
    let state = makeState({ handCards: [card] });
    state = reduce(state, { type: 'UPGRADE_CARD', cardId: card.id }).state;
    state = reduce(state, { type: 'UPGRADE_CARD', cardId: card.id }).state;
    const upgraded = state.handCards[0] as any;
    expect(upgraded.upgradeLevel).toBe(2);
    expect(upgraded.value).toBe(6);
    expect(upgraded.maxDurability).toBe(4);
    expect(upgraded.durability).toBe(4);
  });

  it('cannot upgrade past maxUpgradeLevel (2)', () => {
    const card = { ...soulHunterBladeL0(), upgradeLevel: 2, value: 6, durability: 4, maxDurability: 4 };
    const state = makeState({ handCards: [card as any] });
    const result = reduce(state, { type: 'UPGRADE_CARD', cardId: card.id });
    const upgraded = result.state.handCards[0] as any;
    expect(upgraded.upgradeLevel).toBe(2);
    expect(upgraded.value).toBe(6);
    expect(upgraded.maxDurability).toBe(4);
  });
});

describe('Exchange Blade (汰换之刃) upgrade handler', () => {
  function exchangeBladeL0(): GameCardData {
    return {
      id: 'knight-exchange-blade-1',
      type: 'weapon',
      name: '汰换之刃',
      value: 2,
      image: '',
      classCard: true,
      description: '入场：该装备栏永久攻击 +1。遗言：该装备栏永久护甲 +1。',
      shortDescription: '入场本栏永久 +1 攻；遗言本栏永久 +1 护',
      durability: 3,
      maxDurability: 3,
      onEquipEffect: 'perm-slot-damage+1',
      onDestroyPermanentShield: 1,
      knightEffect: 'exchange-blade',
      maxUpgradeLevel: 2,
      upgradeLevel: 0,
    } as any;
  }

  it('L0 → L1: onEquipEffect stays at +1, onDestroyPermanentShield 1 → 2', () => {
    const card = exchangeBladeL0();
    const state = makeState({ handCards: [card] });
    const result = reduce(state, { type: 'UPGRADE_CARD', cardId: card.id });
    const upgraded = result.state.handCards[0] as any;
    expect(upgraded.upgradeLevel).toBe(1);
    expect(upgraded.onEquipEffect).toBe('perm-slot-damage+1');
    expect(upgraded.onDestroyPermanentShield).toBe(2);
    expect(upgraded.value).toBe(2);
    expect(upgraded.maxDurability).toBe(3);
    expect(upgraded.durability).toBe(3);
    expect(upgraded.description).toBe('入场：该装备栏永久攻击 +1。遗言：该装备栏永久护甲 +2。');
    expect(upgraded.shortDescription).toBe('入场本栏永久 +1 攻；遗言本栏永久 +2 护');
  });

  it('L1 → L2: onEquipEffect → perm-slot-damage+2, onDestroyPermanentShield stays 2', () => {
    const card = {
      ...exchangeBladeL0(),
      upgradeLevel: 1,
      onDestroyPermanentShield: 2,
      description: '入场：该装备栏永久攻击 +1。遗言：该装备栏永久护甲 +2。',
      shortDescription: '入场本栏永久 +1 攻；遗言本栏永久 +2 护',
    };
    const state = makeState({ handCards: [card as any] });
    const result = reduce(state, { type: 'UPGRADE_CARD', cardId: card.id });
    const upgraded = result.state.handCards[0] as any;
    expect(upgraded.upgradeLevel).toBe(2);
    expect(upgraded.onEquipEffect).toBe('perm-slot-damage+2');
    expect(upgraded.onDestroyPermanentShield).toBe(2);
    expect(upgraded.value).toBe(2);
    expect(upgraded.maxDurability).toBe(3);
    expect(upgraded.description).toBe('入场：该装备栏永久攻击 +2。遗言：该装备栏永久护甲 +2。');
    expect(upgraded.shortDescription).toBe('入场本栏永久 +2 攻；遗言本栏永久 +2 护');
  });

  it('L0 → L1 → L2 chained: end state is +2 / +2', () => {
    const card = exchangeBladeL0();
    let state = makeState({ handCards: [card] });
    state = reduce(state, { type: 'UPGRADE_CARD', cardId: card.id }).state;
    state = reduce(state, { type: 'UPGRADE_CARD', cardId: card.id }).state;
    const upgraded = state.handCards[0] as any;
    expect(upgraded.upgradeLevel).toBe(2);
    expect(upgraded.onEquipEffect).toBe('perm-slot-damage+2');
    expect(upgraded.onDestroyPermanentShield).toBe(2);
  });

  it('cannot upgrade past maxUpgradeLevel (2)', () => {
    const card = {
      ...exchangeBladeL0(),
      upgradeLevel: 2,
      onEquipEffect: 'perm-slot-damage+2',
      onDestroyPermanentShield: 2,
    };
    const state = makeState({ handCards: [card as any] });
    const result = reduce(state, { type: 'UPGRADE_CARD', cardId: card.id });
    const upgraded = result.state.handCards[0] as any;
    expect(upgraded.upgradeLevel).toBe(2);
    expect(upgraded.onEquipEffect).toBe('perm-slot-damage+2');
    expect(upgraded.onDestroyPermanentShield).toBe(2);
  });
});

describe('Rage Cleave (怒斩之刃) upgrade handler', () => {
  function rageCleaveL0(): GameCardData {
    return {
      id: 'knight-rage-cleave-1',
      type: 'weapon',
      name: '怒斩之刃',
      value: 4,
      image: '',
      classCard: true,
      description: '该武器每回合可攻击 2 次（攻击次数 +1）。每次攻击时，所有怪物攻击力 -2。',
      shortDescription: '每回合攻击 2 次；每次攻击全场怪物 -2 攻',
      durability: 3,
      maxDurability: 3,
      weaponExtraAttack: 1,
      onAttackDebuffAllMonsterAttack: 2,
      knightEffect: 'rage-cleave',
      maxUpgradeLevel: 2,
      upgradeLevel: 0,
    } as any;
  }

  it('L0 → L1: weaponExtraAttack stays 1, debuff 2 → 3', () => {
    const card = rageCleaveL0();
    const state = makeState({ handCards: [card] });
    const result = reduce(state, { type: 'UPGRADE_CARD', cardId: card.id });
    const upgraded = result.state.handCards[0] as any;
    expect(upgraded.upgradeLevel).toBe(1);
    expect(upgraded.weaponExtraAttack).toBe(1);
    expect(upgraded.onAttackDebuffAllMonsterAttack).toBe(3);
    expect(upgraded.value).toBe(4);
    expect(upgraded.maxDurability).toBe(3);
    expect(upgraded.description).toBe(
      '该武器每回合可攻击 2 次（攻击次数 +1）。每次攻击时，所有怪物攻击力 -3。',
    );
    expect(upgraded.shortDescription).toBe('每回合攻击 2 次；每次攻击全场怪物 -3 攻');
  });

  it('L1 → L2: weaponExtraAttack 1 → 2 (3 attacks/turn), debuff stays 3', () => {
    const card = {
      ...rageCleaveL0(),
      upgradeLevel: 1,
      onAttackDebuffAllMonsterAttack: 3,
      description: '该武器每回合可攻击 2 次（攻击次数 +1）。每次攻击时，所有怪物攻击力 -3。',
      shortDescription: '每回合攻击 2 次；每次攻击全场怪物 -3 攻',
    };
    const state = makeState({ handCards: [card as any] });
    const result = reduce(state, { type: 'UPGRADE_CARD', cardId: card.id });
    const upgraded = result.state.handCards[0] as any;
    expect(upgraded.upgradeLevel).toBe(2);
    expect(upgraded.weaponExtraAttack).toBe(2);
    expect(upgraded.onAttackDebuffAllMonsterAttack).toBe(3);
    expect(upgraded.description).toBe(
      '该武器每回合可攻击 3 次（攻击次数 +2）。每次攻击时，所有怪物攻击力 -3。',
    );
    expect(upgraded.shortDescription).toBe('每回合攻击 3 次；每次攻击全场怪物 -3 攻');
  });

  it('L0 → L1 → L2 chained: end state is 3 attacks/turn, -3 debuff', () => {
    const card = rageCleaveL0();
    let state = makeState({ handCards: [card] });
    state = reduce(state, { type: 'UPGRADE_CARD', cardId: card.id }).state;
    state = reduce(state, { type: 'UPGRADE_CARD', cardId: card.id }).state;
    const upgraded = state.handCards[0] as any;
    expect(upgraded.upgradeLevel).toBe(2);
    expect(upgraded.weaponExtraAttack).toBe(2);
    expect(upgraded.onAttackDebuffAllMonsterAttack).toBe(3);
  });

  it('cannot upgrade past maxUpgradeLevel (2)', () => {
    const card = {
      ...rageCleaveL0(),
      upgradeLevel: 2,
      weaponExtraAttack: 2,
      onAttackDebuffAllMonsterAttack: 3,
    };
    const state = makeState({ handCards: [card as any] });
    const result = reduce(state, { type: 'UPGRADE_CARD', cardId: card.id });
    const upgraded = result.state.handCards[0] as any;
    expect(upgraded.upgradeLevel).toBe(2);
    expect(upgraded.weaponExtraAttack).toBe(2);
    expect(upgraded.onAttackDebuffAllMonsterAttack).toBe(3);
  });
});

describe('Resonance Blade (共鸣之刃) upgrade handler', () => {
  function resonanceBladeL0(): GameCardData {
    return {
      id: 'knight-resonance-blade-1',
      type: 'weapon',
      name: '共鸣之刃',
      value: 4,
      image: '',
      classCard: true,
      description: '每次攻击时，给另一个装备栏 +2 临时攻击，并恢复其装备 1 点耐久。',
      shortDescription: '每次攻击：另一栏 +2 临时攻 +1 耐久',
      onAttackBuffOtherSlotTempAttack: 2,
      onAttackRepairOtherSlot: 1,
      durability: 2,
      maxDurability: 2,
      knightEffect: 'resonance-blade',
      maxUpgradeLevel: 2,
      upgradeLevel: 0,
    } as any;
  }

  it('L0 → L1: value stays 4, maxDurability 2 → 3, effects unchanged (+2 temp atk)', () => {
    const card = resonanceBladeL0();
    const state = makeState({ handCards: [card] });
    const result = reduce(state, { type: 'UPGRADE_CARD', cardId: card.id });
    const upgraded = result.state.handCards[0] as any;
    expect(upgraded.upgradeLevel).toBe(1);
    expect(upgraded.value).toBe(4);
    expect(upgraded.maxDurability).toBe(3);
    expect(upgraded.durability).toBe(3);
    expect(upgraded.onAttackBuffOtherSlotTempAttack).toBe(2);
    expect(upgraded.onAttackRepairOtherSlot).toBe(1);
    expect(upgraded.description).toBe(
      '每次攻击时，给另一个装备栏 +2 临时攻击，并恢复其装备 1 点耐久。',
    );
  });

  it('L1 → L2: value/durability stay (4 / 3), onAttackBuffOtherSlotTempAttack 2 → 4', () => {
    const card = {
      ...resonanceBladeL0(),
      upgradeLevel: 1,
      durability: 3,
      maxDurability: 3,
    };
    const state = makeState({ handCards: [card as any] });
    const result = reduce(state, { type: 'UPGRADE_CARD', cardId: card.id });
    const upgraded = result.state.handCards[0] as any;
    expect(upgraded.upgradeLevel).toBe(2);
    expect(upgraded.value).toBe(4);
    expect(upgraded.maxDurability).toBe(3);
    expect(upgraded.durability).toBe(3);
    expect(upgraded.onAttackBuffOtherSlotTempAttack).toBe(4);
    expect(upgraded.onAttackRepairOtherSlot).toBe(1);
    expect(upgraded.description).toBe(
      '每次攻击时，给另一个装备栏 +4 临时攻击，并恢复其装备 1 点耐久。',
    );
    expect(upgraded.shortDescription).toBe('每次攻击：另一栏 +4 临时攻 +1 耐久');
  });

  it('upgrade preserves "broken amount": L0 with 1/2 → L1 becomes 2/3', () => {
    const card = { ...resonanceBladeL0(), durability: 1, maxDurability: 2 };
    const state = makeState({ handCards: [card as any] });
    const result = reduce(state, { type: 'UPGRADE_CARD', cardId: card.id });
    const upgraded = result.state.handCards[0] as any;
    expect(upgraded.maxDurability).toBe(3);
    expect(upgraded.durability).toBe(2);
  });

  it('L0 → L1 → L2 chained: end state is 4 attack, 3/3, +4 temp atk', () => {
    const card = resonanceBladeL0();
    let state = makeState({ handCards: [card] });
    state = reduce(state, { type: 'UPGRADE_CARD', cardId: card.id }).state;
    state = reduce(state, { type: 'UPGRADE_CARD', cardId: card.id }).state;
    const upgraded = state.handCards[0] as any;
    expect(upgraded.upgradeLevel).toBe(2);
    expect(upgraded.value).toBe(4);
    expect(upgraded.maxDurability).toBe(3);
    expect(upgraded.durability).toBe(3);
    expect(upgraded.onAttackBuffOtherSlotTempAttack).toBe(4);
    expect(upgraded.onAttackRepairOtherSlot).toBe(1);
  });

  it('cannot upgrade past maxUpgradeLevel (2)', () => {
    const card = {
      ...resonanceBladeL0(),
      upgradeLevel: 2,
      durability: 3,
      maxDurability: 3,
      onAttackBuffOtherSlotTempAttack: 4,
    };
    const state = makeState({ handCards: [card as any] });
    const result = reduce(state, { type: 'UPGRADE_CARD', cardId: card.id });
    const upgraded = result.state.handCards[0] as any;
    expect(upgraded.upgradeLevel).toBe(2);
    expect(upgraded.onAttackBuffOtherSlotTempAttack).toBe(4);
  });
});

describe('Growth Blade (生长之刃) upgrade handler', () => {
  function growthBladeL0(): GameCardData {
    return {
      id: 'knight-growth-blade-1',
      type: 'weapon',
      name: '生长之刃',
      value: 1,
      image: '',
      classCard: true,
      description: '上手：该武器增幅一次（攻击 +1，按卡名累计；所有同名「生长之刃」共享）。',
      shortDescription: '上手 +1 攻击（按卡名累计）',
      durability: 3,
      maxDurability: 3,
      onEnterHandEffect: 'growth-blade-onhand',
      knightEffect: 'growth-blade',
      maxUpgradeLevel: 2,
      upgradeLevel: 0,
    } as any;
  }

  it('L0 → L1: value stays 1, maxDurability 3 → 4, onEnterHandEffect unchanged', () => {
    const card = growthBladeL0();
    const state = makeState({ handCards: [card] });
    const result = reduce(state, { type: 'UPGRADE_CARD', cardId: card.id });
    const upgraded = result.state.handCards[0] as any;
    expect(upgraded.upgradeLevel).toBe(1);
    expect(upgraded.value).toBe(1);
    expect(upgraded.maxDurability).toBe(4);
    expect(upgraded.durability).toBe(4);
    expect(upgraded.onEnterHandEffect).toBe('growth-blade-onhand');
    expect(upgraded.description).toContain('增幅一次（攻击 +1');
    expect(upgraded.shortDescription).toBe('上手 +1 攻击（按卡名累计）');
  });

  it('L1 → L2: value/durability stay (1 / 4), onEnterHandEffect → growth-blade-onhand-x2', () => {
    const card = {
      ...growthBladeL0(),
      upgradeLevel: 1,
      durability: 4,
      maxDurability: 4,
    };
    const state = makeState({ handCards: [card as any] });
    const result = reduce(state, { type: 'UPGRADE_CARD', cardId: card.id });
    const upgraded = result.state.handCards[0] as any;
    expect(upgraded.upgradeLevel).toBe(2);
    expect(upgraded.value).toBe(1);
    expect(upgraded.maxDurability).toBe(4);
    expect(upgraded.durability).toBe(4);
    expect(upgraded.onEnterHandEffect).toBe('growth-blade-onhand-x2');
    expect(upgraded.description).toContain('增幅两次（攻击 +2');
    expect(upgraded.shortDescription).toBe('上手 +2 攻击（按卡名累计）');
  });

  it('upgrade preserves "broken amount": L0 with 2/3 → L1 becomes 3/4', () => {
    const card = { ...growthBladeL0(), durability: 2, maxDurability: 3 };
    const state = makeState({ handCards: [card as any] });
    const result = reduce(state, { type: 'UPGRADE_CARD', cardId: card.id });
    const upgraded = result.state.handCards[0] as any;
    expect(upgraded.maxDurability).toBe(4);
    expect(upgraded.durability).toBe(3);
  });

  it('L0 → L1 → L2 chained: end state is 1 attack, 4/4, growth-blade-onhand-x2', () => {
    const card = growthBladeL0();
    let state = makeState({ handCards: [card] });
    state = reduce(state, { type: 'UPGRADE_CARD', cardId: card.id }).state;
    state = reduce(state, { type: 'UPGRADE_CARD', cardId: card.id }).state;
    const upgraded = state.handCards[0] as any;
    expect(upgraded.upgradeLevel).toBe(2);
    expect(upgraded.value).toBe(1);
    expect(upgraded.maxDurability).toBe(4);
    expect(upgraded.durability).toBe(4);
    expect(upgraded.onEnterHandEffect).toBe('growth-blade-onhand-x2');
  });

  it('cannot upgrade past maxUpgradeLevel (2)', () => {
    const card = {
      ...growthBladeL0(),
      upgradeLevel: 2,
      durability: 4,
      maxDurability: 4,
      onEnterHandEffect: 'growth-blade-onhand-x2',
    };
    const state = makeState({ handCards: [card as any] });
    const result = reduce(state, { type: 'UPGRADE_CARD', cardId: card.id });
    const upgraded = result.state.handCards[0] as any;
    expect(upgraded.upgradeLevel).toBe(2);
    expect(upgraded.onEnterHandEffect).toBe('growth-blade-onhand-x2');
  });
});

describe('Magic Missile Crossbow (魔弹连弩) upgrade handler', () => {
  function magicMissileCrossbowL0(): GameCardData {
    return {
      id: 'knight-mb-1',
      type: 'weapon',
      name: '魔弹连弩',
      value: 1,
      image: '',
      classCard: true,
      description: '超杀：所有「魔弹」获得 +1 增幅，并将一张同步增幅的「魔弹」加入背包。',
      shortDescription: '超杀：所有魔弹 +1 增幅；背包 +1 张魔弹',
      durability: 3,
      maxDurability: 3,
      onAttackAmplifyMissileGenerate: true,
      knightEffect: 'magic-missile-crossbow',
      maxUpgradeLevel: 2,
      upgradeLevel: 0,
    } as any;
  }

  it('L0 → L1: value 1 → 3, durability stays 3/3, bolt count stays 1', () => {
    const card = magicMissileCrossbowL0();
    const state = makeState({ handCards: [card] });
    const result = reduce(state, { type: 'UPGRADE_CARD', cardId: card.id });
    const upgraded = result.state.handCards[0] as any;
    expect(upgraded.upgradeLevel).toBe(1);
    expect(upgraded.value).toBe(3);
    expect(upgraded.maxDurability).toBe(3);
    expect(upgraded.durability).toBe(3);
    expect(upgraded.onAttackAmplifyMissileGenerate).toBe(true);
    expect(upgraded.onAttackAmplifyMissileGenerateCount).toBeUndefined();
    expect(upgraded.description).toContain('一张');
  });

  it('L1 → L2: value/durability stay (3 / 3), onAttackAmplifyMissileGenerateCount 1 → 2', () => {
    const card = {
      ...magicMissileCrossbowL0(),
      upgradeLevel: 1,
      value: 3,
    };
    const state = makeState({ handCards: [card as any] });
    const result = reduce(state, { type: 'UPGRADE_CARD', cardId: card.id });
    const upgraded = result.state.handCards[0] as any;
    expect(upgraded.upgradeLevel).toBe(2);
    expect(upgraded.value).toBe(3);
    expect(upgraded.maxDurability).toBe(3);
    expect(upgraded.durability).toBe(3);
    expect(upgraded.onAttackAmplifyMissileGenerate).toBe(true);
    expect(upgraded.onAttackAmplifyMissileGenerateCount).toBe(2);
    expect(upgraded.description).toContain('两张');
    expect(upgraded.shortDescription).toContain('+2 张');
  });

  it('L0 → L1 → L2 chained: end state is 3 attack, 3/3, bolt count 2', () => {
    const card = magicMissileCrossbowL0();
    let state = makeState({ handCards: [card] });
    state = reduce(state, { type: 'UPGRADE_CARD', cardId: card.id }).state;
    state = reduce(state, { type: 'UPGRADE_CARD', cardId: card.id }).state;
    const upgraded = state.handCards[0] as any;
    expect(upgraded.upgradeLevel).toBe(2);
    expect(upgraded.value).toBe(3);
    expect(upgraded.onAttackAmplifyMissileGenerateCount).toBe(2);
  });

  it('cannot upgrade past maxUpgradeLevel (2)', () => {
    const card = {
      ...magicMissileCrossbowL0(),
      upgradeLevel: 2,
      value: 3,
      onAttackAmplifyMissileGenerateCount: 2,
    };
    const state = makeState({ handCards: [card as any] });
    const result = reduce(state, { type: 'UPGRADE_CARD', cardId: card.id });
    const upgraded = result.state.handCards[0] as any;
    expect(upgraded.upgradeLevel).toBe(2);
    expect(upgraded.onAttackAmplifyMissileGenerateCount).toBe(2);
  });
});

describe('Guardian Shield (守护圣盾) upgrade handler', () => {
  function guardianShieldL0(over: Partial<GameCardData> = {}): GameCardData {
    return {
      id: 'knight-guardian-shield-1',
      type: 'shield',
      name: '守护圣盾',
      value: 3,
      image: '',
      classCard: true,
      description: '完美格挡时（攻击≤护甲值），50% 概率本次格挡不消耗护甲值（掷骰判定）。',
      shortDescription: '完美格挡时 50% 不耗护甲值',
      shieldPerfectBlockArmorSaveChance: 50,
      durability: 2,
      maxDurability: 2,
      armorMax: 3,
      knightEffect: 'guardian-shield',
      maxUpgradeLevel: 2,
      upgradeLevel: 0,
      ...over,
    } as any;
  }

  it('routes 守护圣盾 to knight:guardian-shield', () => {
    expect(resolveUpgradeEffectId(guardianShieldL0())).toBe('knight:guardian-shield');
  });

  it('L0 → L1: value/armorMax 3 → 4, durability 2/2 → 3/3, save chance stays 50', () => {
    const card = guardianShieldL0();
    const state = makeState({ handCards: [card] });
    const result = reduce(state, { type: 'UPGRADE_CARD', cardId: card.id });
    const upgraded = result.state.handCards[0] as any;
    expect(upgraded.upgradeLevel).toBe(1);
    expect(upgraded.value).toBe(4);
    expect(upgraded.armorMax).toBe(4);
    expect(upgraded.durability).toBe(3);
    expect(upgraded.maxDurability).toBe(3);
    expect(upgraded.shieldPerfectBlockArmorSaveChance).toBe(50);
    expect(upgraded.armor).toBeUndefined();
    expect(upgraded.description).toContain('50%');
  });

  it('L0 → L1 preserves broken amount (durability 1/2 → 2/3)', () => {
    const card = guardianShieldL0({ durability: 1 });
    const state = makeState({ handCards: [card] });
    const result = reduce(state, { type: 'UPGRADE_CARD', cardId: card.id });
    const upgraded = result.state.handCards[0] as any;
    expect(upgraded.maxDurability).toBe(3);
    expect(upgraded.durability).toBe(2);
  });

  it('L1 → L2: value/durability stay (4 / 3), save chance 50 → 60', () => {
    const card = guardianShieldL0({
      upgradeLevel: 1,
      value: 4,
      armorMax: 4,
      durability: 3,
      maxDurability: 3,
    });
    const state = makeState({ handCards: [card] });
    const result = reduce(state, { type: 'UPGRADE_CARD', cardId: card.id });
    const upgraded = result.state.handCards[0] as any;
    expect(upgraded.upgradeLevel).toBe(2);
    expect(upgraded.value).toBe(4);
    expect(upgraded.armorMax).toBe(4);
    expect(upgraded.durability).toBe(3);
    expect(upgraded.maxDurability).toBe(3);
    expect(upgraded.shieldPerfectBlockArmorSaveChance).toBe(60);
    expect(upgraded.description).toContain('60%');
    expect(upgraded.shortDescription).toContain('60%');
  });

  it('L0 → L1 → L2 chained: end state is 4 armor, 3/3, 60% save chance', () => {
    const card = guardianShieldL0();
    let state = makeState({ handCards: [card] });
    state = reduce(state, { type: 'UPGRADE_CARD', cardId: card.id }).state;
    state = reduce(state, { type: 'UPGRADE_CARD', cardId: card.id }).state;
    const upgraded = state.handCards[0] as any;
    expect(upgraded.upgradeLevel).toBe(2);
    expect(upgraded.value).toBe(4);
    expect(upgraded.armorMax).toBe(4);
    expect(upgraded.durability).toBe(3);
    expect(upgraded.maxDurability).toBe(3);
    expect(upgraded.shieldPerfectBlockArmorSaveChance).toBe(60);
  });

  it('cannot upgrade past maxUpgradeLevel (2)', () => {
    const card = guardianShieldL0({
      upgradeLevel: 2,
      value: 4,
      armorMax: 4,
      durability: 3,
      maxDurability: 3,
      shieldPerfectBlockArmorSaveChance: 60,
    });
    const state = makeState({ handCards: [card] });
    const result = reduce(state, { type: 'UPGRADE_CARD', cardId: card.id });
    const upgraded = result.state.handCards[0] as any;
    expect(upgraded.upgradeLevel).toBe(2);
    expect(upgraded.shieldPerfectBlockArmorSaveChance).toBe(60);
  });
});

describe('Thorned Shield (棘刺反盾) upgrade handler', () => {
  function thornedShieldL0(over: Partial<GameCardData> = {}): GameCardData {
    return {
      id: 'knight-thorned-shield-1',
      type: 'shield',
      name: '棘刺反盾',
      value: 4,
      image: '',
      classCard: true,
      description: '格挡时反弹一半的攻击伤害给攻击者（向上取整），并加上该装备栏的永久攻击和临时攻击。',
      shortDescription: '格挡时反弹一半伤害+本栏攻击',
      reflectHalfDamage: true,
      durability: 2,
      maxDurability: 2,
      armorMax: 4,
      knightEffect: 'thorned-shield',
      maxUpgradeLevel: 2,
      upgradeLevel: 0,
      ...over,
    } as any;
  }

  it('routes 棘刺反盾 to knight:thorned-shield', () => {
    expect(resolveUpgradeEffectId(thornedShieldL0())).toBe('knight:thorned-shield');
  });

  it('L0 → L1: durability 2/2 → 3/3, armor stays 4, effect stays half-reflect', () => {
    const card = thornedShieldL0();
    const state = makeState({ handCards: [card] });
    const result = reduce(state, { type: 'UPGRADE_CARD', cardId: card.id });
    const upgraded = result.state.handCards[0] as any;
    expect(upgraded.upgradeLevel).toBe(1);
    expect(upgraded.value).toBe(4);
    expect(upgraded.armorMax).toBe(4);
    expect(upgraded.durability).toBe(3);
    expect(upgraded.maxDurability).toBe(3);
    expect(upgraded.reflectHalfDamage).toBe(true);
    expect(upgraded.reflectFullDamage).toBeUndefined();
    expect(upgraded.description).toContain('一半');
  });

  it('L0 → L1 preserves broken amount (durability 1/2 → 2/3)', () => {
    const card = thornedShieldL0({ durability: 1 });
    const state = makeState({ handCards: [card] });
    const result = reduce(state, { type: 'UPGRADE_CARD', cardId: card.id });
    const upgraded = result.state.handCards[0] as any;
    expect(upgraded.maxDurability).toBe(3);
    expect(upgraded.durability).toBe(2);
  });

  it('L1 → L2: durability stays 3/3, armor stays 4, reflectHalfDamage → reflectFullDamage', () => {
    const card = thornedShieldL0({ upgradeLevel: 1, durability: 3, maxDurability: 3 });
    const state = makeState({ handCards: [card] });
    const result = reduce(state, { type: 'UPGRADE_CARD', cardId: card.id });
    const upgraded = result.state.handCards[0] as any;
    expect(upgraded.upgradeLevel).toBe(2);
    expect(upgraded.value).toBe(4);
    expect(upgraded.armorMax).toBe(4);
    expect(upgraded.durability).toBe(3);
    expect(upgraded.maxDurability).toBe(3);
    expect(upgraded.reflectHalfDamage).toBeUndefined();
    expect(upgraded.reflectFullDamage).toBe(true);
    expect(upgraded.description).toContain('全部');
    expect(upgraded.description).not.toContain('一半');
    expect(upgraded.shortDescription).toContain('全部');
  });

  it('L0 → L1 → L2 chained: end state is 4 armor, 3/3, reflectFullDamage', () => {
    const card = thornedShieldL0();
    let state = makeState({ handCards: [card] });
    state = reduce(state, { type: 'UPGRADE_CARD', cardId: card.id }).state;
    state = reduce(state, { type: 'UPGRADE_CARD', cardId: card.id }).state;
    const upgraded = state.handCards[0] as any;
    expect(upgraded.upgradeLevel).toBe(2);
    expect(upgraded.value).toBe(4);
    expect(upgraded.armorMax).toBe(4);
    expect(upgraded.durability).toBe(3);
    expect(upgraded.maxDurability).toBe(3);
    expect(upgraded.reflectFullDamage).toBe(true);
    expect(upgraded.reflectHalfDamage).toBeUndefined();
  });

  it('cannot upgrade past maxUpgradeLevel (2)', () => {
    const card = thornedShieldL0({
      upgradeLevel: 2,
      durability: 3,
      maxDurability: 3,
      reflectHalfDamage: undefined,
      reflectFullDamage: true,
    } as any);
    const state = makeState({ handCards: [card] });
    const result = reduce(state, { type: 'UPGRADE_CARD', cardId: card.id });
    const upgraded = result.state.handCards[0] as any;
    expect(upgraded.upgradeLevel).toBe(2);
    expect(upgraded.reflectFullDamage).toBe(true);
  });
});

describe('Iron Tower Shield (铁壁塔盾) upgrade handler', () => {
  function ironTowerL0(): GameCardData {
    return {
      id: 'knight-iron-tower-1',
      type: 'shield',
      name: '铁壁塔盾',
      value: 5,
      image: '',
      classCard: true,
      description: '完全格挡一次攻击的全部伤害，无论攻击力多高。损毁后进入回收袋。',
      shortDescription: '完全格挡一次攻击的全部伤害',
      durability: 1,
      maxDurability: 1,
      armorMax: 5,
      permEquipment: true,
      knightEffect: 'fullBlock',
      maxUpgradeLevel: 2,
      upgradeLevel: 0,
    } as any;
  }

  it('L0 → L1: value/armorMax 5 → 8, durability stays 1/1, no extra blocks', () => {
    const card = ironTowerL0();
    const state = makeState({ handCards: [card] });
    const result = reduce(state, { type: 'UPGRADE_CARD', cardId: card.id });
    const upgraded = result.state.handCards[0] as any;
    expect(upgraded.upgradeLevel).toBe(1);
    expect(upgraded.value).toBe(8);
    expect(upgraded.armorMax).toBe(8);
    expect(upgraded.maxDurability).toBe(1);
    expect(upgraded.durability).toBe(1);
    expect(upgraded.permEquipment).toBe(true);
    expect(upgraded.knightEffect).toBe('fullBlock');
    expect(upgraded.shieldExtraBlocksPerDurability).toBeUndefined();
    expect(upgraded.armor).toBeUndefined();
    expect(upgraded.description).toContain('一次');
  });

  it('L1 → L2: value/durability stay (8 / 1), shieldExtraBlocksPerDurability 0 → 1', () => {
    const card = {
      ...ironTowerL0(),
      upgradeLevel: 1,
      value: 8,
      armorMax: 8,
    };
    const state = makeState({ handCards: [card as any] });
    const result = reduce(state, { type: 'UPGRADE_CARD', cardId: card.id });
    const upgraded = result.state.handCards[0] as any;
    expect(upgraded.upgradeLevel).toBe(2);
    expect(upgraded.value).toBe(8);
    expect(upgraded.armorMax).toBe(8);
    expect(upgraded.maxDurability).toBe(1);
    expect(upgraded.durability).toBe(1);
    expect(upgraded.permEquipment).toBe(true);
    expect(upgraded.shieldExtraBlocksPerDurability).toBe(1);
    expect(upgraded._shieldDurabilityBlockCounter).toBe(0);
    expect(upgraded.description).toContain('两次');
    expect(upgraded.shortDescription).toContain('两次');
  });

  it('L0 → L1 → L2 chained: end state is 8 armor, 1/1, +1 extra block, perm', () => {
    const card = ironTowerL0();
    let state = makeState({ handCards: [card] });
    state = reduce(state, { type: 'UPGRADE_CARD', cardId: card.id }).state;
    state = reduce(state, { type: 'UPGRADE_CARD', cardId: card.id }).state;
    const upgraded = state.handCards[0] as any;
    expect(upgraded.upgradeLevel).toBe(2);
    expect(upgraded.value).toBe(8);
    expect(upgraded.armorMax).toBe(8);
    expect(upgraded.shieldExtraBlocksPerDurability).toBe(1);
    expect(upgraded.permEquipment).toBe(true);
  });

  it('cannot upgrade past maxUpgradeLevel (2)', () => {
    const card = {
      ...ironTowerL0(),
      upgradeLevel: 2,
      value: 8,
      armorMax: 8,
      shieldExtraBlocksPerDurability: 1,
    };
    const state = makeState({ handCards: [card as any] });
    const result = reduce(state, { type: 'UPGRADE_CARD', cardId: card.id });
    const upgraded = result.state.handCards[0] as any;
    expect(upgraded.upgradeLevel).toBe(2);
    expect(upgraded.shieldExtraBlocksPerDurability).toBe(1);
  });
});

describe('Revive Bone Shield (不朽骨盾) upgrade handler', () => {
  function reviveBoneShieldL0(over: Partial<GameCardData> = {}): GameCardData {
    return {
      id: 'knight-revive-bone-shield-1',
      type: 'shield',
      name: '不朽骨盾',
      value: 3,
      image: '',
      classCard: true,
      description: '复生（首次摧毁恢复 1 耐久）。遗言:该装备栏永久伤害 +1。',
      shortDescription: '复生 1 次;遗言:本栏永久 +1 伤害',
      hasEquipmentRevive: true,
      onDestroyPermanentDamage: 1,
      durability: 2,
      maxDurability: 2,
      armorMax: 3,
      knightEffect: 'revive-bone-shield',
      maxUpgradeLevel: 1,
      upgradeLevel: 0,
      ...over,
    } as any;
  }

  it('routes 不朽骨盾 to knight:revive-bone-shield', () => {
    expect(resolveUpgradeEffectId(reviveBoneShieldL0())).toBe('knight:revive-bone-shield');
  });

  it('L0 → L1: onDestroyPermanentDamage 1 → 2; armor/durability/revive unchanged', () => {
    const card = reviveBoneShieldL0();
    const state = makeState({ handCards: [card] });
    const result = reduce(state, { type: 'UPGRADE_CARD', cardId: card.id });
    const upgraded = result.state.handCards[0] as any;
    expect(upgraded.upgradeLevel).toBe(1);
    expect(upgraded.onDestroyPermanentDamage).toBe(2);
    expect(upgraded.value).toBe(3);
    expect(upgraded.armorMax).toBe(3);
    expect(upgraded.durability).toBe(2);
    expect(upgraded.maxDurability).toBe(2);
    expect(upgraded.hasEquipmentRevive).toBe(true);
    expect(upgraded.description).toContain('+2');
    expect(upgraded.shortDescription).toContain('+2');
  });

  it('cannot upgrade past maxUpgradeLevel (1)', () => {
    const card = reviveBoneShieldL0({
      upgradeLevel: 1,
      onDestroyPermanentDamage: 2,
      description: '复生（首次摧毁恢复 1 耐久）。遗言:该装备栏永久伤害 +2。',
    });
    const state = makeState({ handCards: [card] });
    const result = reduce(state, { type: 'UPGRADE_CARD', cardId: card.id });
    const upgraded = result.state.handCards[0] as any;
    expect(upgraded.upgradeLevel).toBe(1);
    expect(upgraded.onDestroyPermanentDamage).toBe(2);
  });
});

describe('Evolving Shield (进化甲壁) upgrade handler', () => {
  function evolvingShieldL0(over: Partial<GameCardData> = {}): GameCardData {
    return {
      id: 'knight-evolving-shield-1',
      type: 'shield',
      name: '进化甲壁',
      value: 3,
      image: '',
      classCard: true,
      description: '格挡 4 次后自动升级（护甲 +2、耐久 +1、耐久上限 +1）。',
      shortDescription: '格挡 4 次后自动升级',
      shieldBlockAutoUpgradeCount: 4,
      durability: 2,
      maxDurability: 2,
      armorMax: 3,
      knightEffect: 'evolving-shield',
      maxUpgradeLevel: 2,
      upgradeLevel: 0,
      ...over,
    } as any;
  }

  it('routes 进化甲壁 to knight:evolving-shield', () => {
    expect(resolveUpgradeEffectId(evolvingShieldL0())).toBe('knight:evolving-shield');
  });

  it('L0 → L1: armor 3 → 5, durability 2/2 → 3/3, _shieldBlockCount → 0, current armor preserve+delta', () => {
    // armor field 走 preserve+delta：fixture armor=1 + delta +2 = 3（clamp 到新 cap 5 内）。
    // 与旧 strip+refill 行为的区别：旧实现把 armor 字段删除让下次读取按 cap 5 刷满；
    // 新实现保留战斗扣损状态，下次读取按当前 armor=3 算（保留 2 点扣损）。
    const card = evolvingShieldL0({ _shieldBlockCount: 2, armor: 1 } as any);
    const state = makeState({ handCards: [card] });
    const result = reduce(state, { type: 'UPGRADE_CARD', cardId: card.id });
    const upgraded = result.state.handCards[0] as any;
    expect(upgraded.upgradeLevel).toBe(1);
    expect(upgraded.value).toBe(5);
    expect(upgraded.armorMax).toBe(5);
    expect(upgraded.durability).toBe(3);
    expect(upgraded.maxDurability).toBe(3);
    expect(upgraded._shieldBlockCount).toBe(0);
    expect(upgraded.armor).toBe(3);
    expect(upgraded.shieldBlockAutoUpgradeCount).toBe(4); // auto-evolve still active
  });

  it('L0 → L1 preserves broken amount (durability 1/2 → 2/3)', () => {
    const card = evolvingShieldL0({ durability: 1 });
    const state = makeState({ handCards: [card] });
    const result = reduce(state, { type: 'UPGRADE_CARD', cardId: card.id });
    const upgraded = result.state.handCards[0] as any;
    expect(upgraded.maxDurability).toBe(3);
    expect(upgraded.durability).toBe(2);
  });

  it('L1 → L2: armor 5 → 7, durability 3/3 → 4/4 (hits DURABILITY_CAP)', () => {
    const card = evolvingShieldL0({
      upgradeLevel: 1,
      value: 5,
      armorMax: 5,
      durability: 3,
      maxDurability: 3,
    });
    const state = makeState({ handCards: [card] });
    const result = reduce(state, { type: 'UPGRADE_CARD', cardId: card.id });
    const upgraded = result.state.handCards[0] as any;
    expect(upgraded.upgradeLevel).toBe(2);
    expect(upgraded.value).toBe(7);
    expect(upgraded.armorMax).toBe(7);
    expect(upgraded.durability).toBe(4);
    expect(upgraded.maxDurability).toBe(4);
    expect(upgraded._shieldBlockCount).toBe(0);
  });

  it('L0 → L1 → L2 chained: end state is 7 armor, 4/4, auto-evolve still active', () => {
    const card = evolvingShieldL0();
    let state = makeState({ handCards: [card] });
    state = reduce(state, { type: 'UPGRADE_CARD', cardId: card.id }).state;
    state = reduce(state, { type: 'UPGRADE_CARD', cardId: card.id }).state;
    const upgraded = state.handCards[0] as any;
    expect(upgraded.upgradeLevel).toBe(2);
    expect(upgraded.value).toBe(7);
    expect(upgraded.armorMax).toBe(7);
    expect(upgraded.durability).toBe(4);
    expect(upgraded.maxDurability).toBe(4);
    expect(upgraded.shieldBlockAutoUpgradeCount).toBe(4);
  });

  it('cannot upgrade past maxUpgradeLevel (2)', () => {
    const card = evolvingShieldL0({
      upgradeLevel: 2,
      value: 7,
      armorMax: 7,
      durability: 4,
      maxDurability: 4,
    });
    const state = makeState({ handCards: [card] });
    const result = reduce(state, { type: 'UPGRADE_CARD', cardId: card.id });
    const upgraded = result.state.handCards[0] as any;
    expect(upgraded.upgradeLevel).toBe(2);
    expect(upgraded.value).toBe(7);
    expect(upgraded.maxDurability).toBe(4);
  });
});

describe('Guardian Link Shield (守望者之盾) upgrade handler', () => {
  function guardianLinkShieldL0(over: Partial<GameCardData> = {}): GameCardData {
    return {
      id: 'knight-guardian-link-shield-1',
      type: 'shield',
      name: '守望者之盾',
      value: 4,
      image: '',
      classCard: true,
      description: '格挡时，另一个装备栏获得临时护甲（等同此盾护甲值）。',
      shortDescription: '格挡时另一栏 +临时护甲（＝本盾护甲）',
      blockGrantTempArmorToOther: true,
      durability: 2,
      maxDurability: 2,
      armorMax: 4,
      knightEffect: 'guardian-link-shield',
      maxUpgradeLevel: 2,
      upgradeLevel: 0,
      ...over,
    } as any;
  }

  it('routes 守望者之盾 to knight:guardian-link-shield', () => {
    expect(resolveUpgradeEffectId(guardianLinkShieldL0())).toBe('knight:guardian-link-shield');
  });

  it('L0 → L1: value/armorMax 4 → 5, durability 2/2 → 3/3, current armor preserve+delta', () => {
    // armor field 走 preserve+delta：fixture armor=2 + delta +1 = 3（clamp 到新 cap 5 内）。
    const card = guardianLinkShieldL0({ armor: 2 } as any);
    const state = makeState({ handCards: [card] });
    const result = reduce(state, { type: 'UPGRADE_CARD', cardId: card.id });
    const upgraded = result.state.handCards[0] as any;
    expect(upgraded.upgradeLevel).toBe(1);
    expect(upgraded.value).toBe(5);
    expect(upgraded.armorMax).toBe(5);
    expect(upgraded.durability).toBe(3);
    expect(upgraded.maxDurability).toBe(3);
    expect(upgraded.armor).toBe(3);
    expect(upgraded.blockGrantTempArmorToOther).toBe(true);
  });

  it('L0 → L1 preserves broken amount (durability 1/2 → 2/3)', () => {
    const card = guardianLinkShieldL0({ durability: 1 });
    const state = makeState({ handCards: [card] });
    const result = reduce(state, { type: 'UPGRADE_CARD', cardId: card.id });
    const upgraded = result.state.handCards[0] as any;
    expect(upgraded.maxDurability).toBe(3);
    expect(upgraded.durability).toBe(2);
  });

  it('L1 → L2: value/armorMax 5 → 8, durability 3/3 unchanged, blockGrantTempArmorToOther preserved', () => {
    const card = guardianLinkShieldL0({
      upgradeLevel: 1,
      value: 5,
      armorMax: 5,
      durability: 3,
      maxDurability: 3,
    });
    const state = makeState({ handCards: [card] });
    const result = reduce(state, { type: 'UPGRADE_CARD', cardId: card.id });
    const upgraded = result.state.handCards[0] as any;
    expect(upgraded.upgradeLevel).toBe(2);
    expect(upgraded.value).toBe(8);
    expect(upgraded.armorMax).toBe(8);
    expect(upgraded.durability).toBe(3);
    expect(upgraded.maxDurability).toBe(3);
    expect(upgraded.armor).toBeUndefined();
    expect(upgraded.blockGrantTempArmorToOther).toBe(true);
  });

  it('L0 → L1 → L2 chained: end state is 8 armor, 3/3, effect intact', () => {
    const card = guardianLinkShieldL0();
    let state = makeState({ handCards: [card] });
    state = reduce(state, { type: 'UPGRADE_CARD', cardId: card.id }).state;
    state = reduce(state, { type: 'UPGRADE_CARD', cardId: card.id }).state;
    const upgraded = state.handCards[0] as any;
    expect(upgraded.upgradeLevel).toBe(2);
    expect(upgraded.value).toBe(8);
    expect(upgraded.armorMax).toBe(8);
    expect(upgraded.durability).toBe(3);
    expect(upgraded.maxDurability).toBe(3);
    expect(upgraded.blockGrantTempArmorToOther).toBe(true);
  });

  it('cannot upgrade past maxUpgradeLevel (2)', () => {
    const card = guardianLinkShieldL0({
      upgradeLevel: 2,
      value: 8,
      armorMax: 8,
      durability: 3,
      maxDurability: 3,
    });
    const state = makeState({ handCards: [card] });
    const result = reduce(state, { type: 'UPGRADE_CARD', cardId: card.id });
    const upgraded = result.state.handCards[0] as any;
    expect(upgraded.upgradeLevel).toBe(2);
    expect(upgraded.value).toBe(8);
    expect(upgraded.maxDurability).toBe(3);
  });
});

describe('Shield Bash (猛击之盾) upgrade handler', () => {
  function shieldBashL0(over: Partial<GameCardData> = {}): GameCardData {
    return {
      id: 'knight-shield-bash-1',
      type: 'shield',
      name: '猛击之盾',
      value: 2,
      image: '',
      classCard: true,
      description: '可拖动到怪物上猛击（不造成伤害），5%×护甲值 概率击晕。每回合不限次数，有耐久即可使用。',
      shortDescription: '猛击：5%×护甲 概率击晕；每回合不限次数',
      durability: 4,
      maxDurability: 4,
      armorMax: 2,
      shieldBashStunRate: 5,
      shieldBashUnlimited: true,
      knightEffect: 'shield-bash',
      maxUpgradeLevel: 2,
      upgradeLevel: 0,
      ...over,
    } as any;
  }

  it('routes 猛击之盾 to knight:shield-bash', () => {
    expect(resolveUpgradeEffectId(shieldBashL0())).toBe('knight:shield-bash');
  });

  it('L0 → L1: shieldBashStunRate 5 → 7, armor/durability unchanged, description shows 7%', () => {
    const card = shieldBashL0();
    const state = makeState({ handCards: [card] });
    const result = reduce(state, { type: 'UPGRADE_CARD', cardId: card.id });
    const upgraded = result.state.handCards[0] as any;
    expect(upgraded.upgradeLevel).toBe(1);
    expect(upgraded.shieldBashStunRate).toBe(7);
    expect(upgraded.value).toBe(2);
    expect(upgraded.armorMax).toBe(2);
    expect(upgraded.durability).toBe(4);
    expect(upgraded.maxDurability).toBe(4);
    expect(upgraded.shieldBashUnlimited).toBe(true);
    expect(upgraded.description).toContain('7%');
    expect(upgraded.shortDescription).toContain('7%');
  });

  it('L1 → L2: shieldBashStunRate 7 → 10, armor/durability still unchanged', () => {
    const card = shieldBashL0({
      upgradeLevel: 1,
      shieldBashStunRate: 7,
      description: '可拖动到怪物上猛击（不造成伤害），7%×护甲值 概率击晕。每回合不限次数，有耐久即可使用。',
      shortDescription: '猛击：7%×护甲 概率击晕；每回合不限次数',
    });
    const state = makeState({ handCards: [card] });
    const result = reduce(state, { type: 'UPGRADE_CARD', cardId: card.id });
    const upgraded = result.state.handCards[0] as any;
    expect(upgraded.upgradeLevel).toBe(2);
    expect(upgraded.shieldBashStunRate).toBe(10);
    expect(upgraded.value).toBe(2);
    expect(upgraded.armorMax).toBe(2);
    expect(upgraded.durability).toBe(4);
    expect(upgraded.maxDurability).toBe(4);
    expect(upgraded.description).toContain('10%');
    expect(upgraded.shortDescription).toContain('10%');
  });

  it('L0 → L1 → L2 chained: end state has shieldBashStunRate=10', () => {
    const card = shieldBashL0();
    let state = makeState({ handCards: [card] });
    state = reduce(state, { type: 'UPGRADE_CARD', cardId: card.id }).state;
    state = reduce(state, { type: 'UPGRADE_CARD', cardId: card.id }).state;
    const upgraded = state.handCards[0] as any;
    expect(upgraded.upgradeLevel).toBe(2);
    expect(upgraded.shieldBashStunRate).toBe(10);
    expect(upgraded.shieldBashUnlimited).toBe(true);
  });

  it('cannot upgrade past maxUpgradeLevel (2)', () => {
    const card = shieldBashL0({
      upgradeLevel: 2,
      shieldBashStunRate: 10,
    });
    const state = makeState({ handCards: [card] });
    const result = reduce(state, { type: 'UPGRADE_CARD', cardId: card.id });
    const upgraded = result.state.handCards[0] as any;
    expect(upgraded.upgradeLevel).toBe(2);
    expect(upgraded.shieldBashStunRate).toBe(10);
  });
});

describe('Endurance Shield (坚韧磐盾) upgrade handler', () => {
  function enduranceShieldL0(over: Partial<GameCardData> = {}): GameCardData {
    return {
      id: 'knight-endurance-shield-1',
      type: 'shield',
      name: '坚韧磐盾',
      value: 3,
      image: '',
      classCard: true,
      description: '该护盾每回合可消耗的耐久上限 +1（怪物回合最多消耗 2 耐久）。怪物攻击该护盾后死亡时，耐久度恢复 1。',
      shortDescription: '每回合格挡耐久上限 +1；怪物死亡时回 1 耐久',
      equipBlockDurabilityBonus: 1,
      shieldRefillOnMonsterDeath: true,
      durability: 3,
      maxDurability: 3,
      armorMax: 3,
      knightEffect: 'endurance-shield',
      maxUpgradeLevel: 2,
      upgradeLevel: 0,
      ...over,
    } as any;
  }

  it('routes 坚韧磐盾 to knight:endurance-shield', () => {
    expect(resolveUpgradeEffectId(enduranceShieldL0())).toBe('knight:endurance-shield');
  });

  it('L0 → L1: armor 3 → 5, durability 3/3 unchanged, equipBlockDurabilityBonus stays 1', () => {
    // armor field 走 preserve+delta：fixture armor=1 + delta +2 = 3（clamp 到新 cap 5 内）。
    const card = enduranceShieldL0({ armor: 1 } as any);
    const state = makeState({ handCards: [card] });
    const result = reduce(state, { type: 'UPGRADE_CARD', cardId: card.id });
    const upgraded = result.state.handCards[0] as any;
    expect(upgraded.upgradeLevel).toBe(1);
    expect(upgraded.value).toBe(5);
    expect(upgraded.armorMax).toBe(5);
    expect(upgraded.durability).toBe(3);
    expect(upgraded.maxDurability).toBe(3);
    expect(upgraded.armor).toBe(3);
    expect(upgraded.equipBlockDurabilityBonus).toBe(1);
    expect(upgraded.shieldRefillOnMonsterDeath).toBe(true);
    expect(upgraded.description).toContain('+1');
    expect(upgraded.description).toContain('最多消耗 2');
  });

  it('L1 → L2: equipBlockDurabilityBonus 1 → 2, armor/durability stay (5 / 3/3)', () => {
    const card = enduranceShieldL0({
      upgradeLevel: 1,
      value: 5,
      armorMax: 5,
    });
    const state = makeState({ handCards: [card] });
    const result = reduce(state, { type: 'UPGRADE_CARD', cardId: card.id });
    const upgraded = result.state.handCards[0] as any;
    expect(upgraded.upgradeLevel).toBe(2);
    expect(upgraded.equipBlockDurabilityBonus).toBe(2);
    expect(upgraded.value).toBe(5);
    expect(upgraded.armorMax).toBe(5);
    expect(upgraded.durability).toBe(3);
    expect(upgraded.maxDurability).toBe(3);
    expect(upgraded.shieldRefillOnMonsterDeath).toBe(true);
    expect(upgraded.description).toContain('+2');
    expect(upgraded.description).toContain('最多消耗 3');
    expect(upgraded.shortDescription).toContain('+2');
  });

  it('L0 → L1 → L2 chained: end state is 5 armor, 3/3, equipBlockDurabilityBonus=2', () => {
    const card = enduranceShieldL0();
    let state = makeState({ handCards: [card] });
    state = reduce(state, { type: 'UPGRADE_CARD', cardId: card.id }).state;
    state = reduce(state, { type: 'UPGRADE_CARD', cardId: card.id }).state;
    const upgraded = state.handCards[0] as any;
    expect(upgraded.upgradeLevel).toBe(2);
    expect(upgraded.value).toBe(5);
    expect(upgraded.armorMax).toBe(5);
    expect(upgraded.durability).toBe(3);
    expect(upgraded.maxDurability).toBe(3);
    expect(upgraded.equipBlockDurabilityBonus).toBe(2);
    expect(upgraded.shieldRefillOnMonsterDeath).toBe(true);
  });

  it('cannot upgrade past maxUpgradeLevel (2)', () => {
    const card = enduranceShieldL0({
      upgradeLevel: 2,
      value: 5,
      armorMax: 5,
      equipBlockDurabilityBonus: 2,
    });
    const state = makeState({ handCards: [card] });
    const result = reduce(state, { type: 'UPGRADE_CARD', cardId: card.id });
    const upgraded = result.state.handCards[0] as any;
    expect(upgraded.upgradeLevel).toBe(2);
    expect(upgraded.equipBlockDurabilityBonus).toBe(2);
  });
});

describe('Growth Shield (生长之盾) upgrade handler', () => {
  function growthShieldL0(over: Partial<GameCardData> = {}): GameCardData {
    return {
      id: 'knight-growth-shield-1',
      type: 'shield',
      name: '生长之盾',
      value: 2,
      image: '',
      classCard: true,
      description: '装备时：每发生一次卡牌翻转，该护盾增幅一次（按卡名累计 +1 护甲）。遗言：从坟场随机抽出一张 Event 加入手牌。',
      shortDescription: '每次卡牌翻转 +1 护甲；遗言：随机入手 1 张坟场 Event',
      durability: 4,
      maxDurability: 4,
      armorMax: 2,
      amplifyOnFlip: true,
      onDestroyEffect: 'graveyard-event-to-hand',
      knightEffect: 'growth-shield',
      maxUpgradeLevel: 2,
      upgradeLevel: 0,
      ...over,
    } as any;
  }

  it('routes 生长之盾 to knight:growth-shield', () => {
    expect(resolveUpgradeEffectId(growthShieldL0())).toBe('knight:growth-shield');
  });

  it('L0 → L1: amplifyOnFlipAmount 1 → 2; armor/durability/onDestroyEventCount unchanged', () => {
    const card = growthShieldL0();
    const state = makeState({ handCards: [card] });
    const result = reduce(state, { type: 'UPGRADE_CARD', cardId: card.id });
    const upgraded = result.state.handCards[0] as any;
    expect(upgraded.upgradeLevel).toBe(1);
    expect(upgraded.amplifyOnFlipAmount).toBe(2);
    expect(upgraded.amplifyOnFlip).toBe(true);
    expect(upgraded.value).toBe(2);
    expect(upgraded.armorMax).toBe(2);
    expect(upgraded.durability).toBe(4);
    expect(upgraded.maxDurability).toBe(4);
    expect(upgraded.onDestroyEffect).toBe('graveyard-event-to-hand');
    expect(upgraded.onDestroyEventCount).toBeUndefined();
    expect(upgraded.description).toContain('增幅两次');
    expect(upgraded.description).toContain('+2 护甲');
    expect(upgraded.description).toContain('一张 Event');
    expect(upgraded.shortDescription).toContain('+2 护甲');
    expect(upgraded.shortDescription).toContain('1 张坟场 Event');
  });

  it('L1 → L2: onDestroyEventCount 1 → 3, amplifyOnFlipAmount stays 2', () => {
    const card = growthShieldL0({
      upgradeLevel: 1,
      amplifyOnFlipAmount: 2,
    } as any);
    const state = makeState({ handCards: [card] });
    const result = reduce(state, { type: 'UPGRADE_CARD', cardId: card.id });
    const upgraded = result.state.handCards[0] as any;
    expect(upgraded.upgradeLevel).toBe(2);
    expect(upgraded.amplifyOnFlipAmount).toBe(2);
    expect(upgraded.onDestroyEventCount).toBe(3);
    expect(upgraded.amplifyOnFlip).toBe(true);
    expect(upgraded.value).toBe(2);
    expect(upgraded.armorMax).toBe(2);
    expect(upgraded.durability).toBe(4);
    expect(upgraded.maxDurability).toBe(4);
    expect(upgraded.onDestroyEffect).toBe('graveyard-event-to-hand');
    expect(upgraded.description).toContain('增幅两次');
    expect(upgraded.description).toContain('三张 Event');
    expect(upgraded.shortDescription).toContain('3 张坟场 Event');
  });

  it('L0 → L1 → L2 chained: end state has amplifyOnFlipAmount=2, onDestroyEventCount=3', () => {
    const card = growthShieldL0();
    let state = makeState({ handCards: [card] });
    state = reduce(state, { type: 'UPGRADE_CARD', cardId: card.id }).state;
    state = reduce(state, { type: 'UPGRADE_CARD', cardId: card.id }).state;
    const upgraded = state.handCards[0] as any;
    expect(upgraded.upgradeLevel).toBe(2);
    expect(upgraded.amplifyOnFlipAmount).toBe(2);
    expect(upgraded.onDestroyEventCount).toBe(3);
    expect(upgraded.amplifyOnFlip).toBe(true);
    expect(upgraded.value).toBe(2);
    expect(upgraded.armorMax).toBe(2);
    expect(upgraded.durability).toBe(4);
    expect(upgraded.maxDurability).toBe(4);
  });

  it('cannot upgrade past maxUpgradeLevel (2)', () => {
    const card = growthShieldL0({
      upgradeLevel: 2,
      amplifyOnFlipAmount: 2,
      onDestroyEventCount: 3,
    } as any);
    const state = makeState({ handCards: [card] });
    const result = reduce(state, { type: 'UPGRADE_CARD', cardId: card.id });
    const upgraded = result.state.handCards[0] as any;
    expect(upgraded.upgradeLevel).toBe(2);
    expect(upgraded.amplifyOnFlipAmount).toBe(2);
    expect(upgraded.onDestroyEventCount).toBe(3);
  });
});

describe('Barrage Shield (弹幕护盾) upgrade handler', () => {
  function barrageShieldL0(over: Partial<GameCardData> = {}): GameCardData {
    return {
      id: 'knight-barrage-shield-1',
      type: 'shield',
      name: '弹幕护盾',
      value: 4,
      image: '',
      classCard: true,
      description: '完美格挡时，将 2 张「魔弹」加入手牌（手牌已满则静默丢弃多余的）。',
      shortDescription: '完美格挡 → 2 张「魔弹」入手牌',
      perfectBlockSpawnMissiles: 2,
      durability: 3,
      maxDurability: 3,
      armorMax: 4,
      knightEffect: 'barrage-shield',
      maxUpgradeLevel: 2,
      upgradeLevel: 0,
      ...over,
    } as any;
  }

  it('routes 弹幕护盾 to knight:barrage-shield', () => {
    expect(resolveUpgradeEffectId(barrageShieldL0())).toBe('knight:barrage-shield');
  });

  it('L0 → L1: armor 4 → 6, missile count stays 2, durability stays 3/3, current armor preserve+delta', () => {
    // armor field 走 preserve+delta：fresh shield armor=4 + delta +2 = 6（clamp 到新 cap 6）。
    const card = barrageShieldL0({ armor: 4 } as any);
    const state = makeState({ handCards: [card] });
    const result = reduce(state, { type: 'UPGRADE_CARD', cardId: card.id });
    const upgraded = result.state.handCards[0] as any;
    expect(upgraded.upgradeLevel).toBe(1);
    expect(upgraded.value).toBe(6);
    expect(upgraded.armorMax).toBe(6);
    expect(upgraded.armor).toBe(6);
    expect(upgraded.durability).toBe(3);
    expect(upgraded.maxDurability).toBe(3);
    expect(upgraded.perfectBlockSpawnMissiles).toBe(2);
    expect(upgraded.description).toContain('2 张「魔弹」');
    expect(upgraded.shortDescription).toContain('2 张「魔弹」');
  });

  it('L1 → L2: missile count 2 → 3, armor stays 6, durability stays 3/3', () => {
    const card = barrageShieldL0({
      upgradeLevel: 1,
      value: 6,
      armorMax: 6,
    } as any);
    const state = makeState({ handCards: [card] });
    const result = reduce(state, { type: 'UPGRADE_CARD', cardId: card.id });
    const upgraded = result.state.handCards[0] as any;
    expect(upgraded.upgradeLevel).toBe(2);
    expect(upgraded.value).toBe(6);
    expect(upgraded.armorMax).toBe(6);
    expect(upgraded.durability).toBe(3);
    expect(upgraded.maxDurability).toBe(3);
    expect(upgraded.perfectBlockSpawnMissiles).toBe(3);
    expect(upgraded.description).toContain('3 张「魔弹」');
    expect(upgraded.shortDescription).toContain('3 张「魔弹」');
  });

  it('L0 → L1 → L2 chained: end state has armor 6, missile count 3, durability 3/3', () => {
    const card = barrageShieldL0();
    let state = makeState({ handCards: [card] });
    state = reduce(state, { type: 'UPGRADE_CARD', cardId: card.id }).state;
    state = reduce(state, { type: 'UPGRADE_CARD', cardId: card.id }).state;
    const upgraded = state.handCards[0] as any;
    expect(upgraded.upgradeLevel).toBe(2);
    expect(upgraded.value).toBe(6);
    expect(upgraded.armorMax).toBe(6);
    expect(upgraded.durability).toBe(3);
    expect(upgraded.maxDurability).toBe(3);
    expect(upgraded.perfectBlockSpawnMissiles).toBe(3);
  });

  it('cannot upgrade past maxUpgradeLevel (2)', () => {
    const card = barrageShieldL0({
      upgradeLevel: 2,
      value: 6,
      armorMax: 6,
      perfectBlockSpawnMissiles: 3,
    } as any);
    const state = makeState({ handCards: [card] });
    const result = reduce(state, { type: 'UPGRADE_CARD', cardId: card.id });
    const upgraded = result.state.handCards[0] as any;
    expect(upgraded.upgradeLevel).toBe(2);
    expect(upgraded.value).toBe(6);
    expect(upgraded.perfectBlockSpawnMissiles).toBe(3);
  });
});

describe('Thunder Guard Shield (雷震守护盾) upgrade handler', () => {
  function thunderGuardShieldL0(over: Partial<GameCardData> = {}): GameCardData {
    return {
      id: 'knight-thunder-guard-shield-1',
      type: 'shield',
      name: '雷震守护盾',
      value: 8,
      image: '',
      classCard: true,
      description: '遗言：击晕上限 +8%（封顶 100%）。',
      shortDescription: '遗言：击晕上限 +8%',
      onDestroyEffect: 'stunCap+8',
      durability: 1,
      maxDurability: 1,
      armorMax: 8,
      knightEffect: 'thunder-guard-shield',
      maxUpgradeLevel: 2,
      upgradeLevel: 0,
      ...over,
    } as any;
  }

  it('routes 雷震守护盾 to knight:thunder-guard-shield', () => {
    expect(resolveUpgradeEffectId(thunderGuardShieldL0())).toBe('knight:thunder-guard-shield');
  });

  it('L0 → L1: onDestroyEffect stunCap+8 → stunCap+10; armor/durability/revive unchanged', () => {
    const card = thunderGuardShieldL0();
    const state = makeState({ handCards: [card] });
    const result = reduce(state, { type: 'UPGRADE_CARD', cardId: card.id });
    const upgraded = result.state.handCards[0] as any;
    expect(upgraded.upgradeLevel).toBe(1);
    expect(upgraded.onDestroyEffect).toBe('stunCap+10');
    expect(upgraded.value).toBe(8);
    expect(upgraded.armorMax).toBe(8);
    expect(upgraded.durability).toBe(1);
    expect(upgraded.maxDurability).toBe(1);
    expect(upgraded.hasEquipmentRevive).toBeUndefined();
    expect(upgraded.description).toContain('击晕上限 +10%');
    expect(upgraded.description).not.toContain('复生');
    expect(upgraded.shortDescription).toContain('击晕上限 +10%');
    expect(upgraded.shortDescription).not.toContain('复生');
  });

  it('L1 → L2: hasEquipmentRevive=true; stunCap+10 retained; armor/durability unchanged', () => {
    const card = thunderGuardShieldL0({
      upgradeLevel: 1,
      onDestroyEffect: 'stunCap+10',
      description: '遗言：击晕上限 +10%（封顶 100%）。',
      shortDescription: '遗言：击晕上限 +10%',
    } as any);
    const state = makeState({ handCards: [card] });
    const result = reduce(state, { type: 'UPGRADE_CARD', cardId: card.id });
    const upgraded = result.state.handCards[0] as any;
    expect(upgraded.upgradeLevel).toBe(2);
    expect(upgraded.onDestroyEffect).toBe('stunCap+10');
    expect(upgraded.hasEquipmentRevive).toBe(true);
    expect(upgraded.equipmentReviveUsed).toBeUndefined();
    expect(upgraded.value).toBe(8);
    expect(upgraded.armorMax).toBe(8);
    expect(upgraded.durability).toBe(1);
    expect(upgraded.maxDurability).toBe(1);
    expect(upgraded.description).toContain('复生');
    expect(upgraded.description).toContain('击晕上限 +10%');
    expect(upgraded.shortDescription).toContain('复生');
    expect(upgraded.shortDescription).toContain('击晕上限 +10%');
  });

  it('L0 → L1 → L2 chained: end state has stunCap+10 and hasEquipmentRevive', () => {
    const card = thunderGuardShieldL0();
    let state = makeState({ handCards: [card] });
    state = reduce(state, { type: 'UPGRADE_CARD', cardId: card.id }).state;
    state = reduce(state, { type: 'UPGRADE_CARD', cardId: card.id }).state;
    const upgraded = state.handCards[0] as any;
    expect(upgraded.upgradeLevel).toBe(2);
    expect(upgraded.onDestroyEffect).toBe('stunCap+10');
    expect(upgraded.hasEquipmentRevive).toBe(true);
    expect(upgraded.value).toBe(8);
    expect(upgraded.armorMax).toBe(8);
    expect(upgraded.durability).toBe(1);
    expect(upgraded.maxDurability).toBe(1);
  });

  it('cannot upgrade past maxUpgradeLevel (2)', () => {
    const card = thunderGuardShieldL0({
      upgradeLevel: 2,
      onDestroyEffect: 'stunCap+10',
      hasEquipmentRevive: true,
    } as any);
    const state = makeState({ handCards: [card] });
    const result = reduce(state, { type: 'UPGRADE_CARD', cardId: card.id });
    const upgraded = result.state.handCards[0] as any;
    expect(upgraded.upgradeLevel).toBe(2);
    expect(upgraded.onDestroyEffect).toBe('stunCap+10');
    expect(upgraded.hasEquipmentRevive).toBe(true);
  });
});

describe('Communal Defense Shield (共御圣盾) upgrade handler', () => {
  function communalDefenseShieldL0(over: Partial<GameCardData> = {}): GameCardData {
    return {
      id: 'knight-communal-defense-shield-1',
      type: 'shield',
      name: '共御圣盾',
      value: 6,
      image: '',
      classCard: true,
      description: '复生（首次摧毁恢复 1 耐久）。遗言：所有装备栏 +4 临时护甲。',
      shortDescription: '复生 1 次；遗言：全栏 +4 临时护甲',
      hasEquipmentRevive: true,
      onDestroyEffect: 'allSlotTempArmor:4',
      durability: 1,
      maxDurability: 1,
      armorMax: 6,
      knightEffect: 'communal-defense-shield',
      maxUpgradeLevel: 2,
      upgradeLevel: 0,
      ...over,
    } as any;
  }

  it('routes 共御圣盾 to knight:communal-defense-shield', () => {
    expect(resolveUpgradeEffectId(communalDefenseShieldL0())).toBe('knight:communal-defense-shield');
  });

  it('L0 → L1: value/armorMax 6 → 8; durability/revive/last-words preserved at +4', () => {
    const card = communalDefenseShieldL0();
    const state = makeState({ handCards: [card] });
    const result = reduce(state, { type: 'UPGRADE_CARD', cardId: card.id });
    const upgraded = result.state.handCards[0] as any;
    expect(upgraded.upgradeLevel).toBe(1);
    expect(upgraded.value).toBe(8);
    expect(upgraded.armorMax).toBe(8);
    expect(upgraded.durability).toBe(1);
    expect(upgraded.maxDurability).toBe(1);
    expect(upgraded.hasEquipmentRevive).toBe(true);
    expect(upgraded.onDestroyEffect).toBe('allSlotTempArmor:4');
    expect(upgraded.description).toContain('+4 临时护甲');
    expect(upgraded.description).toContain('复生');
    expect(upgraded.shortDescription).toContain('+4 临时护甲');
    expect(upgraded.shortDescription).toContain('复生');
  });

  it('L1 → L2: value/armorMax 8 unchanged; last-words allSlotTempArmor:4 → :7; revive preserved', () => {
    const card = communalDefenseShieldL0({
      upgradeLevel: 1,
      value: 8,
      armorMax: 8,
      description: '复生（首次摧毁恢复 1 耐久）。遗言：所有装备栏 +4 临时护甲。',
      shortDescription: '复生 1 次；遗言：全栏 +4 临时护甲',
    } as any);
    const state = makeState({ handCards: [card] });
    const result = reduce(state, { type: 'UPGRADE_CARD', cardId: card.id });
    const upgraded = result.state.handCards[0] as any;
    expect(upgraded.upgradeLevel).toBe(2);
    expect(upgraded.value).toBe(8);
    expect(upgraded.armorMax).toBe(8);
    expect(upgraded.durability).toBe(1);
    expect(upgraded.maxDurability).toBe(1);
    expect(upgraded.hasEquipmentRevive).toBe(true);
    expect(upgraded.onDestroyEffect).toBe('allSlotTempArmor:7');
    expect(upgraded.description).toContain('+7 临时护甲');
    expect(upgraded.description).toContain('复生');
    expect(upgraded.shortDescription).toContain('+7 临时护甲');
    expect(upgraded.shortDescription).toContain('复生');
  });

  it('L0 → L1 → L2 chained: end state has armor 8, allSlotTempArmor:7, revive', () => {
    const card = communalDefenseShieldL0();
    let state = makeState({ handCards: [card] });
    state = reduce(state, { type: 'UPGRADE_CARD', cardId: card.id }).state;
    state = reduce(state, { type: 'UPGRADE_CARD', cardId: card.id }).state;
    const upgraded = state.handCards[0] as any;
    expect(upgraded.upgradeLevel).toBe(2);
    expect(upgraded.value).toBe(8);
    expect(upgraded.armorMax).toBe(8);
    expect(upgraded.durability).toBe(1);
    expect(upgraded.maxDurability).toBe(1);
    expect(upgraded.hasEquipmentRevive).toBe(true);
    expect(upgraded.onDestroyEffect).toBe('allSlotTempArmor:7');
  });

  it('cannot upgrade past maxUpgradeLevel (2)', () => {
    const card = communalDefenseShieldL0({
      upgradeLevel: 2,
      value: 8,
      armorMax: 8,
      onDestroyEffect: 'allSlotTempArmor:7',
    } as any);
    const state = makeState({ handCards: [card] });
    const result = reduce(state, { type: 'UPGRADE_CARD', cardId: card.id });
    const upgraded = result.state.handCards[0] as any;
    expect(upgraded.upgradeLevel).toBe(2);
    expect(upgraded.value).toBe(8);
    expect(upgraded.armorMax).toBe(8);
    expect(upgraded.onDestroyEffect).toBe('allSlotTempArmor:7');
  });
});

describe('Routing fix unblocks knight handlers (regression for dead-code bug)', () => {
  // 不灭守护已删除升级效果（现在永远是 instant，触发后直接进坟场，无 Perm 版本），
  // 因此不再需要 death-ward L1 的升级 handler 测试。

  it('blood-greed L1 description rewrites to upgraded form', () => {
    const card: GameCardData = {
      id: 'knight-50',
      type: 'magic',
      name: '血色贪婪',
      value: 0,
      image: '',
      classCard: true,
      description: '原描述',
      magicType: 'instant',
      magicEffect: '原 magicEffect',
      knightEffect: 'blood-greed',
      maxUpgradeLevel: 1,
      upgradeLevel: 0,
    } as any;
    const state = makeState({ handCards: [card] });
    const result = reduce(state, { type: 'UPGRADE_CARD', cardId: card.id });
    const upgraded = result.state.handCards[0] as any;
    expect(upgraded.upgradeLevel).toBe(1);
    expect(upgraded.description).toContain('贪婪诅咒');
  });
});
