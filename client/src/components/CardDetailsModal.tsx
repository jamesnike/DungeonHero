import { useTranslation } from "react-i18next";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import {
  type EventEffectExpression,
  type EventRequirement,
  type GameCardData,
  isPermRecycleEquipment,
  isMonsterEquipmentCard,
  formatScalingSpellDamageLine,
  useArcaneStormDamage,
  useArcaneShieldStunGain,
} from "./GameCard";
import { calculateMonsterRage, getMonsterRageRule, getMonsterUpgrades, getActiveUpgrade, getUpgradeTierCount } from "@/lib/monsterRage";
import { isUpgradeableCard, isCardAtMaxUpgrade } from "./CardUpgradeModal";
import { Skull, Sword, Shield, Heart, Sparkles, Zap, Scroll, Wand2, AlertTriangle, Coins, ArrowBigUpDash, Landmark, Flame, Star } from "lucide-react";
import { CHAOS_DICE_SPELL_DESCRIPTION } from "@/lib/knightChaosDiceCopy";
import { getStarterBaseId } from "@/game-core/deck";

type MonsterRewardPreview = {
  id: string;
  title: string;
  description: string;
  detail?: string;
};

interface CardDetailsModalProps {
  card: GameCardData | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  currentTurn: number;
  monsterRewards?: MonsterRewardPreview[] | null;
  /**
   * Base IDs of unique class cards the player already acquired this run.
   * When the displayed card is `unique: true` and its base ID is in this
   * list, the modal renders a "唯一 · 已获得" indicator so the player
   * knows the card cannot be obtained again.
   */
  acquiredUniqueClassCardIds?: readonly string[];
}

export default function CardDetailsModal({
  card,
  open,
  onOpenChange,
  currentTurn,
  monsterRewards,
  acquiredUniqueClassCardIds,
}: CardDetailsModalProps) {
  const { t } = useTranslation();
  const arcaneStormDamage = useArcaneStormDamage();
  const arcaneShieldStunGain = useArcaneShieldStunGain();
  if (!card) return null;

  const isMonsterEquipment = isMonsterEquipmentCard(card);
  const isUnique = card.unique === true;
  const isUniqueAcquired =
    isUnique &&
    !!acquiredUniqueClassCardIds &&
    acquiredUniqueClassCardIds.includes(getStarterBaseId(card.id));

  const rageRule = card.type === 'monster' ? getMonsterRageRule(card.name) : null;
  const rageTurn = card.type === 'monster' ? (card.rageTurn ?? currentTurn) : null;
  const computedRage =
    card.type === 'monster' && rageRule && rageTurn
      ? calculateMonsterRage(card.name, rageTurn) ?? null
      : null;
  const rageDisplayValue =
    card.type === 'monster'
      ? computedRage ?? card.fury ?? card.hpLayers ?? null
      : null;

  const formatAmuletAuraBonus = () => {
    if (card.type !== 'amulet') return null;
    const bonus = card.amuletAuraBonus;
    if (!bonus) return null;
    const parts: string[] = [];
    if (typeof bonus.attack === 'number' && bonus.attack !== 0) {
      parts.push(`攻击 +${bonus.attack}`);
    }
    if (typeof bonus.defense === 'number' && bonus.defense !== 0) {
      parts.push(`护甲 +${bonus.defense}`);
    }
    if (typeof bonus.maxHp === 'number' && bonus.maxHp !== 0) {
      parts.push(`最大生命 +${bonus.maxHp}`);
    }
    return parts.length > 0 ? parts.join(' / ') : null;
  };

  const describeAmuletPassive = () => {
    if (card.type !== 'amulet') {
      return { primary: '', secondary: null as string | null };
    }
    const auraText = formatAmuletAuraBonus();
    if (card.description) {
      return { primary: card.description, secondary: auraText };
    }
    if (auraText) {
      return { primary: auraText, secondary: null };
    }
    if (card.effect && typeof card.value === 'number') {
      const effectLabels: Record<string, string> = {
        health: '最大生命',
        attack: '武器伤害',
        defense: '护甲',
      };
      const label = effectLabels[card.effect] ?? card.effect;
      return { primary: `+${card.value} ${label}`, secondary: null };
    }
    return { primary: '装备后提供被动增益。', secondary: null };
  };

  const getCardIcon = () => {
    switch (card.type) {
      case 'monster': return <Skull className="w-6 h-6 text-destructive" />;
      case 'weapon': return <Sword className="w-6 h-6 text-amber-500" />;
      case 'shield': return <Shield className="w-6 h-6 text-blue-500" />;
      case 'potion': return <Heart className="w-6 h-6 text-green-500" />;
      case 'amulet': return <Sparkles className="w-6 h-6 text-purple-500" />;
      case 'magic': return <Zap className="w-6 h-6 text-cyan-500" />;
      case 'hero-magic': return <Wand2 className="w-6 h-6 text-rose-500" />;
      case 'event': return <Scroll className="w-6 h-6 text-violet-500" />;
      case 'building': return <Landmark className="w-6 h-6 text-stone-500" />;
      default: return null;
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="w-[min(90vw,42rem)] max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <div className="flex items-center gap-2">
            {isMonsterEquipment ? <Sword className="w-6 h-6 text-amber-500" /> : getCardIcon()}
            <DialogTitle className="text-xl">{card.name}</DialogTitle>
          </div>
          <DialogDescription>
            {isMonsterEquipment ? t('modal.cardDetails.monsterEquipmentTag') : card.type.toUpperCase()} {card.classCard ? `• ${t('modal.cardDetails.knightClassTag')}` : ''}{isUnique ? ` • ${t('modal.cardDetails.uniqueTag', '唯一')}` : ''}
          </DialogDescription>
          {isUnique && (
            <div className="flex items-center gap-2 mt-1">
              <span
                className={
                  isUniqueAcquired
                    ? 'inline-flex items-center gap-1 rounded-full bg-amber-500/15 px-2.5 py-0.5 text-xs font-semibold text-amber-700 dark:text-amber-300 line-through opacity-80'
                    : 'inline-flex items-center gap-1 rounded-full bg-amber-500/15 px-2.5 py-0.5 text-xs font-semibold text-amber-700 dark:text-amber-300'
                }
                title={t('modal.cardDetails.uniqueTooltip', '唯一卡。本局获得过一次后，将不再出现。')}
                data-testid="card-details-unique-pill"
              >
                <Star className="w-3.5 h-3.5" />
                {isUniqueAcquired
                  ? t('modal.cardDetails.uniqueAcquired', '唯一 · 已获得')
                  : t('modal.cardDetails.uniqueTag', '唯一')}
              </span>
            </div>
          )}
          {!isMonsterEquipment && isUpgradeableCard(card) && (
            <div className="flex items-center gap-2 mt-1">
              {isCardAtMaxUpgrade(card) ? (
                <span className="inline-flex items-center gap-1 rounded-full bg-gray-500/15 px-2.5 py-0.5 text-xs font-semibold text-gray-500 dark:text-gray-400">
                  <ArrowBigUpDash className="w-3.5 h-3.5" />
                  {t('modal.cardDetails.upgradeMaxed', { current: card.upgradeLevel ?? 0, max: card.maxUpgradeLevel ?? 0 })}
                </span>
              ) : (
                <span className="inline-flex items-center gap-1 rounded-full bg-emerald-500/15 px-2.5 py-0.5 text-xs font-semibold text-emerald-700 dark:text-emerald-300 animate-pulse">
                  <ArrowBigUpDash className="w-3.5 h-3.5" />
                  {t('modal.cardDetails.upgradeAvailable', { current: card.upgradeLevel ?? 0, max: card.maxUpgradeLevel ?? 0 })}
                </span>
              )}
            </div>
          )}
        </DialogHeader>
        
        <div className="flex flex-col gap-4 py-4">
          {/* Monster Reward Preview */}
          {card.type === 'monster' && !isMonsterEquipment && monsterRewards?.length ? (
            <div className="space-y-2">
              <div className="flex items-center gap-2 text-sm font-semibold text-amber-600 dark:text-amber-400">
                <Sparkles className="w-4 h-4" />
                {t('modal.cardDetails.rewardSectionTitle')}
              </div>
              <div className="space-y-2">
                {monsterRewards.map(option => (
                  <div
                    key={option.id}
                    className="rounded-md border border-amber-200/60 dark:border-amber-700/40 bg-amber-50/40 dark:bg-amber-900/20 p-3 text-sm"
                  >
                    <div className="flex items-center justify-between gap-2">
                      <span className="font-semibold text-foreground">{option.title}</span>
                      {option.detail && (
                        <span className="rounded-full bg-amber-500/10 px-2 py-0.5 text-[11px] font-medium tracking-wide text-amber-700 dark:text-amber-300">
                          {option.detail}
                        </span>
                      )}
                    </div>
                    {option.description && (
                      <div className="text-xs text-muted-foreground mt-1 leading-relaxed">
                        {option.description}
                      </div>
                    )}
                  </div>
                ))}
              </div>
            </div>
          ) : null}

          {/* Detailed Stats & Description */}
          <div className="space-y-3 text-sm">
            {/* Monster Details */}
            {card.type === 'monster' && !isMonsterEquipment && (() => {
              const mType = card.monsterType ?? card.name;
              const upgrades = getMonsterUpgrades(mType);
              const activeUpgrade = rageTurn ? getActiveUpgrade(mType, rageTurn) : null;
              const hasBonus = activeUpgrade && (activeUpgrade.attackBonus > 0 || activeUpgrade.hpBonus > 0);
              return (
                <div className="grid grid-cols-2 gap-2 bg-muted/30 p-3 rounded-md">
                  <div className="flex items-center gap-2">
                    <Sword className="w-4 h-4 text-amber-500" />
                    <span>Attack: <span className={`font-bold ${(card.specialAttackBoost ?? 0) > 0 ? 'text-orange-500' : ''}`}>{card.attack ?? card.value}</span>
                      {hasBonus && card.baseAttack != null && (
                        <span className="text-red-500 text-xs ml-1">(+{activeUpgrade!.attackBonus})</span>
                      )}
                      {(card.specialAttackBoost ?? 0) > 0 && (
                        <span className="text-orange-500 text-xs ml-1">(精英 +{card.specialAttackBoost})</span>
                      )}
                    </span>
                  </div>
                  <div className="flex items-center gap-2">
                    <Heart className="w-4 h-4 text-red-500" />
                    <span>HP: <span className="font-bold">{card.hp ?? card.value}/{card.maxHp ?? card.value}</span>
                      {hasBonus && card.baseHp != null && (
                        <span className="text-red-500 text-xs ml-1">(+{activeUpgrade!.hpBonus})</span>
                      )}
                    </span>
                  </div>
                  {card.hpLayers && card.hpLayers > 1 && (
                    <div className="col-span-2 text-muted-foreground text-xs">
                      Has {card.hpLayers} HP layers. Current layer: {card.currentLayer}
                    </div>
                  )}
                  {rageRule && rageTurn && rageDisplayValue !== null && (
                    <div className="col-span-2 text-muted-foreground text-xs leading-relaxed">
                      <div>怒气 = 初始 {rageRule.base} + floor(waterfall / {rageRule.interval})</div>
                      <div>当前 waterfall {rageTurn} ⇒ 怒气 {rageDisplayValue}</div>
                    </div>
                  )}
                  {upgrades.length > 0 && (() => {
                    const currentLevel = card.upgradeLevel ?? 0;
                    const maxLevel = getUpgradeTierCount(mType);
                    return (
                    <div className="col-span-2 mt-1 space-y-1">
                      <div className="text-xs font-semibold text-muted-foreground flex items-center gap-2">
                        <span>强化等级</span>
                        <span className={`${currentLevel > 0 ? 'text-red-500' : ''}`}>Lv.{currentLevel} / {maxLevel}</span>
                      </div>
                      {upgrades.map((u, i) => {
                        const tierLevel = i + 1;
                        const reached = currentLevel >= tierLevel;
                        return (
                          <div key={i} className={`text-xs ${reached ? 'text-red-500 font-semibold' : 'text-muted-foreground'}`}>
                            <div className="flex items-center gap-2">
                              <span>Lv.{tierLevel} (Waterfall ≥ {u.waterfallLevel}):</span>
                              <span>攻击 +{u.attackBonus}, 血量 +{u.hpBonus}</span>
                              {reached && <span className="text-[10px]">✓ 已激活</span>}
                            </div>
                            {u.specialDesc && (
                              <div className={`pl-4 text-[11px] ${reached ? 'text-red-400' : 'text-muted-foreground/70'}`}>
                                {u.specialDesc}
                              </div>
                            )}
                          </div>
                        );
                      })}
                    </div>
                    );
                  })()}
                </div>
              );
            })()}

            {/* Monster Equipment Stats */}
            {isMonsterEquipment && (() => {
              const armorMax = card.hp ?? card.value;
              const showArmor = armorMax != null && armorMax > 0;
              const curArmor = showArmor ? Math.min(card.armor ?? armorMax, armorMax) : 0;
              return (
                <div className="grid grid-cols-2 gap-2 bg-muted/30 p-3 rounded-md">
                  {card.attack != null && (
                    <div className="flex items-center gap-2">
                      <Sword className="w-4 h-4 text-amber-500" />
                      <span>攻击: <span className="font-bold">{card.attack}</span></span>
                    </div>
                  )}
                  {card.durability !== undefined && (
                    <div className="flex items-center gap-2">
                      <span className="text-muted-foreground">耐久:</span>
                      <span className="font-bold">{card.durability}/{card.maxDurability || card.durability}</span>
                    </div>
                  )}
                  {showArmor && (
                    <div className="col-span-2 flex items-center gap-2">
                      <Shield className="w-4 h-4 text-cyan-500" />
                      <span>
                        护甲：<span className={`font-bold ${curArmor < armorMax ? 'text-orange-500' : 'text-cyan-600'}`}>{curArmor}</span>
                        <span className="text-muted-foreground"> / {armorMax}</span>
                      </span>
                    </div>
                  )}
                </div>
              );
            })()}

            {!isMonsterEquipment && (<>
            {/* Waterfall Effect */}
            {(card.type === 'monster' || card.type === 'event') && card.waterfallEffect && (
              <div className="bg-orange-500/10 p-3 rounded-md border border-orange-500/20">
                <div className="flex items-center gap-2 text-orange-700 dark:text-orange-400">
                  <AlertTriangle className="w-4 h-4 shrink-0" />
                  <span className="font-bold text-sm">{card.waterfallEffect.description}</span>
                </div>
              </div>
            )}

            {/* Monster Special Ability */}
            {card.type === 'monster' && card.monsterSpecial && (card.monsterSpecialDesc || card.description) && (
              <div className="bg-violet-500/15 p-3 rounded-md border border-violet-500/30 relative overflow-hidden">
                <div className="absolute inset-0 bg-gradient-to-r from-violet-500/5 to-purple-500/10 pointer-events-none" />
                <div className="relative flex flex-col gap-1.5">
                  <div className="flex items-center gap-2">
                    <Sparkles className="w-4 h-4 shrink-0 text-violet-500" />
                    <span className="font-extrabold text-sm text-violet-700 dark:text-violet-300 tracking-wide">
                      ⚔ 精英怪物
                    </span>
                  </div>
                  <p className="text-sm font-semibold text-violet-800 dark:text-violet-200 pl-6">
                    {card.monsterSpecialDesc || card.description}
                  </p>
                </div>
              </div>
            )}

            {/* Monster Revive Keyword */}
            {card.type === 'monster' && (card.hasRevive || card.hasEquipmentRevive) && (() => {
              const allUsed = (!card.hasRevive || card.reviveUsed) && (!card.hasEquipmentRevive || card.equipmentReviveUsed);
              return (
                <div className={`p-3 rounded-md border relative overflow-hidden ${
                  allUsed
                    ? 'bg-gray-500/10 border-gray-500/30'
                    : 'bg-emerald-500/15 border-emerald-500/30'
                }`}>
                  <div className="relative flex flex-col gap-1.5">
                    <div className="flex items-center gap-2">
                      <Heart className={`w-4 h-4 shrink-0 ${allUsed ? 'text-gray-400' : 'text-emerald-500'}`} />
                      <span className={`font-extrabold text-sm tracking-wide ${
                        allUsed
                          ? 'text-gray-500 dark:text-gray-400 line-through'
                          : 'text-emerald-700 dark:text-emerald-300'
                      }`}>
                        复生
                      </span>
                      {allUsed && (
                        <span className="text-xs text-gray-400">（已触发）</span>
                      )}
                    </div>
                    <p className={`text-sm pl-6 ${
                      allUsed
                        ? 'text-gray-500 dark:text-gray-400'
                        : 'font-semibold text-emerald-800 dark:text-emerald-200'
                    }`}>
                      首次死亡时，以 1 血层的形式复生（仅一次）。
                    </p>
                  </div>
                </div>
              );
            })()}

            {/* Monster Bleed Keyword */}
            {card.type === 'monster' && card.bleedEffect && (
              <div className="bg-orange-500/15 p-3 rounded-md border border-orange-500/30 relative overflow-hidden">
                <div className="relative flex flex-col gap-1.5">
                  <div className="flex items-center gap-2">
                    <Sword className="w-4 h-4 shrink-0 text-orange-500" />
                    <span className="font-extrabold text-sm text-orange-700 dark:text-orange-300 tracking-wide">
                      狂怒
                    </span>
                  </div>
                  <p className="text-sm font-semibold text-orange-800 dark:text-orange-200 pl-6">
                    每失去一个血层，攻击力 +{card.bleedEffect.replace('attack+', '')}。
                  </p>
                </div>
              </div>
            )}

            {/* Dragon Lv1: Attack no layer cost */}
            {card.type === 'monster' && card.dragonAttackNoLayerCost && (
              <div className="bg-amber-500/15 p-3 rounded-md border border-amber-500/30 relative overflow-hidden">
                <div className="relative flex flex-col gap-1.5">
                  <div className="flex items-center gap-2">
                    <Shield className="w-4 h-4 shrink-0 text-amber-500" />
                    <span className="font-extrabold text-sm text-amber-700 dark:text-amber-300 tracking-wide">
                      龙鳞 {card.dragonNoLayerCostActive ? '（已激活）' : ''}
                    </span>
                  </div>
                  <p className="text-sm font-semibold text-amber-800 dark:text-amber-200 pl-6">
                    若上个Hero回合该怪物掉过血层，则本次攻击不消耗血层。
                  </p>
                </div>
              </div>
            )}

            {/* Dragon Lv2: Damage retaliation */}
            {card.type === 'monster' && card.dragonDamageRetaliation != null && card.dragonDamageRetaliation > 0 && (
              <div className="bg-red-500/15 p-3 rounded-md border border-red-500/30 relative overflow-hidden">
                <div className="relative flex flex-col gap-1.5">
                  <div className="flex items-center gap-2">
                    <Flame className="w-4 h-4 shrink-0 text-red-500" />
                    <span className="font-extrabold text-sm text-red-700 dark:text-red-300 tracking-wide">
                      龙息
                    </span>
                  </div>
                  <p className="text-sm font-semibold text-red-800 dark:text-red-200 pl-6">
                    每受到一次伤害，对玩家造成 {card.dragonDamageRetaliation} 点法术伤害。
                  </p>
                </div>
              </div>
            )}

            {/* Monster Elite Dragon Regen */}
            {card.type === 'monster' && card.eliteRegenHeroTurn && (
              <div className="bg-amber-500/15 p-3 rounded-md border border-amber-500/30 relative overflow-hidden">
                <div className="relative flex flex-col gap-1.5">
                  <div className="flex items-center gap-2">
                    <Heart className="w-4 h-4 shrink-0 text-amber-500" />
                    <span className="font-extrabold text-sm text-amber-700 dark:text-amber-300 tracking-wide">
                      再生
                    </span>
                  </div>
                  <p className="text-sm font-semibold text-amber-800 dark:text-amber-200 pl-6">
                    若 Hero 回合结束时未掉血层，立即恢复一个血层。
                  </p>
                </div>
              </div>
            )}

            {/* Elite Dragon: Heal other monster */}
            {card.type === 'monster' && card.eliteHealOtherMonster && (
              <div className="bg-emerald-500/15 p-3 rounded-md border border-emerald-500/30 relative overflow-hidden">
                <div className="relative flex flex-col gap-1.5">
                  <div className="flex items-center gap-2">
                    <Heart className="w-4 h-4 shrink-0 text-emerald-500" />
                    <span className="font-extrabold text-sm text-emerald-700 dark:text-emerald-300 tracking-wide">
                      庇护
                    </span>
                  </div>
                  <p className="text-sm font-semibold text-emerald-800 dark:text-emerald-200 pl-6">
                    若 Hero 回合结束时未掉血层，为激活行另一个怪物恢复一个血层。
                  </p>
                </div>
              </div>
            )}

            {/* Monster Enter Effect */}
            {card.type === 'monster' && card.enterEffect && (
              <div className="bg-amber-500/15 p-3 rounded-md border border-amber-500/30 relative overflow-hidden">
                <div className="relative flex flex-col gap-1.5">
                  <div className="flex items-center gap-2">
                    <Zap className="w-4 h-4 shrink-0 text-amber-500" />
                    <span className="font-extrabold text-sm text-amber-700 dark:text-amber-300 tracking-wide">
                      开战
                    </span>
                  </div>
                  <p className="text-sm font-semibold text-amber-800 dark:text-amber-200 pl-6">
                    {card.enterEffect === 'auto-engage'
                      ? '进入战斗行时，整行怪物自动进入激怒状态。'
                      : '进入战斗行时触发特殊效果。'}
                  </p>
                </div>
              </div>
            )}

            {/* Swarm Race Default - 繁殖 */}
            {card.type === 'monster' && card.swarmSpawn && (
              <div className="bg-emerald-500/15 p-3 rounded-md border border-emerald-500/30 relative overflow-hidden">
                <div className="relative flex flex-col gap-1.5">
                  <div className="flex items-center gap-2">
                    <Sparkles className="w-4 h-4 shrink-0 text-emerald-500" />
                    <span className="font-extrabold text-sm text-emerald-700 dark:text-emerald-300 tracking-wide">
                      繁殖
                    </span>
                  </div>
                  <p className="text-sm font-semibold text-emerald-800 dark:text-emerald-200 pl-6">
                    场上有虫群怪物时，每移除一张地城牌，在该位置生成一只小虫子。
                  </p>
                </div>
              </div>
            )}

            {/* Ogre Crit - 暴击 */}
            {card.type === 'monster' && card.monsterSpecial === 'ogre-crit' && (
              <div className="bg-red-500/15 p-3 rounded-md border border-red-500/30 relative overflow-hidden">
                <div className="relative flex flex-col gap-1.5">
                  <div className="flex items-center gap-2">
                    <Sword className="w-4 h-4 shrink-0 text-red-500" />
                    <span className="font-extrabold text-sm text-red-700 dark:text-red-300 tracking-wide">
                      暴击
                    </span>
                  </div>
                  <p className="text-sm font-semibold text-red-800 dark:text-red-200 pl-6">
                    攻击时 50% 概率双倍伤害。
                  </p>
                </div>
              </div>
            )}

            {/* Monster On-Attack Effect */}
            {card.type === 'monster' && card.onAttackEffect && (
              <div className="bg-emerald-500/15 p-3 rounded-md border border-emerald-500/30 relative overflow-hidden">
                <div className="relative flex flex-col gap-1.5">
                  <div className="flex items-center gap-2">
                    <Coins className="w-4 h-4 shrink-0 text-emerald-500" />
                    <span className="font-extrabold text-sm text-emerald-700 dark:text-emerald-300 tracking-wide">
                      {card.onAttackEffect?.startsWith('steal-gold-') ? '窃金' : '动手'}
                    </span>
                  </div>
                  <p className="text-sm font-semibold text-emerald-800 dark:text-emerald-200 pl-6">
                    每次攻击时偷取 {card.onAttackEffect?.replace('steal-gold-', '') ?? '5'} 金币。
                  </p>
                </div>
              </div>
            )}

            {/* Elite Goblin Low-Gold Power */}
            {card.type === 'monster' && card.eliteLowGoldPower && (
              <div className={`p-3 rounded-md relative overflow-hidden ${card.lowGoldBuffActive ? 'bg-red-500/15 border border-red-500/30' : 'bg-yellow-500/15 border border-yellow-500/30'}`}>
                <div className="relative flex flex-col gap-1.5">
                  <div className="flex items-center gap-2">
                    <AlertTriangle className={`w-4 h-4 shrink-0 ${card.lowGoldBuffActive ? 'text-red-500' : 'text-yellow-500'}`} />
                    <span className={`font-extrabold text-sm tracking-wide ${card.lowGoldBuffActive ? 'text-red-700 dark:text-red-300' : 'text-yellow-700 dark:text-yellow-300'}`}>
                      窘境 {card.lowGoldBuffActive ? '（已激活）' : ''}
                    </span>
                  </div>
                  <p className={`text-sm font-semibold pl-6 ${card.lowGoldBuffActive ? 'text-red-800 dark:text-red-200' : 'text-yellow-800 dark:text-yellow-200'}`}>
                    当玩家金币 ≤ 10 时，攻击力与血量翻倍。
                  </p>
                </div>
              </div>
            )}

            {/* Monster Last Words */}
            {card.type === 'monster' && card.lastWords && (() => {
              const isDiscard = card.lastWords === 'discard-hand-3' || card.lastWords === 'discard-hand-1';
              const isWraith = card.lastWords?.startsWith('wraith-haunt');
              const title = isDiscard ? '撕牌' : isWraith ? '缠绕' : '散音';
              return (
                <div className="bg-red-500/15 p-3 rounded-md border border-red-500/30 relative overflow-hidden">
                  <div className="relative flex flex-col gap-1.5">
                    <div className="flex items-center gap-2">
                      <Skull className="w-4 h-4 shrink-0 text-red-500" />
                      <span className="font-extrabold text-sm text-red-700 dark:text-red-300 tracking-wide">
                        {title}
                      </span>
                    </div>
                    <p className="text-sm font-semibold text-red-800 dark:text-red-200 pl-6">
                      {card.lastWords === 'discard-hand-3'
                        ? '死亡时随机弃回玩家 3 张手牌。'
                        : card.lastWords === 'discard-hand-1'
                          ? '死亡时随机弃回玩家 1 张手牌。'
                          : card.lastWords === 'wraith-haunt-2'
                            ? '死亡时同行其他怪物攻击力 +2，同行卡牌位置随机打乱。'
                            : card.lastWords === 'wraith-haunt-4'
                              ? '死亡时同行其他怪物攻击力 +4，同行卡牌位置随机打乱。'
                              : '死亡时触发特殊效果。'}
                    </p>
                  </div>
                </div>
              );
            })()}

            {/* Ogre Stun */}
            {card.type === 'monster' && card.ogreStun && (
              <div className="bg-cyan-500/15 p-3 rounded-md border border-cyan-500/30">
                <div className="flex flex-col gap-1.5">
                  <div className="flex items-center gap-2">
                    <Zap className="w-4 h-4 shrink-0 text-cyan-500" />
                    <span className="font-extrabold text-sm text-cyan-700 dark:text-cyan-300 tracking-wide">震晕</span>
                  </div>
                  <p className="text-sm font-semibold text-cyan-800 dark:text-cyan-200 pl-6">攻击时30%概率击晕玩家，冻结装备栏和护符栏一回合。手牌仍可使用，但无法装备/卸下装备和护符。</p>
                </div>
              </div>
            )}

            {/* Ogre Double Attack */}
            {card.type === 'monster' && card.eliteDoubleAttack && (
              <div className="bg-violet-500/15 p-3 rounded-md border border-violet-500/30">
                <div className="flex flex-col gap-1.5">
                  <div className="flex items-center gap-2">
                    <Zap className="w-4 h-4 shrink-0 text-violet-500" />
                    <span className="font-extrabold text-sm text-violet-700 dark:text-violet-300 tracking-wide">连击</span>
                  </div>
                  <p className="text-sm font-semibold text-violet-800 dark:text-violet-200 pl-6">攻击时70%概率再攻击一次。</p>
                </div>
              </div>
            )}

            {/* Tier-3 Upgrade: Ogre Enter Discard */}
            {card.type === 'monster' && card.ogreEnterDiscard && (
              <div className="bg-amber-500/15 p-3 rounded-md border border-amber-500/30">
                <div className="flex flex-col gap-1.5">
                  <div className="flex items-center gap-2">
                    <Zap className="w-4 h-4 shrink-0 text-amber-500" />
                    <span className="font-extrabold text-sm text-amber-700 dark:text-amber-300 tracking-wide">震慑</span>
                  </div>
                  <p className="text-sm font-semibold text-amber-800 dark:text-amber-200 pl-6">入场时随机弃回玩家一张手牌。</p>
                </div>
              </div>
            )}

            {/* Tier-3 Upgrade: Dragon Bleed Destroy */}
            {card.type === 'monster' && card.dragonBleedDestroy && (
              <div className="bg-orange-500/15 p-3 rounded-md border border-orange-500/30">
                <div className="flex flex-col gap-1.5">
                  <div className="flex items-center gap-2">
                    <Sword className="w-4 h-4 shrink-0 text-orange-500" />
                    <span className="font-extrabold text-sm text-orange-700 dark:text-orange-300 tracking-wide">破甲</span>
                  </div>
                  <p className="text-sm font-semibold text-orange-800 dark:text-orange-200 pl-6">每失去一个血层，破坏所有耐久度大于该怪物剩余血层数的装备。</p>
                </div>
              </div>
            )}

            {/* Tier-1 Upgrade: Skeleton No Layer Cost */}
            {card.type === 'monster' && (card.skeletonNoLayerCost || card.skeletonNoLayerCostActive) && (
              <div className="bg-gray-500/15 p-3 rounded-md border border-gray-500/30">
                <div className="flex flex-col gap-1.5">
                  <div className="flex items-center gap-2">
                    <Skull className="w-4 h-4 shrink-0 text-gray-500" />
                    <span className="font-extrabold text-sm text-gray-700 dark:text-gray-300 tracking-wide">
                      无尽 {card.skeletonNoLayerCostActive ? '（已激活）' : ''}
                    </span>
                  </div>
                  <p className="text-sm font-semibold text-gray-800 dark:text-gray-200 pl-6">复生后，攻击不再消耗血层。</p>
                </div>
              </div>
            )}

            {/* Tier-2 Upgrade: Skeleton Last Words Discard */}
            {card.type === 'monster' && card.skeletonLastWordsDiscard && (
              <div className="bg-red-500/15 p-3 rounded-md border border-red-500/30">
                <div className="flex flex-col gap-1.5">
                  <div className="flex items-center gap-2">
                    <Skull className="w-4 h-4 shrink-0 text-red-500" />
                    <span className="font-extrabold text-sm text-red-700 dark:text-red-300 tracking-wide">
                      骸弃
                    </span>
                  </div>
                  <p className="text-sm font-semibold text-red-800 dark:text-red-200 pl-6">死亡时随机弃回玩家 1 张手牌。</p>
                </div>
              </div>
            )}

            {/* Tier-3 Upgrade: Skeleton Re-Revive */}
            {card.type === 'monster' && card.skeletonReRevive && (
              <div className="bg-violet-500/15 p-3 rounded-md border border-violet-500/30">
                <div className="flex flex-col gap-1.5">
                  <div className="flex items-center gap-2">
                    <Skull className="w-4 h-4 shrink-0 text-violet-500" />
                    <span className="font-extrabold text-sm text-violet-700 dark:text-violet-300 tracking-wide">
                      轮回
                    </span>
                  </div>
                  <p className="text-sm font-semibold text-violet-800 dark:text-violet-200 pl-6">同行其他怪物被击败时，若本骷髅已复生过，再次获得复生。</p>
                </div>
              </div>
            )}

            {/* Tier-2 Upgrade: Wraith Turn Attack (legacy) */}
            {card.type === 'monster' && card.wraithTurnAttack != null && card.wraithTurnAttack > 0 && (
              <div className="bg-purple-500/15 p-3 rounded-md border border-purple-500/30">
                <div className="flex flex-col gap-1.5">
                  <div className="flex items-center gap-2">
                    <Sword className="w-4 h-4 shrink-0 text-purple-500" />
                    <span className="font-extrabold text-sm text-purple-700 dark:text-purple-300 tracking-wide">蓄积</span>
                  </div>
                  <p className="text-sm font-semibold text-purple-800 dark:text-purple-200 pl-6">每个怪物回合结束时攻击力 +{card.wraithTurnAttack}。</p>
                </div>
              </div>
            )}

            {/* Tier-3 Upgrade: Wraith Death Heal (legacy) */}
            {card.type === 'monster' && card.wraithDeathHeal != null && card.wraithDeathHeal > 0 && (
              <div className="bg-purple-500/15 p-3 rounded-md border border-purple-500/30">
                <div className="flex flex-col gap-1.5">
                  <div className="flex items-center gap-2">
                    <Heart className="w-4 h-4 shrink-0 text-purple-500" />
                    <span className="font-extrabold text-sm text-purple-700 dark:text-purple-300 tracking-wide">祝福</span>
                  </div>
                  <p className="text-sm font-semibold text-purple-800 dark:text-purple-200 pl-6">死亡时同行其他怪物生命值 +{card.wraithDeathHeal}。</p>
                </div>
              </div>
            )}

            {/* Tier-1 Upgrade: Wraith Aura Attack */}
            {card.type === 'monster' && card.wraithAuraAttack != null && card.wraithAuraAttack > 0 && (
              <div className="bg-purple-500/15 p-3 rounded-md border border-purple-500/30">
                <div className="flex flex-col gap-1.5">
                  <div className="flex items-center gap-2">
                    <Sword className="w-4 h-4 shrink-0 text-purple-500" />
                    <span className="font-extrabold text-sm text-purple-700 dark:text-purple-300 tracking-wide">光环</span>
                  </div>
                  <p className="text-sm font-semibold text-purple-800 dark:text-purple-200 pl-6">每个怪物回合结束时，激活行所有怪物攻击力 +{card.wraithAuraAttack}（无需激怒）。</p>
                </div>
              </div>
            )}

            {/* Tier-2 Upgrade: Wraith Death Heal Spread */}
            {card.type === 'monster' && card.wraithDeathHealSpread != null && card.wraithDeathHealSpread > 0 && (
              <div className="bg-purple-500/15 p-3 rounded-md border border-purple-500/30">
                <div className="flex flex-col gap-1.5">
                  <div className="flex items-center gap-2">
                    <Heart className="w-4 h-4 shrink-0 text-purple-500" />
                    <span className="font-extrabold text-sm text-purple-700 dark:text-purple-300 tracking-wide">传魂</span>
                  </div>
                  <p className="text-sm font-semibold text-purple-800 dark:text-purple-200 pl-6">死亡时同行其他怪物生命值 +{card.wraithDeathHealSpread}，并让随机一个激活行怪物获得此遗言。</p>
                </div>
              </div>
            )}

            {/* Tier-3 Upgrade: Wraith Curse */}
            {card.type === 'monster' && card.wraithTurnEnrage && (
              <div className="bg-purple-500/15 p-3 rounded-md border border-purple-500/30">
                <div className="flex flex-col gap-1.5">
                  <div className="flex items-center gap-2">
                    <Sword className="w-4 h-4 shrink-0 text-purple-500" />
                    <span className="font-extrabold text-sm text-purple-700 dark:text-purple-300 tracking-wide">诅咒</span>
                  </div>
                  <p className="text-sm font-semibold text-purple-800 dark:text-purple-200 pl-6">每个怪物回合结束时，使激活行所有怪物激怒，并随机摧毁一个护符。</p>
                </div>
              </div>
            )}

            {/* Tier-1 Upgrade: Goblin Steal Card */}
            {card.type === 'monster' && card.goblinStealCard && (
              <div className="bg-emerald-500/15 p-3 rounded-md border border-emerald-500/30">
                <div className="flex flex-col gap-1.5">
                  <div className="flex items-center gap-2">
                    <Scroll className="w-4 h-4 shrink-0 text-emerald-500" />
                    <span className="font-extrabold text-sm text-emerald-700 dark:text-emerald-300 tracking-wide">窃牌</span>
                  </div>
                  <p className="text-sm font-semibold text-emerald-800 dark:text-emerald-200 pl-6">攻击时随机偷走一张玩家手牌，堆叠在自身下方。击杀后被偷的牌逐张成为地城牌。</p>
                </div>
              </div>
            )}

            {/* Tier-2 Upgrade: Goblin Stack Heal */}
            {card.type === 'monster' && card.goblinStackHeal && (
              <div className="bg-emerald-500/15 p-3 rounded-md border border-emerald-500/30">
                <div className="flex flex-col gap-1.5">
                  <div className="flex items-center gap-2">
                    <Heart className="w-4 h-4 shrink-0 text-emerald-500" />
                    <span className="font-extrabold text-sm text-emerald-700 dark:text-emerald-300 tracking-wide">疗养</span>
                  </div>
                  <p className="text-sm font-semibold text-emerald-800 dark:text-emerald-200 pl-6">怪物回合结束时掷一次骰子，自身下方每有1张牌成功率 +15%（最高100%），成功则恢复 1 血层。</p>
                </div>
              </div>
            )}

            {/* Elite: Goblin Steal Equip */}
            {card.type === 'monster' && card.goblinStealEquip && (
              <div className="bg-red-500/15 p-3 rounded-md border border-red-500/30">
                <div className="flex flex-col gap-1.5">
                  <div className="flex items-center gap-2">
                    <AlertTriangle className="w-4 h-4 shrink-0 text-red-500" />
                    <span className="font-extrabold text-sm text-red-700 dark:text-red-300 tracking-wide">窃宝</span>
                  </div>
                  <p className="text-sm font-semibold text-red-800 dark:text-red-200 pl-6">怪物回合结束时掷一次骰子，自身下方每有1张牌成功率 +25%（最高100%），成功则偷走玩家 1 件装备或护符并堆叠在自身下方。</p>
                </div>
              </div>
            )}

            {/* Tier-3 Upgrade: Goblin Steal Scale */}
            {card.type === 'monster' && card.goblinStealScale && (
              <div className="bg-emerald-500/15 p-3 rounded-md border border-emerald-500/30">
                <div className="flex flex-col gap-1.5">
                  <div className="flex items-center gap-2">
                    <Coins className="w-4 h-4 shrink-0 text-emerald-500" />
                    <span className="font-extrabold text-sm text-emerald-700 dark:text-emerald-300 tracking-wide">贪敛</span>
                  </div>
                  <p className="text-sm font-semibold text-emerald-800 dark:text-emerald-200 pl-6">每偷到 X 金币，攻击力和生命值各 +X。</p>
                </div>
              </div>
            )}

            {/* Golem Anti-Magic Reflect */}
            {card.type === 'monster' && card.antiMagicReflect != null && card.antiMagicReflect > 0 && (
              <div className="bg-indigo-500/15 p-3 rounded-md border border-indigo-500/30">
                <div className="flex flex-col gap-1.5">
                  <div className="flex items-center gap-2">
                    <Sparkles className="w-4 h-4 shrink-0 text-indigo-500" />
                    <span className="font-extrabold text-sm text-indigo-700 dark:text-indigo-300 tracking-wide">反魔</span>
                  </div>
                  <p className="text-sm font-semibold text-indigo-800 dark:text-indigo-200 pl-6">玩家每使用一张法术牌，对玩家造成 {card.antiMagicReflect} 点伤害。</p>
                </div>
              </div>
            )}

            {/* Golem Spell Damage Reduction */}
            {card.type === 'monster' && card.spellDamageReduction != null && card.spellDamageReduction > 0 && (
              <div className="bg-indigo-500/15 p-3 rounded-md border border-indigo-500/30">
                <div className="flex flex-col gap-1.5">
                  <div className="flex items-center gap-2">
                    <Shield className="w-4 h-4 shrink-0 text-indigo-500" />
                    <span className="font-extrabold text-sm text-indigo-700 dark:text-indigo-300 tracking-wide">抗性</span>
                  </div>
                  <p className="text-sm font-semibold text-indigo-800 dark:text-indigo-200 pl-6">受到的法术伤害减少 {Math.round(card.spellDamageReduction * 100)}%。</p>
                </div>
              </div>
            )}

            {/* Golem Max Damage Per Hit */}
            {card.type === 'monster' && card.maxDamagePerHit != null && (
              <div className="bg-indigo-500/15 p-3 rounded-md border border-indigo-500/30">
                <div className="flex flex-col gap-1.5">
                  <div className="flex items-center gap-2">
                    <Shield className="w-4 h-4 shrink-0 text-indigo-500" />
                    <span className="font-extrabold text-sm text-indigo-700 dark:text-indigo-300 tracking-wide">护体</span>
                  </div>
                  <p className="text-sm font-semibold text-indigo-800 dark:text-indigo-200 pl-6">每次最多受到 {card.maxDamagePerHit} 点伤害。</p>
                </div>
              </div>
            )}

            {/* Golem Layer Loss Reflect */}
            {card.type === 'monster' && card.golemLayerLossReflect != null && card.golemLayerLossReflect > 0 && (
              <div className="bg-indigo-500/15 p-3 rounded-md border border-indigo-500/30">
                <div className="flex flex-col gap-1.5">
                  <div className="flex items-center gap-2">
                    <Sparkles className="w-4 h-4 shrink-0 text-indigo-500" />
                    <span className="font-extrabold text-sm text-indigo-700 dark:text-indigo-300 tracking-wide">反震</span>
                  </div>
                  <p className="text-sm font-semibold text-indigo-800 dark:text-indigo-200 pl-6">每次掉1血层，对玩家造成 {card.golemLayerLossReflect}×已损失血层 点伤害。</p>
                </div>
              </div>
            )}

            {/* Golem Spell Growth */}
            {card.type === 'monster' && card.golemSpellGrowth != null && card.golemSpellGrowth > 0 && (
              <div className="bg-indigo-500/15 p-3 rounded-md border border-indigo-500/30">
                <div className="flex flex-col gap-1.5">
                  <div className="flex items-center gap-2">
                    <Sparkles className="w-4 h-4 shrink-0 text-indigo-500" />
                    <span className="font-extrabold text-sm text-indigo-700 dark:text-indigo-300 tracking-wide">吞噬</span>
                  </div>
                  <p className="text-sm font-semibold text-indigo-800 dark:text-indigo-200 pl-6">每个怪物回合结束时，反魔伤害 +{card.golemSpellGrowth}，反震系数 +{card.golemSpellGrowth}。</p>
                </div>
              </div>
            )}

            {/* Stun Status */}
            {card.type === 'monster' && card.isStunned && (
              <div className="bg-yellow-500/15 p-3 rounded-md border border-yellow-500/30">
                <div className="flex flex-col gap-1.5">
                  <div className="flex items-center gap-2">
                    <Zap className="w-4 h-4 shrink-0 text-yellow-500" />
                    <span className="font-extrabold text-sm text-yellow-700 dark:text-yellow-300 tracking-wide">晕眩</span>
                  </div>
                  <p className="text-sm font-semibold text-yellow-800 dark:text-yellow-200 pl-6">被击晕，本回合无法行动，不触发回合效果。</p>
                </div>
              </div>
            )}

            {/* Boss Phase Banner */}
            {card.type === 'monster' && card.bossPhase && (
              <div className="bg-red-600/20 p-3 rounded-md border-2 border-red-500/50 relative overflow-hidden">
                <div className="absolute inset-0 bg-gradient-to-r from-red-500/10 to-orange-500/10 pointer-events-none" />
                <div className="relative flex items-center gap-2">
                  <Skull className="w-5 h-5 shrink-0 text-red-500" />
                  <span className="font-black text-sm text-red-600 dark:text-red-300 tracking-widest uppercase">
                    {t('modal.cardDetails.bossPhaseTag')}
                  </span>
                </div>
              </div>
            )}

            {/* Boss: Retaliation */}
            {card.type === 'monster' && card.bossRetaliationDamage && card.bossRetaliationDamage > 0 && (
              <div className="bg-red-500/15 p-3 rounded-md border border-red-500/30 relative overflow-hidden">
                <div className="relative flex flex-col gap-1.5">
                  <div className="flex items-center gap-2">
                    <Zap className="w-4 h-4 shrink-0 text-red-500" />
                    <span className="font-extrabold text-sm text-red-700 dark:text-red-300 tracking-wide">
                      反噬
                    </span>
                  </div>
                  <p className="text-sm font-semibold text-red-800 dark:text-red-200 pl-6">
                    每次受到伤害时，对英雄造成 {card.bossRetaliationDamage} 点直接伤害（无视护盾）。
                  </p>
                </div>
              </div>
            )}

            {/* Boss: Enrage Graveyard Summon */}
            {card.type === 'monster' && card.bossEnrageGraveyardSummon && card.bossEnrageGraveyardSummon > 0 && (
              <div className="bg-purple-500/15 p-3 rounded-md border border-purple-500/30 relative overflow-hidden">
                <div className="relative flex flex-col gap-1.5">
                  <div className="flex items-center gap-2">
                    <Skull className="w-4 h-4 shrink-0 text-purple-500" />
                    <span className="font-extrabold text-sm text-purple-700 dark:text-purple-300 tracking-wide">
                      召唤
                    </span>
                  </div>
                  <p className="text-sm font-semibold text-purple-800 dark:text-purple-200 pl-6">
                    被激怒时，从坟场取 {card.bossEnrageGraveyardSummon} 张牌：2 张怪物各占 1 个非 boss 格子（成为顶层，进场时恢复 1 血层，即当前血层为 2，受血层上限封顶），2 张非怪物堆叠在另一个非 boss 格子上。被召唤的怪物立即激怒。
                  </p>
                </div>
              </div>
            )}

            </>)}

            {/* Monster Equipment Effects */}
            {card.type === 'monster' && card.durability != null && (() => {
              const mType = card.monsterType ?? card.name;
              const effects: { title: string; desc: string; color: string }[] = [];

              if (mType === 'Goblin') {
                if (card.onAttackEffect?.startsWith('steal-gold-')) {
                  const amt = card.onAttackEffect.replace('steal-gold-', '');
                  effects.push({ title: '窃金', desc: `攻击时为 Hero 偷取 ${amt} 金币。`, color: 'emerald' });
                }
                if (card.goblinStackHeal) {
                  effects.push({ title: '疗养', desc: '攻击怪物时自动发动免费劝降，成功则怪物加入背包。', color: 'emerald' });
                }
                if (card.eliteLowGoldPower) {
                  effects.push({ title: '窘境', desc: '当玩家金币 ≥ 30 时，该装备攻击力和护盾值翻倍。', color: 'amber' });
                }
                if (card.goblinStealEquip) {
                  effects.push({ title: '窃宝', desc: '若所在装备栏为多装备且下层有装备，劝降概率 +30%。', color: 'red' });
                }
                if (card.goblinStealScale) {
                  effects.push({ title: '贪敛', desc: '每次窃金攻击触发时，本装备攻击力 +N、生命值 +N（N = 窃金金额）。', color: 'emerald' });
                }
              } else if (mType === 'Ogre') {
                if (card.monsterSpecial === 'ogre-crit') {
                  effects.push({ title: '暴击', desc: '装备攻击时伤害始终翻倍。', color: 'red' });
                }
                if (card.eliteDoubleAttack) {
                  effects.push({ title: '连击', desc: '攻击后 50% 概率可以再攻击一次。', color: 'violet' });
                }
              } else if (mType === 'Skeleton') {
                if (card.hasRevive) {
                  effects.push({
                    title: card.reviveUsed ? '复生（已触发）' : '复生',
                    desc: '装备第一次耐久耗完时，以 1 耐久形式复生。',
                    color: card.reviveUsed ? 'gray' : 'emerald',
                  });
                }
                if (card.skeletonLastWordsDiscard) {
                  effects.push({ title: '骸弃', desc: '装备被毁坏时，抽 1 张牌。', color: 'amber' });
                }
                if (card.skeletonReRevive) {
                  effects.push({ title: '轮回', desc: '当另一个装备栏的装备被毁坏时，若本装备没有「复生」，获得「复生」。', color: 'emerald' });
                }
                if (card.monsterSpecial === 'bone-regen') {
                  effects.push({ title: '骸生', desc: '每次失去耐久，40% 概率恢复 1 耐久。', color: 'emerald' });
                }
              } else if (mType === 'Wraith') {
                if (card.lastWords?.startsWith('wraith-haunt')) {
                  const hauntAmt = card.lastWords.replace('wraith-haunt-', '');
                  effects.push({ title: '缠绕', desc: `另一个装备栏获得 +${hauntAmt} 临时攻击力，50% 概率左右装备互换。`, color: 'purple' });
                }
                if (card.monsterSpecial === 'wraith-rebirth') {
                  effects.push({
                    title: card.wraithRebirthUsed ? '重生（已触发）' : '重生',
                    desc: '耐久第一次降到 1 时，50% 概率耐久回满。',
                    color: card.wraithRebirthUsed ? 'gray' : 'purple',
                  });
                }
                if (card.wraithDeathHealSpread) {
                  effects.push({ title: '传魂', desc: '遗言：另一装备耐久 +1，并获得遗言「祝福：另一装备耐久 +1」。', color: 'purple' });
                } else if (card.wraithDeathHeal) {
                  effects.push({ title: '祝福', desc: '遗言：另一个装备栏的装备耐久 +1。', color: 'purple' });
                }
                if (card.wraithTurnEnrage) {
                  effects.push({ title: '诅咒', desc: '每次瀑流时，使激活行所有怪物激怒，护符栏上限 +1。', color: 'purple' });
                }
              } else if (mType === 'Swarm') {
                if (card.swarmCorrode) {
                  effects.push({ title: '腐蚀', desc: '攻击时，立刻让攻击目标 -1 血层。', color: 'emerald' });
                }
                if (card.swarmBugletShield) {
                  effects.push({ title: '虫盾', desc: '若另一装备栏的装备是小虫子，格挡时不掉耐久。', color: 'emerald' });
                }
                if (card.monsterSpecial === 'swarm-elite') {
                  effects.push({ title: '虫母', desc: '每次掉耐久时，将另一装备栏的装备替换为小虫子。', color: 'red' });
                }
              } else if (mType === 'Dragon') {
                if (card.bleedEffect) {
                  effects.push({ title: '狂怒', desc: '每失去 1 耐久，攻击力 +3。', color: 'orange' });
                }
                if (card.eliteRegenHeroTurn) {
                  effects.push({ title: '再生', desc: '若怪物回合内 Hero 未掉血，50% 概率为另一装备栏的装备恢复 1 耐久。', color: 'amber' });
                }
                if (card.eliteHealOtherMonster) {
                  effects.push({ title: '庇护', desc: 'Hero 回合未掉血层时，为激活行另一个怪物恢复 1 血层。', color: 'emerald' });
                }
                if (card.dragonDamageRetaliation) {
                  effects.push({ title: '龙息', desc: '每格挡一次，对随机怪物造成 2 点伤害。', color: 'red' });
                }
                if (card.dragonBleedDestroy) {
                  effects.push({ title: '破甲', desc: '每失去 1 耐久，破坏所有耐久度 > 该装备剩余耐久的装备（包括自己的）。', color: 'orange' });
                }
              } else if (mType === 'Golem') {
                if (card.golemLayerLossReflect && card.golemLayerLossReflect > 0) {
                  effects.push({ title: '反震', desc: `每次掉 1 耐久，对随机怪物造成 ${card.golemLayerLossReflect}×已损失耐久 的伤害。`, color: 'amber' });
                }
                if (card.golemSpellGrowth && card.golemSpellGrowth > 0) {
                  effects.push({ title: '吞噬', desc: `每次瀑流时，反震伤害系数 +${card.golemSpellGrowth}。`, color: 'amber' });
                }
                if (card.maxDamagePerHit != null) {
                  effects.push({ title: '护体', desc: `作为护盾时，每次格挡最多只掉 ${card.maxDamagePerHit} 护甲。`, color: 'cyan' });
                }
              }

              {
                const stacks = (card.lastWordsSlotTempBuff ?? 0)
                  + (card.onDestroyEffect === 'slot-temp-buff-3-3' ? 1 : 0);
                if (stacks > 0) {
                  const amt = 3 * stacks;
                  const stackText = stacks > 1 ? `（遗赠淬炼药 ×${stacks} 层）` : '';
                  effects.push({
                    title: stacks > 1 ? `遗言 ×${stacks}` : '遗言',
                    desc: `装备毁坏时，该装备栏 +${amt} 临时攻击 +${amt} 临时护甲。${stackText}`,
                    color: 'amber',
                  });
                }
              }

              {
                const stacks = card.lastWordsMaxHpBoost ?? 0;
                if (stacks > 0) {
                  const amt = 4 * stacks;
                  const stackText = stacks > 1 ? `（附魔祭坛 ×${stacks} 层）` : '';
                  effects.push({
                    title: stacks > 1 ? `遗言 ×${stacks}` : '遗言',
                    desc: `装备毁坏时，永久最大生命 +${amt}。${stackText}`,
                    color: 'amber',
                  });
                }
              }

              if (effects.length === 0) return null;

              const colorMap: Record<string, { bg: string; border: string; title: string; text: string; iconColor: string }> = {
                emerald: { bg: 'bg-emerald-500/15', border: 'border-emerald-500/30', title: 'text-emerald-700 dark:text-emerald-300', text: 'text-emerald-800 dark:text-emerald-200', iconColor: 'text-emerald-500' },
                amber:   { bg: 'bg-amber-500/15',   border: 'border-amber-500/30',   title: 'text-amber-700 dark:text-amber-300',     text: 'text-amber-800 dark:text-amber-200',   iconColor: 'text-amber-500' },
                red:     { bg: 'bg-red-500/15',     border: 'border-red-500/30',     title: 'text-red-700 dark:text-red-300',         text: 'text-red-800 dark:text-red-200',       iconColor: 'text-red-500' },
                violet:  { bg: 'bg-violet-500/15',  border: 'border-violet-500/30',  title: 'text-violet-700 dark:text-violet-300',   text: 'text-violet-800 dark:text-violet-200', iconColor: 'text-violet-500' },
                cyan:    { bg: 'bg-cyan-500/15',    border: 'border-cyan-500/30',    title: 'text-cyan-700 dark:text-cyan-300',       text: 'text-cyan-800 dark:text-cyan-200',     iconColor: 'text-cyan-500' },
                gray:    { bg: 'bg-gray-500/15',    border: 'border-gray-500/30',    title: 'text-gray-700 dark:text-gray-300',       text: 'text-gray-800 dark:text-gray-200',     iconColor: 'text-gray-400' },
                purple:  { bg: 'bg-purple-500/15',  border: 'border-purple-500/30',  title: 'text-purple-700 dark:text-purple-300',   text: 'text-purple-800 dark:text-purple-200', iconColor: 'text-purple-500' },
                orange:  { bg: 'bg-orange-500/15',  border: 'border-orange-500/30',  title: 'text-orange-700 dark:text-orange-300',   text: 'text-orange-800 dark:text-orange-200', iconColor: 'text-orange-500' },
              };

              const effectIconMap: Record<string, typeof Sword> = {
                '窃金': Coins,
                '窃牌': Scroll,
                '疗养': Heart,
                '窘境': AlertTriangle,
                '窃宝': AlertTriangle,
                '贪敛': Coins,
                '开战': Zap,
                '震慑': Zap,
                '暴击': Sword,
                '连击': Zap,
                '复生': Heart,
                '复生（已触发）': Heart,
                '遗言': Skull,
                '骸弃': Skull,
                '轮回': Skull,
                '骸生': Sparkles,
                '重生': Sparkles,
                '重生（已触发）': Sparkles,
                '缠绕': Skull,
                '传魂': Heart,
                '祝福': Heart,
                '诅咒': Sword,
                '腐蚀': Sword,
                '虫盾': Shield,
                '虫母': Sparkles,
                '狂怒': Sword,
                '再生': Heart,
                '庇护': Heart,
                '龙息': Flame,
                '破甲': Sword,
                '反震': Sparkles,
                '吞噬': Sparkles,
                '护体': Shield,
              };

              return (
                <div className="space-y-2">
                  <div className="flex items-center gap-2 text-sm font-semibold text-amber-600 dark:text-amber-400">
                    <Sparkles className="w-4 h-4" />
                    {t('modal.cardDetails.equipmentEffectsTitle')}
                  </div>
                  {effects.map((eff, idx) => {
                    const c = colorMap[eff.color] ?? colorMap.gray;
                    const EffIcon = effectIconMap[eff.title] ?? Sparkles;
                    return (
                      <div key={idx} className={`${c.bg} p-3 rounded-md border ${c.border}`}>
                        <div className="flex flex-col gap-1.5">
                          <div className="flex items-center gap-2">
                            <EffIcon className={`w-4 h-4 shrink-0 ${c.iconColor}`} />
                            <span className={`font-extrabold text-sm ${c.title} tracking-wide`}>
                              {eff.title}
                            </span>
                          </div>
                          <p className={`text-sm font-semibold ${c.text} pl-6`}>
                            {eff.desc}
                          </p>
                        </div>
                      </div>
                    );
                  })}
                </div>
              );
            })()}

            {/* Weapon/Shield Details */}
            {(card.type === 'weapon' || card.type === 'shield') && (
              <div className="grid grid-cols-2 gap-2 bg-muted/30 p-3 rounded-md">
                {(isPermRecycleEquipment(card) || (card.recycleDelay != null && card.recycleDelay > 0)) && (
                  <div className="col-span-2 mb-1 inline-flex items-center gap-1 rounded-md border border-cyan-500/45 bg-cyan-950/25 px-2 py-1 text-xs font-bold tracking-wide text-cyan-900 dark:text-cyan-100">
                    PERM
                    {(card.recycleDelay ?? 1) > 1 && (
                      <span className="tabular-nums">{card.recycleDelay}</span>
                    )}
                    <span className="ml-1 font-normal text-muted-foreground">
                      损毁后进回收袋，{isPermRecycleEquipment(card) ? '耐久恢复至满' : '耐久回到 1'}，与永久法术相同瀑流计数后回背包。
                    </span>
                  </div>
                )}
                <div className="flex items-center gap-2">
                  {card.type === 'weapon' ? <Sword className="w-4 h-4" /> : <Shield className="w-4 h-4" />}
                  <span>{card.type === 'weapon' ? 'Attack' : 'Defense'}: <span className="font-bold">{card.value}</span></span>
                </div>
                {card.durability !== undefined && (
                  <div className="flex items-center gap-2">
                    <span className="text-muted-foreground">Durability:</span>
                    <span className="font-bold">{card.durability}/{card.maxDurability || card.durability}</span>
                  </div>
                )}
                {card.type === 'shield' && card.armorMax != null && card.armorMax > 0 && (() => {
                  const baseArmorMax = card.armorMax;
                  const curArmor = Math.min(card.armor ?? baseArmorMax, baseArmorMax);
                  return (
                    <div className="col-span-2 flex items-center gap-2 mt-1">
                      <Shield className="w-4 h-4 text-cyan-500" />
                      <span>
                        护甲：<span className={`font-bold ${curArmor < baseArmorMax ? 'text-orange-500' : 'text-cyan-600'}`}>{curArmor}</span>
                        <span className="text-muted-foreground"> / {baseArmorMax}</span>
                      </span>
                    </div>
                  );
                })()}
                {(card as any).healOnKill && (
                   <div className="col-span-2 text-green-600 flex items-center gap-1">
                     <Heart className="w-3 h-3" /> Heals {(card as any).healOnKill} HP on kill
                   </div>
                )}
                {(card as any).damageReflect && (
                   <div className="col-span-2 text-amber-600 flex flex-col gap-0.5">
                     <div className="flex items-center gap-1">
                       <Shield className="w-3 h-3 shrink-0" />
                       <span>
                         格挡反弹 {(card as any).damageReflect} 点基础伤害，结算时叠加该栏永久伤害与全局永久法术伤害加成。
                       </span>
                     </div>
                   </div>
                )}
              </div>
            )}

            {/* Equipment Revive Keyword (from 不灭赐福) */}
            {(card.type === 'weapon' || card.type === 'shield' || isMonsterEquipment) && card.hasEquipmentRevive && (
              <div className={`p-3 rounded-md border relative overflow-hidden ${
                card.equipmentReviveUsed
                  ? 'bg-gray-500/10 border-gray-500/30'
                  : 'bg-emerald-500/15 border-emerald-500/30'
              }`}>
                <div className="relative flex flex-col gap-1.5">
                  <div className="flex items-center gap-2">
                    <Heart className={`w-4 h-4 shrink-0 ${card.equipmentReviveUsed ? 'text-gray-400' : 'text-emerald-500'}`} />
                    <span className={`font-extrabold text-sm tracking-wide ${
                      card.equipmentReviveUsed
                        ? 'text-gray-500 dark:text-gray-400 line-through'
                        : 'text-emerald-700 dark:text-emerald-300'
                    }`}>
                      复生
                    </span>
                    {card.equipmentReviveUsed && (
                      <span className="text-xs text-gray-400">（已触发）</span>
                    )}
                  </div>
                  <p className={`text-sm pl-6 ${
                    card.equipmentReviveUsed
                      ? 'text-gray-500 dark:text-gray-400'
                      : 'font-semibold text-emerald-800 dark:text-emerald-200'
                  }`}>
                    首次毁坏时，以 1 耐久的形式复生（仅一次）。
                  </p>
                </div>
              </div>
            )}

            {/* Equipment Flank / Transform Keywords */}
            {(card.type === 'weapon' || card.type === 'shield') && card.flankEffect && (
              <div className="mt-2 flex items-center gap-1.5 rounded-md border border-cyan-500/40 bg-cyan-500/10 px-2 py-1 text-xs text-cyan-800 dark:text-cyan-200">
                <span className="font-bold">侧击</span>
                <span>手牌最左/最右时打出：{card.flankEffect}</span>
              </div>
            )}
            {(card.type === 'weapon' || card.type === 'shield') && card.transformBonus && (
              <div className="mt-2 flex items-center gap-1.5 rounded-md border border-amber-500/40 bg-amber-500/10 px-2 py-1 text-xs text-amber-800 dark:text-amber-200">
                <span className="font-bold">转型</span>
                <span>上一张使用的牌类型不同时：{card.transformBonus}</span>
              </div>
            )}

            {/* Equipment Last Words from potion (weapon/shield) */}
            {(card.type === 'weapon' || card.type === 'shield') && (() => {
              const stacks = (card.lastWordsSlotTempBuff ?? 0)
                + (card.onDestroyEffect === 'slot-temp-buff-3-3' ? 1 : 0);
              if (stacks <= 0) return null;
              const amt = 3 * stacks;
              return (
                <div className="p-3 rounded-md border bg-amber-500/15 border-amber-500/30">
                  <div className="flex flex-col gap-1.5">
                    <div className="flex items-center gap-2">
                      <Skull className="w-4 h-4 shrink-0 text-amber-500" />
                      <span className="font-extrabold text-sm text-amber-700 dark:text-amber-300 tracking-wide">
                        {stacks > 1 ? `遗言 ×${stacks}` : '遗言'}
                      </span>
                    </div>
                    <p className="text-sm font-semibold text-amber-800 dark:text-amber-200 pl-6">
                      装备毁坏时，该装备栏 +{amt} 临时攻击 +{amt} 临时护甲。
                      {stacks > 1 ? `（遗赠淬炼药 ×${stacks} 层）` : ''}
                    </p>
                  </div>
                </div>
              );
            })()}

            {/* Equipment Last Words from 附魔祭坛: maxHp+4 stacks (weapon/shield) */}
            {(card.type === 'weapon' || card.type === 'shield') && (() => {
              const stacks = card.lastWordsMaxHpBoost ?? 0;
              if (stacks <= 0) return null;
              const amt = 4 * stacks;
              return (
                <div className="p-3 rounded-md border bg-amber-500/15 border-amber-500/30">
                  <div className="flex flex-col gap-1.5">
                    <div className="flex items-center gap-2">
                      <Skull className="w-4 h-4 shrink-0 text-amber-500" />
                      <span className="font-extrabold text-sm text-amber-700 dark:text-amber-300 tracking-wide">
                        {stacks > 1 ? `遗言 ×${stacks}` : '遗言'}
                      </span>
                    </div>
                    <p className="text-sm font-semibold text-amber-800 dark:text-amber-200 pl-6">
                      装备毁坏时，永久最大生命 +{amt}（不回血）。
                      {stacks > 1 ? `（附魔祭坛 ×${stacks} 层）` : ''}
                    </p>
                  </div>
                </div>
              );
            })()}

            {/* Equipment Last Words: stunCap+N (e.g. 雷震守护盾) */}
            {(card.type === 'weapon' || card.type === 'shield') && card.onDestroyEffect?.startsWith('stunCap+') && (() => {
              const amt = parseInt(card.onDestroyEffect.replace('stunCap+', ''), 10) || 0;
              if (amt <= 0) return null;
              return (
                <div className="p-3 rounded-md border bg-amber-500/15 border-amber-500/30">
                  <div className="flex flex-col gap-1.5">
                    <div className="flex items-center gap-2">
                      <Skull className="w-4 h-4 shrink-0 text-amber-500" />
                      <span className="font-extrabold text-sm text-amber-700 dark:text-amber-300 tracking-wide">
                        遗言
                      </span>
                    </div>
                    <p className="text-sm font-semibold text-amber-800 dark:text-amber-200 pl-6">装备毁坏时，击晕上限 +{amt}%（封顶 100%）。</p>
                  </div>
                </div>
              );
            })()}

            {/* Equipment Last Words: allSlotTempArmor:N (e.g. 共御圣盾) */}
            {(card.type === 'weapon' || card.type === 'shield') && card.onDestroyEffect?.startsWith('allSlotTempArmor:') && (() => {
              const amt = parseInt(card.onDestroyEffect.replace('allSlotTempArmor:', ''), 10) || 0;
              if (amt <= 0) return null;
              return (
                <div className="p-3 rounded-md border bg-amber-500/15 border-amber-500/30">
                  <div className="flex flex-col gap-1.5">
                    <div className="flex items-center gap-2">
                      <Skull className="w-4 h-4 shrink-0 text-amber-500" />
                      <span className="font-extrabold text-sm text-amber-700 dark:text-amber-300 tracking-wide">
                        遗言
                      </span>
                    </div>
                    <p className="text-sm font-semibold text-amber-800 dark:text-amber-200 pl-6">装备毁坏时，所有装备栏 +{amt} 临时护甲。</p>
                  </div>
                </div>
              );
            })()}

            {/* Potion Details */}
            {card.type === 'potion' && (
              <div className="bg-green-500/10 p-3 rounded-md border border-green-500/20">
                 <div className="flex items-center gap-2 text-green-700 dark:text-green-400">
                   {(card as any).potionEffect?.startsWith('heal') ? (
                     <Heart className="w-4 h-4 shrink-0" />
                   ) : (
                     <Zap className="w-4 h-4 shrink-0" />
                   )}
                   <span className="font-bold">
                     {(card as any).potionEffect === 'heal-14'
                       ? 'Restores 14 HP'
                       : (card as any).potionEffect?.startsWith('heal')
                         ? `Restores ${card.value} HP`
                         : card.description || '使用后触发效果'}
                   </span>
                 </div>
              </div>
            )}

            {/* Magic Details */}
            {card.type === 'magic' && (
              <div className="bg-cyan-500/10 p-3 rounded-md border border-cyan-500/20">
                <div className="mb-1 font-semibold text-cyan-700 dark:text-cyan-400">
                  {t('modal.cardDetails.spellTypeLabel', { type: (card.magicType === 'instant' || card.permStripped) ? t('modal.cardDetails.spellTypeInstant') : t('modal.cardDetails.spellTypePermanent') })}
                </div>
                {card.magicType === 'permanent' && !card.permStripped && (
                  <div className="mb-2 inline-flex items-center gap-1 rounded-md border border-cyan-500/45 bg-cyan-950/25 px-2 py-1 text-xs font-bold tracking-wide text-cyan-900 dark:text-cyan-100">
                    PERM
                    <span className="tabular-nums">{card.recycleDelay ?? 1}</span>
                  </div>
                )}
                <div>
                  {card.scalingDamage != null ? (
                    <>
                      <p className="font-semibold text-foreground">
                        {formatScalingSpellDamageLine(card.scalingDamage)}
                      </p>
                      {(card.shortDescription || card.description) && (
                        <p className="text-xs text-muted-foreground mt-1">
                          {card.shortDescription || card.description}
                        </p>
                      )}
                    </>
                  ) : card.magicEffect === 'arcane-storm-magic-count' ? (
                    <>
                      <p className="font-semibold text-foreground">
                        当下 {arcaneStormDamage + (card.amplifyBonus ?? 0)} 点
                      </p>
                      <p className="text-xs text-muted-foreground mt-1">
                        伤害 = 已使用的魔法卡累计数量{(card.amplifyBonus ?? 0) > 0 ? ` + ${card.amplifyBonus} 增幅` : ''} + 永久法术伤害加成。使用后计数清零。
                      </p>
                    </>
                  ) : card.magicEffect === 'arcane-shield-stun-cap' ? (
                    <>
                      <p className="font-semibold text-foreground">
                        当下 击晕上限 +{arcaneShieldStunGain}%
                      </p>
                      <p className="text-xs text-muted-foreground mt-1">
                        +X% = 本回合已使用的非伤害魔法卡数量。
                      </p>
                    </>
                  ) : (card as GameCardData & { knightEffect?: string }).knightEffect === 'chaos-dice' ||
                    card.name === '混沌骰运' ? (
                    CHAOS_DICE_SPELL_DESCRIPTION
                  ) : (card as GameCardData & { knightEffect?: string }).knightEffect === 'missile-bolt' ? (
                    <>
                      <p className="font-semibold text-foreground">
                        选择一个怪物，造成 {1 + (card.amplifyBonus ?? 0)} 点法术伤害。
                      </p>
                      {(card.amplifyBonus ?? 0) > 0 && (
                        <p className="text-xs text-muted-foreground mt-1">
                          基础 1 + {card.amplifyBonus} 增幅 = {1 + (card.amplifyBonus ?? 0)} 点
                        </p>
                      )}
                    </>
                  ) : (
                    card.description || card.magicEffect
                  )}
                </div>
                {card.transformBonus && (
                  <div className="mt-2 flex items-center gap-1.5 rounded-md border border-amber-500/40 bg-amber-500/10 px-2 py-1 text-xs text-amber-800 dark:text-amber-200">
                    <span className="font-bold">转型</span>
                    <span>上一张使用的牌类型不同时：{card.transformBonus}</span>
                  </div>
                )}
                {card.flankEffect && (
                  <div className="mt-2 flex items-center gap-1.5 rounded-md border border-cyan-500/40 bg-cyan-500/10 px-2 py-1 text-xs text-cyan-800 dark:text-cyan-200">
                    <span className="font-bold">侧击</span>
                    <span>手牌最左/最右时打出：{card.flankEffect}</span>
                  </div>
                )}
              </div>
            )}

            {/* Hero Magic Details */}
            {card.type === 'hero-magic' && (
              <div className="bg-rose-500/10 p-3 rounded-md border border-rose-500/20">
                <div className="mb-1 font-semibold text-rose-700 dark:text-rose-400">
                  {t('modal.cardDetails.heroMagicTitle')}
                </div>
                <div>{card.heroMagicEffect || card.description}</div>
              </div>
            )}

            {/* Amulet Details */}
            {card.type === 'amulet' && (() => {
              const passive = describeAmuletPassive();
              return (
                <div className="bg-purple-500/10 p-3 rounded-md border border-purple-500/20">
                  <div className="font-semibold text-purple-700 dark:text-purple-400">
                    {t('modal.cardDetails.passiveEffectTitle')}
                  </div>
                  <div className="text-muted-foreground mt-1">
                    {passive.primary}
                  </div>
                  {passive.secondary && (
                    <div className="text-xs text-muted-foreground/80 mt-1">
                      {passive.secondary}
                    </div>
                  )}
                </div>
              );
            })()}

            {card.type !== 'magic' && card.transformBonus && (
              <div className="flex items-center gap-1.5 rounded-md border border-amber-500/40 bg-amber-500/10 px-2 py-1 text-xs text-amber-800 dark:text-amber-200">
                <span className="font-bold">转型</span>
                <span>上一张使用的牌类型不同时：{card.transformBonus}</span>
              </div>
            )}

            {card.type === 'building' && (card.maxHp != null || card.hp != null) && (
              <div className="rounded-md border border-stone-500/30 bg-stone-500/10 p-3 text-sm">
                <span className="font-semibold text-stone-800 dark:text-stone-200">耐久 </span>
                <span className="tabular-nums font-bold">{card.hp ?? 0}</span>
                {card.maxHp != null && (
                  <span className="text-muted-foreground"> / {card.maxHp}</span>
                )}
                {(card.fury ?? card.hpLayers ?? card.currentLayer) != null && (
                  <span className="ml-3 text-muted-foreground">
                    血层 {card.currentLayer ?? card.fury ?? card.hpLayers ?? 1}
                  </span>
                )}
              </div>
            )}

            {/* Event Details */}
            {(card.type === 'event' || card.type === 'building') && card.description && (
              <div className="bg-sky-500/10 p-3 rounded-md border border-sky-500/30">
                <p className="text-sm font-semibold text-sky-800 dark:text-sky-200">{card.description}</p>
              </div>
            )}
            {(card.type === 'event' || card.type === 'building') && card.eventChoices && (
              <div className="space-y-2">
                <div className="font-semibold mb-1">{card.type === 'building' ? t('modal.cardDetails.buildingAbilitiesTitle') : t('modal.cardDetails.eventChoicesTitle')}</div>
                {card.eventChoices.map((choice, idx) => (
                  <div key={idx} className="rounded-md border border-border/60 bg-muted/40 p-3 space-y-1">
                    <div className="text-sm font-semibold text-foreground">{choice.text}</div>
                    {choice.hint && (
                      <div className="text-[11px] text-muted-foreground">{choice.hint}</div>
                    )}
                    {choice.requires?.length ? (
                      <div className="text-[11px] text-amber-600">
                        <span className="font-semibold text-amber-700 dark:text-amber-400">{t('modal.cardDetails.requirementLabel')}</span>
                        {formatRequirementText(choice.requires)}
                      </div>
                    ) : null}
                    {choice.effect && (
                      <div className="text-[11px] text-muted-foreground">
                        {t('modal.cardDetails.directEffectLabel')}{describeEventEffect(choice.effect)}
                      </div>
                    )}
                    {choice.diceTable?.length ? (
                      <div className="mt-2 space-y-1 border-t border-border/50 pt-2 overflow-hidden">
                        {choice.diceTable.map(entry => (
                          <div key={entry.id} className="flex items-start gap-2 text-[11px] min-w-0">
                            <span className="font-mono text-foreground shrink-0">{formatRange(entry.range)}</span>
                            <span className="text-muted-foreground break-words min-w-0">{entry.label}</span>
                          </div>
                        ))}
                      </div>
                    ) : null}
                  </div>
                ))}
              </div>
            )}

            {/* Flip Target */}
            {card.flipTarget && (
              <div className="space-y-2 border-t border-violet-500/30 pt-3 mt-1">
                <div className="flex items-center gap-2 text-sm font-semibold text-violet-600 dark:text-violet-400">
                  <Scroll className="w-4 h-4 shrink-0" />
                  {t('modal.cardDetails.flipEffectTitle')}
                </div>
                <div className="rounded-md border border-violet-500/20 bg-violet-500/5 p-3 space-y-1.5">
                  <div className="text-sm font-semibold text-foreground">
                    → {card.flipTarget.toCard.name}
                    <span className="ml-2 text-[11px] font-normal text-muted-foreground">
                      ({card.flipTarget.toCard.type === 'magic'
                        ? card.flipTarget.toCard.magicType === 'instant' ? '一次性法术' : '永久法术'
                        : card.flipTarget.toCard.type === 'event' ? '事件'
                        : card.flipTarget.toCard.type === 'building' ? '建筑'
                        : card.flipTarget.toCard.type === 'potion' ? '药水'
                        : card.flipTarget.toCard.type.toUpperCase()})
                    </span>
                  </div>
                  {(card.flipTarget.toCard.description || card.flipTarget.toCard.magicEffect || card.flipTarget.toCard.heroMagicEffect) && (
                    <div className="text-xs text-muted-foreground leading-relaxed">
                      {card.flipTarget.toCard.description || card.flipTarget.toCard.magicEffect || card.flipTarget.toCard.heroMagicEffect}
                    </div>
                  )}
                  {(card.flipTarget.toCard.type === 'event' || card.flipTarget.toCard.type === 'building') && card.flipTarget.toCard.eventChoices?.map((choice, idx) => (
                    <div key={idx} className="text-xs text-muted-foreground leading-relaxed">
                      {choice.hint || choice.text}
                    </div>
                  ))}
                  {card.flipTarget.destination === 'stay' && (
                    <div className="text-[11px] text-violet-500/80 italic">{t('modal.cardDetails.flipStaysHere')}</div>
                  )}
                </div>
              </div>
            )}

            {/* General Description */}
            {card.description &&
              !isMonsterEquipment &&
              card.type !== 'magic' &&
              card.type !== 'hero-magic' &&
              card.type !== 'event' &&
              card.type !== 'building' &&
              card.type !== 'amulet' &&
              card.type !== 'potion' && (
              <div className="italic text-muted-foreground border-t pt-2 mt-2">
                "{card.description}"
              </div>
            )}
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}

function describeEventEffect(effect: EventEffectExpression): string {
  const tokens = Array.isArray(effect) ? effect : effect.split(',');
  return tokens
    .map(token => token.trim())
    .filter(Boolean)
    .map(token => {
      if (token.startsWith('hp-')) return `受到 ${token.replace('hp-', '')} 点伤害`;
      if (token.startsWith('heal+')) return `恢复 ${token.replace('heal+', '')} 点生命`;
      if (token.startsWith('gold+')) return `获得 ${token.replace('gold+', '')} 枚金币`;
      if (token.startsWith('gold-')) return `失去 ${token.replace('gold-', '')} 枚金币`;
      if (token.startsWith('maxhpperm+')) return `永久 +${token.replace('maxhpperm+', '')} 最大生命`;
      if (token === 'flipToCurse') return '将事件卡翻为诅咒并收入背包';
      if (token === 'addCurse') return '背包加入一张诅咒';
      if (token === 'discardHandAll') return '弃回全部手牌';
      if (token.startsWith('backpackSize-')) return `背包容量 -${token.replace('backpackSize-', '')}`;
      if (token.startsWith('shopLevel+')) return `商店等级 +${token.replace('shopLevel+', '')}`;
      if (token.startsWith('spellDamage+')) return `法术伤害 +${token.replace('spellDamage+', '')}`;
      if (token.startsWith('spellLifesteal+')) return `超杀吸血 +${token.replace('spellLifesteal+', '')}`;
      if (token.startsWith('spellLifesteal-')) return `超杀吸血 -${token.replace('spellLifesteal-', '')}`;
      if (token === 'halveSlotDamageBonus') return '所有装备栏永久攻击加成减半';
      if (token === 'halveSpellDamageBonus') return '法术伤害加成减半';
      if (token === 'halveSlotShieldBonus') return '所有装备栏永久护甲加成减半';
      if (token === 'amuletCapacity-1') return '护符栏上限 -1';
      if (token === 'persuadeSameTargetCostHalve') return '连续劝降同一怪物，第二次费用减半';
      if (token.startsWith('persuadeRaceBonus:')) {
        const parts = token.replace('persuadeRaceBonus:', '').split(':');
        return `${parts[0].split(',').join('、')} 劝降率 +${parts[1]}%`;
      }
      if (token.startsWith('persuadeSuccessDurabilityBonus+')) return `劝降成功的怪物起始耐久 +${token.replace('persuadeSuccessDurabilityBonus+', '')}`;
      if (token === 'upgradePersuadeAmulets') return '升级已装备的劝降护符';
      if (token.startsWith('discardCards:')) return `弃回 ${token.replace('discardCards:', '')} 张牌`;
      if (token.startsWith('deleteCard')) {
        const [, count = '1'] = token.split(':');
        return `删除 ${count} 张牌`;
      }
      if (token === 'graveyardDiscover') return '从坟场发现一张卡牌';
      if (token.startsWith('drawHeroCards:')) return `从背包抽 ${token.replace('drawHeroCards:', '')} 张牌`;
      if (token === 'removeAllAmulets') return '摧毁所有护符';
      if (token === 'discoverClass') return '发现一张专属卡';
      if (token === 'openShop') return '打开商店';
      if (token === 'slotLeftDamage+1') return '左槽永久伤害 +1';
      if (token === 'slotRightDefense+1') return '右槽永久护甲 +1';
      if (token === 'swapEquipmentSlots') return '左右装备互换';
      if (token === 'destroyEquipment:any') return '破坏任一装备';
      if (token === 'discardAllLeftForGold+10') return '破坏所有左槽装备，每件获得 10 金币';
      if (token === 'discardAllRightForGold+10') return '破坏所有右槽装备，每件获得 10 金币';
      if (token === 'discardCurrentLeftForGold+15') return '破坏当前左槽装备并获得 15 金币';
      if (token === 'discardCurrentRightForGold+15') return '破坏当前右槽装备并获得 15 金币';
      if (token === 'amuletsToGold+10') return '摧毁所有护符并每个获得 10 金币';
      if (token === 'classBottom+2') return '获得 class 底部两张专属卡';
      if (token === 'upgradeCard') return '选择一张牌进行升级';
      if (token === 'flipToUpgradeScroll') return '翻转为「升级卷轴」即时魔法：选择一张牌进行升级';
      if (token === 'allSlotDamage-1') return '所有装备栏永久攻击 -1';
      if (token === 'allSlotDamage+1') return '所有装备栏永久攻击 +1';
      if (token === 'allSlotShield-1') return '所有装备栏永久护甲 -1';
      if (token === 'flipToRecallEquip') return '翻转为「回收术」永久魔法：失去 2 点生命，回手一张牌（从装备栏或护符栏选择）';
      if (token === 'flipToUndyingBlessing') return '翻转为「不灭赐福」永久魔法：赋予装备复生能力，失去 2 点生命';
      if (token === 'flipToHonorBloodMagic') {
        return '事件卡翻为「战血之印」永久法术并收入背包：打出 -1 生命并选一装备 +1 耐久（回响 +2）；被弃时将激活行所有怪物攻击力 -2';
      }
      if (token === 'flipToHonorSweepMagic') {
        return '事件卡翻为「战血横扫」即时法术并收入背包：选武器对激活行所有怪物造成等同攻击力的法术伤害，每击杀一个怪物升级一张牌';
      }
      if (token === 'fate-dice-strike')
        return '对右侧相邻卡牌生效：非怪物则摧毁；怪物则激怒并穿透打掉 2 层血（可击杀）';
      if (token === 'amuletCapacity+1') return '护符上限 +1';
      if (token === 'equipSlot1Capacity+1') return '左装备栏容量 +1';
      if (token === 'equipSlot2Capacity+1') return '右装备栏容量 +1';
      if (token.startsWith('backpackSize+')) return `背包容量 +${token.replace('backpackSize+', '')}`;
      if (token === 'none') return '无额外效果';
      return token;
    })
    .join('，');
}

function formatRequirementText(requires: EventRequirement[]): string {
  return requires
    .map(req => {
      switch (req.type) {
        case 'equipment':
          return req.slot === 'left' ? '左侧装备' : '右侧装备';
        case 'equipmentAny':
          return '任意装备';
        case 'amulet':
          return '至少 1 个护符';
        case 'hand':
          return `至少 ${req.min} 张手牌`;
        case 'cardPool':
          return `手牌/背包合计 ≥ ${req.min}`;
        case 'graveyard':
          return `坟场卡牌 ≥ ${req.min}`;
        case 'gold':
          return `至少 ${req.min} 金币`;
        case 'leftmostIsEnraged':
          return (
            req.message ??
            '地城激活行从左起第一个有牌的格子上必须是怪物，且该怪物已与英雄交战（空列跳过，不计入「第一个有牌格」）。'
          );
        default:
          return '';
      }
    })
    .filter(Boolean)
    .join('、');
}

function formatRange(range: [number, number]) {
  const [min, max] = range;
  return min === max ? `${min}` : `${min} - ${max}`;
}

