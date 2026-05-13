import dragonImage from '@assets/generated_images/cute_chibi_dragon_monster.png';
import skeletonImage from '@assets/generated_images/cute_chibi_skeleton_monster.png';
import goblinImage from '@assets/generated_images/cute_chibi_goblin_monster.png';
import ogreImage from '@assets/generated_images/cute_chibi_ogre_monster.png';
import eliteDragonImage from '@assets/generated_images/elite_dragon_monster.png';
import eliteSkeletonImage from '@assets/generated_images/elite_skeleton_monster.png';
import eliteGoblinImage from '@assets/generated_images/elite_goblin_monster.png';
import eliteOgreImage from '@assets/generated_images/elite_ogre_monster.png';
import swordImage from '@assets/generated_images/cute_cartoon_medieval_sword.png';
import axeImage from '@assets/generated_images/cute_cartoon_battle_axe.png';
import daggerImage from '@assets/generated_images/cute_cartoon_dagger.png';
import daggerWeaponImage from '@assets/generated_images/cute_cartoon_weapon_dagger.png';
import holyBladeImage from '@assets/generated_images/cute_cartoon_holy_blade.png';
import maceImage from '@assets/generated_images/cute_cartoon_mace.png';
import arcaneBladeImage from '@assets/generated_images/arcane_blade_weapon.png';
import starterGhostBladeImage from '@assets/generated_images/starter_ghost_blade.png';
import warhammerImage from '@assets/generated_images/thunder_warhammer.png';
import woodenShieldImage from '@assets/generated_images/cute_wooden_shield.png';
import ironShieldImage from '@assets/generated_images/cute_iron_shield.png';
import heavyShieldImage from '@assets/generated_images/card_dedupe_shield_heavy_main.png';
import potionImage from '@assets/generated_images/cute_cartoon_healing_potion.png';
import lifeAmuletImage from '@assets/generated_images/chibi_life_amulet.png';
import strengthAmuletImage from '@assets/generated_images/chibi_strength_amulet.png';
import balanceAmuletImage from '@assets/generated_images/chibi_balance_amulet.png';
import dedupeAmuletCatapultImage from '@assets/generated_images/card_dedupe_amulet_catapult.png';
import forgeHeartAmuletImage from '@assets/generated_images/chibi_forge_heart_amulet.png';
import dedupeMagicWaterfallResetImage from '@assets/generated_images/card_dedupe_magic_waterfall_reset.png';
import dedupeMagicStormArrowsImage from '@assets/generated_images/card_dedupe_magic_storm_arrows.png';
import dedupeMagicEchoBagImage from '@assets/generated_images/card_dedupe_magic_echo_bag.png';
import dedupeMagicTideArmorImage from '@assets/generated_images/card_dedupe_magic_tide_armor.png';
import dedupeMagicGoldJudgmentImage from '@assets/generated_images/card_dedupe_magic_gold_judgment.png';
import dedupeMagicFullHandSpringImage from '@assets/generated_images/card_dedupe_magic_full_hand_spring.png';
import dedupeMagicEquivalentExchangeImage from '@assets/generated_images/card_dedupe_magic_equivalent_exchange.png';
import dedupeMagicUnderworldRelicImage from '@assets/generated_images/card_dedupe_magic_underworld_relic.png';
import dedupeMagicArcaneRefineImage from '@assets/generated_images/card_dedupe_magic_arcane_refine.png';
import dedupePersuadeScrollCharmImage from '@assets/generated_images/card_dedupe_persuade_scroll_charm.png';
import dedupeMagicShadowSpikeFlipImage from '@assets/generated_images/card_dedupe_magic_shadow_spike_flip.png';
import dedupeStarterCombatRallyImage from '@assets/generated_images/card_dedupe_starter_combat_rally.png';
import dedupeStarterFineRepairImage from '@assets/generated_images/card_dedupe_starter_fine_repair.png';
import dedupeStarterBlessingWindImage from '@assets/generated_images/card_dedupe_starter_blessing_wind.png';
import dedupeStarterMazeRewindImage from '@assets/generated_images/card_dedupe_starter_maze_rewind.png';
import dedupeStarterWorldSwapImage from '@assets/generated_images/card_dedupe_starter_world_swap.png';
import dedupeEventFateCrossroadsImage from '@assets/generated_images/card_dedupe_event_fate_crossroads.png';
import dedupeEventSecretVaultImage from '@assets/generated_images/card_dedupe_event_secret_vault.png';
import dedupeEventSecretVaultOpenImage from '@assets/generated_images/card_dedupe_event_secret_vault_open.png';
import dedupeEventShadowPactImage from '@assets/generated_images/card_dedupe_event_shadow_pact.png';
import dedupeEventResonanceForgeImage from '@assets/generated_images/card_dedupe_event_resonance_forge.png';
import dedupeEventGreedyAltarImage from '@assets/generated_images/card_dedupe_event_greedy_altar.png';
import dedupeEventSealAltarBuildingImage from '@assets/generated_images/card_dedupe_event_seal_altar_building.png';
import dedupeEventBattleHonorImage from '@assets/generated_images/card_dedupe_event_battle_honor.png';
import dedupeEventBloodCurseImage from '@assets/generated_images/card_dedupe_event_blood_curse.png';
import dedupeEventCrimsonPactImage from '@assets/generated_images/card_dedupe_event_crimson_pact.png';
import dedupeEventCrimsonPactAwakenedImage from '@assets/generated_images/card_dedupe_event_crimson_pact_awakened.png';
import dedupeEventCryptWhisperImage from '@assets/generated_images/card_dedupe_event_crypt_whisper.png';
import dedupeEventArcaneGuildImage from '@assets/generated_images/card_dedupe_event_arcane_guild.png';
import dedupeEventFateDiceCupImage from '@assets/generated_images/card_dedupe_event_fate_dice_cup.png';
import dedupeEventChaosDiceGameImage from '@assets/generated_images/card_dedupe_event_chaos_dice_game.png';
import dedupeEventCursedDiceImage from '@assets/generated_images/card_dedupe_knight_magic_fortune_wheel.png';
import dedupeEventCursedDiceBuildingImage from '@assets/generated_images/card_dedupe_cursed_stele_building.png';
import potionEternalInscribeImage from '@assets/generated_images/card_dedupe_potion_eternal_perm.png';
import potionAmuletToRelicImage from '@assets/generated_images/potion_amulet_to_relic.png';

import type { CardType, GameCardData } from '../GameCard';
import type { RngState } from '@/game-core/rng';
import { nextInt, shuffle as rngShuffle } from '@/game-core/rng';
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

export const countActiveRowSlotsExcludeGhost = (slots: ActiveRowSlots): number =>
  slots.reduce((count, card) => (card && !card.isGhost ? count + 1 : count), 0);

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

export const getEmptyOrGhostColumns = (slots: ActiveRowSlots): number[] =>
  DUNGEON_COLUMNS.filter(columnIndex => !slots[columnIndex] || slots[columnIndex]?.isGhost);

export const getFilledPreviewColumns = (slots: ActiveRowSlots): number[] =>
  DUNGEON_COLUMNS.filter(columnIndex => Boolean(slots[columnIndex]));

// `createEmptyAmuletEffects` lives in `@/game-core/constants` — don't redefine here.
// Dead code historically duplicated the factory and silently went stale when
// new amulet effects were added.

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
  Boolean(card && (card.type === 'magic' || card.type === 'hero-magic' || card.type === 'potion' || card.type === 'curse'));

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

export const getRandomInt = (min: number, max: number, rng: RngState): [number, RngState] =>
  nextInt(rng, min, max);

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

export function createDeck(rng: RngState): [GameCardData[], RngState] {
  const deck: GameCardData[] = [];
  let id = 0;
  let currentRng = rng;

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
      image: eliteDragonImage,
      minAttack: 6,
      maxAttack: 8,
      minHp: 9,
      maxHp: 11,
      minFury: 3,
      maxFury: 4,
    },
    {
      name: 'Bone Overlord',
      image: eliteSkeletonImage,
      minAttack: 5,
      maxAttack: 7,
      minHp: 7,
      maxHp: 9,
      minFury: 3,
      maxFury: 4,
    },
    {
      name: 'Goblin Warlock',
      image: eliteGoblinImage,
      minAttack: 4,
      maxAttack: 6,
      minHp: 5,
      maxHp: 7,
      minFury: 2,
      maxFury: 3,
    },
    {
      name: 'Ogre Juggernaut',
      image: eliteOgreImage,
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
    let attack: number; [attack, currentRng] = nextInt(currentRng, monsterType.minAttack, monsterType.maxAttack);
    let hp: number; [hp, currentRng] = nextInt(currentRng, monsterType.minHp, monsterType.maxHp);
    let fury: number; [fury, currentRng] = nextInt(currentRng, monsterType.minFury, monsterType.maxFury);
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
      monsterCard.onAttackEffect = 'steal-gold-5';
    }
    deck.push(monsterCard);
  }

  const weaponTypes = [
    { name: 'Holy Blade', image: holyBladeImage },
    { name: 'Sword', image: axeImage },
    { name: 'Dagger', image: daggerWeaponImage },
    { name: 'Mace', image: maceImage },
    { name: '虚灵刀', image: starterGhostBladeImage },
    { name: '奥术之刃', image: arcaneBladeImage },
    { name: '战锤', image: warhammerImage },
  ];
  let selectedWeapons: typeof weaponTypes;
  [selectedWeapons, currentRng] = rngShuffle([...weaponTypes], currentRng);
  selectedWeapons = selectedWeapons.slice(0, 6);

  for (let i = 0; i < 6; i++) {
    const weaponType = selectedWeapons[i];
    let value: number; [value, currentRng] = nextInt(currentRng, 2, 6);
    let durability: number; [durability, currentRng] = nextInt(currentRng, 1, 4);
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
      card.onEquipEffect = 'spell-lifesteal+1';
      card.overkillDraw = 1;
      card.description = '入场：超杀吸血 +1。超杀：抽 1 张牌。';
      card.durability = 2;
      card.maxDurability = 2;
    }
    if (weaponType.name === '虚灵刀') {
      [card.durability, currentRng] = nextInt(currentRng, 2, 3);
      card.maxDurability = card.durability;
      card.ghostBladeExile = true;
      card.description = '每次攻击后，可从坟场选择卡牌移除出游戏。';
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
      card.durability = 2;
      card.maxDurability = 2;
      card.daggerSelfDestructDiscover = true;
      card.description = '攻击后，可自毁来发现专属牌。';
    }
    if (weaponType.name === 'Sword') {
      card.value = Math.min(card.value, 3);
      card.waterfallAttackBoost = 1;
      card.onDestroyGold = 4;
      card.description = '每次瀑流触发时，攻击力 +1。遗言：获得 4 金币。';
    }
    if (weaponType.name === '奥术之刃') {
      [card.value, currentRng] = nextInt(currentRng, 1, 2);
      let abDurability: number; [abDurability, currentRng] = nextInt(currentRng, 2, 3);
      card.durability = abDurability;
      card.maxDurability = abDurability;
      card.postAttackSpellDamage = 1;
      card.description = '攻击后，随机对一个怪物造成 1 点法术伤害（受法术伤害加成）。';
    }
    if (weaponType.name === '战锤') {
      [card.value, currentRng] = nextInt(currentRng, 1, 3);
      card.durability = 2;
      card.maxDurability = 2;
      card.weaponStunChance = 40;
      card.onEquipEffect = 'stunCap+5';
      card.description = '入场：击晕上限 +5%。击晕率 40%。';
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
    let durability: number;
    if (shieldType.name === 'Wooden Shield') {
      [durability, currentRng] = nextInt(currentRng, 1, 2);
    } else if (shieldType.name === 'Iron Shield') {
      [durability, currentRng] = nextInt(currentRng, 1, 3);
    } else {
      [durability, currentRng] = nextInt(currentRng, 2, 3);
    }
    const card: GameCardData = {
      id: `shield-${id++}`,
      type: 'shield',
      name: shieldType.name,
      value: shieldType.value,
      image: shieldType.image,
      durability,
      maxDurability: durability,
      armorMax: shieldType.value,
    };
    if (shieldType.name === 'Wooden Shield') {
      card.onDestroyHeal = 3;
      card.description = '遗言：恢复 3 点生命。';
    }
    if (shieldType.name === 'Iron Shield') {
      card.onDestroyEffect = 'graveyard-to-hand';
      card.description = '遗言：随机获得一张坟场的牌，移到手牌。';
    }
    if (shieldType.name === 'Heavy Shield') {
      card.damageReflect = 1;
      card.onDestroyClassDraw = 1;
      card.description =
        '格挡时反弹 1 点基础伤害给攻击者（叠加该装备栏永久伤害与永久法术伤害加成）。遗言：获得 1 张专属卡。';
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
    {
      type: 'potion',
      name: '永恒铭刻药',
      value: 6,
      image: potionEternalInscribeImage,
      potionEffect: 'grant-perm-2',
      description: '选择一张没有 Perm 属性的手牌，赋予 Perm 3（被移除后进入回收袋，经 3 次瀑流返回背包）。',
    },
    {
      type: 'potion',
      name: '护符永铸药',
      value: 0,
      image: potionAmuletToRelicImage,
      potionEffect: 'amulet-to-eternal-relic',
      description: '选择一个护符栏中的护符，将其转化为永恒护符（移除护符，效果永久生效）。',
    },
    {
      type: 'potion',
      name: '回合汲取药',
      value: 5,
      image: potionImage,
      potionEffect: 'grant-amulet-end-turn-draw',
      description: '获得永久护符「回合汲取」：每次结束英雄回合时，从背包抽 1 张牌。',
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
      image: balanceAmuletImage,
      description: '左边装备栏临时攻击+3临时护甲-1，右边装备栏临时护甲+3临时攻击-1',
      amuletEffect: 'balance',
    },
    {
      type: 'amulet',
      name: 'Life Amulet',
      value: 5,
      image: lifeAmuletImage,
      description: '超杀吸血+3。',
      amuletEffect: 'life',
    },
    {
      type: 'amulet',
      name: 'Catapult Amulet',
      value: 5,
      image: dedupeAmuletCatapultImage,
      description: '每手动弃置1张牌，抽2张牌。',
      amuletEffect: 'catapult',
    },
    {
      type: 'amulet',
      name: 'Flash Amulet',
      value: 5,
      image: strengthAmuletImage,
      description: '所有装备攻击力减半，攻击次数+1',
      amuletEffect: 'flash',
    },
    {
      type: 'amulet',
      name: 'Strength Amulet',
      value: 5,
      image: strengthAmuletImage,
      description: '所有装备栏临时攻击+4，每攻击一次，失去2血',
      amuletEffect: 'strength',
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
    image: dedupeMagicWaterfallResetImage,
    magicType: 'instant',
    magicEffect: '将激活行的所有卡牌置于牌堆底（不打乱其余牌序），然后触发瀑布。',
  });

  deck.push({
    id: `magic-${id++}`,
    type: 'magic',
    name: '风暴箭雨',
    value: 0,
    image: dedupeMagicStormArrowsImage,
    magicType: 'instant',
    magicEffect: '对激活行的每个怪物造成 3 点伤害。',
  });

  deck.push({
    id: `magic-${id++}`,
    type: 'magic',
    name: '回响行囊',
    value: 0,
    image: dedupeMagicEchoBagImage,
    magicType: 'instant',
    magicEffect: '弃回至多 2 张手牌，从坟场发现 2 张牌加入手牌，再从背包抽 2 张牌。',
  });

  deck.push({
    id: `magic-${id++}`,
    type: 'magic',
    name: '潮涌铸甲',
    value: 0,
    image: dedupeMagicTideArmorImage,
    magicType: 'instant',
    magicEffect: '2选1获得永恒护符：瀑流铸剑（每次攻击该栏临时攻击+2）或格挡铸甲（每次格挡该栏临时护甲+2）。可叠加。',
  });

  deck.push({
    id: `magic-${id++}`,
    type: 'magic',
    name: '点金裁决',
    value: 0,
    image: dedupeMagicGoldJudgmentImage,
    magicType: 'instant',
    magicEffect: '对任意怪物造成等同于当前金币数量的伤害，并恢复等量生命。',
  });

  deck.push({
    id: `magic-${id++}`,
    type: 'magic',
    name: '涌泉满手',
    value: 0,
    image: dedupeMagicFullHandSpringImage,
    magicType: 'instant',
    magicEffect: '恢复 8 点生命，手牌补充到上限（从背包抽牌）。',
  });

  deck.push({
    id: `magic-${id++}`,
    type: 'magic',
    name: '等价交换',
    value: 0,
    image: dedupeMagicEquivalentExchangeImage,
    magicType: 'instant',
    magicEffect: '选择一件装备和一个非Boss怪物，互换它们的耐久与血层数。',
  });

  deck.push({
    id: `magic-${id++}`,
    type: 'magic',
    name: '冥途拾遗',
    value: 0,
    image: dedupeMagicUnderworldRelicImage,
    magicType: 'instant',
    magicEffect: '坟场随机取回 3 张牌。',
    description: '一次性：从坟场随机取回至多 3 张牌加入背包（不能取回自己）。',
    knightEffect: 'graveyard-recall',
    maxUpgradeLevel: 3,
  });

  deck.push({
    id: `magic-${id++}`,
    type: 'magic',
    name: '怀柔令',
    value: 0,
    image: dedupePersuadeScrollCharmImage,
    magicType: 'instant',
    magicEffect: '劝降费用永久 -2，下次成功率 +10%。',
    description: '一次性：劝降费用永久降低 2 金币，下次劝降成功率 +10%。',
    knightEffect: 'persuade-discount',
    maxUpgradeLevel: 2,
  });

  deck.push({
    id: `magic-${id++}`,
    type: 'magic',
    name: '秘法精炼',
    value: 0,
    image: dedupeMagicArcaneRefineImage,
    magicType: 'instant',
    magicEffect: '升级手牌中至多 2 张魔法牌。',
    description: '一次性：选择手牌中至多 2 张可升级的魔法牌，各升级一次。',
  });

  deck.push({
    id: `event-${id++}`,
    type: 'event',
    name: '命运十字路口',
    value: 0,
    image: dedupeEventFateCrossroadsImage,
    description: '打开时向左平移至被阻挡位置。若正下方有装备或护符，可破坏它并获得全部效果。选择任意选项后翻转为「命运挪移」。',
    eventChoices: [
      { text: '倾听命运的低语（发现2张专属卡）', effect: 'drawClass2', hint: '获得 2 张职业牌放入背包' },
      { text: '与命运商贩交谈（商店等级+1 并 打开商店）', effect: ['shopLevel+1', 'openShop'], hint: '商店等级+1 并立刻开启商店' },
      { text: '献祭体魄（永久 +8 生命上限）', effect: 'maxhpperm+8', hint: '上限提升会保留整局' },
      { text: '选择一张牌升级', effect: 'upgradeCard', hint: '从所有可升级的牌中选择一张进行升级' },
    ],
  });

  const vaultId = `event-${id++}`;
  deck.push({
    id: vaultId,
    type: 'event',
    name: '秘藏宝库',
    value: 0,
    image: dedupeEventSecretVaultImage,
    description: '选择选项后翻转为「秘藏宝库（已开启）」，可重复使用。',
    eventChoices: [
      {
        text: '搜刮遗物（获得两张专属卡，随机弃回两张手牌）',
        effect: ['drawClass2', 'randomDiscardHand:2'],
        hint: '专属卡放入背包，随机弃回两张手牌',
        requires: [{ type: 'hand', min: 2, message: '需要至少 2 张手牌' }],
      },
      {
        text: '翻找黄金（掷骰决定收益）',
        hint: '25% +20金 / 25% +30金 / 25% -10金 / 25% -10金且弃回1手牌',
        diceTable: [
          { id: 'vault-gold20', range: [1, 5], label: '+20 金币', effect: 'gold+20' },
          { id: 'vault-gold30', range: [6, 10], label: '+30 金币', effect: 'gold+30' },
          { id: 'vault-gold-10', range: [11, 15], label: '-10 金币', effect: 'gold-10' },
          { id: 'vault-gold-10d', range: [16, 20], label: '-10 金币，弃回 1 张手牌', effect: 'gold-10,randomDiscardHand:1' },
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
        image: dedupeEventSecretVaultOpenImage,
        eventChoices: [
          { text: '翻阅卷轴（抽 3 张牌）', effect: 'drawHeroCards:3' },
          { text: '联络商贩（商店等级 +1，劝降等级 +1）', effect: ['shopLevel+1', 'persuadeLevel+1'], hint: '商店等级与劝降等级各 +1' },
          { text: '召唤商队（金币+10 且 打开商店）', effect: ['gold+10', 'openShop'], hint: '获得 10 金币并立刻开启商店' },
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
    image: dedupeEventShadowPactImage,
    description: '选择选项后翻转为「暗影之刺」永久魔法（扩展手牌选项除外）。',
    eventChoices: [
      { text: '签下血约（受到 8 点伤害）', effect: 'hp-8' },
      {
        text: '献出装备（破坏任一装备）',
        effect: 'destroyEquipment:any',
        hint: '会要求你选择左或右装备',
        requires: [{ type: 'equipmentAny', message: '需要至少一件装备' }],
      },
      { text: '支付赎金（损失 15 金币）', effect: 'gold-15', requires: [{ type: 'gold', min: 15, message: '需要至少 15 金币' }] },
      { text: '扩展手牌（手牌上限 +1，跳过翻转）', effect: 'handLimit+1', skipFlip: true },
    ],
    flipTarget: {
      toCard: {
        id: `${shadowPactId}-flip`,
        type: 'magic',
        name: '暗影之刺',
        value: 0,
        image: dedupeMagicShadowSpikeFlipImage,
        magicType: 'permanent',
        magicEffect: '永久：对怪造成伤害；用后叠刺+1，回回收袋。',
        description: '每用过一次叠刺+1；卡面数字为叠刺层数。',
        scalingDamage: 3,
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
    image: dedupeEventResonanceForgeImage,
    description: '选择选项后翻转为「熔炉之心」护符。',
    eventChoices: [
      { text: '左槽淬火（左槽永久伤害 +2，恢复1耐久）', effect: ['slotLeftDamage+2', 'repairSlot:left:1'] },
      { text: '右槽固化（右槽永久护甲 +2，恢复1耐久）', effect: ['slotRightDefense+2', 'repairSlot:right:1'] },
      { text: '翻转轨道（左右装备互换，各恢复1耐久）', effect: ['swapEquipmentSlots', 'repairSlot:both:1'] },
    ],
    flipTarget: {
      toCard: {
        id: 'amulet-flip-gold',
        type: 'amulet',
        name: '熔炉之心',
        value: 0,
        image: forgeHeartAmuletImage,
        description: '每有一张牌翻转，获得 3 金币。可熔炉灵焰',
        amuletEffect: 'flip-gold',
        recycleDelay: 1,
      },
      destination: 'backpack',
      banner: '共鸣熔炉翻转为「熔炉之心」，已放入背包。',
    },
  });

  deck.push({
    id: `event-${id++}`,
    type: 'event',
    name: '破坏祭坛',
    value: 0,
    image: dedupeEventGreedyAltarImage,
    description: '选择选项后翻转为「破印遗物」一次性魔法。',
    eventChoices: [
      {
        id: 'greedy-left',
        text: '献祭所有左手装备（每个 +10 金币）',
        effect: 'discardAllLeftForGold+10',
        requires: [{ type: 'equipment', slot: 'left', message: '左侧装备栏为空' }],
      },
      {
        id: 'greedy-right',
        text: '献祭所有右手装备（每个 +10 金币）',
        effect: 'discardAllRightForGold+10',
        requires: [{ type: 'equipment', slot: 'right', message: '右侧装备栏为空' }],
      },
      {
        id: 'greedy-current-left',
        text: '献祭当前左手装备（金币 +15）',
        effect: 'discardCurrentLeftForGold+15',
        requires: [{ type: 'equipment', slot: 'left', message: '左侧装备栏为空' }],
      },
      {
        id: 'greedy-current-right',
        text: '献祭当前右手装备（金币 +15）',
        effect: 'discardCurrentRightForGold+15',
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
        requiresDisabledChoices: ['greedy-left', 'greedy-right', 'greedy-current-left', 'greedy-current-right', 'greedy-amulet'],
        requiresDisabledReason: '仍有其他献祭方式可用',
      },
    ],
    waterfallEffect: { type: 'destroyAllEquipment', amount: 0, description: '被挤出时：破坏玩家所有装备' },
    flipTarget: {
      toCard: {
        id: 'event-greedy-altar-seal-altar',
        type: 'building',
        name: '破印祭坛',
        value: 0,
        image: dedupeEventSealAltarBuildingImage,
        buildingAura: 'suppress-adjacent-temp-attack',
        fury: 1,
        hpLayers: 1,
        currentLayer: 1,
        hp: 6,
        maxHp: 6,
        description:
          '光环（在场时生效，毁坏后消失）：在预览行、地城激活行与英雄行构成的 5 列棋盘上，与本建筑八邻（含斜向）相邻格子中的玩家装备，不受该装备栏「临时攻击」数值加成。',
      },
      destination: 'stay',
      message: '破坏祭坛凝固为破印祭坛！',
      banner: '破坏祭坛翻转为「破印祭坛」',
    },
  });

  deck.push({
    id: `event-${id++}`,
    type: 'event',
    name: '战血荣誉',
    value: 0,
    image: dedupeEventBattleHonorImage,
    description: '结算后，此卡右侧格子上的所有怪物将被激怒（进入交战）。',
    eventChoices: [
      { text: '整理呼吸（回复 8 HP，超杀吸血+1）', effect: ['heal+8', 'spellLifesteal+1'] },
      { text: '回收战利品（金币 +15，打开商店）', effect: ['gold+15', 'openShop'] },
      { text: '唤醒底牌（获得底部三张专属卡）', effect: 'classBottom+3' },
      { text: '选择一张牌升级', effect: 'upgradeCard', hint: '从所有可升级的牌中选择一张进行升级' },
    ],
  });

  deck.push({
    id: `event-${id++}`,
    type: 'event',
    name: '血咒仪式',
    value: 0,
    image: dedupeEventBloodCurseImage,
    eventChoices: [
      {
        id: 'curse-flip',
        text: '翻转卷轴（获得血咒）',
        effect: 'flipToCurse',
        hint: '事件卡本身会翻转成永久诅咒并进入背包',
      },
      {
        id: 'curse-discard-hand',
        text: '献祭手牌（手牌全部弃回）',
        effect: 'discardHandAll',
        requires: [{ type: 'hand', min: 1, message: '需要至少 1 张手牌' }],
      },
      {
        id: 'curse-hand-all-recycle',
        text: '缚咒收纳（所有手牌移入回收袋）',
        effect: 'handAllToRecycleBag',
        requires: [{ type: 'hand', min: 1, message: '需要至少 1 张手牌' }],
        hint: '全部手牌进入永久魔法回收袋（含不可回收牌）',
      },
      {
        id: 'curse-pack-shrink',
        text: '束缚空间（背包容量 -4）',
        effect: 'backpackSize-4',
        hint: '背包容量永久降低 4，超过的卡牌会被随机放入回收袋',
      },
      {
        id: 'curse-atk-recall',
        text: '血蚀锋刃（所有装备栏永久攻击 -1，翻转成「回收术」）',
        effect: ['allSlotDamage-1', 'flipToRecallEquip'],
        hint: '左右装备栏永久伤害各 -1，事件卡翻转为「回收术」永久魔法放入背包',
      },
      {
        id: 'curse-def-blessing',
        text: '血蚀铠甲（所有装备栏永久护甲 -1，翻转成「不灭赐福」）',
        effect: ['allSlotShield-1', 'flipToUndyingBlessing'],
        hint: '左右装备栏永久护甲各 -1，事件卡翻转为「不灭赐福」永久魔法放入背包',
      },
    ],
    waterfallEffect: { type: 'boostRowMonsterAttack', amount: 5, description: '被挤出时：所有怪物攻击 +5' },
  });

  const crimsonPactId = `event-${id++}`;
  deck.push({
    id: crimsonPactId,
    type: 'event',
    name: '双重燃烧',
    value: 0,
    image: dedupeEventCrimsonPactImage,
    description: '选择选项后翻转为「双重燃烧（觉醒）」。',
    eventChoices: [
      { text: '血价交易（-2 HP，发现专属）', effect: 'hp-2,discoverClass' },
      {
        text: '捐献财富（-4 金币，商店等级 +1）',
        effect: 'gold-4,shopLevel+1',
        requires: [{ type: 'gold', min: 4, message: '需要至少 4 金币' }],
      },
      {
        text: '焚尽旧物（随机弃回 2 张手牌，法伤 +1）',
        effect: ['randomDiscardHand:2', 'spellDamage+1'],
        requires: [{ type: 'hand', min: 2, message: '需要至少 2 张手牌' }],
      },
    ],
    flipTarget: {
      toCard: {
        id: `${crimsonPactId}-flip`,
        type: 'event',
        name: '双重燃烧（觉醒）',
        value: 0,
        image: dedupeEventCrimsonPactAwakenedImage,
        description: '使用后进入墓地。若预览行正上方是魔法牌，触发魔法共鸣，翻转为「虚空置换」瞬发魔法。',
        eventChoices: [
          { text: '鲜血献祭（-6 HP，发现专属）', effect: 'hp-6,discoverClass' },
          {
            text: '黄金燃祭（-12 金币，商店等级 +1）',
            effect: 'gold-12,shopLevel+1',
            requires: [{ type: 'gold', min: 12, message: '需要至少 12 金币' }],
          },
          {
            text: '灵魂焚烧（随机弃回 4 张手牌，法伤 +1）',
            effect: ['randomDiscardHand:4', 'spellDamage+1'],
            requires: [{ type: 'hand', min: 4, message: '需要至少 4 张手牌' }],
          },
        ],
      },
      destination: 'stay',
      message: '双重燃烧觉醒！代价更高，但仍可反复使用。',
    },
  });

  deck.push({
    id: `event-${id++}`,
    type: 'event',
    name: '墓语密室',
    value: 0,
    image: dedupeEventCryptWhisperImage,
    description: '左右两侧都是怪物时，翻转为「墓语回响」；否则翻转为「墓语遗愿」。',
    eventChoices: [
      {
        text: '净化杂质（删 3 张牌）',
        effect: 'deleteCard:3',
        requires: [
          {
            type: 'cardPool',
            pools: ['hand', 'backpack'],
            min: 3,
            message: '需要至少 3 张可删除的卡牌',
          },
        ],
      },
      {
        text: '坟场召回（召回2次）',
        effect: ['graveyardDiscover', 'graveyardDiscover'],
        requires: [{ type: 'graveyard', min: 1, message: '坟场中没有可召回的卡牌' }],
      },
      { text: '召唤商贩（回收袋发现一张牌，打开商店）', effect: ['recycleBagDiscover', 'openShop'] },
      { text: '空间扩展（背包上限 +5）', effect: 'backpackSize+5' },
    ],
  });

  deck.push({
    id: `event-${id++}`,
    type: 'event',
    name: '奇术商会',
    value: 0,
    image: dedupeEventArcaneGuildImage,
    eventChoices: [
      { text: '思绪翻涌（获得2张专属牌，加入手上）', effect: 'drawClassToHand:2', hint: '从专属牌堆抽 2 张直接加入手牌' },
      { text: '扩张人脉（商店等级 +1，打开商店）', effect: ['shopLevel+1', 'openShop'] },
      {
        text: '挖掘遗物（坟场发现 2 张）',
        effect: ['graveyardDiscover', 'graveyardDiscover'],
        requires: [{ type: 'graveyard', min: 1, message: '坟场中没有可召回的卡牌' }],
      },
      { text: '翻转商会卷轴', effect: 'guildFlipToMagic', hint: '翻转为永久魔法「血金术」，放入背包' },
      { text: '翻转为「奇术轮转」', effect: 'guildFlipToHandRecycleMagic', hint: '翻转为永久魔法：所有手牌移入回收袋，再从回收袋随机 2 张移到手上' },
    ],
  });

  deck.push({
    id: `event-${id++}`,
    type: 'event',
    name: '命运骰盅',
    value: 0,
    image: dedupeEventFateDiceCupImage,
    description: '掷骰后翻转为「命运之刃」建筑。',
    eventChoices: [
      {
        text: '掷出不同结果：金币+10并打开商店/商店等级+1并劝降费用-2/法术伤害+1并超杀吸血+1/摧毁所有护符/发现两张专属卡，然后翻转成"命运之刃"。',
        hint: '20% 触发不同奖励或惩罚',
        diceTable: [
          { id: 'dice11-shop', range: [1, 4], label: '金币+10，打开商店', effect: ['gold+10', 'openShop'] },
          { id: 'dice11-level', range: [5, 8], label: '商店等级 +1，劝降费用-2', effect: ['shopLevel+1', 'persuadeCost-2'] },
          { id: 'dice11-spell', range: [9, 12], label: '法术伤害 +1，超杀吸血+1', effect: ['spellDamage+1', 'spellLifesteal+1'] },
          { id: 'dice11-amulets', range: [13, 16], label: '摧毁所有护符', effect: 'removeAllAmulets' },
          { id: 'dice11-discover', range: [17, 20], label: '发现两张专属卡', effect: 'drawClass2' },
        ],
      },
    ],
  });

  deck.push({
    id: `event-${id++}`,
    type: 'event',
    name: '混沌骰局',
    value: 0,
    image: dedupeEventChaosDiceGameImage,
    description: '掷骰后翻转为「混沌冲击」即时魔法。',
    eventChoices: [
      {
        text: '20%掷出不同结果：金币+10并打开商店/背包加入一张诅咒/删除2张牌/获得2张专属卡/回收袋洗回背包并抽2张牌，并翻转为"混沌冲击"。',
        hint: '20% 概率触发不同命运',
        diceTable: [
          { id: 'dice12-shop', range: [1, 4], label: '金币+10，打开商店', effect: ['gold+10', 'openShop'] },
          { id: 'dice12-curse', range: [5, 8], label: '背包加入一张诅咒', effect: 'addCurse' },
          {
            id: 'dice12-delete',
            range: [9, 12],
            label: '删除 2 张牌',
            effect: 'deleteCard:2',
          },
          { id: 'dice12-class', range: [13, 16], label: '获得 2 张专属卡', effect: 'drawClass2' },
          { id: 'dice12-draw', range: [17, 20], label: '回收袋洗回背包，抽 2 张牌', effect: ['recycleToBackpack', 'drawHeroCards:2'] },
          { id: 'dice12-upgrade', range: [1, 20], label: '选择一张牌升级', effect: 'upgradeCard' },
        ],
      },
    ],
  });

  deck.push({
    id: `event-${id++}`,
    type: 'event',
    name: '劝降祭典',
    value: 0,
    image: dedupePersuadeScrollCharmImage,
    description: '劝降等级 +1。若装备着怀柔之印或劝降归袋符，将升级它们。',
    eventChoices: [
      {
        text: '掷出劝降骰：劝降等级+1/劝降费用-2/连劝减半/种族加成/耐久增强',
        hint: '通用：劝降等级+1 + 升级劝降护符；并掷出 5 种增强之一',
        effect: ['persuadeLevel+1', 'upgradePersuadeAmulets'],
        diceTable: [
          { id: 'persuade-dice-level', range: [1, 4], label: '劝降等级 +1', effect: 'persuadeLevel+1' },
          { id: 'persuade-dice-cost', range: [5, 8], label: '劝降费用永久 -2', effect: 'persuadeCost-2' },
          { id: 'persuade-dice-same-halve', range: [9, 12], label: '连续劝降同一怪物，第二次费用减半', effect: 'persuadeSameTargetCostHalve' },
          { id: 'persuade-dice-race', range: [13, 16], label: 'Skeleton/Wraith 劝降率 +20%', effect: 'persuadeRaceBonus:Skeleton,Wraith:20' },
          { id: 'persuade-dice-durability', range: [17, 20], label: '劝降成功的怪物起始耐久 +1', effect: 'persuadeSuccessDurabilityBonus+1' },
        ],
      },
    ],
  });

  deck.push({
    id: `event-${id++}`,
    type: 'event',
    name: '诅咒骰局',
    value: 0,
    image: dedupeEventCursedDiceImage,
    description: '掷骰后翻转为「诅咒碑」建筑。',
    waterfallEffect: { type: 'destroyRandomAmuletAndDiscardHand', amount: 0, description: '被挤出时：随机摧毁一枚护符，弃回所有手牌' },
    eventChoices: [
      {
        text: '掷出诅咒骰：装备攻击减半/法伤减半/装备护甲减半/超杀吸血-3/护符上限-1',
        hint: '20% 概率触发不同惩罚，然后翻转为「诅咒碑」',
        diceTable: [
          { id: 'cursed-dice-atk-halve', range: [1, 4], label: '所有装备栏永久攻击加成减半', effect: 'halveSlotDamageBonus' },
          { id: 'cursed-dice-spell-halve', range: [5, 8], label: '法术伤害加成减半', effect: 'halveSpellDamageBonus' },
          { id: 'cursed-dice-armor-halve', range: [9, 12], label: '所有装备栏永久护甲加成减半', effect: 'halveSlotShieldBonus' },
          { id: 'cursed-dice-lifesteal-loss', range: [13, 16], label: '超杀吸血 -3', effect: 'spellLifesteal-3' },
          { id: 'cursed-dice-amulet-cap', range: [17, 20], label: '护符栏上限 -1', effect: 'amuletCapacity-1' },
        ],
      },
    ],
  });

  // ---------------------------------------------------------------------------
  // Event: 赋能神殿 (Empowerment Shrine)
  // ---------------------------------------------------------------------------
  deck.push({
    id: `event-${id++}`,
    type: 'event',
    name: '赋能神殿',
    value: 0,
    image: dedupeEventResonanceForgeImage,
    description: '掷骰子，为一张手牌赋予侧击或转型效果。',
    eventChoices: [
      {
        id: 'shrine-roll-dice',
        text: '掷出赋能骰：侧击劝降-1/侧击击晕+5%/转型抽2/转型回2血/侧击伤害5',
        hint: '随机赋予一张手牌新的侧击或转型效果',
        effect: 'noop',
        requires: [{ type: 'hand', min: 1, message: '需要至少 1 张手牌' }],
        diceTable: [
          { id: 'shrine-flank-persuade', range: [1, 4] as [number, number], label: '侧击：劝降费用永久 -1', effect: 'grantFlankPersuadeCost:1' },
          { id: 'shrine-flank-stun', range: [5, 8] as [number, number], label: '侧击：击晕上限 +5%', effect: 'grantFlankStunCap:5' },
          { id: 'shrine-transform-draw', range: [9, 12] as [number, number], label: '转型：抽 2 张牌', effect: 'grantTransformDraw:2' },
          { id: 'shrine-transform-heal', range: [13, 16] as [number, number], label: '转型：恢复 2 HP', effect: 'grantTransformHeal:2' },
          { id: 'shrine-flank-damage', range: [17, 20] as [number, number], label: '侧击：对随机怪物造成 5 点伤害', effect: 'grantFlankDamage:5' },
        ],
      },
      {
        text: '失去 5 生命 离开',
        effect: 'hp-5',
        hint: '当无手牌、无法掷骰赋能时可选',
        requiresDisabledChoices: ['shrine-roll-dice'],
        requiresDisabledReason: '仍可掷出赋能骰',
      },
    ],
  });

  let shuffledDeck: GameCardData[];
  [shuffledDeck, currentRng] = rngShuffle(deck, currentRng);
  return [shuffledDeck, currentRng];
}

export function createStarterBackpack(): GameCardData[] {
  return [
    {
      id: STARTER_CARD_IDS.weaponBurst,
      type: 'magic',
      name: '战斗鼓舞',
      value: 0,
      image: dedupeStarterCombatRallyImage,
      magicType: 'permanent',
      magicEffect: '永久魔法：选择一个装备栏，临时攻击力 +2。',
      description: '选择一个装备栏，临时攻击力 +2（瀑流后重置）。',
      maxUpgradeLevel: 2,
    },
    {
      id: STARTER_CARD_IDS.repairOne,
      type: 'magic',
      name: '精工修复',
      value: 0,
      image: dedupeStarterFineRepairImage,
      magicType: 'permanent',
      magicEffect: '永久魔法：失去 2 点生命，选择一个装备恢复 1 点耐久。',
      description: '失去 2 点生命，精准修补武器或护盾，恢复 1 点耐久值。',
      recycleDelay: 1,
      maxUpgradeLevel: 3,
    },
    {
      id: STARTER_CARD_IDS.healTwo,
      type: 'magic',
      name: '祝福之风',
      value: 0,
      image: dedupeStarterBlessingWindImage,
      magicType: 'permanent',
      magicEffect: '永久魔法：回复 2 点生命值。',
      description: '微风拂面，立即回复 2 点生命。',
    },
    {
      id: STARTER_CARD_IDS.reshuffle,
      type: 'magic',
      name: '迷宫回溯',
      value: 0,
      image: dedupeStarterMazeRewindImage,
      magicType: 'permanent',
      magicEffect: '永久魔法：选择一张地城卡牌，置于牌堆底（不打乱牌堆）。',
      description: '将一张地城卡牌放到牌堆最底部。',
      recycleDelay: 3,
      maxUpgradeLevel: 2,
    },
    {
      id: STARTER_CARD_IDS.dungeonSwap,
      type: 'magic',
      name: '乾坤挪移',
      value: 0,
      image: dedupeStarterWorldSwapImage,
      magicType: 'permanent',
      magicEffect: '永久魔法：将地城行最左边的两张牌交换位置。',
      description: '扭转地城秩序，将最左边的两张牌互换。',
      recycleDelay: 2,
      maxUpgradeLevel: 2,
    },
    {
      id: STARTER_CARD_IDS.trainingBlade,
      type: 'weapon',
      name: '新手短剑',
      value: 2,
      image: swordImage,
      durability: 2,
      maxDurability: 2,
      maxUpgradeLevel: 2,
    },
  ];
}

export const isHeroRowHighlightCard = (
  card: GameCardData | null,
): card is GameCardData & { type: HeroRowDropType } =>
  Boolean(card && (card.type === 'event' || card.type === 'magic' || card.type === 'hero-magic' || card.type === 'potion' || card.type === 'curse' || (card.type === 'building' && card.eventChoices)));

