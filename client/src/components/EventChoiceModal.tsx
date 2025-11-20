import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Calendar } from 'lucide-react';
import { type GameCardData } from './GameCard';

interface EventChoiceModalProps {
  open: boolean;
  eventCard: GameCardData | null;
  onChoice: (choiceIndex: number) => void;
}

export default function EventChoiceModal({ open, eventCard, onChoice }: EventChoiceModalProps) {
  if (!eventCard || !eventCard.eventChoices) return null;

  return (
    <Dialog open={open}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Calendar className="w-5 h-5 text-pink-500" />
            {eventCard.name}
          </DialogTitle>
          <DialogDescription>
            Choose your path wisely...
          </DialogDescription>
        </DialogHeader>
        
        <div className="flex flex-col gap-3 mt-4">
          {eventCard.eventChoices.map((choice, index) => (
            <Button
              key={index}
              variant="outline"
              className="w-full text-left justify-start p-4 h-auto"
              onClick={() => onChoice(index)}
            >
              <div className="flex flex-col items-start">
                <span className="font-semibold">{choice.text}</span>
                {choice.effect !== 'none' && (
                  <span className="text-xs text-muted-foreground mt-1">
                    {formatEffect(choice.effect)}
                  </span>
                )}
              </div>
            </Button>
          ))}
        </div>
      </DialogContent>
    </Dialog>
  );
}

function formatEffect(effect: string): string {
  const parts = effect.split(',');
  return parts.map(part => {
    if (part.includes('hp-')) return `Lose ${part.replace('hp-', '')} HP`;
    if (part.includes('hp+')) return `Gain ${part.replace('hp+', '')} HP`;
    if (part.includes('heal+')) return `Heal ${part.replace('heal+', '')} HP`;
    if (part.includes('gold-')) return `Lose ${part.replace('gold-', '')} Gold`;
    if (part.includes('gold+')) return `Gain ${part.replace('gold+', '')} Gold`;
    if (part.includes('maxhp+')) return `+${part.replace('maxhp+', '')} Max HP`;
    if (part.includes('fullheal')) return 'Full Heal';
    if (part.includes('weapon')) return 'Get Random Weapon';
    if (part.includes('permanentskill')) return 'Gain Random Permanent Skill';
    return part;
  }).join(', ');
}