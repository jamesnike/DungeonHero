import dragonImage from '@assets/generated_images/cute_chibi_dragon_monster.png';
import skeletonImage from '@assets/generated_images/cute_chibi_skeleton_monster.png';
import goblinImage from '@assets/generated_images/cute_chibi_goblin_monster.png';
import ogreImage from '@assets/generated_images/cute_chibi_ogre_monster.png';
import swordImage from '@assets/generated_images/cute_cartoon_medieval_sword.png';
import axeImage from '@assets/generated_images/cute_cartoon_battle_axe.png';
import daggerImage from '@assets/generated_images/cute_cartoon_dagger.png';
import woodenShieldImage from '@assets/generated_images/cute_wooden_shield.png';
import ironShieldImage from '@assets/generated_images/cute_iron_shield.png';
import heavyShieldImage from '@assets/generated_images/simple_heavy_shield.png';
import potionImage from '@assets/generated_images/cute_cartoon_healing_potion.png';
import lifeAmuletImage from '@assets/generated_images/chibi_life_amulet.png';
import strengthAmuletImage from '@assets/generated_images/chibi_strength_amulet.png';
import guardianAmuletImage from '@assets/generated_images/chibi_guardian_amulet.png';
import skillScrollImage from '@assets/generated_images/chibi_skill_scroll.png';
import eventScrollImage from '@assets/generated_images/chibi_event_scroll.png';

import type { CardType, GameCardData } from '../GameCard';
import {
  DEV_MODE,
  DUNGEON_COLUMNS,
  DUNGEON_COLUMN_COUNT,
  ELITE_MONSTER_DISCARD_WARNING,
  ELITE_MONSTER_NAME_SET,
  SHOP_LEVEL_DISCOUNT_STEP,
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

export const getBaseShopPrice = (card: GameCardData): number => {
  if (SHOP_TYPE_PRICES[card.type as CardType] !== undefined) {
    return SHOP_TYPE_PRICES[card.type as CardType] as number;
  }
  return Math.max(5, card.value || 5);
};

export const getShopDiscountFactor = (level: number): number => Math.max(0, 1 - level * SHOP_LEVEL_DISCOUNT_STEP);

export const getShopDiscountPercent = (level: number): number =>
  Math.max(0, Math.round(level * SHOP_LEVEL_DISCOUNT_STEP * 100));

export const getShopPrice = (card: GameCardData, level: number): number => {
  const basePrice = getBaseShopPrice(card);
  const discounted = Math.floor(basePrice * getShopDiscountFactor(level));
  return Math.max(1, discounted);
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

    deck.push({
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
    });
  }

  const weaponTypes = [
    { name: 'Sword', image: swordImage },
    { name: 'Axe', image: axeImage },
    { name: 'Dagger', image: daggerImage },
    { name: 'Mace', image: swordImage },
    { name: 'Spear', image: daggerImage },
  ];

  for (let i = 0; i < 6; i++) {
    const weaponType = weaponTypes[i % weaponTypes.length];
    const value = Math.floor(Math.random() * 5) + 2;
    const durability = Math.floor(Math.random() * 4) + 1;
    deck.push({
      id: `weapon-${id++}`,
      type: 'weapon',
      name: weaponType.name,
      value,
      image: weaponType.image,
      durability,
      maxDurability: durability,
    });
  }

  const shieldTypes = [
    { name: 'Wooden Shield', value: 2, image: woodenShieldImage },
    { name: 'Iron Shield', value: 3, image: ironShieldImage },
    { name: 'Heavy Shield', value: 4, image: heavyShieldImage },
  ];

  const shieldDistribution = [shieldTypes[0], shieldTypes[0], shieldTypes[1], shieldTypes[1], shieldTypes[2]];

  shieldDistribution.forEach(shieldType => {
    const durability = Math.floor(Math.random() * 4) + 1;
    deck.push({
      id: `shield-${id++}`,
      type: 'shield',
      name: shieldType.name,
      value: shieldType.value,
      image: shieldType.image,
      durability,
      maxDurability: durability,
    });
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
      potionEffect: 'heal-7',
      description: '立即回复7点生命。',
    },
    {
      type: 'potion',
      name: '高级修复剂',
      value: 7,
      image: potionImage,
      potionEffect: 'repair-equipment-2',
      description: '选择一个武器或护盾，恢复2点耐久。',
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
      description: '左边Equipment攻击+3，右边Equipment护甲+3',
      amuletEffect: 'balance',
    },
    {
      type: 'amulet',
      name: 'Life Amulet',
      value: 5,
      image: lifeAmuletImage,
      description: '攻击时候，超出对方血量的伤害，为自己回血',
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
      description: '所有Equipment 攻击+4，每攻击一次，掉3点血',
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
    magicEffect: '将激活行的所有卡牌洗回牌堆，然后触发瀑布。',
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
    magicEffect: '从背包抽牌，数量等于自上次瀑布后弃置的牌数。',
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
    magicEffect: '对任意怪物造成等同于你已损失生命的伤害。',
  });

  deck.push({
    id: `magic-${id++}`,
    type: 'magic',
    name: '永恒修复',
    value: 0,
    image: skillScrollImage,
    magicType: 'instant',
    magicEffect: '选择一个已装备物品，并恢复到满耐久。',
  });

  deck.push({
    id: `event-${id++}`,
    type: 'event',
    name: '命运十字路口',
    value: 0,
    image: eventScrollImage,
    eventChoices: [
      { text: '倾听命运的低语（发现专属卡）', effect: 'discoverClass', hint: '立即进行发现流程' },
      { text: '与命运商贩交谈（打开商店）', effect: 'openShop', hint: '立刻开启商店' },
      { text: '献祭体魄（永久 +3 生命上限）', effect: 'maxhpperm+3', hint: '上限提升会保留整局' },
    ],
  });

  deck.push({
    id: `event-${id++}`,
    type: 'event',
    name: '秘藏宝库',
    value: 0,
    image: eventScrollImage,
    eventChoices: [
      { text: '搜刮遗物（获得两张专属卡）', effect: 'drawClass2', hint: '立刻放入背包' },
      {
        text: '逐层翻找黄金（掷骰 5-14 金币）',
        hint: '展示掷骰动画，并映射为金币奖励',
        diceTable: [
          { id: 'gold-5', range: [1, 2], label: '+5 金币', effect: 'gold+5' },
          { id: 'gold-6', range: [3, 4], label: '+6 金币', effect: 'gold+6' },
          { id: 'gold-7', range: [5, 6], label: '+7 金币', effect: 'gold+7' },
          { id: 'gold-8', range: [7, 8], label: '+8 金币', effect: 'gold+8' },
          { id: 'gold-9', range: [9, 10], label: '+9 金币', effect: 'gold+9' },
          { id: 'gold-10', range: [11, 12], label: '+10 金币', effect: 'gold+10' },
          { id: 'gold-11', range: [13, 14], label: '+11 金币', effect: 'gold+11' },
          { id: 'gold-12', range: [15, 16], label: '+12 金币', effect: 'gold+12' },
          { id: 'gold-13', range: [17, 18], label: '+13 金币', effect: 'gold+13' },
          { id: 'gold-14', range: [19, 20], label: '+14 金币', effect: 'gold+14' },
        ],
      },
      {
        text: '翻出治疗药剂（掷骰 2-6 治疗）',
        hint: '示意掷骰并标出对应治疗值',
        diceTable: [
          { id: 'heal-2', range: [1, 4], label: '恢复 2 HP', effect: 'heal+2' },
          { id: 'heal-3', range: [5, 8], label: '恢复 3 HP', effect: 'heal+3' },
          { id: 'heal-4', range: [9, 12], label: '恢复 4 HP', effect: 'heal+4' },
          { id: 'heal-5', range: [13, 16], label: '恢复 5 HP', effect: 'heal+5' },
          { id: 'heal-6', range: [17, 20], label: '恢复 6 HP', effect: 'heal+6' },
        ],
      },
    ],
  });

  deck.push({
    id: `event-${id++}`,
    type: 'event',
    name: '暗影契约',
    value: 0,
    image: eventScrollImage,
    eventChoices: [
      { text: '签下血约（受到 5 点伤害）', effect: 'hp-5' },
      {
        text: '献出装备（破坏任一装备）',
        effect: 'destroyEquipment:any',
        hint: '会要求你选择左或右装备',
        requires: [{ type: 'equipmentAny', message: '需要至少一件装备' }],
      },
      { text: '支付赎金（损失 10 金币）', effect: 'gold-10' },
    ],
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
        text: '献血离开（掉 5 HP）',
        effect: 'hp-5',
        hint: '仅当其他献祭方式全部不可用时可选',
        requiresDisabledChoices: ['greedy-left', 'greedy-right', 'greedy-amulet'],
        requiresDisabledReason: '仍有其他献祭方式可用',
      },
    ],
  });

  deck.push({
    id: `event-${id++}`,
    type: 'event',
    name: '荣誉回响',
    value: 0,
    image: eventScrollImage,
    eventChoices: [
      { text: '整理呼吸（回复 5 HP）', effect: 'heal+5' },
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
        hint: '背包容量永久降低 4，超过的卡牌会被丢弃',
      },
    ],
  });

  deck.push({
    id: `event-${id++}`,
    type: 'event',
    name: '深红契约',
    value: 0,
    image: eventScrollImage,
    eventChoices: [
      { text: '血价交易（-2 HP，发现专属）', effect: 'hp-2,discoverClass' },
      { text: '捐献财富（-4 金币，商店等级 +1）', effect: 'gold-4,shopLevel+1' },
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
  });

  deck.push({
    id: `event-${id++}`,
    type: 'event',
    name: '墓语密室',
    value: 0,
    image: eventScrollImage,
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
        text: '掷动命运骰子',
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
        text: '掷出混沌结果',
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
      magicEffect: '永久魔法：选择一个武器，使它的下一次攻击 +3。',
      description: '选择一个已装备的武器，让它的下一次攻击临时 +3。',
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
      magicEffect: '永久魔法：选择一张地城卡牌，洗回牌堆。',
      description: '将一张地城卡牌洗回牌堆，重新扰乱命运。',
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

