import { memo, useMemo } from 'react';
import { useShallowGameState } from '@/hooks/useGameEngine';
import { useModalCallbacks } from '../contexts/ModalCallbacksContext';
import { BASE_BACKPACK_CAPACITY, HAND_LIMIT, INITIAL_HP } from '@/game-core/constants';
import { SHOP_HEAL_COST, SHOP_LEVEL_UP_COST, SHOP_SKILL_DISCOVER_COST, SHOP_EQUIP_BOOST_COST, SHOP_REFRESH_COST } from '@/game-core/constants';
import { getHeroSkillById, heroSkills as allHeroSkills } from '@/lib/heroSkills';

import ShopModal from '@/components/ShopModal';
import ShopSkillSelectModal from '@/components/ShopSkillSelectModal';

import type { GameCardData } from '@/components/GameCard';

function ShopContainerInner() {
  const cb = useModalCallbacks();

  const gs = useShallowGameState(s => ({
    shopModalOpen: s.shopModalOpen,
    shopModalMinimized: s.shopModalMinimized,
    shopOfferings: s.shopOfferings,
    shopLevel: s.shopLevel,
    shopSourceEvent: s.shopSourceEvent,
    shopHealUsed: s.shopHealUsed,
    shopLevelUpUsed: s.shopLevelUpUsed,
    shopSkillDiscoverUsed: s.shopSkillDiscoverUsed,
    shopEquipAttackUsed: s.shopEquipAttackUsed,
    shopEquipArmorUsed: s.shopEquipArmorUsed,
    shopRefreshUsed: s.shopRefreshUsed,
    shopSkillSelectOpen: s.shopSkillSelectOpen,
    shopSkillOptions: s.shopSkillOptions,
    shopDeleteUsed: s.shopDeleteUsed,
    gold: s.gold,
    hp: s.hp,
    backpackItems: s.backpackItems,
    permanentMagicRecycleBag: s.permanentMagicRecycleBag,
    equipmentSlot1: s.equipmentSlot1,
    equipmentSlot2: s.equipmentSlot2,
    equipmentSlot1Reserve: s.equipmentSlot1Reserve,
    equipmentSlot2Reserve: s.equipmentSlot2Reserve,
    amuletSlots: s.amuletSlots,
    handCards: s.handCards,
    backpackCapacityModifier: s.backpackCapacityModifier,
    permanentSkills: s.permanentSkills,
    selectedHeroSkill: s.selectedHeroSkill,
    extraHeroSkills: s.extraHeroSkills,
    permanentMaxHpBonus: s.permanentMaxHpBonus,
    eternalRelics: s.eternalRelics,
    handLimitBonus: s.handLimitBonus,
    maxAmuletSlots: s.maxAmuletSlots,
    equipmentSlotCapacity: s.equipmentSlotCapacity,
  }));

  const backpackCapacity = Math.max(1, BASE_BACKPACK_CAPACITY + gs.backpackCapacityModifier);
  const shopSourceEvent = gs.shopSourceEvent?.name ?? undefined;

  const flatEquipmentCards: GameCardData[] = (
    [gs.equipmentSlot1, ...gs.equipmentSlot1Reserve, gs.equipmentSlot2, ...gs.equipmentSlot2Reserve] as (GameCardData | null)[]
  ).filter(Boolean) as GameCardData[];
  const flatAmuletCards: GameCardData[] = gs.amuletSlots;
  const deletableCardCount = gs.handCards.length + gs.backpackItems.length + gs.permanentMagicRecycleBag.length
    + flatEquipmentCards.length + flatAmuletCards.length;
  const canDeleteCardInShop = !gs.shopDeleteUsed && deletableCardCount > 0;
  const shopDeleteDisabledReason = gs.shopDeleteUsed
    ? '本次商店已使用过删除'
    : deletableCardCount === 0 ? '没有可以删除的卡牌' : undefined;

  const aura = useMemo(() => {
    let attack = 0, defense = 0, mHp = 0;
    for (const slot of gs.amuletSlots) {
      if (!slot) continue;
      if (slot.amuletAuraBonus) {
        attack += slot.amuletAuraBonus.attack ?? 0;
        defense += slot.amuletAuraBonus.defense ?? 0;
        mHp += slot.amuletAuraBonus.maxHp ?? 0;
      }
      if (typeof slot.value === 'number' && slot.effect) {
        if (slot.effect === 'attack' && !(slot.amuletAuraBonus && typeof slot.amuletAuraBonus.attack === 'number')) attack += slot.value;
        if (slot.effect === 'defense' && !(slot.amuletAuraBonus && typeof slot.amuletAuraBonus.defense === 'number')) defense += slot.value;
        if (slot.effect === 'health' && !(slot.amuletAuraBonus && typeof slot.amuletAuraBonus.maxHp === 'number')) mHp += slot.value;
      }
    }
    for (const relic of gs.eternalRelics) {
      if (relic.amuletAuraBonus) {
        attack += relic.amuletAuraBonus.attack ?? 0;
        defense += relic.amuletAuraBonus.defense ?? 0;
        mHp += relic.amuletAuraBonus.maxHp ?? 0;
      }
    }
    return { attack, defense, maxHp: mHp };
  }, [gs.amuletSlots, gs.eternalRelics]);

  const selectedHeroSkillDef = useMemo(
    () => getHeroSkillById(gs.selectedHeroSkill),
    [gs.selectedHeroSkill],
  );

  const eternalMaxHpBonus = useMemo(
    () => gs.eternalRelics.reduce((sum, r) => sum + (r.initialMaxHpBonus ?? 0), 0),
    [gs.eternalRelics],
  );

  const maxHp = INITIAL_HP + aura.maxHp + gs.permanentMaxHpBonus +
    (gs.permanentSkills.includes('Iron Will') ? 3 : 0) +
    (selectedHeroSkillDef?.initialMaxHpBonus ?? 0) +
    eternalMaxHpBonus;

  const canDiscoverSkill = useMemo(() => {
    const ownedCount = (gs.selectedHeroSkill ? 1 : 0) + gs.extraHeroSkills.length;
    return allHeroSkills.length - ownedCount >= 3;
  }, [gs.selectedHeroSkill, gs.extraHeroSkills.length]);

  const discoverSkillDisabledReason = useMemo(() => {
    const ownedCount = (gs.selectedHeroSkill ? 1 : 0) + gs.extraHeroSkills.length;
    return allHeroSkills.length - ownedCount < 3
      ? '已学习太多技能，没有足够的未学技能可供选择。'
      : undefined;
  }, [gs.selectedHeroSkill, gs.extraHeroSkills.length]);

  return (
    <>
      <ShopModal
        open={gs.shopModalOpen && !gs.shopModalMinimized}
        offerings={gs.shopOfferings}
        gold={gs.gold}
        backpackCount={gs.backpackItems.length}
        backpackCapacity={backpackCapacity}
        shopLevel={gs.shopLevel}
        canDeleteCard={canDeleteCardInShop}
        deleteDisabledReason={shopDeleteDisabledReason}
        onDeleteRequest={cb.onShopDeleteRequest}
        onBuy={cb.onShopPurchase}
        onFinish={cb.onShopClose}
        onMinimize={cb.onShopMinimize}
        sourceEventName={shopSourceEvent}
        hp={gs.hp}
        maxHp={maxHp}
        healCost={SHOP_HEAL_COST}
        shopHealUsed={gs.shopHealUsed}
        onHealRequest={cb.onShopHealRequest}
        shopLevelUpCost={SHOP_LEVEL_UP_COST}
        shopLevelUpUsed={gs.shopLevelUpUsed}
        onShopLevelUpRequest={cb.onShopLevelUpRequest}
        shopSkillDiscoverCost={SHOP_SKILL_DISCOVER_COST}
        shopSkillDiscoverUsed={gs.shopSkillDiscoverUsed}
        canDiscoverSkill={canDiscoverSkill}
        discoverSkillDisabledReason={discoverSkillDisabledReason}
        onShopSkillDiscoverRequest={cb.onShopSkillDiscoverRequest}
        shopEquipBoostCost={SHOP_EQUIP_BOOST_COST}
        shopEquipAttackUsed={gs.shopEquipAttackUsed}
        shopEquipArmorUsed={gs.shopEquipArmorUsed}
        onShopEquipAttackRequest={cb.onShopEquipAttackRequest}
        onShopEquipArmorRequest={cb.onShopEquipArmorRequest}
        shopRefreshCost={SHOP_REFRESH_COST}
        shopRefreshUsed={gs.shopRefreshUsed}
        onShopRefreshRequest={cb.onShopRefreshRequest}
      />

      <ShopSkillSelectModal
        open={gs.shopSkillSelectOpen}
        options={gs.shopSkillOptions}
        onSelect={cb.onShopSkillSelect}
      />
    </>
  );
}

export const ShopContainer = memo(ShopContainerInner);
