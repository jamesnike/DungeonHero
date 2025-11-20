import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Trophy, Skull, Coins, Heart, Swords } from 'lucide-react';
import { Badge } from '@/components/ui/badge';

interface VictoryDefeatModalProps {
  open: boolean;
  isVictory: boolean;
  gold: number;
  hpRemaining: number;
  onRestart: () => void;
  monstersDefeated?: number;
  damageTaken?: number;
  totalHealed?: number;
}

export default function VictoryDefeatModal({ 
  open, 
  isVictory, 
  gold, 
  hpRemaining,
  onRestart,
  monstersDefeated = 0,
  damageTaken = 0,
  totalHealed = 0
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
          <div className="grid grid-cols-2 gap-3">
            <div className="flex flex-col items-center gap-2 p-3 bg-muted rounded-md">
              <Coins className="w-5 h-5 text-yellow-500" />
              <span className="text-xs text-muted-foreground">Gold</span>
              <Badge variant="outline" className="font-mono text-lg">
                {gold}
              </Badge>
            </div>

            {isVictory && (
              <div className="flex flex-col items-center gap-2 p-3 bg-muted rounded-md">
                <Heart className="w-5 h-5 text-destructive" />
                <span className="text-xs text-muted-foreground">HP Left</span>
                <Badge variant="outline" className="font-mono text-lg">
                  {hpRemaining}
                </Badge>
              </div>
            )}
            
            <div className="flex flex-col items-center gap-2 p-3 bg-muted rounded-md">
              <Skull className="w-5 h-5 text-primary" />
              <span className="text-xs text-muted-foreground">Defeated</span>
              <Badge variant="outline" className="font-mono text-lg">
                {monstersDefeated}
              </Badge>
            </div>
            
            <div className="flex flex-col items-center gap-2 p-3 bg-muted rounded-md">
              <Swords className="w-5 h-5 text-destructive" />
              <span className="text-xs text-muted-foreground">Damage</span>
              <Badge variant="outline" className="font-mono text-lg">
                {damageTaken}
              </Badge>
            </div>
            
            <div className="flex flex-col items-center gap-2 p-3 bg-muted rounded-md">
              <Heart className="w-5 h-5 text-green-500" />
              <span className="text-xs text-muted-foreground">Healed</span>
              <Badge variant="outline" className="font-mono text-lg">
                {totalHealed}
              </Badge>
            </div>
          </div>
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
