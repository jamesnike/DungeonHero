/**
 * useFlightState — flight-related state that GameBoard's RENDER actually
 * reads.
 *
 * The 8 flight ARRAYS (class-deck, fate-swap, graveyard-stack, backpack-hand,
 * discard-shock, flip-shock, discard, steal-card) used to live here too,
 * but GameBoard never read their values — they only flowed through to
 * `<FlightOverlayLayer>` props. Every setter call would force a re-render
 * of GameBoard's 8000-line render path for no benefit. Those arrays now
 * live inside `<FlightOverlayContainer>` (see
 * `client/src/components/game-board/components/FlightOverlayContainer.tsx`)
 * and are written via `flightOverlayRef.current?.setXxxFlights(...)`.
 *
 * What's left: the 2 boolean lock flags. GameBoard's render genuinely
 * needs these — they participate in `boardInteractionLocked` (so the
 * board freezes mouse input while a discard-shock or flip-shock projectile
 * is mid-flight). Keeping them here is correct: when they flip, GameBoard
 * SHOULD re-render to apply the lock.
 */

import { useState } from 'react';

export function useFlightState() {
  const [discardShockInteractionLocked, setDiscardShockInteractionLocked] = useState(false);
  const [flipShockInteractionLocked, setFlipShockInteractionLocked] = useState(false);

  return {
    discardShockInteractionLocked,
    setDiscardShockInteractionLocked,
    flipShockInteractionLocked,
    setFlipShockInteractionLocked,
  } as const;
}
