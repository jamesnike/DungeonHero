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
                <strong className="text-foreground">With Weapon:</strong> If weapon value ≥ monster value, monster is defeated.
                Otherwise, you take (monster - weapon - shield) damage. Weapon is consumed after use.
              </div>
              <div className="p-3 bg-muted rounded-md">
                <strong className="text-foreground">Without Weapon:</strong> You take full monster damage, reduced by shield value.
              </div>
              <div className="p-3 bg-muted rounded-md">
                <strong className="text-foreground">Shields:</strong> Provide permanent damage reduction.
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
                  <p className="text-xs text-muted-foreground">Equip or sell. Single-use when attacking.</p>
                </div>
              </div>
              <div className="flex items-start gap-2 p-2 bg-muted rounded-md">
                <Shield className="w-4 h-4 text-blue-500 mt-0.5" />
                <div>
                  <strong className="text-foreground">Shields</strong>
                  <p className="text-xs text-muted-foreground">Equip or sell. Permanent protection.</p>
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
                <span className="text-muted-foreground">Drag monster to hero</span>
              </div>
              <div className="flex items-start gap-2">
                <Badge variant="outline" className="mt-0.5">Equip</Badge>
                <span className="text-muted-foreground">Drag weapon/shield to equipment slots</span>
              </div>
              <div className="flex items-start gap-2">
                <Badge variant="outline" className="mt-0.5">Store</Badge>
                <span className="text-muted-foreground">Drag item to backpack (1 item max)</span>
              </div>
              <div className="flex items-start gap-2">
                <Badge variant="outline" className="mt-0.5">Use</Badge>
                <span className="text-muted-foreground">Click backpack item to use/equip it</span>
              </div>
              <div className="flex items-start gap-2">
                <Badge variant="outline" className="mt-0.5">Sell</Badge>
                <span className="text-muted-foreground">Drag items to merchant for gold</span>
              </div>
            </div>
          </div>

          <div className="p-4 bg-primary/10 rounded-md border border-primary/20">
            <p className="text-sm">
              <strong>Pro Tip:</strong> Manage your resources carefully! Save potions in the backpack for emergencies,
              and remember that weapons are single-use while shields last forever.
            </p>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
