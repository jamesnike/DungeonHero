import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Shield, Swords } from 'lucide-react';
import type { GameCardData } from './GameCard';

type EquipmentSlotId = 'equipmentSlot1' | 'equipmentSlot2';

interface CombatPanelProps {
  engagedMonsters: GameCardData[];
  isActive: boolean;
  currentTurn: 'hero' | 'monster';
  heroAttacksRemaining: number;
  heroAttacksThisTurn: Record<EquipmentSlotId, boolean>;
  pendingBlock: { monsterId: string; attackValue: number; monsterName: string } | null;
  monsterAttackQueue: string[];
  onEndHeroTurn: () => void;
  equipmentSlot1: (GameCardData & { type: 'weapon' | 'shield' }) | null;
  equipmentSlot2: (GameCardData & { type: 'weapon' | 'shield' }) | null;
}

export default function CombatPanel({
  engagedMonsters,
  isActive,
  currentTurn,
  heroAttacksRemaining,
  heroAttacksThisTurn,
  pendingBlock,
  monsterAttackQueue,
  onEndHeroTurn,
  equipmentSlot1,
  equipmentSlot2,
}: CombatPanelProps) {
  if (!isActive || engagedMonsters.length === 0) {
    return null;
  }
  const currentAttackerId = pendingBlock?.monsterId ?? null;
  const currentAttacker =
    pendingBlock && engagedMonsters.find(mon => mon.id === pendingBlock.monsterId);

  const renderSlotStatus = (slotId: EquipmentSlotId, item: (GameCardData & { type: 'weapon' | 'shield' }) | null) => {
    const used = heroAttacksThisTurn[slotId];
    const label = slotId === 'equipmentSlot1' ? 'Left' : 'Right';
    return (
      <div className="flex flex-col px-3 py-2 rounded-md border bg-background/50" key={slotId}>
        <span className="text-xs uppercase tracking-wide text-muted-foreground">{label} Slot</span>
        {item ? (
          <span className="text-sm font-semibold">
            {item.name} {item.type === 'weapon' ? `(${item.value} dmg)` : `(${item.value} block)`}
          </span>
        ) : (
          <span className="text-sm text-muted-foreground">Empty</span>
        )}
        <span className={`text-xs font-medium ${used ? 'text-red-500' : 'text-green-500'}`}>
          {used ? 'Used this turn' : 'Ready'}
        </span>
      </div>
    );
  };

  const statusStylesForMonster = (monsterId: string) => {
    if (currentTurn !== 'monster') {
      return {
        badge: 'bg-primary/15 text-primary',
        card: 'border-border bg-background/80',
        label: 'Hero Turn',
      };
    }
    if (currentAttackerId === monsterId) {
      return {
        badge: 'bg-destructive/20 text-destructive',
        card: 'border-destructive bg-destructive/10 shadow-inner',
        label: 'Attacking',
      };
    }
    const queueIndex = monsterAttackQueue.indexOf(monsterId);
    if (queueIndex >= 0) {
      return {
        badge: 'bg-amber-100 text-amber-900',
        card: 'border-amber-200 bg-amber-50/30',
        label: `Queued #${queueIndex + 1}`,
      };
    }
    return {
      badge: 'bg-muted text-muted-foreground',
      card: 'border-border bg-muted/30',
      label: 'Waiting',
    };
  };

  const turnSummary =
    currentTurn === 'hero'
      ? `${engagedMonsters.length} monster${engagedMonsters.length === 1 ? '' : 's'} engaged`
      : pendingBlock
        ? `${pendingBlock.monsterName} attacking (${pendingBlock.attackValue})`
        : monsterAttackQueue.length > 0
          ? `${monsterAttackQueue.length} attack${monsterAttackQueue.length === 1 ? '' : 's'} queued`
          : 'Monsters regrouping';

  return (
    <Card className="relative z-10 w-full h-full border border-primary/25 bg-card/60 backdrop-blur-md shadow-2xl">
      <div className="p-2 h-full flex flex-col gap-2">
        <div className="flex items-start justify-between gap-1.5">
          <div className="space-y-0.5">
            <p className="text-[8px] uppercase tracking-wide text-muted-foreground">Combat</p>
            <p className="text-[11px] font-semibold">{currentTurn === 'hero' ? 'Hero Turn' : 'Monsters Turn'}</p>
            <p className="text-[9px] text-muted-foreground line-clamp-2">{turnSummary}</p>
          </div>
          <div className="w-6 h-6 rounded-full bg-muted/60 flex items-center justify-center flex-shrink-0">
            {currentTurn === 'hero' ? <Swords className="w-3 h-3 text-primary" /> : <Shield className="w-3 h-3 text-destructive" />}
          </div>
        </div>

        {pendingBlock && (
          <div className="rounded-md border border-destructive/40 bg-destructive/10 px-2.5 py-1.5 text-[11px] text-destructive">
            {pendingBlock.monsterName} will deal {pendingBlock.attackValue} damage. Choose a block target.
          </div>
        )}

        <div className="flex-1 overflow-y-auto rounded-md border bg-muted/40 p-1 space-y-1.5 max-h-[60vh]">
          {engagedMonsters.map((engaged) => {
            const status = statusStylesForMonster(engaged.id);
            const hp = engaged.hp ?? engaged.value;
            const maxHp = engaged.maxHp ?? hp;
            const fury = engaged.currentLayer ?? engaged.fury ?? 1;
            const attackValue = engaged.attack ?? engaged.value;
            return (
              <div
                key={engaged.id}
                className={`flex items-start gap-1 rounded-md border px-1.5 py-1 ${status.card}`}
              >
                <div className="w-8 h-11 rounded-md overflow-hidden border border-border/40 bg-background flex-shrink-0">
                  {engaged.image ? (
                    <img src={engaged.image} alt={engaged.name} className="w-full h-full object-cover" />
                  ) : (
                    <div className="w-full h-full flex items-center justify-center text-[7px] text-muted-foreground">
                      Monster
                    </div>
                  )}
                </div>
                <div className="flex-1 space-y-0.5 min-w-0">
                  <div className="flex items-center justify-between gap-0.5">
                    <span className="text-[10px] font-semibold truncate">{engaged.name}</span>
                    <span className={`text-[7px] font-semibold px-1 py-0.5 rounded-full whitespace-nowrap ${status.badge}`}>
                      {status.label}
                    </span>
                  </div>
                  <p className="text-[8px] text-muted-foreground">
                    HP {hp}/{maxHp} • Fury {fury}
                  </p>
                  <p className="text-[8px] text-muted-foreground">ATK {attackValue}</p>
                </div>
              </div>
            );
          })}
        </div>

        <div className="border-t border-border/30 pt-1.5">
          {currentTurn === 'hero' ? (
            <div className="flex flex-col gap-2">
              <div className="flex items-center justify-between gap-1">
                <span className="text-[11px] font-semibold">
                  Attacks remaining: {heroAttacksRemaining}
                </span>
                <Button variant="secondary" size="sm" className="px-2 py-1 text-[10px]" onClick={onEndHeroTurn}>
                  End Hero Turn
                </Button>
              </div>
              <div className="grid grid-cols-1 gap-2">
                {renderSlotStatus('equipmentSlot1', equipmentSlot1)}
                {renderSlotStatus('equipmentSlot2', equipmentSlot2)}
              </div>
            </div>
          ) : (
            <p className="text-[11px] text-muted-foreground">
              {currentAttacker
                ? `${currentAttacker.name} is attacking now.`
                : monsterAttackQueue.length > 0
                  ? 'Waiting for the next attacker...'
                  : 'Monsters are regrouping.'}
            </p>
          )}
        </div>
      </div>
    </Card>
  );
}

