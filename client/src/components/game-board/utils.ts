import dragonImage from '@assets/generated_images/cute_chibi_dragon_monster.png';
import skeletonImage from '@assets/generated_images/cute_chibi_skeleton_monster.png';
import goblinImage from '@assets/generated_images/cute_chibi_goblin_monster.png';
import ogreImage from '@assets/generated_images/cute_chibi_ogre_monster.png';
import swordImage from '@assets/generated_images/cute_cartoon_medieval_sword.png';
import axeImage from '@assets/generated_images/cute_cartoon_battle_axe.png';
import daggerImage from '@assets/generated_images/cute_cartoon_dagger.png';
import daggerWeaponImage from '@assets/generated_images/cute_cartoon_weapon_dagger.png';
import holyBladeImage from '@assets/generated_images/cute_cartoon_holy_blade.png';
import maceImage from '@assets/generated_images/cute_cartoon_mace.png';
import woodenShieldImage from '@assets/generated_images/cute_wooden_shield.png';
import ironShieldImage from '@assets/generated_images/cute_iron_shield.png';
import heavyShieldImage from '@assets/generated_images/simple_heavy_shield.png';
import potionImage from '@assets/generated_images/cute_cartoon_healing_potion.png';
import lifeAmuletImage from '@assets/generated_images/chibi_life_amulet.png';
import strengthAmuletImage from '@assets/generated_images/chibi_strength_amulet.png';
import guardianAmuletImage from '@assets/generated_images/chibi_guardian_amulet.png';
import balanceAmuletImage from '@assets/generated_images/chibi_balance_amulet.png';
import skillScrollImage from '@assets/generated_images/chibi_skill_scroll.png';
import eventScrollImage from '@assets/generated_images/chibi_event_scroll.png';

import type { CardType, GameCardData } from '../GameCard';
import {
  DEV_MODE,
  DUNGEON_COLUMNS,
  DUNGEON_COLUMN_COUNT,
  ELITE_MONSTER_DISCARD_WARNING,
  ELITE_MONSTER_NAME_SET,
  SHOP_TYPE_PRICES,
  SLOT_LABEL_MAP,
  STARTER_CARD_IDS,
} from './constants';
import type {
  ActiveAmuletEffects,
  ActiveRowSlots,
  EquipmentRepairTarget,
  EquipmentSlotBonusState,
  EquipmentSlotId,
  GridMetrics,
  HeroRowDropType,
  SlotPermanentBonus,
} from './types';

export const formatRepairTargetLabel = (targets: EquipmentRepairTarget[]) => {
  if (targets.includes('weapon') && targets.includes('shield')) {
    return '武器或护盾';
  }
  return targets[0] === 'shield' ? '护盾' : '武器';
};

export const describeSlotLabel = (slotId: EquipmentSlotId): '左侧装备栏' | '右侧装备栏' =>
  SLOT_LABEL_MAP[slotId] ?? '装备槽';

export const describeBonusLabel = (bonusType: keyof SlotPermanentBonus): '伤害' | '护甲' =>
  bonusType === 'damage' ? '伤害' : '护甲';

export const createEmptySlotBonusState = (): EquipmentSlotBonusState => ({
  equipmentSlot1: { damage: 0, shield: 0 },
  equipmentSlot2: { damage: 0, shield: 0 },
});

export const createEmptyEquipmentBuffState = (): Record<EquipmentSlotId, number> => ({
  equipmentSlot1: 0,
  equipmentSlot2: 0,
});

export const createEmptyActiveRow = (): ActiveRowSlots =>
  Array.from({ length: DUNGEON_COLUMN_COUNT }, () => null);

export const fillActiveRowSlots = (cards: GameCardData[]): ActiveRowSlots => {
  const slots = createEmptyActiveRow();
  cards.forEach((card, index) => {
    if (index < DUNGEON_COLUMN_COUNT) {
      slots[index] = card;
    }
  });
  return slots;
};

export const flattenActiveRowSlots = (slots: ActiveRowSlots): GameCardData[] =>
  slots.filter((card): card is GameCardData => Boolean(card));

export const countActiveRowSlots = (slots: ActiveRowSlots): number =>
  slots.reduce((count, card) => (card ? count + 1 : count), 0);

const sanitizeCardMetadata = <T extends GameCardData>(card: T): T => {
  const { fromSlot, ...rest } = card as T & { fromSlot?: string };
  return { ...rest } as T;
};

export const sanitizeCardList = <T extends GameCardData>(cards: T[]): T[] =>
  cards.map(card => sanitizeCardMetadata(card));

export const sanitizeSlotRow = (slots: ActiveRowSlots): ActiveRowSlots =>
  slots.map(card => (card ? sanitizeCardMetadata(card) : null));

export const getEmptyColumns = (slots: ActiveRowSlots): number[] =>
  DUNGEON_COLUMNS.filter(columnIndex => !slots[columnIndex]);

export const getFilledPreviewColumns = (slots: ActiveRowSlots): number[] =>
  DUNGEON_COLUMNS.filter(columnIndex => Boolean(slots[columnIndex]));

export const createEmptyAmuletEffects = (): ActiveAmuletEffects => ({
  aura: {
    attack: 0,
    defense: 0,
    maxHp: 0,
  },
  hasHeal: false,
  hasBalance: false,
  hasLife: false,
  hasGuardian: false,
  hasFlash: false,
  hasStrength: false,
  hasDualGuard: false,
  hasDiscardShock: false,
  hasFlipGold: false,
});

export const logWaterfallInvariant = (
  condition: boolean,
  label: string,
  payload?: Record<string, unknown>,
) => {
  if (condition || !DEV_MODE) {
    return;
  }
  console.warn(`[Waterfall][Invariant] ${label}`, payload);
};

export const findSlotIndexByCardId = (slots: ActiveRowSlots, cardId: string): number =>
  slots.findIndex(card => card?.id === cardId);

export const logWaterfall = (phase: string, payload?: Record<string, unknown>) => {
  if (process.env.NODE_ENV !== 'production') {
    console.debug(`[Waterfall] ${phase}`, payload);
  }
};

export const pointInsideRect = (rect: DOMRect | null, clientX: number, clientY: number) =>
  Boolean(rect && clientX >= rect.left && clientX <= rect.right && clientY >= rect.top && clientY <= rect.bottom);

export const isBackpackRestrictedCard = (card: GameCardData | null) =>
  Boolean(card && (card.type === 'magic' || card.type === 'hero-magic' || card.type === 'potion'));

export const getShopPrice = (card: GameCardData): number => {
  if (SHOP_TYPE_PRICES[card.type as CardType] !== undefined) {
    return SHOP_TYPE_PRICES[card.type as CardType] as number;
  }
  return Math.max(5, card.value || 5);
};

export const getGridMetricsForWidth = (width: number): GridMetrics => {
  if (width <= 430) {
    return {
      gapX: 6,
      gapY: 10,
      padding: 2,
      cardFontScale: 1.15,
      cardStatScale: 1.2,
      cardIconScale: 1.15,
      cardDotSize: 9,
      heroFontScale: 0.85,
    };
  }
  if (width <= 640) {
    return {
      gapX: 10,
      gapY: 14,
      padding: 4,
      cardFontScale: 1.08,
      cardStatScale: 1.08,
      cardIconScale: 1.08,
      cardDotSize: 8,
      heroFontScale: 0.9,
    };
  }
  if (width <= 1024) {
    return {
      gapX: 16,
      gapY: 18,
      padding: 6,
      cardFontScale: 1,
      cardStatScale: 1,
      cardIconScale: 1,
      cardDotSize: 7,
      heroFontScale: 1,
    };
  }
  return {
    gapX: 24,
    gapY: 26,
    padding: 8,
    cardFontScale: 1,
    cardStatScale: 1,
    cardIconScale: 1,
    cardDotSize: 7,
    heroFontScale: 1.05,
  };
};

export const clamp = (value: number, min = 0, max = 1) => Math.min(Math.max(value, min), max);

export const easeInOutCubic = (t: number) =>
  t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2;

export const getRandomInt = (min: number, max: number) =>
  Math.floor(Math.random() * (max - min + 1)) + min;

export const logHeroMagic = (...args: unknown[]) => {
  if (!DEV_MODE) {
    return;
  }
  console.debug('[HeroMagic]', ...args);
};

export const logBackpackDraw = (tag: string, payload?: unknown) => {
  if (!DEV_MODE) {
    return;
  }
  if (typeof payload === 'undefined') {
    console.debug('[BackpackDraw]', tag);
  } else {
    console.debug('[BackpackDraw]', tag, payload);
  }
};

export function createDeck(): GameCardData[] {
  const deck: GameCardData[] = [];
  let id = 0;

  const monsterTypes = [
    {
      name: 'Dragon',
      image: dragonImage,
      minAttack: 4,
      maxAttack: 6,
      minHp: 7,
      maxHp: 10,
      minFury: 3,
      maxFury: 4,
    },
    {
      name: 'Skeleton',
      image: skeletonImage,
      minAttack: 5,
      maxAttack: 7,
      minHp: 1,
      maxHp: 3,
      minFury: 2,
      maxFury: 4,
    },
    {
      name: 'Goblin',
      image: goblinImage,
      minAttack: 2,
      maxAttack: 3,
      minHp: 3,
      maxHp: 4,
      minFury: 1,
      maxFury: 4,
    },
    {
      name: 'Ogre',
      image: ogreImage,
      minAttack: 3,
      maxAttack: 4,
      minHp: 5,
      maxHp: 7,
      minFury: 2,
      maxFury: 4,
    },
    {
      name: 'Elder Dragon',
      image: dragonImage,
      minAttack: 6,
      maxAttack: 8,
      minHp: 9,
      maxHp: 11,
      minFury: 3,
      maxFury: 4,
    },
    {
      name: 'Bone Overlord',
      image: skeletonImage,
      minAttack: 5,
      maxAttack: 7,
      minHp: 7,
      maxHp: 9,
      minFury: 3,
      maxFury: 4,
    },
    {
      name: 'Goblin Warlock',
      image: goblinImage,
      minAttack: 4,
      maxAttack: 6,
      minHp: 5,
      maxHp: 7,
      minFury: 2,
      maxFury: 3,
    },
    {
      name: 'Ogre Juggernaut',
      image: ogreImage,
      minAttack: 5,
      maxAttack: 7,
      minHp: 8,
      maxHp: 10,
      minFury: 3,
      maxFury: 4,
    },
  ];

  for (let i = 0; i < 16; i++) {
    const monsterType = monsterTypes[i % monsterTypes.length];
    const attack = Math.floor(Math.random() * (monsterType.maxAttack - monsterType.minAttack + 1)) + monsterType.minAttack;
    const hp = Math.floor(Math.random() * (monsterType.maxHp - monsterType.minHp + 1)) + monsterType.minHp;
    const fury = Math.floor(Math.random() * (monsterType.maxFury - monsterType.minFury + 1)) + monsterType.minFury;
    const isEliteMonster = ELITE_MONSTER_NAME_SET.has(monsterType.name);

    const monsterCard: GameCardData = {
      id: `monster-${id++}`,
      type: 'monster',
      name: monsterType.name,
      value: attack,
      attack,
      hp,
      maxHp: hp,
      fury,
      hpLayers: fury,
      currentLayer: fury,
      image: monsterType.image,
      description: isEliteMonster ? ELITE_MONSTER_DISCARD_WARNING : undefined,
    };
    if (monsterType.name === 'Goblin' || monsterType.name === 'Goblin Warlock') {
      monsterCard.onAttackEffect = 'steal-gold-3';
    }
    deck.push(monsterCard);
  }

  const weaponTypes = [
    { name: 'Holy Blade', image: holyBladeImage },
    { name: 'Sword', image: axeImage },
    { name: 'Dagger', image: daggerWeaponImage },
    { name: 'Mace', image: maceImage },
    { name: 'Swift Blade', image: daggerImage },
    { name: 'Sword', image: axeImage },
  ];

  for (let i = 0; i < 6; i++) {
    const weaponType = weaponTypes[i % weaponTypes.length];
    const value = Math.floor(Math.random() * 5) + 2;
    const durability = Math.floor(Math.random() * 4) + 1;
    const card: GameCardData = {
      id: `weapon-${id++}`,
      type: 'weapon',
      name: weaponType.name,
      value,
      image: weaponType.image,
      durability,
      maxDurability: durability,
    };
    if (weaponType.name === 'Holy Blade') {
      card.healOnKill = 2;
      card.description = '击杀怪物时回复 2 点生命。';
      const hbDurability = Math.floor(Math.random() * 3) + 2;
      card.durability = hbDurability;
      card.maxDurability = hbDurability;
    }
    if (weaponType.name === 'Swift Blade') {
      card.durability = Math.floor(Math.random() * 3) + 2;
      card.maxDurability = card.durability;
    }
    if (weaponType.name === 'Mace') {
      card.value = Math.min(card.value, 3);
      card.durability = Math.min(card.durability!, 2);
      card.maxDurability = card.durability;
      card.description = '攻击后掷骰：50% 概率不消耗耐久。';
      card.weaponDurabilitySaveChance = 50;
    }
    if (weaponType.name === 'Dagger') {
      card.value = Math.min(card.value, 3);
      card.durability = Math.min(card.durability!, 2);
      card.maxDurability = card.durability;
      card.critChance = 50;
      card.description = '攻击时 50% 概率造成双倍伤害。';
    }
    if (weaponType.name === 'Sword') {
      card.value = Math.min(card.value, 3);
      card.waterfallAttackBoost = 1;
      card.description = '每次瀑流触发时，攻击力 +1。';
    }
    
    deck.push(card);
  }

  const shieldTypes = [
    { name: 'Wooden Shield', value: 2, image: woodenShieldImage },
    { name: 'Iron Shield', value: 3, image: ironShieldImage },
    { name: 'Heavy Shield', value: 4, image: heavyShieldImage },
  ];

  const shieldDistribution = [shieldTypes[0], shieldTypes[0], shieldTypes[1], shieldTypes[1], shieldTypes[2]];

  shieldDistribution.forEach(shieldType => {
    const durability = Math.floor(Math.random() * 4) + 1;
    const card: GameCardData = {
      id: `shield-${id++}`,
      type: 'shield',
      name: shieldType.name,
      value: shieldType.value,
      image: shieldType.image,
      durability,
      maxDurability: durability,
    };
    if (shieldType.name === 'Wooden Shield') {
      card.onDestroyHeal = 3;
      card.description = '毁坏时恢复 3 点生命。';
    }
    if (shieldType.name === 'Iron Shield') {
      card.onDestroyGold = 3;
      card.description = '毁坏时获得 3 金币。';
    }
    if (shieldType.name === 'Heavy Shield') {
      card.damageReflect = 1;
      card.description =
        '格挡时反弹 1 点基础伤害给攻击者（叠加该装备栏永久伤害与永久法术伤害加成）。';
      card.durability = Math.floor(Math.random() * 3) + 2;
      card.maxDurability = card.durability;
    }
    deck.push(card);
  });

  const potionCards: Omit<GameCardData, 'id'>[] = [
    {
      type: 'potion',
      name: '治疗药水',
      value: 5,
      image: potionImage,
      potionEffect: 'heal-5',
      description: '立即回复5点生命。',
    },
    {
      type: 'potion',
      name: '浓缩治疗药水',
      value: 7,
      image: potionImage,
      potionEffect: 'heal-14',
      description: '立即回复14点生命。',
    },
    {
      type: 'potion',
      name: '双锋淬液',
      value: 7,
      image: potionImage,
      potionEffect: 'boost-both-slots',
      description: '左右装备栏永久伤害+1，护甲+1。',
    },
  ];

  potionCards.forEach(card => {
    deck.push({
      ...card,
      id: `potion-${id++}`,
    });
  });

  const amuletCards: Omit<GameCardData, 'id'>[] = [
    {
      type: 'amulet',
      name: 'Heal Amulet',
      value: 5,
      image: lifeAmuletImage,
      description: '所有回血效果翻倍',
      amuletEffect: 'heal',
    },
    {
      type: 'amulet',
      name: 'Balance Amulet',
      value: 5,
      image: guardianAmuletImage,
      description: '左边Equipment攻击+3护甲-1，右边Equipment护甲+3攻击-1',
      amuletEffect: 'balance',
    },
    {
      type: 'amulet',
      name: 'Life Amulet',
      value: 5,
      image: lifeAmuletImage,
      description: '攻击时，若伤害超出怪物血量，回复 6 点生命。',
      amuletEffect: 'life',
    },
    {
      type: 'amulet',
      name: 'Guardian Amulet',
      value: 5,
      image: guardianAmuletImage,
      description: '有护盾时候，超过格挡的部分不损失血',
      amuletEffect: 'guardian',
    },
    {
      type: 'amulet',
      name: 'Flash Amulet',
      value: 5,
      image: strengthAmuletImage,
      description: '所有Equipment攻击力-3，攻击两次',
      amuletEffect: 'flash',
    },
    {
      type: 'amulet',
      name: 'Strength Amulet',
      value: 5,
      image: strengthAmuletImage,
      description: '所有Equipment 攻击+4，每攻击一次，掉2点血',
      amuletEffect: 'strength',
      amuletAuraBonus: {
        attack: 4,
      },
    },
  ];

  amuletCards.forEach(amulet => {
    deck.push({
      ...amulet,
      id: `amulet-${id++}`,
    });
  });

  deck.push({
    id: `magic-${id++}`,
    type: 'magic',
    name: '瀑流重置',
    value: 0,
    image: skillScrollImage,
    magicType: 'instant',
    magicEffect: '将激活行的所有卡牌置于牌堆底（不打乱其余牌序），然后触发瀑布。',
  });

  deck.push({
    id: `magic-${id++}`,
    type: 'magic',
    name: '风暴箭雨',
    value: 0,
    image: skillScrollImage,
    magicType: 'instant',
    magicEffect: '对激活行的每个怪物造成 3 点伤害。',
  });

  deck.push({
    id: `magic-${id++}`,
    type: 'magic',
    name: '回响行囊',
    value: 0,
    image: skillScrollImage,
    magicType: 'instant',
    magicEffect: '弃置至多 2 张手牌，从坟场发现 2 张牌加入手牌，再从背包抽 2 张牌。',
  });

  deck.push({
    id: `magic-${id++}`,
    type: 'magic',
    name: '壁垒猛击',
    value: 0,
    image: skillScrollImage,
    magicType: 'instant',
    magicEffect: '选择一个护盾槽，对一只怪物造成等同于该护盾值的伤害。',
  });

  deck.push({
    id: `magic-${id++}`,
    type: 'magic',
    name: '血债清算',
    value: 0,
    image: skillScrollImage,
    magicType: 'instant',
    magicEffect: '对任意怪物造成等同于当前金币数量的伤害，并恢复等量生命。',
  });

  deck.push({
    id: `magic-${id++}`,
    type: 'magic',
    name: '永恒修复',
    value: 0,
    image: skillScrollImage,
    magicType: 'instant',
    magicEffect: '选择一件武器或随从，在下个瀑流之前使用不消耗耐久。',
  });

  deck.push({
    id: `event-${id++}`,
    type: 'event',
    name: '命运十字路口',
    value: 0,
    image: eventScrollImage,
    description: '打开时向左平移至被阻挡位置。若正下方有装备或护符，可破坏它并获得全部效果。',
    eventChoices: [
      { text: '倾听命运的低语（发现专属卡）', effect: 'discoverClass', hint: '立即进行发现流程' },
      { text: '与命运商贩交谈（打开商店）', effect: 'openShop', hint: '立刻开启商店' },
      { text: '献祭体魄（永久 +3 生命上限）', effect: 'maxhpperm+3', hint: '上限提升会保留整局' },
    ],
  });

  const vaultId = `event-${id++}`;
  deck.push({
    id: vaultId,
    type: 'event',
    name: '秘藏宝库',
    value: 0,
    image: eventScrollImage,
    eventChoices: [
      {
        text: '搜刮遗物（获得两张专属卡，随机弃两张手牌）',
        effect: ['drawClass2', 'randomDiscardHand:2'],
        hint: '专属卡放入背包，随机弃置两张手牌',
        requires: [{ type: 'hand', min: 2, message: '需要至少 2 张手牌' }],
      },
      {
        text: '翻找黄金（掷骰决定收益）',
        hint: '25% +10金 / 25% +20金 / 25% -10金 / 25% -10金且弃1手牌',
        diceTable: [
          { id: 'vault-gold10', range: [1, 5], label: '+10 金币', effect: 'gold+10' },
          { id: 'vault-gold20', range: [6, 10], label: '+20 金币', effect: 'gold+20' },
          { id: 'vault-gold-10', range: [11, 15], label: '-10 金币', effect: 'gold-10' },
          { id: 'vault-gold-10d', range: [16, 20], label: '-10 金币，弃 1 手牌', effect: 'gold-10,randomDiscardHand:1' },
        ],
      },
      {
        text: '翻出药剂（掷骰决定效果）',
        hint: '30% 恢复5HP / 30% 恢复10HP / 40% 受到8点伤害',
        diceTable: [
          { id: 'vault-heal5', range: [1, 6], label: '恢复 5 HP', effect: 'heal+5' },
          { id: 'vault-heal10', range: [7, 12], label: '恢复 10 HP', effect: 'heal+10' },
          { id: 'vault-dmg8', range: [13, 20], label: '受到 8 点伤害', effect: 'hp-8' },
        ],
      },
    ],
    flipTarget: {
      toCard: {
        id: `${vaultId}-flip`,
        type: 'event',
        name: '秘藏宝库（已开启）',
        value: 0,
        image: eventScrollImage,
        eventChoices: [
          { text: '翻阅卷轴（抽 2 张牌）', effect: 'drawHeroCards:2' },
          { text: '联络商贩（商店等级 +1）', effect: 'shopLevel+1' },
          { text: '召唤商队（打开商店）', effect: 'openShop' },
          { text: '深入探索（受 3 伤害，瀑流+1，翻转回去）', effect: 'vault-flipback', hint: '受到 3 点伤害，瀑流计数 +1，宝库翻转回未开启状态' },
        ],
      },
      destination: 'stay',
      message: '秘藏宝库翻转为已开启状态！',
    },
  });

  const shadowPactId = `event-${id++}`;
  deck.push({
    id: shadowPactId,
    type: 'event',
    name: '暗影契约',
    value: 0,
    image: eventScrollImage,
    eventChoices: [
      { text: '签下血约（受到 8 点伤害）', effect: 'hp-8' },
      {
        text: '献出装备（破坏任一装备）',
        effect: 'destroyEquipment:any',
        hint: '会要求你选择左或右装备',
        requires: [{ type: 'equipmentAny', message: '需要至少一件装备' }],
      },
      { text: '支付赎金（损失 15 金币）', effect: 'gold-15' },
      { text: '扩展手牌（手牌上限 +1，跳过翻转）', effect: 'handLimit+1', skipFlip: true },
    ],
    flipTarget: {
      toCard: {
        id: `${shadowPactId}-flip`,
        type: 'magic',
        name: '暗影之刺',
        value: 0,
        image: skillScrollImage,
        magicType: 'permanent',
        magicEffect: '永久：对怪造成伤害；用后叠刺+1，回回收袋。',
        description: '每用过一次叠刺+1；卡面数字为叠刺层数。',
        scalingDamage: 1,
      },
      destination: 'backpack',
      message: '暗影契约翻转为「暗影之刺」，已放入背包。',
    },
  });

  deck.push({
    id: `event-${id++}`,
    type: 'event',
    name: '共鸣熔炉',
    value: 0,
    image: eventScrollImage,
    eventChoices: [
      { text: '左槽淬火（左槽永久伤害 +1）', effect: 'slotLeftDamage+1' },
      { text: '右槽固化（右槽永久护甲 +1）', effect: 'slotRightDefense+1' },
      { text: '翻转轨道（左右装备互换）', effect: 'swapEquipmentSlots' },
    ],
    flipTarget: {
      toCard: {
        id: 'amulet-flip-gold',
        type: 'amulet',
        name: '熔炉之心',
        value: 0,
        image: balanceAmuletImage,
        description: '每有一张牌翻转，获得 3 金币。',
        amuletEffect: 'flip-gold',
      },
      destination: 'backpack',
      banner: '共鸣熔炉翻转为「熔炉之心」，已放入背包。',
    },
  });

  deck.push({
    id: `event-${id++}`,
    type: 'event',
    name: '贪婪祭坛',
    value: 0,
    image: eventScrollImage,
    eventChoices: [
      {
        id: 'greedy-left',
        text: '献祭左手装备（金币 +15）',
        effect: 'discardLeftForGold+15',
        requires: [{ type: 'equipment', slot: 'left', message: '左侧装备栏为空' }],
      },
      {
        id: 'greedy-right',
        text: '献祭右手装备（金币 +15）',
        effect: 'discardRightForGold+15',
        requires: [{ type: 'equipment', slot: 'right', message: '右侧装备栏为空' }],
      },
      {
        id: 'greedy-amulet',
        text: '粉碎所有护符（每个 +10 金币）',
        effect: 'amuletsToGold+10',
        requires: [{ type: 'amulet', message: '需要至少一个护符' }],
      },
      {
        id: 'greedy-blood',
        text: '献血离开（掉 8 HP）',
        effect: 'hp-8',
        hint: '仅当其他献祭方式全部不可用时可选',
        requiresDisabledChoices: ['greedy-left', 'greedy-right', 'greedy-amulet'],
        requiresDisabledReason: '仍有其他献祭方式可用',
      },
    ],
    waterfallEffect: { type: 'destroyAllEquipment', amount: 0, description: '被挤出时：破坏玩家所有装备' },
  });

  deck.push({
    id: `event-${id++}`,
    type: 'event',
    name: '荣誉回响',
    value: 0,
    image: eventScrollImage,
    description: '选择一项奖励。结算后，此卡右侧格子上的所有怪物将被激怒（进入交战）。',
    eventChoices: [
      { text: '整理呼吸（回复 8 HP）', effect: 'heal+8' },
      { text: '回收战利品（金币 +20）', effect: 'gold+20' },
      { text: '唤醒底牌（获得底部两张专属卡）', effect: 'classBottom+2' },
    ],
  });

  deck.push({
    id: `event-${id++}`,
    type: 'event',
    name: '血咒仪式',
    value: 0,
    image: eventScrollImage,
    eventChoices: [
      {
        id: 'curse-flip',
        text: '翻转卷轴（获得血咒）',
        effect: 'flipToCurse',
        hint: '事件卡本身会翻转成永久诅咒并进入背包',
      },
      {
        id: 'curse-discard-hand',
        text: '献祭手牌（手牌全弃）',
        effect: 'discardHandAll',
        requires: [{ type: 'hand', min: 1, message: '需要至少 1 张手牌' }],
      },
      {
        id: 'curse-pack-shrink',
        text: '束缚空间（背包容量 -4）',
        effect: 'backpackSize-4',
        hint: '背包容量永久降低 4，超过的卡牌会被随机放入回收袋',
      },
    ],
    waterfallEffect: { type: 'boostRowMonsterAttack', amount: 3, description: '被挤出时：所有怪物攻击 +3' },
  });

  const crimsonPactId = `event-${id++}`;
  deck.push({
    id: crimsonPactId,
    type: 'event',
    name: '深红契约',
    value: 0,
    image: eventScrollImage,
    eventChoices: [
      { text: '血价交易（-2 HP，发现专属）', effect: 'hp-2,discoverClass' },
      {
        text: '捐献财富（-4 金币，商店等级 +1）',
        effect: 'gold-4,shopLevel+1',
        requires: [{ type: 'gold', min: 4, message: '需要至少 4 金币' }],
      },
      {
        text: '焚尽旧物（弃 2 张牌，法伤 +1）',
        effect: ['discardCards:2', 'spellDamage+1'],
        requires: [
          {
            type: 'cardPool',
            pools: ['hand', 'backpack'],
            min: 2,
            message: '需要至少 2 张可弃置的卡牌',
          },
        ],
      },
    ],
    flipTarget: {
      toCard: {
        id: `${crimsonPactId}-flip`,
        type: 'event',
        name: '深红契约（觉醒）',
        value: 0,
        image: eventScrollImage,
        eventChoices: [
          { text: '鲜血献祭（-6 HP，发现专属）', effect: 'hp-6,discoverClass' },
          {
            text: '黄金燃祭（-12 金币，商店等级 +1）',
            effect: 'gold-12,shopLevel+1',
            requires: [{ type: 'gold', min: 12, message: '需要至少 12 金币' }],
          },
          {
            text: '灵魂焚烧（弃 4 张牌，法伤 +1）',
            effect: ['discardCards:4', 'spellDamage+1'],
            requires: [
              {
                type: 'cardPool',
                pools: ['hand', 'backpack'],
                min: 4,
                message: '需要至少 4 张可弃置的卡牌',
              },
            ],
          },
        ],
      },
      destination: 'stay',
      message: '深红契约觉醒！代价更高，但仍可反复使用。',
    },
  });

  deck.push({
    id: `event-${id++}`,
    type: 'event',
    name: '墓语密室',
    value: 0,
    image: eventScrollImage,
    description: '若左右两侧都是怪物，可获得全部效果。',
    eventChoices: [
      {
        text: '净化杂质（删 1 张牌）',
        effect: 'deleteCard:1',
        requires: [
          {
            type: 'cardPool',
            pools: ['hand', 'backpack'],
            min: 1,
            message: '需要至少 1 张可删除的卡牌',
          },
        ],
      },
      {
        text: '坟场召回（随机 3 选 1）',
        effect: 'graveyardDiscover',
        requires: [{ type: 'graveyard', min: 1, message: '坟场中没有可召回的卡牌' }],
      },
      { text: '召唤商贩（打开商店）', effect: 'openShop' },
      { text: '空间扩展（背包上限 +2）', effect: 'backpackSize+2' },
    ],
  });

  deck.push({
    id: `event-${id++}`,
    type: 'event',
    name: '奇术商会',
    value: 0,
    image: eventScrollImage,
    eventChoices: [
      { text: '思绪翻涌（抽 2 张牌）', effect: 'drawHeroCards:2' },
      { text: '扩张人脉（商店等级 +1）', effect: 'shopLevel+1' },
      {
        text: '挖掘遗物（坟场发现 1 张）',
        effect: 'graveyardDiscover',
        requires: [{ type: 'graveyard', min: 1, message: '坟场中没有可召回的卡牌' }],
      },
      { text: '翻转商会卷轴', effect: 'guildFlipToMagic', hint: '翻转为永久魔法「血金术」，放入背包' },
    ],
  });

  deck.push({
    id: `event-${id++}`,
    type: 'event',
    name: '命运骰盅',
    value: 0,
    image: eventScrollImage,
    eventChoices: [
      {
        text: '掷出不同结果：打开商店/商店等级+1/法术伤害+1/摧毁所有护符/发现一张专属卡，然后翻转成"命运之刃"。',
        hint: '20% 触发不同奖励或惩罚',
        diceTable: [
          { id: 'dice11-shop', range: [1, 4], label: '打开商店', effect: 'openShop' },
          { id: 'dice11-level', range: [5, 8], label: '商店等级 +1', effect: 'shopLevel+1' },
          { id: 'dice11-spell', range: [9, 12], label: '法术伤害 +1', effect: 'spellDamage+1' },
          { id: 'dice11-amulets', range: [13, 16], label: '摧毁所有护符', effect: 'removeAllAmulets' },
          { id: 'dice11-discover', range: [17, 20], label: '发现一张专属卡', effect: 'discoverClass' },
        ],
      },
    ],
  });

  deck.push({
    id: `event-${id++}`,
    type: 'event',
    name: '混沌骰局',
    value: 0,
    image: eventScrollImage,
    eventChoices: [
      {
        text: '20%掷出不同结果：打开商店/背包加入一张诅咒/删除1张牌/获得2张专属卡/抽2张牌，并翻转为"混沌冲击"。',
        hint: '20% 概率触发不同命运',
        diceTable: [
          { id: 'dice12-shop', range: [1, 4], label: '打开商店', effect: 'openShop' },
          { id: 'dice12-curse', range: [5, 8], label: '背包加入一张诅咒', effect: 'addCurse' },
          {
            id: 'dice12-delete',
            range: [9, 12],
            label: '删除 1 张牌',
            effect: 'deleteCard:1',
          },
          { id: 'dice12-class', range: [13, 16], label: '获得 2 张专属卡', effect: 'drawClass2' },
          { id: 'dice12-draw', range: [17, 20], label: '抽 2 张牌', effect: 'drawHeroCards:2' },
        ],
      },
    ],
  });

  return deck.sort(() => Math.random() - 0.5);
}

export function createStarterBackpack(): GameCardData[] {
  return [
    {
      id: STARTER_CARD_IDS.weaponBurst,
      type: 'magic',
      name: '战斗鼓舞',
      value: 0,
      image: skillScrollImage,
      magicType: 'permanent',
      magicEffect: '永久魔法：选择一个装备栏，使其装备的下一次攻击 +3。',
      description: '选择一个装备栏，使其中装备的下一次攻击临时 +3。',
    },
    {
      id: STARTER_CARD_IDS.repairOne,
      type: 'magic',
      name: '精工修复',
      value: 0,
      image: skillScrollImage,
      magicType: 'permanent',
      magicEffect: '永久魔法：选择一个装备，恢复 1 点耐久。',
      description: '精准地修补武器或护盾，恢复 1 点耐久值。',
      recycleDelay: 1,
    },
    {
      id: STARTER_CARD_IDS.healTwo,
      type: 'magic',
      name: '祝福之风',
      value: 0,
      image: skillScrollImage,
      magicType: 'permanent',
      magicEffect: '永久魔法：回复 2 点生命值。',
      description: '微风拂面，立即回复 2 点生命。',
    },
    {
      id: STARTER_CARD_IDS.reshuffle,
      type: 'magic',
      name: '迷宫回溯',
      value: 0,
      image: skillScrollImage,
      magicType: 'permanent',
      magicEffect: '永久魔法：选择一张地城卡牌，置于牌堆底（不打乱牌堆）。',
      description: '将一张地城卡牌放到牌堆最底部。',
      recycleDelay: 2,
    },
    {
      id: STARTER_CARD_IDS.dungeonSwap,
      type: 'magic',
      name: '乾坤挪移',
      value: 0,
      image: skillScrollImage,
      magicType: 'permanent',
      magicEffect: '永久魔法：将地城行最左和最右的卡牌对换位置。',
      description: '扭转地城秩序，将最左与最右的卡牌互换。',
      recycleDelay: 2,
    },
    {
      id: STARTER_CARD_IDS.trainingBlade,
      type: 'weapon',
      name: '新手短剑',
      value: 2,
      image: swordImage,
      durability: 2,
      maxDurability: 2,
    },
  ];
}

export const isHeroRowHighlightCard = (
  card: GameCardData | null,
): card is GameCardData & { type: HeroRowDropType } =>
  Boolean(card && (card.type === 'event' || card.type === 'magic' || card.type === 'hero-magic' || card.type === 'potion'));

