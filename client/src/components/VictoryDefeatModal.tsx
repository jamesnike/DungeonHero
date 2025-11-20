import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Trophy, Skull, Coins, Heart } from 'lucide-react';
import { Badge } from '@/components/ui/badge';

interface VictoryDefeatModalProps {
  open: boolean;
  isVictory: boolean;
  gold: number;
  hpRemaining: number;
  onRestart: () => void;
}

export default function VictoryDefeatModal({ 
  open, 
  isVictory, 
  gold, 
  hpRemaining,
  onRestart 
}: VictoryDefeatModalProps) {
  return (
    <Dialog open={open}>
      <DialogContent className="max-w-md" data-testid={isVictory ? "victory-modal" : "defeat-modal"}>
        <DialogHeader>
          <div className="flex flex-col items-center gap-4 mb-4">
            {isVictory ? (
              <div className="w-20 h-20 rounded-full bg-primary/20 flex items-center justify-center">
                <Trophy className="w-12 h-12 text-primary" />
              </div>
            ) : (
              <div className="w-20 h-20 rounded-full bg-destructive/20 flex items-center justify-center">
                <Skull className="w-12 h-12 text-destructive" />
              </div>
            )}
          </div>
          <DialogTitle className="text-center font-serif text-3xl">
            {isVictory ? 'Victory!' : 'Defeat'}
          </DialogTitle>
          <DialogDescription className="text-center text-base">
            {isVictory 
              ? 'You have conquered the dungeon!' 
              : 'The darkness has claimed you...'}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-3 py-4">
          <div className="flex items-center justify-between p-3 bg-muted rounded-md">
            <div className="flex items-center gap-2">
              <Coins className="w-5 h-5 text-yellow-500" />
              <span className="font-medium">Gold Collected</span>
            </div>
            <Badge variant="outline" className="font-mono text-lg">
              {gold}
            </Badge>
          </div>

          {isVictory && (
            <div className="flex items-center justify-between p-3 bg-muted rounded-md">
              <div className="flex items-center gap-2">
                <Heart className="w-5 h-5 text-destructive" />
                <span className="font-medium">HP Remaining</span>
              </div>
              <Badge variant="outline" className="font-mono text-lg">
                {hpRemaining}
              </Badge>
            </div>
          )}
        </div>

        <DialogFooter>
          <Button 
            onClick={onRestart} 
            className="w-full"
            size="lg"
            data-testid="button-restart"
          >
            Play Again
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
