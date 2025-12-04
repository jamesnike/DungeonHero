import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Calendar, Dice1 } from 'lucide-react';
import type { EventEffectExpression, GameCardData } from './GameCard';

export interface EventChoiceAvailability {
  disabled: boolean;
  reason?: string;
}

interface EventChoiceModalProps {
  open: boolean;
  eventCard: GameCardData | null;
  onChoice: (choiceIndex: number) => void;
  choiceStates?: EventChoiceAvailability[];
}

export default function EventChoiceModal({ open, eventCard, onChoice, choiceStates }: EventChoiceModalProps) {
  if (!eventCard || !eventCard.eventChoices) return null;

  return (
    <Dialog open={open}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Calendar className="w-5 h-5 text-pink-500" />
            {eventCard.name}
          </DialogTitle>
          <DialogDescription>Choose your path wisely...</DialogDescription>
        </DialogHeader>

        <div className="mt-4 flex flex-col gap-3">
          {eventCard.eventChoices.map((choice, index) => {
            const state = choiceStates?.[index];
            const disabled = state?.disabled ?? false;
            const effectText = formatEffect(choice.effect);
            return (
              <Button
                key={index}
                variant="outline"
                className="h-auto w-full justify-start p-4 text-left"
                disabled={disabled}
                onClick={() => !disabled && onChoice(index)}
              >
                <div className="flex w-full flex-col gap-2">
                  <div className="flex items-center justify-between gap-2">
                    <span className="font-semibold">{choice.text}</span>
                    {choice.diceTable && (
                      <Badge variant="secondary" className="gap-1 text-[10px] uppercase">
                        <Dice1 className="h-3 w-3" />
                        D20
                      </Badge>
                    )}
                  </div>
                  {choice.hint && (
                    <span className="text-xs text-muted-foreground">{choice.hint}</span>
                  )}
                  {effectText && (
                    <span className="text-xs text-muted-foreground">{effectText}</span>
                  )}
                  {choice.diceTable && (
                    <div className="grid gap-1 text-[11px] text-muted-foreground">
                      {choice.diceTable.map(entry => (
                        <div
                          key={entry.id}
                          className="flex items-center justify-between rounded border border-border px-2 py-1"
                        >
                          <span className="font-mono text-foreground">
                            {formatRange(entry.range)}
                          </span>
                          <span className="text-right text-xs text-foreground">{entry.label}</span>
                        </div>
                      ))}
                    </div>
                  )}
                  {disabled && state?.reason && (
                    <span className="text-xs text-destructive">{state.reason}</span>
                  )}
                </div>
              </Button>
            );
          })}
        </div>
      </DialogContent>
    </Dialog>
  );
}

function formatEffect(effect?: EventEffectExpression): string | null {
  if (!effect) return null;
  const tokens = Array.isArray(effect) ? effect : effect.split(',');
  const text = tokens
    .map(token => token.trim())
    .filter(Boolean)
    .map(token => {
      if (token.startsWith('hp-')) return `Lose ${token.replace('hp-', '')} HP`;
      if (token.startsWith('hp+')) return `Gain ${token.replace('hp+', '')} HP`;
      if (token.startsWith('heal+')) return `Heal ${token.replace('heal+', '')} HP`;
      if (token.startsWith('gold-')) return `Lose ${token.replace('gold-', '')} Gold`;
      if (token.startsWith('gold+')) return `Gain ${token.replace('gold+', '')} Gold`;
      if (token.startsWith('maxhp+')) return `+${token.replace('maxhp+', '')} Max HP`;
      if (token.startsWith('maxhpperm+')) return `Permanently +${token.replace('maxhpperm+', '')} Max HP`;
      if (token === 'openShop') return 'Open a shop';
      if (token === 'discoverClass') return 'Discover a class card';
      if (token === 'flipToCurse') return 'Event card flips into a curse';
      if (token === 'addCurse') return 'Backpack gains a curse card';
      if (token === 'discardHandAll') return 'Discard entire hand';
      if (token.startsWith('backpackSize-')) return `Backpack capacity -${token.replace('backpackSize-', '')}`;
      if (token.startsWith('shopLevel+')) return `Shop level +${token.replace('shopLevel+', '')}`;
      if (token.startsWith('spellDamage+')) return `Spell damage +${token.replace('spellDamage+', '')}`;
      if (token.startsWith('discardCards:')) return `Discard ${token.replace('discardCards:', '')} card(s)`;
      if (token.startsWith('deleteCard')) {
        const [, count = '1'] = token.split(':');
        return `Delete ${count} card(s)`;
      }
      if (token === 'graveyardDiscover') return 'Discover 1 card from the graveyard';
      if (token.startsWith('drawHeroCards:')) return `Draw ${token.replace('drawHeroCards:', '')} card(s) from backpack`;
      if (token === 'removeAllAmulets') return 'Destroy all amulets';
      if (token === 'slotLeftDamage+1') return 'Left slot +1 permanent damage';
      if (token === 'slotRightDefense+1') return 'Right slot +1 permanent armor';
      if (token === 'swapEquipmentSlots') return 'Swap left/right equipment';
      if (token === 'destroyEquipment:any') return 'Destroy one equipped item';
      if (token === 'discardLeftForGold+15') return 'Destroy left equipment, gain 15 gold';
      if (token === 'discardRightForGold+15') return 'Destroy right equipment, gain 15 gold';
      if (token === 'amuletsToGold+10') return 'Destroy all amulets, +10 gold each';
      if (token === 'classBottom+2') return 'Gain bottom 2 class cards';
      if (token === 'none') return null;
      return token;
    })
    .filter(Boolean)
    .join(', ');
  return text || null;
}

function formatRange(range: [number, number]) {
  const [min, max] = range;
  return min === max ? `${min}` : `${min} - ${max}`;
}
