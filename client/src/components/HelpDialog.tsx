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
              Survive all 54 cards without your HP reaching 0. You must play exactly <strong>3 of 4 cards</strong> each turn.
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
                <strong className="text-foreground">Attack:</strong> Drag weapon from equipment → monster. If weapon value ≥ monster value, monster is defeated.
                Otherwise, monster counterattacks. Weapon is consumed after use.
              </div>
              <div className="p-3 bg-muted rounded-md">
                <strong className="text-foreground">Defend:</strong> Drag monster → hero. Take full monster damage, reduced by equipped shield.
              </div>
              <div className="p-3 bg-muted rounded-md">
                <strong className="text-foreground">Shields:</strong> Single-use! Consumed when blocking damage.
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
                <span className="text-muted-foreground">Drag weapon from equipment → monster card</span>
              </div>
              <div className="flex items-start gap-2">
                <Badge variant="outline" className="mt-0.5">Defend</Badge>
                <span className="text-muted-foreground">Drag monster → hero card</span>
              </div>
              <div className="flex items-start gap-2">
                <Badge variant="outline" className="mt-0.5">Equip</Badge>
                <span className="text-muted-foreground">Drag weapon/shield to 2 equipment slots</span>
              </div>
              <div className="flex items-start gap-2">
                <Badge variant="outline" className="mt-0.5">Store</Badge>
                <span className="text-muted-foreground">Drag item to backpack (1 item max, click to use)</span>
              </div>
              <div className="flex items-start gap-2">
                <Badge variant="outline" className="mt-0.5">Sell</Badge>
                <span className="text-muted-foreground">Drag dungeon cards OR equipped items to sell zone</span>
              </div>
              <div className="flex items-start gap-2">
                <Badge variant="outline" className="mt-0.5">View Deck</Badge>
                <span className="text-muted-foreground">Click deck counter to see all remaining cards</span>
              </div>
            </div>
          </div>

          <div className="p-4 bg-primary/10 rounded-md border border-primary/20">
            <p className="text-sm">
              <strong>Pro Tip:</strong> Both weapons AND shields are single-use! Use your equipment slots wisely.
              You can drag weapons directly onto monsters to attack, or let monsters attack you to trigger shield blocking.
              Equipped items can be sold if you need gold!
            </p>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
