/**
 * useFlightState — groups all flight animation state arrays.
 *
 * Purely state management — no animation logic, no subscriptions.
 */

import { useState } from 'react';
import type {
  ClassDeckFlight,
  FateSwapFlight,
  GraveyardStackFlight,
  BackpackHandFlight,
  DiscardShockFlight,
  DiscardFlight,
  DirectedCombatFxFlight,
} from '@/components/game-board/types';

export function useFlightState() {
  const [classDeckFlights, setClassDeckFlights] = useState<ClassDeckFlight[]>([]);
  const [fateSwapFlights, setFateSwapFlights] = useState<FateSwapFlight[]>([]);
  const [graveyardStackFlights, setGraveyardStackFlights] = useState<GraveyardStackFlight[]>([]);
  const [backpackHandFlights, setBackpackHandFlights] = useState<BackpackHandFlight[]>([]);
  const [discardShockFlights, setDiscardShockFlights] = useState<DiscardShockFlight[]>([]);
  const [discardShockInteractionLocked, setDiscardShockInteractionLocked] = useState(false);
  const [flipShockFlights, setFlipShockFlights] = useState<DiscardShockFlight[]>([]);
  const [flipShockInteractionLocked, setFlipShockInteractionLocked] = useState(false);
  const [discardFlights, setDiscardFlights] = useState<DiscardFlight[]>([]);
  const [stealCardFlights, setStealCardFlights] = useState<DiscardFlight[]>([]);
  const [directedCombatFxFlights, setDirectedCombatFxFlights] = useState<DirectedCombatFxFlight[]>([]);

  return {
    classDeckFlights, setClassDeckFlights,
    fateSwapFlights, setFateSwapFlights,
    graveyardStackFlights, setGraveyardStackFlights,
    backpackHandFlights, setBackpackHandFlights,
    discardShockFlights, setDiscardShockFlights,
    discardShockInteractionLocked, setDiscardShockInteractionLocked,
    flipShockFlights, setFlipShockFlights,
    flipShockInteractionLocked, setFlipShockInteractionLocked,
    discardFlights, setDiscardFlights,
    stealCardFlights, setStealCardFlights,
    directedCombatFxFlights, setDirectedCombatFxFlights,
  } as const;
}
