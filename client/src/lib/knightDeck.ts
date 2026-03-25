import { type GameCardData } from '@/components/GameCard';

// Import images for Knight cards
import swordImage from '@assets/generated_images/cute_cartoon_medieval_sword.png';
import axeImage from '@assets/generated_images/cute_cartoon_battle_axe.png';
import heavyShieldImage from '@assets/generated_images/simple_heavy_shield.png';
import skillScrollImage from '@assets/generated_images/chibi_skill_scroll.png';
import eventScrollImage from '@assets/generated_images/chibi_event_scroll.png';
import dualguardAmuletImage from '@assets/generated_images/chibi_dualguard_amulet.png';
import thunderAmuletImage from '@assets/generated_images/chibi_thunder_amulet.png';
import potionArcaneInfusionImage from '@assets/generated_images/cute_potion_arcane_infusion.png';
import potionBackpackExpandImage from '@assets/generated_images/cute_potion_backpack_expand.png';

export interface KnightCardData extends GameCardData {
  classCard: true;
  description: string;
  knightEffect?: string;
  weaponBonus?: number;
  shieldBonus?: number;
  healOnKill?: number;
  damageReflect?: number;
  permanentBuff?: string;
  tempBuff?: string;
}

export function generateKnightDeck(): KnightCardData[] {
  const deck: KnightCardData[] = [];
  let id = 0;

  const nextId = () => `knight-${id++}`;
  const pushCard = (card: Omit<KnightCardData, 'id'>) => {
    deck.push({ ...card, id: nextId() });
  };

  // === WEAPONS (3 cards) ===
  pushCard({
    type: 'weapon',
    name: 'Holy Blade',
    value: 6,
    image: swordImage,
    classCard: true,
    description: 'Heals 2 HP when defeating a monster.',
    healOnKill: 2,
    durability: 2,
    maxDurability: 2,
  });

  pushCard({
    type: 'weapon',
    name: 'Swift Blade',
    value: 4,
    image: swordImage,
    classCard: true,
    description: 'Reliable light weapon with 3 uses.',
    durability: 3,
    maxDurability: 3,
  });

  pushCard({
    type: 'weapon',
    name: 'Stormbreaker Hammer',
    value: 7,
    image: axeImage,
    classCard: true,
    description: 'Each hit gains +1 permanent damage for the battle.',
    weaponBonus: 1,
    durability: 2,
    maxDurability: 2,
  });

  // === SHIELDS (3 cards) ===
  pushCard({
    type: 'shield',
    name: 'Tower Shield',
    value: 5,
    image: heavyShieldImage,
    classCard: true,
    description: 'Blocks the next full source of damage.',
    durability: 1,
    maxDurability: 1,
    knightEffect: 'fullBlock',
  });

  pushCard({
    type: 'shield',
    name: 'Reflective Shield',
    value: 4,
    image: heavyShieldImage,
    classCard: true,
    description: 'Reflects 2 damage when it blocks.',
    damageReflect: 2,
    durability: 2,
    maxDurability: 2,
  });

  pushCard({
    type: 'shield',
    name: 'Guardian Aegis',
    value: 4,
    image: heavyShieldImage,
    classCard: true,
    description: 'Reliable defender that reflects 1 damage.',
    damageReflect: 1,
    durability: 2,
    maxDurability: 2,
  });

  // === AMULETS (2 cards) ===
  pushCard({
    type: 'amulet',
    name: '双守护圣盾',
    value: 1,
    image: dualguardAmuletImage,
    classCard: true,
    description: '护盾完美格挡时（护甲值≥攻击力），该装备栏永久护甲+1。',
    amuletEffect: 'dual-guard',
  });

  pushCard({
    type: 'amulet',
    name: '雷霆符印',
    value: 1,
    image: thunderAmuletImage,
    classCard: true,
    description: '每弃一张牌，对激活行随机怪物造成 2 点伤害。',
    amuletEffect: 'discard-zap',
  });

  // === POTIONS (2 cards) ===
  pushCard({
    type: 'potion',
    name: '奥术灌注',
    value: 0,
    image: potionArcaneInfusionImage,
    classCard: true,
    description: '永久让法术伤害 +1。',
    potionEffect: 'perm-spell-damage',
  });

  pushCard({
    type: 'event',
    name: '无尽背袋灵药',
    value: 0,
    image: potionBackpackExpandImage,
    classCard: true,
    description: '四选一：护符上限+1、左装备栏容量+1、右装备栏容量+1、背包容量+3。',
    eventChoices: [
      { text: '护符上限 +1', hint: '护符栏可叠加更多护符', effect: 'amuletCapacity+1' },
      { text: '左装备栏容量 +1', hint: '左装备栏可装备多件，点击切换', effect: 'equipSlot1Capacity+1' },
      { text: '右装备栏容量 +1', hint: '右装备栏可装备多件，点击切换', effect: 'equipSlot2Capacity+1' },
      { text: '背包容量 +3', hint: '永久增加背包空间', effect: 'backpackSize+3' },
    ],
  });

  // === HERO MAGIC (2 cards) ===
  pushCard({
    type: 'hero-magic',
    name: '圣光秘术',
    value: 0,
    image: skillScrollImage,
    classCard: true,
    description: '第一次使用时解锁圣光；之后可立即回满生命或净化怒气。',
    heroMagicId: 'holy-light',
    heroMagicEffect: '英雄魔法：解锁或触发圣光。',
  });

  pushCard({
    type: 'hero-magic',
    name: '狂战秘典',
    value: 0,
    image: skillScrollImage,
    classCard: true,
    description: '第一次使用时解锁狂战；之后可触发狂战：直到下次瀑布前，每个武器栏每回合可多攻击一次，且不消耗耐久。',
    heroMagicId: 'berserker-rage',
    heroMagicEffect: '英雄魔法：解锁或触发狂战。',
  });

  // === ARCANE MAGIC (8 cards) ===
  pushCard({
    type: 'magic',
    name: '浴血贪念',
    value: 0,
    image: skillScrollImage,
    classCard: true,
    description: '一次性：获得等同本回合已损失生命的金币，并将“贪婪诅咒”放入背包。',
    magicType: 'instant',
    magicEffect: '获得金币并生成贪婪诅咒。',
    knightEffect: 'blood-greed',
  });

  pushCard({
    type: 'magic',
    name: '铠甲贯刺',
    value: 0,
    image: skillScrollImage,
    classCard: true,
    description: '永久：选择一件护甲装备，对目标怪物造成等同护甲值的伤害。',
    magicType: 'permanent',
    magicEffect: '护甲转化为伤害。',
    knightEffect: 'armor-strike',
  });

  pushCard({
    type: 'magic',
    name: '残血终焉',
    value: 0,
    image: skillScrollImage,
    classCard: true,
    description: '永久：对一名怪物造成等同当前已损失生命值的伤害。',
    magicType: 'permanent',
    magicEffect: '以失去生命为伤害。',
    knightEffect: 'missing-hp-smite',
  });

  pushCard({
    type: 'magic',
    name: '坟火新星',
    value: 0,
    image: skillScrollImage,
    classCard: true,
    description: '永久：当此牌被弃置时，对当前行所有怪物造成 3 点伤害。',
    magicType: 'permanent',
    magicEffect: '被弃置时爆炸伤害。',
    knightEffect: 'grave-nova',
  });

  pushCard({
    type: 'magic',
    name: '孤注一掷',
    value: 0,
    image: skillScrollImage,
    classCard: true,
    description: '一次性：生命降至 1，本回合所有装备 +4 伤害并额外攻击一次。',
    magicType: 'instant',
    magicEffect: '降血换取爆发与额外攻击。',
    knightEffect: 'berserk-gambit',
  });

  pushCard({
    type: 'magic',
    name: '回收灵焰',
    value: 0,
    image: skillScrollImage,
    classCard: true,
    description: '永久：将回收袋里的卡牌放回背包，然后抽 2 张牌。',
    magicType: 'permanent',
    magicEffect: '回收袋归位并抽牌。',
    knightEffect: 'recycle-flare',
  });

  pushCard({
    type: 'magic',
    name: '不灭守护',
    value: 0,
    image: skillScrollImage,
    classCard: true,
    description: '一次性：只能在受到致命伤害时打出，抵消该次伤害。',
    magicType: 'instant',
    magicEffect: '濒死时抵消致死伤害。',
    knightEffect: 'death-ward',
  });

  pushCard({
    type: 'magic',
    name: '混沌骰运',
    value: 0,
    image: skillScrollImage,
    classCard: true,
    description: '永久：掷骰 20% 触发不同效果（装备回手/发现专属/开启商店/对怪物造成双段伤害/弃 2 抽 2）。',
    magicType: 'permanent',
    magicEffect: '掷骰触发混沌事件。',
    knightEffect: 'chaos-dice',
  });

  // === GRAVEYARD RECALL (1 card) ===
  const graveyardRecallId = nextId();
  deck.push({
    id: graveyardRecallId,
    type: 'magic',
    name: '冥途拾遗',
    value: 0,
    image: skillScrollImage,
    classCard: true,
    description: '一次性：从坟场随机取回至多 3 张牌加入背包（不能取回自己）。使用后翻转为事件。',
    magicType: 'instant',
    magicEffect: '坟场随机取回 3 张牌。',
    knightEffect: 'graveyard-recall',
    flipTarget: {
      toCard: buildGraveyardRecallFlipEvent(`${graveyardRecallId}-flip`),
      destination: 'backpack',
      banner: '法术翻转成事件卷轴，已放入背包。',
      message: '坟场之力翻涌，卷轴变形为新的形态…',
    },
  });

  // Shuffle the deck
  return deck.sort(() => Math.random() - 0.5);
}

// Class card discovery events for the main deck
export function createKnightDiscoveryEvents(): GameCardData[] {
  const events: GameCardData[] = [];
  // Discovery events removed to keep total event count at 12 while preserving API surface.
  return events;
}

const createDynamicKnightCardId = (prefix: string) =>
  `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;

function buildGraveyardRecallFlipEvent(id: string): GameCardData {
  return {
    id,
    type: 'event',
    name: '冥途幻变',
    value: 0,
    image: eventScrollImage,
    description: '掷骰子决定命运：25% 获得专属卡，25% 装备耐久 +1，25% 翻回原始法术，25% 摧毁所有装备。',
    eventChoices: [
      {
        text: '掷动命运之骰',
        hint: '25% 触发四种不同结果',
        diceTable: [
          { id: 'gr-class2', range: [1, 5] as [number, number], label: '获得 2 张专属卡', effect: 'drawClass2' },
          { id: 'gr-repair', range: [6, 10] as [number, number], label: '所有装备耐久 +1', effect: 'repairAllDurability+1' },
          { id: 'gr-flipback', range: [11, 15] as [number, number], label: '翻回原始法术', effect: 'flipBackToGraveyardRecall' },
          { id: 'gr-destroy', range: [16, 20] as [number, number], label: '摧毁所有装备', effect: 'destroyAllEquipment' },
        ],
      },
    ],
  };
}

export const createGraveyardRecallCard = (): KnightCardData => {
  const id = createDynamicKnightCardId('graveyard-recall');
  return {
    id,
    type: 'magic',
    name: '冥途拾遗',
    value: 0,
    image: skillScrollImage,
    classCard: true,
    description: '一次性：从坟场随机取回至多 3 张牌加入背包（不能取回自己）。使用后翻转为事件。',
    magicType: 'instant',
    magicEffect: '坟场随机取回 3 张牌。',
    knightEffect: 'graveyard-recall',
    flipTarget: {
      toCard: buildGraveyardRecallFlipEvent(`${id}-flip`),
      destination: 'backpack',
      banner: '法术翻转成事件卷轴，已放入背包。',
      message: '坟场之力翻涌，卷轴变形为新的形态…',
    },
  };
};

export const createGreedCurseCard = (): KnightCardData => ({
  id: createDynamicKnightCardId('greed'),
  type: 'magic',
  name: '贪婪诅咒',
  value: 0,
  image: skillScrollImage,
  classCard: true,
  description: '永久：使用时失去 3 金币，瀑布后才能再次使用。',
  magicType: 'permanent',
  magicEffect: '使用失去 3 金币。',
  knightEffect: 'greed-curse',
});