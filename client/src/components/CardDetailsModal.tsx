import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import {
  type EventEffectExpression,
  type EventRequirement,
  type GameCardData,
  isPermRecycleEquipment,
  formatScalingSpellDamageLine,
} from "./GameCard";
import { calculateMonsterRage, getMonsterRageRule, getMonsterUpgrades, getActiveUpgrade } from "@/lib/monsterRage";
import { Skull, Sword, Shield, Heart, Sparkles, Zap, Scroll, Wand2, AlertTriangle, Coins } from "lucide-react";
import { CHAOS_DICE_SPELL_DESCRIPTION } from "@/lib/knightChaosDiceCopy";

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
}

export default function CardDetailsModal({
  card,
  open,
  onOpenChange,
  currentTurn,
  monsterRewards,
}: CardDetailsModalProps) {
  if (!card) return null;

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
      default: return null;
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-2xl max-h-[95vh] overflow-y-auto">
        <DialogHeader>
          <div className="flex items-center gap-2">
            {getCardIcon()}
            <DialogTitle className="text-xl">{card.name}</DialogTitle>
          </div>
          <DialogDescription>
            {card.type.toUpperCase()} {card.classCard ? '• KNIGHT CLASS' : ''}
          </DialogDescription>
        </DialogHeader>
        
        <div className="flex flex-col gap-4 py-4">
          {/* Monster Reward Preview */}
          {card.type === 'monster' && monsterRewards?.length ? (
            <div className="space-y-2">
              <div className="flex items-center gap-2 text-sm font-semibold text-amber-600 dark:text-amber-400">
                <Sparkles className="w-4 h-4" />
                击败奖励（二选一）
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
            {card.type === 'monster' && (() => {
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
                  {upgrades.length > 0 && (
                    <div className="col-span-2 mt-1 space-y-1">
                      <div className="text-xs font-semibold text-muted-foreground">升级阶段</div>
                      {upgrades.map((u, i) => {
                        const reached = rageTurn != null && rageTurn >= u.waterfallLevel;
                        return (
                          <div key={i} className={`text-xs ${reached ? 'text-red-500 font-semibold' : 'text-muted-foreground'}`}>
                            <div className="flex items-center gap-2">
                              <span>Waterfall ≥ {u.waterfallLevel}:</span>
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
                  )}
                </div>
              );
            })()}

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
            {card.type === 'monster' && card.monsterSpecial && card.description && (
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
                    {card.description}
                  </p>
                </div>
              </div>
            )}

            {/* Monster Revive Keyword */}
            {card.type === 'monster' && card.hasRevive && (
              <div className={`p-3 rounded-md border relative overflow-hidden ${
                card.reviveUsed
                  ? 'bg-gray-500/10 border-gray-500/30'
                  : 'bg-emerald-500/15 border-emerald-500/30'
              }`}>
                <div className="relative flex flex-col gap-1.5">
                  <div className="flex items-center gap-2">
                    <Heart className={`w-4 h-4 shrink-0 ${card.reviveUsed ? 'text-gray-400' : 'text-emerald-500'}`} />
                    <span className={`font-extrabold text-sm tracking-wide ${
                      card.reviveUsed
                        ? 'text-gray-500 dark:text-gray-400 line-through'
                        : 'text-emerald-700 dark:text-emerald-300'
                    }`}>
                      复生
                    </span>
                    {card.reviveUsed && (
                      <span className="text-xs text-gray-400">（已触发）</span>
                    )}
                  </div>
                  <p className={`text-sm pl-6 ${
                    card.reviveUsed
                      ? 'text-gray-500 dark:text-gray-400'
                      : 'font-semibold text-emerald-800 dark:text-emerald-200'
                  }`}>
                    首次死亡时，以 1 血层的形式复生（仅一次）。
                  </p>
                </div>
              </div>
            )}

            {/* Monster Bleed Keyword */}
            {card.type === 'monster' && card.bleedEffect && (
              <div className="bg-orange-500/15 p-3 rounded-md border border-orange-500/30 relative overflow-hidden">
                <div className="relative flex flex-col gap-1.5">
                  <div className="flex items-center gap-2">
                    <Sword className="w-4 h-4 shrink-0 text-orange-500" />
                    <span className="font-extrabold text-sm text-orange-700 dark:text-orange-300 tracking-wide">
                      流血
                    </span>
                  </div>
                  <p className="text-sm font-semibold text-orange-800 dark:text-orange-200 pl-6">
                    每失去一个血层，攻击力 +{card.bleedEffect.replace('attack+', '')}。
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
                      龙息回复
                    </span>
                  </div>
                  <p className="text-sm font-semibold text-amber-800 dark:text-amber-200 pl-6">
                    若 Hero 回合结束时未掉血层，立即恢复一个血层。
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
                      入场
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

            {/* Monster Elite Double Attack */}
            {card.type === 'monster' && card.eliteDoubleAttack && (
              <div className="bg-violet-500/15 p-3 rounded-md border border-violet-500/30 relative overflow-hidden">
                <div className="relative flex flex-col gap-1.5">
                  <div className="flex items-center gap-2">
                    <Sword className="w-4 h-4 shrink-0 text-violet-500" />
                    <span className="font-extrabold text-sm text-violet-700 dark:text-violet-300 tracking-wide">
                      连击
                    </span>
                  </div>
                  <p className="text-sm font-semibold text-violet-800 dark:text-violet-200 pl-6">
                    攻击时 50% 概率攻击两次。
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
                      动手
                    </span>
                  </div>
                  <p className="text-sm font-semibold text-emerald-800 dark:text-emerald-200 pl-6">
                    每次攻击时偷取{card.onAttackEffect === 'steal-gold-6' ? ' 6 ' : ' 3 '}金币。
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
                      贪婪强化 {card.lowGoldBuffActive ? '（已激活）' : ''}
                    </span>
                  </div>
                  <p className={`text-sm font-semibold pl-6 ${card.lowGoldBuffActive ? 'text-red-800 dark:text-red-200' : 'text-yellow-800 dark:text-yellow-200'}`}>
                    当玩家金币 ≤ 10 时，攻击力与血量翻倍。
                  </p>
                </div>
              </div>
            )}

            {/* Monster Last Words */}
            {card.type === 'monster' && card.lastWords && (
              <div className="bg-red-500/15 p-3 rounded-md border border-red-500/30 relative overflow-hidden">
                <div className="relative flex flex-col gap-1.5">
                  <div className="flex items-center gap-2">
                    <Skull className="w-4 h-4 shrink-0 text-red-500" />
                    <span className="font-extrabold text-sm text-red-700 dark:text-red-300 tracking-wide">
                      遗言
                    </span>
                  </div>
                  <p className="text-sm font-semibold text-red-800 dark:text-red-200 pl-6">
                    {card.lastWords === 'discard-hand-3'
                      ? '死亡时随机弃置玩家 3 张手牌。'
                      : card.lastWords === 'wraith-haunt-2'
                        ? '死亡时同行其他怪物攻击力 +2，同行卡牌位置随机打乱。'
                        : card.lastWords === 'wraith-haunt-4'
                          ? '死亡时同行其他怪物攻击力 +4，同行卡牌位置随机打乱。'
                          : '死亡时触发特殊效果。'}
                  </p>
                </div>
              </div>
            )}

            {/* Tier-3 Upgrade: Ogre Enter Discard */}
            {card.type === 'monster' && card.ogreEnterDiscard && (
              <div className="bg-amber-500/15 p-3 rounded-md border border-amber-500/30">
                <div className="flex flex-col gap-1.5">
                  <div className="flex items-center gap-2">
                    <Zap className="w-4 h-4 shrink-0 text-amber-500" />
                    <span className="font-extrabold text-sm text-amber-700 dark:text-amber-300 tracking-wide">蛮力震慑</span>
                  </div>
                  <p className="text-sm font-semibold text-amber-800 dark:text-amber-200 pl-6">入场时随机弃掉玩家一张手牌。</p>
                </div>
              </div>
            )}

            {/* Tier-3 Upgrade: Dragon Bleed Destroy */}
            {card.type === 'monster' && card.dragonBleedDestroy && (
              <div className="bg-orange-500/15 p-3 rounded-md border border-orange-500/30">
                <div className="flex flex-col gap-1.5">
                  <div className="flex items-center gap-2">
                    <Sword className="w-4 h-4 shrink-0 text-orange-500" />
                    <span className="font-extrabold text-sm text-orange-700 dark:text-orange-300 tracking-wide">流血破甲</span>
                  </div>
                  <p className="text-sm font-semibold text-orange-800 dark:text-orange-200 pl-6">每失去一个血层，破坏所有耐久度大于该怪物剩余血层数的装备。</p>
                </div>
              </div>
            )}

            {/* Tier-3 Upgrade: Skeleton No Layer Cost */}
            {card.type === 'monster' && (card.skeletonNoLayerCost || card.skeletonNoLayerCostActive) && (
              <div className="bg-gray-500/15 p-3 rounded-md border border-gray-500/30">
                <div className="flex flex-col gap-1.5">
                  <div className="flex items-center gap-2">
                    <Skull className="w-4 h-4 shrink-0 text-gray-500" />
                    <span className="font-extrabold text-sm text-gray-700 dark:text-gray-300 tracking-wide">
                      不朽之骨 {card.skeletonNoLayerCostActive ? '（已激活）' : ''}
                    </span>
                  </div>
                  <p className="text-sm font-semibold text-gray-800 dark:text-gray-200 pl-6">复生后，攻击不再消耗血层。</p>
                </div>
              </div>
            )}

            {/* Tier-3 Upgrade: Wraith Death Heal */}
            {card.type === 'monster' && card.wraithDeathHeal != null && card.wraithDeathHeal > 0 && (
              <div className="bg-purple-500/15 p-3 rounded-md border border-purple-500/30">
                <div className="flex flex-col gap-1.5">
                  <div className="flex items-center gap-2">
                    <Heart className="w-4 h-4 shrink-0 text-purple-500" />
                    <span className="font-extrabold text-sm text-purple-700 dark:text-purple-300 tracking-wide">怨灵祝福</span>
                  </div>
                  <p className="text-sm font-semibold text-purple-800 dark:text-purple-200 pl-6">死亡时同行其他怪物生命值 +{card.wraithDeathHeal}。</p>
                </div>
              </div>
            )}

            {/* Tier-3 Upgrade: Goblin Steal Scale */}
            {card.type === 'monster' && card.goblinStealScale && (
              <div className="bg-emerald-500/15 p-3 rounded-md border border-emerald-500/30">
                <div className="flex flex-col gap-1.5">
                  <div className="flex items-center gap-2">
                    <Coins className="w-4 h-4 shrink-0 text-emerald-500" />
                    <span className="font-extrabold text-sm text-emerald-700 dark:text-emerald-300 tracking-wide">贪婪强化</span>
                  </div>
                  <p className="text-sm font-semibold text-emerald-800 dark:text-emerald-200 pl-6">每偷到 X 金币，攻击力和生命值各 +X。</p>
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
                    BOSS 形态
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

            {/* Boss: Last Stand Aura */}
            {card.type === 'monster' && card.bossLastStandAura && (
              <div className="bg-orange-500/15 p-3 rounded-md border border-orange-500/30 relative overflow-hidden">
                <div className="relative flex flex-col gap-1.5">
                  <div className="flex items-center gap-2">
                    <AlertTriangle className="w-4 h-4 shrink-0 text-orange-500" />
                    <span className="font-extrabold text-sm text-orange-700 dark:text-orange-300 tracking-wide">
                      暴走光环 {(card.currentLayer ?? 1) === 1 ? '（已激活）' : ''}
                    </span>
                  </div>
                  <p className="text-sm font-semibold text-orange-800 dark:text-orange-200 pl-6">
                    血层为 1 时，每个怪物回合结束 +5 攻击，恢复 1 血层。
                  </p>
                </div>
              </div>
            )}

            {/* Boss: Fury Dice Chance */}
            {card.type === 'monster' && card.bossFuryDiceChance && (
              <div className="bg-amber-500/15 p-3 rounded-md border border-amber-500/30 relative overflow-hidden">
                <div className="relative flex flex-col gap-1.5">
                  <div className="flex items-center gap-2">
                    <Shield className="w-4 h-4 shrink-0 text-amber-500" />
                    <span className="font-extrabold text-sm text-amber-700 dark:text-amber-300 tracking-wide">
                      韧性
                    </span>
                  </div>
                  <p className="text-sm font-semibold text-amber-800 dark:text-amber-200 pl-6">
                    攻击后 50% 概率不掉血层（掷骰判定）。
                  </p>
                </div>
              </div>
            )}

            {/* Boss: Final Monster (pre-transform) */}
            {card.type === 'monster' && card.isFinalMonster && !card.bossPhase && (
              <div className="bg-red-500/10 p-3 rounded-md border border-red-500/20 relative overflow-hidden">
                <div className="relative flex flex-col gap-1.5">
                  <div className="flex items-center gap-2">
                    <Skull className="w-4 h-4 shrink-0 text-red-400" />
                    <span className="font-extrabold text-sm text-red-600 dark:text-red-400 tracking-wide">
                      最终之敌
                    </span>
                  </div>
                  <p className="text-sm font-semibold text-red-700 dark:text-red-300 pl-6">
                    击败后将变身为 Boss。
                  </p>
                  <p className="text-sm text-red-600/90 dark:text-red-300/90 pl-6">
                    被瀑流从预览区挤出时不进入坟场，置于剩余牌堆底（不打乱其余牌序）。
                  </p>
                </div>
              </div>
            )}

            {/* Weapon/Shield Details */}
            {(card.type === 'weapon' || card.type === 'shield') && (
              <div className="grid grid-cols-2 gap-2 bg-muted/30 p-3 rounded-md">
                {isPermRecycleEquipment(card) && (
                  <div className="col-span-2 mb-1 inline-flex items-center gap-1 rounded-md border border-cyan-500/45 bg-cyan-950/25 px-2 py-1 text-xs font-bold tracking-wide text-cyan-900 dark:text-cyan-100">
                    PERM
                    {(card.recycleDelay ?? 1) > 1 && (
                      <span className="tabular-nums">{card.recycleDelay}</span>
                    )}
                    <span className="ml-1 font-normal text-muted-foreground">
                      损毁后进回收袋，与永久法术相同瀑流计数后回背包。
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
                  Type: {card.magicType === 'instant' ? 'Instant Spell' : 'Permanent Skill'}
                </div>
                {card.magicType === 'permanent' && (
                  <div className="mb-2 inline-flex items-center gap-1 rounded-md border border-cyan-500/45 bg-cyan-950/25 px-2 py-1 text-xs font-bold tracking-wide text-cyan-900 dark:text-cyan-100">
                    PERM
                    <span className="tabular-nums">{card.recycleDelay ?? 1}</span>
                  </div>
                )}
                <div>
                  {card.scalingDamage != null ? (
                    <p className="font-semibold text-foreground">
                      {formatScalingSpellDamageLine(card.scalingDamage)}
                    </p>
                  ) : (card as GameCardData & { knightEffect?: string }).knightEffect === 'chaos-dice' ||
                    card.name === '混沌骰运' ? (
                    CHAOS_DICE_SPELL_DESCRIPTION
                  ) : (
                    card.description || card.magicEffect
                  )}
                </div>
              </div>
            )}

            {/* Hero Magic Details */}
            {card.type === 'hero-magic' && (
              <div className="bg-rose-500/10 p-3 rounded-md border border-rose-500/20">
                <div className="mb-1 font-semibold text-rose-700 dark:text-rose-400">
                  Hero Magic
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
                    Passive Effect
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

            {/* Event Details */}
            {card.type === 'event' && card.description && (
              <div className="bg-sky-500/10 p-3 rounded-md border border-sky-500/30">
                <p className="text-sm font-semibold text-sky-800 dark:text-sky-200">{card.description}</p>
              </div>
            )}
            {card.type === 'event' && card.eventChoices && (
              <div className="space-y-2">
                <div className="font-semibold mb-1">事件选项</div>
                {card.eventChoices.map((choice, idx) => (
                  <div key={idx} className="rounded-md border border-border/60 bg-muted/40 p-3 space-y-1">
                    <div className="text-sm font-semibold text-foreground">{choice.text}</div>
                    {choice.hint && (
                      <div className="text-[11px] text-muted-foreground">{choice.hint}</div>
                    )}
                    {choice.requires?.length ? (
                      <div className="text-[11px] text-amber-600">
                        <span className="font-semibold text-amber-700 dark:text-amber-400">启用条件：</span>
                        {formatRequirementText(choice.requires)}
                      </div>
                    ) : null}
                    {choice.effect && (
                      <div className="text-[11px] text-muted-foreground">
                        直接效果：{describeEventEffect(choice.effect)}
                      </div>
                    )}
                    {choice.diceTable?.length ? (
                      <div className="mt-2 space-y-1 border-t border-border/50 pt-2">
                        {choice.diceTable.map(entry => (
                          <div key={entry.id} className="flex items-center justify-between text-[11px]">
                            <span className="font-mono text-foreground">{formatRange(entry.range)}</span>
                            <span className="text-muted-foreground">{entry.label}</span>
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
                  翻转效果
                </div>
                <div className="rounded-md border border-violet-500/20 bg-violet-500/5 p-3 space-y-1.5">
                  <div className="text-sm font-semibold text-foreground">
                    → {card.flipTarget.toCard.name}
                    <span className="ml-2 text-[11px] font-normal text-muted-foreground">
                      ({card.flipTarget.toCard.type === 'magic'
                        ? card.flipTarget.toCard.magicType === 'instant' ? '一次性法术' : '永久法术'
                        : card.flipTarget.toCard.type === 'event' ? '事件'
                        : card.flipTarget.toCard.type === 'potion' ? '药水'
                        : card.flipTarget.toCard.type.toUpperCase()})
                    </span>
                  </div>
                  {(card.flipTarget.toCard.description || card.flipTarget.toCard.magicEffect || card.flipTarget.toCard.heroMagicEffect) && (
                    <div className="text-xs text-muted-foreground leading-relaxed">
                      {card.flipTarget.toCard.description || card.flipTarget.toCard.magicEffect || card.flipTarget.toCard.heroMagicEffect}
                    </div>
                  )}
                  {card.flipTarget.toCard.type === 'event' && card.flipTarget.toCard.eventChoices?.map((choice, idx) => (
                    <div key={idx} className="text-xs text-muted-foreground leading-relaxed">
                      {choice.hint || choice.text}
                    </div>
                  ))}
                  {card.flipTarget.destination === 'stay' && (
                    <div className="text-[11px] text-violet-500/80 italic">翻转后留在原位</div>
                  )}
                </div>
              </div>
            )}

            {/* General Description */}
            {card.description &&
              card.type !== 'magic' &&
              card.type !== 'hero-magic' &&
              card.type !== 'event' &&
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
      if (token === 'discardHandAll') return '弃掉全部手牌';
      if (token.startsWith('backpackSize-')) return `背包容量 -${token.replace('backpackSize-', '')}`;
      if (token.startsWith('shopLevel+')) return `商店等级 +${token.replace('shopLevel+', '')}`;
      if (token.startsWith('spellDamage+')) return `法术伤害 +${token.replace('spellDamage+', '')}`;
      if (token.startsWith('discardCards:')) return `弃置 ${token.replace('discardCards:', '')} 张牌`;
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
      if (token === 'discardLeftForGold+15') return '破坏左槽装备并获得 15 金币';
      if (token === 'discardRightForGold+15') return '破坏右槽装备并获得 15 金币';
      if (token === 'amuletsToGold+10') return '摧毁所有护符并每个获得 10 金币';
      if (token === 'classBottom+2') return '获得 class 底部两张专属卡';
      if (token === 'flipToHonorBloodMagic') {
        return '事件卡翻为「战血之印」永久法术并收入背包：打出 -1 生命并选一装备 +1 耐久（回响 +2）；被弃时将激活行所有怪物攻击力 -2';
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

