/**
 * FlightOverlayContainer — owns the React state for the 8 flight arrays
 * (class-deck, fate-swap, graveyard-stack, backpack-hand, discard-shock,
 * flip-shock, discard, steal-card) and renders <FlightOverlayLayer>.
 *
 * Why this exists:
 *   GameBoard previously held all 8 flight arrays via `useFlightState()`.
 *   Every `setXxxFlights(...)` call (which happens at the start AND end of
 *   every flight animation, plus on combat ticks for shock/projectile
 *   spawns) re-rendered the entire 8000-line GameBoard component, even
 *   though those arrays are NEVER read by GameBoard's own render — only by
 *   the FlightOverlayLayer's JSX prop pass.
 *
 *   By moving ownership down here, flight setState calls only re-render
 *   FlightOverlayContainer + FlightOverlayLayer (which is `memo`'d, so it
 *   only re-runs when its visible props actually change). GameBoard stays
 *   stable — its memoized callbacks (activeRowCallbacks, modalCallbacks,
 *   etc.) keep their identity through entire flight animations.
 *
 * The 2 boolean lock flags (discardShockInteractionLocked /
 * flipShockInteractionLocked) stay in `useFlightState()` inside GameBoard
 * because GameBoard's render genuinely reads them (they participate in
 * `boardInteractionLocked` calculation).
 *
 * The `directedCombatFxFlights` prop is owned by `useDirectedCombatFx`
 * (separate hook) and still passes through GameBoard. Same trick could be
 * applied there, but it's a different hook and out of scope for this fix.
 *
 * API contract:
 *   - GameBoard holds a `useRef<FlightOverlayHandle>(null)` and calls
 *     `flightOverlayRef.current?.setXxxFlights(...)` from animation code.
 *   - The setters exposed via useImperativeHandle are React-built-in
 *     setState fns, so identity is stable for the lifetime of this
 *     component (matches the original API).
 *   - The `?.` is needed only for the very first render frame before the
 *     ref is attached; in practice all flight setters fire from event
 *     handlers / animation callbacks that run after mount.
 */

import {
  forwardRef,
  useImperativeHandle,
  useState,
  type Dispatch,
  type MutableRefObject,
  type SetStateAction,
} from 'react';
import FlightOverlayLayer from './FlightOverlayLayer';
import type {
  ClassDeckFlight,
  FateSwapFlight,
  GraveyardStackFlight,
  BackpackHandFlight,
  DiscardShockFlight,
  DiscardFlight,
  DirectedCombatFxFlight,
} from '@/components/game-board/types';

export interface FlightOverlayHandle {
  setClassDeckFlights: Dispatch<SetStateAction<ClassDeckFlight[]>>;
  setFateSwapFlights: Dispatch<SetStateAction<FateSwapFlight[]>>;
  setGraveyardStackFlights: Dispatch<SetStateAction<GraveyardStackFlight[]>>;
  setBackpackHandFlights: Dispatch<SetStateAction<BackpackHandFlight[]>>;
  setDiscardShockFlights: Dispatch<SetStateAction<DiscardShockFlight[]>>;
  setFlipShockFlights: Dispatch<SetStateAction<DiscardShockFlight[]>>;
  setDiscardFlights: Dispatch<SetStateAction<DiscardFlight[]>>;
  setStealCardFlights: Dispatch<SetStateAction<DiscardFlight[]>>;
}

export interface FlightOverlayContainerProps {
  directedCombatFxFlights: DirectedCombatFxFlight[];
  gridCardSize: { width: number; height: number } | null;
  classDeckFlightElementMapRef: MutableRefObject<Map<string, HTMLDivElement>>;
  discardFlightElementMapRef: MutableRefObject<Map<string, HTMLDivElement>>;
  stealCardFlightElementMapRef: MutableRefObject<Map<string, HTMLDivElement>>;
  backpackFlightElementMapRef: MutableRefObject<Map<string, HTMLDivElement>>;
  discardShockElementMapRef: MutableRefObject<Map<string, HTMLDivElement>>;
  flipShockElementMapRef: MutableRefObject<Map<string, HTMLDivElement>>;
  directedCombatFxElementMapRef: MutableRefObject<Map<string, HTMLDivElement>>;
  fateSwapFlightElementMapRef: MutableRefObject<Map<string, HTMLDivElement>>;
  graveyardStackFlightElementMapRef: MutableRefObject<Map<string, HTMLDivElement>>;
}

export const FlightOverlayContainer = forwardRef<FlightOverlayHandle, FlightOverlayContainerProps>(
  function FlightOverlayContainer(
    {
      directedCombatFxFlights,
      gridCardSize,
      classDeckFlightElementMapRef,
      discardFlightElementMapRef,
      stealCardFlightElementMapRef,
      backpackFlightElementMapRef,
      discardShockElementMapRef,
      flipShockElementMapRef,
      directedCombatFxElementMapRef,
      fateSwapFlightElementMapRef,
      graveyardStackFlightElementMapRef,
    },
    ref,
  ) {
    const [classDeckFlights, setClassDeckFlights] = useState<ClassDeckFlight[]>([]);
    const [fateSwapFlights, setFateSwapFlights] = useState<FateSwapFlight[]>([]);
    const [graveyardStackFlights, setGraveyardStackFlights] = useState<GraveyardStackFlight[]>([]);
    const [backpackHandFlights, setBackpackHandFlights] = useState<BackpackHandFlight[]>([]);
    const [discardShockFlights, setDiscardShockFlights] = useState<DiscardShockFlight[]>([]);
    const [flipShockFlights, setFlipShockFlights] = useState<DiscardShockFlight[]>([]);
    const [discardFlights, setDiscardFlights] = useState<DiscardFlight[]>([]);
    const [stealCardFlights, setStealCardFlights] = useState<DiscardFlight[]>([]);

    useImperativeHandle(
      ref,
      () => ({
        setClassDeckFlights,
        setFateSwapFlights,
        setGraveyardStackFlights,
        setBackpackHandFlights,
        setDiscardShockFlights,
        setFlipShockFlights,
        setDiscardFlights,
        setStealCardFlights,
      }),
      [],
    );

    return (
      <FlightOverlayLayer
        classDeckFlights={classDeckFlights}
        discardFlights={discardFlights}
        stealCardFlights={stealCardFlights}
        backpackHandFlights={backpackHandFlights}
        discardShockFlights={discardShockFlights}
        flipShockFlights={flipShockFlights}
        directedCombatFxFlights={directedCombatFxFlights}
        fateSwapFlights={fateSwapFlights}
        graveyardStackFlights={graveyardStackFlights}
        gridCardSize={gridCardSize}
        classDeckFlightElementMapRef={classDeckFlightElementMapRef}
        discardFlightElementMapRef={discardFlightElementMapRef}
        stealCardFlightElementMapRef={stealCardFlightElementMapRef}
        backpackFlightElementMapRef={backpackFlightElementMapRef}
        discardShockElementMapRef={discardShockElementMapRef}
        flipShockElementMapRef={flipShockElementMapRef}
        directedCombatFxElementMapRef={directedCombatFxElementMapRef}
        fateSwapFlightElementMapRef={fateSwapFlightElementMapRef}
        graveyardStackFlightElementMapRef={graveyardStackFlightElementMapRef}
      />
    );
  },
);

export default FlightOverlayContainer;
