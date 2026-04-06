export type GameEventMap = {
  'combat:started': { monsterIds: string[] };
  'combat:finished': { monsterIds: string[] };
  'combat:monsterDamaged': { monsterId: string; damage: number; remainingHp: number };
  'combat:monsterDefeated': { monsterId: string; monsterName: string };
  'combat:heroDamaged': { damage: number; source: string };
  'combat:heroHealed': { amount: number; source: string };
  'combat:weaponSwing': { slotId: string; variant: number };
  'combat:shieldBlock': { slotId: string; variant: number };
  'combat:shieldReflect': { monsterId: string; damage: number };
  'combat:bossRetaliation': { damage: number };
  'combat:monsterAttack': { monsterId: string; damage: number };
  'combat:stunApplied': { monsterId: string };

  'card:drawnToHand': { cardId: string; source: string };
  'card:discarded': { cardId: string; destination: 'graveyard' | 'recycleBag' };
  'card:addedToBackpack': { cardId: string };
  'card:played': { cardId: string; cardType: string };
  'card:flipped': { cardId: string; toCardId: string };

  'equipment:equipped': { slotId: string; cardId: string };
  'equipment:destroyed': { slotId: string; cardId: string };
  'equipment:repaired': { slotId: string; amount: number };
  'equipment:swapped': {};

  'waterfall:started': { sequenceId: number };
  'waterfall:dropPhase': { slots: number[] };
  'waterfall:discardPhase': { slot: number; destination: string };
  'waterfall:dealPhase': { slots: number[] };
  'waterfall:completed': { sequenceId: number };

  'shop:opened': { offerings: unknown[] };
  'shop:purchased': { cardId: string; cost: number };
  'shop:closed': {};

  'event:started': { cardId: string };
  'event:choiceMade': { choiceId: string };
  'event:completed': { cardId: string };
  'event:diceRolled': { value: number };

  'hero:skillUsed': { skillId: string };
  'hero:magicActivated': { magicId: string };
  'hero:leveledUp': { stat: string; amount: number };

  'monster:rewardOffered': { monsterId: string };
  'monster:rewardSelected': { rewardId: string };
  'monster:persuaded': { monsterId: string };

  'game:started': {};
  'game:over': { victory: boolean };
  'game:stateChanged': {};
  'game:undoPerformed': {};

  'log:entry': { type: string; message: string };
};

export type GameEventKey = keyof GameEventMap;

type Handler<T> = (payload: T) => void;

export class EventBus {
  private handlers = new Map<string, Set<Handler<any>>>();

  on<K extends GameEventKey>(event: K, handler: Handler<GameEventMap[K]>): () => void {
    if (!this.handlers.has(event)) {
      this.handlers.set(event, new Set());
    }
    this.handlers.get(event)!.add(handler);
    return () => {
      this.handlers.get(event)?.delete(handler);
    };
  }

  off<K extends GameEventKey>(event: K, handler: Handler<GameEventMap[K]>): void {
    this.handlers.get(event)?.delete(handler);
  }

  emit<K extends GameEventKey>(event: K, payload: GameEventMap[K]): void {
    this.handlers.get(event)?.forEach(handler => {
      try {
        handler(payload);
      } catch (err) {
        console.error(`[EventBus] Error in handler for "${event}":`, err);
      }
    });
  }

  removeAllListeners(): void {
    this.handlers.clear();
  }
}
