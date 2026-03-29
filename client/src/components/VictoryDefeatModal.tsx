import { Button } from '@/components/ui/button';
import { Trophy, Skull, Coins, Heart, Swords, Minus } from 'lucide-react';
import { Badge } from '@/components/ui/badge';

interface VictoryDefeatModalProps {
  open: boolean;
  isVictory: boolean;
  gold: number;
  hpRemaining: number;
  onRestart: () => void;
  onMinimize?: () => void;
  monstersDefeated?: number;
  damageTaken?: number;
  totalHealed?: number;
  scaleMultiplier?: number;
}

export default function VictoryDefeatModal({ 
  open, 
  isVictory, 
  gold, 
  hpRemaining,
  onRestart,
  onMinimize,
  monstersDefeated = 0,
  damageTaken = 0,
  totalHealed = 0,
  scaleMultiplier = 1,
}: VictoryDefeatModalProps) {
  if (!open) return null;

  return (
    <div
      className="absolute inset-0 z-[900] flex items-center justify-center pointer-events-none"
    >
      <div
        className="pointer-events-auto victory-defeat-panel rounded-xl border bg-background/95 backdrop-blur-sm shadow-2xl px-6 py-5 w-[340px] flex flex-col items-center gap-3 relative"
        style={{
          transform: `scale(${scaleMultiplier})`,
          transformOrigin: 'center center',
        }}
        data-testid={isVictory ? 'victory-modal' : 'defeat-modal'}
      >
        {/* Minimize button */}
        {onMinimize && (
          <button
            onClick={onMinimize}
            className="absolute top-2.5 right-2.5 w-7 h-7 rounded-md flex items-center justify-center text-muted-foreground hover:text-foreground hover:bg-muted transition-colors"
            aria-label="最小化"
          >
            <Minus className="w-4 h-4" />
          </button>
        )}

        {/* Icon */}
        <div className="flex flex-col items-center gap-2">
          {isVictory ? (
            <div className="w-16 h-16 rounded-full bg-primary/20 flex items-center justify-center">
              <Trophy className="w-10 h-10 text-primary" />
            </div>
          ) : (
            <div className="w-16 h-16 rounded-full bg-destructive/20 flex items-center justify-center">
              <Skull className="w-10 h-10 text-destructive" />
            </div>
          )}
        </div>

        {/* Title */}
        <h2 className="text-center font-serif text-2xl font-bold tracking-wide">
          {isVictory ? 'Victory!' : 'Defeat'}
        </h2>
        <p className="text-center text-sm text-muted-foreground -mt-1">
          {isVictory
            ? 'You have conquered the dungeon!'
            : 'The darkness has claimed you...'}
        </p>

        {/* Stats grid */}
        <div className="w-full grid grid-cols-2 gap-2 pt-1">
          <div className="flex flex-col items-center gap-1 p-2 bg-muted rounded-md">
            <Coins className="w-4 h-4 text-yellow-500" />
            <span className="text-[10px] text-muted-foreground">Gold</span>
            <Badge variant="outline" className="font-mono text-base">
              {gold}
            </Badge>
          </div>

          {isVictory && (
            <div className="flex flex-col items-center gap-1 p-2 bg-muted rounded-md">
              <Heart className="w-4 h-4 text-destructive" />
              <span className="text-[10px] text-muted-foreground">HP Left</span>
              <Badge variant="outline" className="font-mono text-base">
                {hpRemaining}
              </Badge>
            </div>
          )}

          <div className="flex flex-col items-center gap-1 p-2 bg-muted rounded-md">
            <Skull className="w-4 h-4 text-primary" />
            <span className="text-[10px] text-muted-foreground">Defeated</span>
            <Badge variant="outline" className="font-mono text-base">
              {monstersDefeated}
            </Badge>
          </div>

          <div className="flex flex-col items-center gap-1 p-2 bg-muted rounded-md">
            <Swords className="w-4 h-4 text-destructive" />
            <span className="text-[10px] text-muted-foreground">Damage</span>
            <Badge variant="outline" className="font-mono text-base">
              {damageTaken}
            </Badge>
          </div>

          <div className="flex flex-col items-center gap-1 p-2 bg-muted rounded-md">
            <Heart className="w-4 h-4 text-green-500" />
            <span className="text-[10px] text-muted-foreground">Healed</span>
            <Badge variant="outline" className="font-mono text-base">
              {totalHealed}
            </Badge>
          </div>
        </div>

        {/* Restart button */}
        <Button
          onClick={onRestart}
          className="w-full mt-1"
          size="lg"
          data-testid="button-restart"
        >
          Play Again
        </Button>
      </div>
    </div>
  );
}
