import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { GameCardData } from "./GameCard";
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
                <div className="font-semibold mb-1">Choices:</div>
                {card.eventChoices.map((choice, idx) => (
                  <div key={idx} className="bg-muted p-2 rounded text-xs border">
                    • {choice.text}
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

