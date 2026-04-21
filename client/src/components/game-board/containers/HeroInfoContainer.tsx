import { memo, useMemo } from 'react';
import { Sword, Wrench } from 'lucide-react';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';

import { useShallowGameState } from '@/hooks/useGameEngine';
import { useModalCallbacks } from '../contexts/ModalCallbacksContext';
import { useModalUI } from '../contexts/ModalUIContext';
import { BASE_BACKPACK_CAPACITY, HAND_LIMIT, INITIAL_HP } from '@/game-core/constants';
import { getHeroSkillById } from '@/lib/heroSkills';

import HeroDetailsModal from '@/components/HeroDetailsModal';

function HeroInfoContainerInner() {
  const cb = useModalCallbacks();
  const ui = useModalUI();

  const gs = useShallowGameState(s => ({
    heroVariant: s.heroVariant,
    permanentSkills: s.permanentSkills,
    hp: s.hp,
    gold: s.gold,
    selectedHeroSkill: s.selectedHeroSkill,
    extraHeroSkills: s.extraHeroSkills,
    tempShield: s.tempShield,
    weaponMasterBonus: s.weaponMasterBonus,
    shieldMasterBonus: s.shieldMasterBonus,
    defensiveStanceActive: s.defensiveStanceActive,
    bulwarkPassiveActive: s.bulwarkPassiveActive,
    bulwarkTempArmorStacks: s.bulwarkTempArmorStacks,
    eternalRelics: s.eternalRelics,
    permanentMaxHpBonus: s.permanentMaxHpBonus,
    permanentSpellDamageBonus: s.permanentSpellDamageBonus,
    permanentSpellLifesteal: s.permanentSpellLifesteal,
    stunCap: s.stunCap,
    amuletSlots: s.amuletSlots,
    pendingHeroMagicAction: s.pendingHeroMagicAction,
    pendingPotionAction: s.pendingPotionAction,
    handLimitBonus: s.handLimitBonus,
    backpackCapacityModifier: s.backpackCapacityModifier,
    maxAmuletSlots: s.maxAmuletSlots,
    equipmentSlotCapacity: s.equipmentSlotCapacity,
  }));

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

  const attackBonus = aura.attack +
    (gs.permanentSkills.includes('Weapon Master') ? 1 : 0) +
    gs.weaponMasterBonus +
    (gs.permanentSkills.includes('Berserker Rage') ? Math.floor((maxHp - gs.hp) / 2) : 0) +
    (gs.permanentSkills.includes('Battle Frenzy') && gs.hp < maxHp / 2 ? 2 : 0);

  const defenseBonus = aura.defense +
    (gs.permanentSkills.includes('Iron Skin') ? 1 : 0) +
    gs.shieldMasterBonus +
    (gs.defensiveStanceActive ? 1 : 0);

  const heroDetailsStats = useMemo(() => ({
    hp: gs.hp,
    maxHp,
    gold: gs.gold,
    attackBonus,
    defenseBonus,
    spellDamageBonus: gs.permanentSpellDamageBonus,
    spellLifesteal: gs.permanentSpellLifesteal,
    tempShield: gs.tempShield,
    permanentMaxHpBonus: gs.permanentMaxHpBonus,
    stunCap: gs.stunCap,
  }), [gs.hp, maxHp, gs.gold, attackBonus, defenseBonus, gs.permanentSpellDamageBonus, gs.permanentSpellLifesteal, gs.tempShield, gs.permanentMaxHpBonus, gs.stunCap]);

  const heroDetailsSkills = useMemo(() => {
    const skills: import('@/lib/heroSkills').HeroSkillDefinition[] = [];
    if (selectedHeroSkillDef) skills.push(selectedHeroSkillDef);
    for (const id of gs.extraHeroSkills) {
      const def = getHeroSkillById(id);
      if (def) skills.push(def);
    }
    return skills;
  }, [selectedHeroSkillDef, gs.extraHeroSkills]);

  const permanentSkillStacks = useMemo(() => ({
    '潮涌铸甲': gs.bulwarkPassiveActive + gs.bulwarkTempArmorStacks,
    '潮涌铸甲·瀑流': gs.bulwarkPassiveActive,
    '潮涌铸甲·格挡': gs.bulwarkTempArmorStacks,
  }), [gs.bulwarkPassiveActive, gs.bulwarkTempArmorStacks]);

  const backpackCapacity = Math.max(1, BASE_BACKPACK_CAPACITY + gs.backpackCapacityModifier);
  const capacityLimits = {
    hand: HAND_LIMIT + gs.handLimitBonus,
    backpack: backpackCapacity,
    amuletSlots: gs.maxAmuletSlots,
    equipmentSlotLeft: gs.equipmentSlotCapacity.equipmentSlot1 ?? 1,
    equipmentSlotRight: gs.equipmentSlotCapacity.equipmentSlot2 ?? 1,
  };

  const heroMagicChoicePrompt = gs.pendingHeroMagicAction?.step === 'choice'
    ? { id: gs.pendingHeroMagicAction.id, prompt: gs.pendingHeroMagicAction.prompt ?? '' }
    : null;

  const potionChoiceDialogOpen = Boolean(gs.pendingPotionAction?.step === 'choice');

  return (
    <>
      <HeroDetailsModal
        open={ui.heroDetailsOpen}
        onOpenChange={cb.onHeroDetailsChange}
        heroVariant={gs.heroVariant}
        stats={heroDetailsStats}
        heroSkills={heroDetailsSkills}
        permanentSkills={gs.permanentSkills}
        permanentSkillStacks={permanentSkillStacks}
        heroMagicInfo={ui.heroMagicInfo}
        capacityLimits={capacityLimits}
      />

      {heroMagicChoicePrompt && (
        <Dialog open onOpenChange={(open) => { if (!open) cb.onCancelHeroMagicAction(); }}>
          {/*
            英雄魔法分支选择（圣光）：必须选 heal 或 purge，否则 pendingHeroMagicAction 卡住。
            显式关闭路径：选其中一个 option / X（→ onCancelHeroMagicAction 释放 MP）。
          */}
          <DialogContent
            className="sm:max-w-2xl"
            onInteractOutside={(e) => e.preventDefault()}
            onEscapeKeyDown={(e) => e.preventDefault()}
          >
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2">
                <Sword className="w-5 h-5 text-amber-500" />
                圣光
              </DialogTitle>
            </DialogHeader>
            <div className="flex flex-col gap-3 pt-2">
              <Button
                variant="outline"
                className="h-auto w-full justify-start p-4 text-left"
                onClick={() => cb.onHeroMagicChoice('heal')}
              >
                <div className="flex flex-col gap-1">
                  <span className="font-semibold text-emerald-600">回满生命</span>
                  <span className="text-xs text-muted-foreground">立即将生命值恢复至上限。</span>
                </div>
              </Button>
              <Button
                variant="outline"
                className="h-auto w-full justify-start p-4 text-left"
                onClick={() => cb.onHeroMagicChoice('purge')}
              >
                <div className="flex flex-col gap-1">
                  <span className="font-semibold text-sky-600">净化怒气</span>
                  <span className="text-xs text-muted-foreground">选择一个怪物，将其怒气层数清零（血层归 1，生命回满）。</span>
                </div>
              </Button>
            </div>
          </DialogContent>
        </Dialog>
      )}

      {potionChoiceDialogOpen && (
        <Dialog open onOpenChange={(open) => { if (!open) cb.onCancelPotionAction(); }}>
          {/*
            药水分支选择（装备修复剂）：必须选 repair 或 upgrade，否则 pendingPotionAction 卡住。
            显式关闭路径：选其中一个 option / X（→ onCancelPotionAction 取消药水）。
          */}
          <DialogContent
            className="sm:max-w-2xl"
            onInteractOutside={(e) => e.preventDefault()}
            onEscapeKeyDown={(e) => e.preventDefault()}
          >
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2">
                <Wrench className="w-5 h-5 text-emerald-500" />
                装备修复剂
              </DialogTitle>
            </DialogHeader>
            <div className="flex flex-col gap-3 pt-2">
              <Button
                variant="outline"
                className="h-auto w-full justify-start p-4 text-left"
                onClick={() => cb.onPotionChoiceSelection('repair')}
              >
                <div className="flex flex-col gap-1">
                  <span className="font-semibold">左右装备都恢复 2 点耐久</span>
                  <span className="text-xs text-muted-foreground">所有已装备的武器/盾牌各恢复 2 点耐久。</span>
                </div>
              </Button>
              <Button
                variant="outline"
                className="h-auto w-full justify-start p-4 text-left"
                onClick={() => cb.onPotionChoiceSelection('upgrade')}
              >
                <div className="flex flex-col gap-1">
                  <span className="font-semibold">左右装备都耐久上限 +1</span>
                  <span className="text-xs text-muted-foreground">所有已装备的武器/盾牌永久提升耐久上限 +1（不恢复耐久）。</span>
                </div>
              </Button>
            </div>
          </DialogContent>
        </Dialog>
      )}
    </>
  );
}

export const HeroInfoContainer = memo(HeroInfoContainerInner);
