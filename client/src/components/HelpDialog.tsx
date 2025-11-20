import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { HelpCircle, Target, Sword, Shield, Heart, Coins } from 'lucide-react';
import { Badge } from '@/components/ui/badge';

export default function HelpDialog() {
  return (
    <Dialog>
      <DialogTrigger asChild>
        <Button variant="outline" size="icon" data-testid="button-help">
          <HelpCircle className="w-5 h-5" />
        </Button>
      </DialogTrigger>
      <DialogContent className="max-w-2xl max-h-[80vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="font-serif text-2xl">How to Play</DialogTitle>
          <DialogDescription>
            Survive through a 54-card deck in this dungeon-crawling card game
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-6 py-4">
          <div>
            <h3 className="font-semibold mb-2 flex items-center gap-2">
              <Target className="w-5 h-5 text-primary" />
              Goal
            </h3>
            <p className="text-sm text-muted-foreground">
              Survive all 54 cards without your HP reaching 0. You must play exactly <strong>4 of 5 cards</strong> each turn.
              The unplayed card carries over to the next hand.
            </p>
          </div>

          <div>
            <h3 className="font-semibold mb-3 flex items-center gap-2">
              <Sword className="w-5 h-5 text-amber-500" />
              Combat
            </h3>
            <div className="space-y-2 text-sm text-muted-foreground">
              <div className="p-3 bg-muted rounded-md">
                <strong className="text-foreground">Attack (Weapon→Monster):</strong> Drag equipped weapon → monster card. 
                If weapon ≥ monster: defeated. If weapon &lt; monster: survives and counterattacks!
              </div>
              <div className="p-3 bg-muted rounded-md">
                <strong className="text-foreground">Attack (Monster→Weapon):</strong> Drag monster → equipped weapon slot. 
                Same as above - weapon attacks the monster.
              </div>
              <div className="p-3 bg-muted rounded-md">
                <strong className="text-foreground">Defend (Monster→Shield):</strong> Drag monster → equipped shield slot. 
                Shield blocks damage and is consumed (single-use).
              </div>
              <div className="p-3 bg-muted rounded-md">
                <strong className="text-foreground">Defend (Monster→Hero):</strong> Take full damage, reduced by shield if equipped.
              </div>
            </div>
          </div>

          <div>
            <h3 className="font-semibold mb-3">Card Types</h3>
            <div className="grid grid-cols-2 gap-2 text-sm">
              <div className="flex items-start gap-2 p-2 bg-muted rounded-md">
                <Sword className="w-4 h-4 text-amber-500 mt-0.5" />
                <div>
                  <strong className="text-foreground">Weapons</strong>
                  <p className="text-xs text-muted-foreground">Equip, sell, or drag to monsters. Single-use.</p>
                </div>
              </div>
              <div className="flex items-start gap-2 p-2 bg-muted rounded-md">
                <Shield className="w-4 h-4 text-blue-500 mt-0.5" />
                <div>
                  <strong className="text-foreground">Shields</strong>
                  <p className="text-xs text-muted-foreground">Equip or sell. Single-use when blocking.</p>
                </div>
              </div>
              <div className="flex items-start gap-2 p-2 bg-muted rounded-md">
                <Heart className="w-4 h-4 text-destructive mt-0.5" />
                <div>
                  <strong className="text-foreground">Potions</strong>
                  <p className="text-xs text-muted-foreground">Heal HP or store in backpack.</p>
                </div>
              </div>
              <div className="flex items-start gap-2 p-2 bg-muted rounded-md">
                <Coins className="w-4 h-4 text-yellow-500 mt-0.5" />
                <div>
                  <strong className="text-foreground">Gold</strong>
                  <p className="text-xs text-muted-foreground">Collect for scoring.</p>
                </div>
              </div>
            </div>
          </div>

          <div>
            <h3 className="font-semibold mb-3">Actions</h3>
            <div className="space-y-2 text-sm">
              <div className="flex items-start gap-2">
                <Badge variant="outline" className="mt-0.5">Attack</Badge>
                <span className="text-muted-foreground">Drag weapon→monster OR monster→weapon slot</span>
              </div>
              <div className="flex items-start gap-2">
                <Badge variant="outline" className="mt-0.5">Defend</Badge>
                <span className="text-muted-foreground">Drag monster→shield slot OR monster→hero</span>
              </div>
              <div className="flex items-start gap-2">
                <Badge variant="outline" className="mt-0.5">Equip</Badge>
                <span className="text-muted-foreground">Drag weapon/shield to 2 equipment slots</span>
              </div>
              <div className="flex items-start gap-2">
                <Badge variant="outline" className="mt-0.5">Store</Badge>
                <span className="text-muted-foreground">Drag to backpack (stacks up to 10 items, click to use top item)</span>
              </div>
              <div className="flex items-start gap-2">
                <Badge variant="outline" className="mt-0.5">Hand</Badge>
                <span className="text-muted-foreground">Drag cards to bottom hand area (max 5 cards) to save for later use</span>
              </div>
              <div className="flex items-start gap-2">
                <Badge variant="outline" className="mt-0.5">Amulet</Badge>
                <span className="text-muted-foreground">Equip amulet in dedicated slot for passive bonuses (+HP, +Attack, or +Defense)</span>
              </div>
              <div className="flex items-start gap-2">
                <Badge variant="outline" className="mt-0.5">Sell</Badge>
                <span className="text-muted-foreground">Drag items to graveyard (top right) for gold</span>
              </div>
              <div className="flex items-start gap-2">
                <Badge variant="outline" className="mt-0.5">Graveyard</Badge>
                <span className="text-muted-foreground">Click graveyard to view all discarded cards</span>
              </div>
              <div className="flex items-start gap-2">
                <Badge variant="outline" className="mt-0.5">View Deck</Badge>
                <span className="text-muted-foreground">Click deck counter to see remaining cards</span>
              </div>
            </div>
          </div>

          <div className="p-4 bg-primary/10 rounded-md border border-primary/20">
            <p className="text-sm">
              <strong>Pro Tips:</strong> 
              • Weapons & shields are single-use!
              • Drag monster→equipment for flexible combat
              • If weapon can't defeat monster, it survives and stays on board
              • Sell unwanted items to graveyard for gold
              • Check graveyard to see your card history
            </p>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
