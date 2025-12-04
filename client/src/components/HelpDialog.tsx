import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import {
  HelpCircle,
  Target,
  Sword,
  Shield,
  Heart,
  LayoutGrid,
  Sparkles,
  ScrollText,
  Skull,
  Dices,
  Package,
  Wand2,
  Layers,
  Coins,
} from 'lucide-react';
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
            Survive the Knight’s gauntlet by clearing every card without letting your HP hit 0
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-6 py-4 text-sm text-muted-foreground">
          <div>
            <h3 className="font-semibold mb-2 flex items-center gap-2 text-foreground">
              <Target className="w-5 h-5 text-primary" />
              Goal & Turn Flow
            </h3>
            <p>
              The deck holds <strong>64 cards</strong> (monsters, weapons, shields, potions, six instant magic scrolls,
              amulets, and event cards). Each wave shows 5 active cards backed by a 5-card preview row. Resolve exactly
              <strong> four</strong> of the active cards—when only one remains, the <em>Waterfall</em> discards it to the graveyard and
              drops the preview row into play before drawing five fresh preview cards.
            </p>
            <p className="mt-2">
              Cards obey the “physical card” rule: they move between preview, active row, hero row, backpack, hand, and
              the graveyard exactly once. Use the graveyard modal to audit durability losses, sales, and event history.
            </p>
          </div>

          <div>
            <h3 className="font-semibold mb-2 flex items-center gap-2 text-foreground">
              <LayoutGrid className="w-5 h-5 text-primary" />
              Board Layout (3×6 grid)
            </h3>
            <ul className="space-y-1 list-disc pl-5">
              <li>
                <strong>Preview Row:</strong> ghosted cards (Row 1, Col 1‑5) show the exact order of the next drop.
              </li>
              <li>
                <strong>D20 Column:</strong> Row 1, Col 6 hosts the clickable dice roller—use it whenever events mention
                a 50/50 or luck-based outcome.
              </li>
              <li>
                <strong>Active Row:</strong> Row 2, Col 1‑5 contains the five cards you must interact with before the
                Waterfall.
              </li>
              <li>
                <strong>Graveyard:</strong> Row 2, Col 6 doubles as the sell zone and discard browser.
              </li>
              <li>
                <strong>Hero Row:</strong> Row 3 contains (from left to right) the two-slot amulet queue, two flexible
                equipment slots, the hero card (with HP display and hero-skill button), the 10-item backpack with draw
                button, and the Knight class deck viewer/discover entry.
              </li>
            </ul>
          </div>

          <div>
            <h3 className="font-semibold mb-3 text-foreground">Card Families</h3>
            <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-2">
              <div className="flex items-start gap-2 p-2 bg-muted rounded-md">
                <Skull className="w-4 h-4 text-destructive mt-0.5" />
                <div>
                  <strong className="text-foreground">Monsters</strong>
                  <p className="text-xs text-muted-foreground">
                    Attack + HP values plus fury layers. If your damage doesn’t finish them, they counterattack and stay
                    on the board.
                  </p>
                </div>
              </div>
              <div className="flex items-start gap-2 p-2 bg-muted rounded-md">
                <Sword className="w-4 h-4 text-amber-500 mt-0.5" />
                <div>
                  <strong className="text-foreground">Weapons</strong>
                  <p className="text-xs text-muted-foreground">
                    Equip in either slot. Durability dots track remaining swings, and permanent/hero/amulet bonuses
                    stack on top.
                  </p>
                </div>
              </div>
              <div className="flex items-start gap-2 p-2 bg-muted rounded-md">
                <Shield className="w-4 h-4 text-blue-500 mt-0.5" />
                <div>
                  <strong className="text-foreground">Shields</strong>
                  <p className="text-xs text-muted-foreground">
                    Soak monster damage, consume durability, and fuel Bulwark Slam/Eternal Repair style effects.
                  </p>
                </div>
              </div>
              <div className="flex items-start gap-2 p-2 bg-muted rounded-md">
                <Heart className="w-4 h-4 text-green-500 mt-0.5" />
                <div>
                  <strong className="text-foreground">Potions & Scrolls</strong>
                  <p className="text-xs text-muted-foreground">
                    Potions heal (store them in the backpack). Six instant magic scrolls—Cascade Reset, Tempest Volley,
                    Echo Satchel, Bulwark Slam, Blood Reckoning, Eternal Repair—add powerful tempo plays.
                  </p>
                </div>
              </div>
              <div className="flex items-start gap-2 p-2 bg-muted rounded-md">
                <Sparkles className="w-4 h-4 text-purple-500 mt-0.5" />
                <div>
                  <strong className="text-foreground">Amulets</strong>
                  <p className="text-xs text-muted-foreground">
                    Two-slot queue. Mix heal (double recovery), balance (slot-specific attack/defense), life steal,
                    guardian (shield overflow damage ignored during combat), flash (double strike at -3), and strength (+4 attack with blood upkeep).
                  </p>
                </div>
              </div>
              <div className="flex items-start gap-2 p-2 bg-muted rounded-md">
                <ScrollText className="w-4 h-4 text-violet-500 mt-0.5" />
                <div>
                  <strong className="text-foreground">Events & Class Cards</strong>
                  <p className="text-xs text-muted-foreground">
                    Mysterious Shrine, Wandering Merchant, Dark Altar, treasure rooms, and Knight discoveries award gold,
                    permanent skills, or class cards that enter the backpack or hero slots.
                  </p>
                </div>
              </div>
            </div>
          </div>

          <div>
            <h3 className="font-semibold mb-3 flex items-center gap-2 text-foreground">
              <Layers className="w-5 h-5 text-primary" />
              Systems & Resources
            </h3>
            <div className="space-y-3">
              <div className="p-3 bg-muted rounded-md">
                <div className="flex items-center gap-2 text-foreground font-semibold">
                  <Layers className="w-4 h-4 text-primary" />
                  Waterfall cycle
                </div>
                <p className="mt-1 text-xs">
                  Clearing the fourth card arms the Waterfall. The final active card is discarded, hero skills reset, the
                  preview row drops, five fresh preview cards are drawn, and the backpack draw button locks until you
                  resolve the next dungeon card.
                </p>
              </div>
              <div className="p-3 bg-muted rounded-md">
                <div className="flex items-center gap-2 text-foreground font-semibold">
                  <Package className="w-4 h-4 text-amber-500" />
                  Backpack & Hand
                </div>
                <p className="mt-1 text-xs">
                  Store non-monster/non-event cards in the 10-slot LIFO backpack. The draw button (once lit) flings the
                  top item into the 7-card hand; cards drawn into the hand can’t be returned, so play, equip, or sell
                  them. Echo Satchel draws as many cards as you’ve discarded this wave.
                </p>
              </div>
              <div className="p-3 bg-muted rounded-md">
                <div className="flex items-center gap-2 text-foreground font-semibold">
                  <Wand2 className="w-4 h-4 text-rose-500" />
                  Hero skills
                </div>
                <p className="mt-1 text-xs">
                  Choose one of four skills at the start (Bulwark Offering, Blood-for-Steel, Crimson Strike, or Titan
                  Vitality). Active skills are available once per Waterfall and require slot/monster targeting; passive
                  skills stay on permanently. Cancel target mode via the hero card button if you change your mind.
                </p>
              </div>
              <div className="p-3 bg-muted rounded-md">
                <div className="flex items-center gap-2 text-foreground font-semibold">
                  <ScrollText className="w-4 h-4 text-indigo-400" />
                  Knight deck & Discoveries
                </div>
                <p className="mt-1 text-xs">
                  Row 3, Col 6 opens the Knight deck viewer. Discover choices, Ancient Tome, Dark Altar, and treasure
                  events feed class cards into the backpack, auto-equip gear, or grant permanent skills that fuel weapon
                  mastery and shield bonuses.
                </p>
              </div>
              <div className="p-3 bg-muted rounded-md">
                <div className="flex items-center gap-2 text-foreground font-semibold">
                  <Dices className="w-4 h-4 text-yellow-500" />
                  Dice & risky events
                </div>
                <p className="mt-1 text-xs">
                  Tap the D20 each time you face a 50/50 option (Treasure Chest, Lucky Coin, “Force Open” prompts). The
                  die overlay shows your latest roll so you can roleplay the gamble you’re about to take.
                </p>
              </div>
              <div className="p-3 bg-muted rounded-md">
                <div className="flex items-center gap-2 text-foreground font-semibold">
                  <Coins className="w-4 h-4 text-yellow-500" />
                  Economy & history
                </div>
                <p className="mt-1 text-xs">
                  Drop sellable cards onto the graveyard to convert them into gold. Click the deck counter, backpack, or
                  graveyard piles to inspect the remaining deck, stash, or discard log before committing to big plays.
                </p>
              </div>
            </div>
          </div>

          <div>
            <h3 className="font-semibold mb-3 text-foreground">Actions</h3>
            <div className="space-y-2">
              <div className="flex items-start gap-2">
                <Badge variant="outline" className="mt-0.5">
                  Attack
                </Badge>
                <span>
                  Drag a weapon to a monster (or a monster to the equipped weapon slot). If the weapon value meets or
                  beats HP, both cards hit the graveyard; otherwise the monster survives and retaliates.
                </span>
              </div>
              <div className="flex items-start gap-2">
                <Badge variant="outline" className="mt-0.5">
                  Block
                </Badge>
                <span>
                  Drag a monster onto a shield slot (consumes durability) or onto the hero card to absorb remaining
                  damage after shield bonuses and temporary shields.
                </span>
              </div>
              <div className="flex items-start gap-2">
                <Badge variant="outline" className="mt-0.5">
                  Equip
                </Badge>
                <span>
                  Weapons/shields can occupy either equipment slot. Replacements automatically send the displaced card to
                  the graveyard, preserving the new item’s durability.
                </span>
              </div>
              <div className="flex items-start gap-2">
                <Badge variant="outline" className="mt-0.5">
                  Store
                </Badge>
                <span>
                  Drag any non-monster, non-event card into the backpack (capacity 10). Cards drawn from the hand cannot
                  be stashed back.
                </span>
              </div>
              <div className="flex items-start gap-2">
                <Badge variant="outline" className="mt-0.5">
                  Draw
                </Badge>
                <span>
                  When the backpack button glows, click “Draw” to sling the top item into the hand (up to 7 cards). The
                  button locks again until you resolve another dungeon card.
                </span>
              </div>
              <div className="flex items-start gap-2">
                <Badge variant="outline" className="mt-0.5">
                  Amulets
                </Badge>
                <span>
                  Drop amulets into the dedicated slot; introducing a third amulet bumps the oldest straight to the
                  graveyard while keeping the newest two active.
                </span>
              </div>
              <div className="flex items-start gap-2">
                <Badge variant="outline" className="mt-0.5">
                  Events & Magic
                </Badge>
                <span>
                  Click event cards to choose an option. Instant magic scrolls open prompts (slot or monster targets)
                  before resolving—follow the banner instructions to finish the cast.
                </span>
              </div>
              <div className="flex items-start gap-2">
                <Badge variant="outline" className="mt-0.5">
                  Hero Skill
                </Badge>
                <span>
                  Tap the button on the hero card once per Waterfall. Cancel targeting by clicking again if you need to
                  back out.
                </span>
              </div>
            </div>
          </div>

          <div className="p-4 bg-primary/10 rounded-md border border-primary/20 text-foreground">
            <strong>Pro Tips</strong>
            <ul className="mt-2 list-disc pl-4 space-y-1 text-sm text-muted-foreground">
              <li>
                Don’t leave a monster queued if you still need its loot—finish the interaction before you’re down to the
                final active card or the Waterfall will trash it.
              </li>
              <li>
                Bank cards early in a wave so Echo Satchel has a high discard count and the backpack draw button is
                armed when you need an emergency tool.
              </li>
              <li>
                Resolve hero-skill prompts immediately; dragging other cards while a target selector is active will be
                blocked to keep combat state consistent.
              </li>
              <li>
                Dark Altar’s Blood Pact empowers your best equipped weapon (+2 damage). If you arrive without a weapon
                you’ll still pocket 5 gold, so plan the visit accordingly.
              </li>
              <li>
                Click the Knight deck, deck counter, and graveyard piles often—knowing what’s left prevents wasted
                Waterfalls and keeps the 10-slot backpack from overflowing.
              </li>
              <li>
                Roll the D20 before choosing “Force Open” or “Flip the coin” risk options to roleplay the luck—high rolls
                favor greedy picks, low rolls warn you to play it safe.
              </li>
            </ul>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
