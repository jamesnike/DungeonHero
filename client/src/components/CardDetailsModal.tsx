import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { type EventEffectExpression, type EventRequirement, type GameCardData } from "./GameCard";
import { Skull, Sword, Shield, Heart, Sparkles, Zap, Scroll } from "lucide-react";

interface CardDetailsModalProps {
  card: GameCardData | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export default function CardDetailsModal({ card, open, onOpenChange }: CardDetailsModalProps) {
  if (!card) return null;

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
      case 'event': return <Scroll className="w-6 h-6 text-violet-500" />;
      default: return null;
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
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
          {/* Image */}
          <div className="relative w-full aspect-video rounded-md overflow-hidden bg-muted border">
            {card.image && (
              <img 
                src={card.image} 
                alt={card.name} 
                className="w-full h-full object-cover"
              />
            )}
          </div>

          {/* Detailed Stats & Description */}
          <div className="space-y-3 text-sm">
            {/* Monster Details */}
            {card.type === 'monster' && (
              <div className="grid grid-cols-2 gap-2 bg-muted/30 p-3 rounded-md">
                <div className="flex items-center gap-2">
                  <Sword className="w-4 h-4 text-amber-500" />
                  <span>Attack: <span className="font-bold">{card.attack ?? card.value}</span></span>
                </div>
                <div className="flex items-center gap-2">
                  <Heart className="w-4 h-4 text-red-500" />
                  <span>HP: <span className="font-bold">{card.hp ?? card.value}/{card.maxHp ?? card.value}</span></span>
                </div>
                {card.hpLayers && card.hpLayers > 1 && (
                  <div className="col-span-2 text-muted-foreground text-xs">
                    Has {card.hpLayers} HP layers. Current layer: {card.currentLayer}
                  </div>
                )}
              </div>
            )}

            {/* Weapon/Shield Details */}
            {(card.type === 'weapon' || card.type === 'shield') && (
              <div className="grid grid-cols-2 gap-2 bg-muted/30 p-3 rounded-md">
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
                   <div className="col-span-2 text-amber-600 flex items-center gap-1">
                     <Shield className="w-3 h-3" /> Reflects {(card as any).damageReflect} damage
                   </div>
                )}
              </div>
            )}

            {/* Potion Details */}
            {card.type === 'potion' && (
              <div className="bg-green-500/10 p-3 rounded-md border border-green-500/20">
                 <div className="flex items-center gap-2 text-green-700 dark:text-green-400">
                   <Heart className="w-4 h-4" />
                   <span className="font-bold">Restores {card.value} HP</span>
                 </div>
              </div>
            )}

            {/* Magic Details */}
            {card.type === 'magic' && (
              <div className="bg-cyan-500/10 p-3 rounded-md border border-cyan-500/20">
                <div className="mb-1 font-semibold text-cyan-700 dark:text-cyan-400">
                  Type: {card.magicType === 'instant' ? 'Instant Spell' : 'Permanent Skill'}
                </div>
                <div>{card.magicEffect || card.description}</div>
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
                        需要：{formatRequirementText(choice.requires)}
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

            {/* General Description */}
            {card.description && card.type !== 'magic' && card.type !== 'event' && card.type !== 'amulet' && (
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
      if (token.startsWith('drawHeroCards:')) return `抽 ${token.replace('drawHeroCards:', '')} 张牌`;
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

