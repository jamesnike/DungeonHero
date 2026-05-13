/**
 * FlightOverlayLayer — renders all in-flight card/projectile animations.
 *
 * Covers: class-deck flights, discard flights, steal-card flights,
 * backpack-hand flights, discard-shock flights, directed combat FX,
 * fate-swap flights, and graveyard-stack flights.
 *
 * Pure presentational — no game state subscription.
 */

import { memo, type MutableRefObject } from 'react';
import GameCard from '@/components/GameCard';
import type {
  ClassDeckFlight,
  DiscardFlight,
  BackpackHandFlight,
  DiscardShockFlight,
  DirectedCombatFxFlight,
  FateSwapFlight,
  GraveyardStackFlight,
} from '@/components/game-board/types';

const DISCARD_SHOCK_PROJECTILE_SIZE = 56;
const DIRECTED_REFLECT_PROJECTILE_SIZE = 50;
const DIRECTED_RETALIATION_PROJECTILE_SIZE = 52;
const DIRECTED_ARCANE_PROJECTILE_SIZE = 44;
// Golem 反震 shockwave: rendered as an EXPANDING RING centered on Golem cell
// (no projectile travel). Base size is the at-rest ring diameter; the
// per-flight `ringScale` (typically ~3.4–4.0) inflates it to the peak so the
// wave visibly engulfs adjacent cells. Distinct from the old projectile
// (which used to fly Golem→Hero) — see useDirectedCombatFx.ts for animation.
const DIRECTED_GOLEM_SHOCKWAVE_BASE_SIZE = 96;
const DIRECTED_DRAGON_BREATH_PROJECTILE_SIZE = 50;
const DIRECTED_MISSILE_STORM_PROJECTILE_SIZE = 38;

export interface FlightOverlayLayerProps {
  classDeckFlights: ClassDeckFlight[];
  discardFlights: DiscardFlight[];
  stealCardFlights: DiscardFlight[];
  backpackHandFlights: BackpackHandFlight[];
  discardShockFlights: DiscardShockFlight[];
  /** 弧能之符 (flip-zap) projectiles. Same shape as discard-shock flights, but
   *  rendered with a distinct cyan/blue tint to differentiate. */
  flipShockFlights: DiscardShockFlight[];
  directedCombatFxFlights: DirectedCombatFxFlight[];
  fateSwapFlights: FateSwapFlight[];
  graveyardStackFlights: GraveyardStackFlight[];
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

function FlightOverlayLayerInner({
  classDeckFlights,
  discardFlights,
  stealCardFlights,
  backpackHandFlights,
  discardShockFlights,
  flipShockFlights,
  directedCombatFxFlights,
  fateSwapFlights,
  graveyardStackFlights,
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
}: FlightOverlayLayerProps) {
  const cardWidth = gridCardSize?.width ?? 140;
  const cardHeight = gridCardSize?.height ?? 210;

  return (
    <>
      {classDeckFlights.length > 0 && (
        <div className="pointer-events-none absolute inset-0 z-20">
          {classDeckFlights.map(flight => (
            <div
              key={flight.id}
              ref={el => {
                if (el) classDeckFlightElementMapRef.current.set(flight.id, el);
                else classDeckFlightElementMapRef.current.delete(flight.id);
              }}
              className="absolute class-flight-card"
              style={{
                width: cardWidth,
                height: cardHeight,
                opacity: 0,
                willChange: 'transform, opacity',
                contain: 'layout style',
              }}
            >
              <GameCard card={flight.card} disableInteractions />
            </div>
          ))}
        </div>
      )}

      {discardFlights.length > 0 && (
        <div className="pointer-events-none absolute inset-0 z-30">
          {discardFlights.map(flight => (
            <div
              key={flight.id}
              ref={el => {
                if (el) discardFlightElementMapRef.current.set(flight.id, el);
                else discardFlightElementMapRef.current.delete(flight.id);
              }}
              className="absolute"
              style={{
                width: cardWidth,
                height: cardHeight,
                opacity: 0,
                willChange: 'transform, opacity',
                contain: 'layout style',
              }}
            >
              <GameCard card={flight.card} disableInteractions />
            </div>
          ))}
        </div>
      )}

      {stealCardFlights.length > 0 && (
        <div className="pointer-events-none absolute inset-0 z-[31]">
          {stealCardFlights.map(flight => (
            <div
              key={flight.id}
              ref={el => {
                if (el) stealCardFlightElementMapRef.current.set(flight.id, el);
                else stealCardFlightElementMapRef.current.delete(flight.id);
              }}
              className="absolute"
              style={{
                width: cardWidth,
                height: cardHeight,
                opacity: 0,
                willChange: 'transform, opacity',
                contain: 'layout style',
              }}
            >
              <GameCard card={flight.card} disableInteractions />
            </div>
          ))}
        </div>
      )}

      {backpackHandFlights.length > 0 && (
        <div className="pointer-events-none absolute inset-0 z-30">
          {backpackHandFlights.map(flight => (
            <div
              key={flight.id}
              ref={el => {
                if (el) backpackFlightElementMapRef.current.set(flight.id, el);
                else backpackFlightElementMapRef.current.delete(flight.id);
              }}
              className="absolute"
              style={{
                width: cardWidth,
                height: cardHeight,
                opacity: 0,
                willChange: 'transform, opacity',
                contain: 'layout style',
              }}
            >
              <GameCard card={flight.card} disableInteractions />
            </div>
          ))}
        </div>
      )}

      {discardShockFlights.length > 0 && (
        <div className="pointer-events-none absolute inset-0 z-[35]">
          {discardShockFlights.map(flight => (
            <div
              key={flight.id}
              ref={el => {
                if (el) discardShockElementMapRef.current.set(flight.id, el);
                else discardShockElementMapRef.current.delete(flight.id);
              }}
              className="absolute rounded-full border-2 border-amber-300/90 bg-amber-500/20 shadow-[0_0_16px_rgba(251,191,36,0.9)] overflow-hidden ring-2 ring-yellow-200/40"
              style={{
                width: DISCARD_SHOCK_PROJECTILE_SIZE,
                height: DISCARD_SHOCK_PROJECTILE_SIZE,
                opacity: 0,
                willChange: 'transform, opacity',
                contain: 'layout style',
              }}
            >
              {flight.projectileImage ? (
                <img src={flight.projectileImage} alt="" className="h-full w-full object-cover" draggable={false} />
              ) : (
                <div className="h-full w-full bg-gradient-to-br from-amber-200 via-yellow-400 to-amber-600" />
              )}
            </div>
          ))}
        </div>
      )}

      {flipShockFlights.length > 0 && (
        <div className="pointer-events-none absolute inset-0 z-[35]">
          {flipShockFlights.map(flight => (
            <div
              key={flight.id}
              ref={el => {
                if (el) flipShockElementMapRef.current.set(flight.id, el);
                else flipShockElementMapRef.current.delete(flight.id);
              }}
              className="absolute rounded-full border-2 border-cyan-300/90 bg-cyan-500/20 shadow-[0_0_16px_rgba(34,211,238,0.9)] overflow-hidden ring-2 ring-blue-200/40"
              style={{
                width: DISCARD_SHOCK_PROJECTILE_SIZE,
                height: DISCARD_SHOCK_PROJECTILE_SIZE,
                opacity: 0,
                willChange: 'transform, opacity',
                contain: 'layout style',
              }}
            >
              {flight.projectileImage ? (
                <img src={flight.projectileImage} alt="" className="h-full w-full object-cover" draggable={false} />
              ) : (
                <div className="h-full w-full bg-gradient-to-br from-cyan-200 via-sky-400 to-blue-600" />
              )}
            </div>
          ))}
        </div>
      )}

      {directedCombatFxFlights.length > 0 && (
        <div className="pointer-events-none absolute inset-0 z-[36]">
          {directedCombatFxFlights.map(flight => {
            const sz =
              flight.kind === 'shield-reflect'
                ? DIRECTED_REFLECT_PROJECTILE_SIZE
                : flight.kind === 'arcane-blade-spell'
                  ? DIRECTED_ARCANE_PROJECTILE_SIZE
                  : flight.kind === 'golem-shockwave'
                    ? DIRECTED_GOLEM_SHOCKWAVE_BASE_SIZE
                    : flight.kind === 'dragon-breath'
                      ? DIRECTED_DRAGON_BREATH_PROJECTILE_SIZE
                      : flight.kind === 'missile-storm'
                        ? DIRECTED_MISSILE_STORM_PROJECTILE_SIZE
                        : DIRECTED_RETALIATION_PROJECTILE_SIZE;
            const isReflect = flight.kind === 'shield-reflect';
            const isArcane = flight.kind === 'arcane-blade-spell';
            const isGolemShockwave = flight.kind === 'golem-shockwave';
            const isDragonBreath = flight.kind === 'dragon-breath';
            const isMissileStorm = flight.kind === 'missile-storm';
            // Golem shockwave is rendered as a HOLLOW expanding ring — thick
            // amber/stone border, transparent center, multiple drop-shadows
            // for a "stone slamming outward" feel. Distinct from every other
            // directed FX (which are filled circular projectiles).
            return (
              <div
                key={flight.id}
                ref={el => {
                  if (el) directedCombatFxElementMapRef.current.set(flight.id, el);
                  else directedCombatFxElementMapRef.current.delete(flight.id);
                }}
                className={
                  isGolemShockwave
                    ? 'absolute rounded-full border-[6px] border-amber-400/90 bg-transparent shadow-[0_0_36px_12px_rgba(251,191,36,0.55),inset_0_0_28px_8px_rgba(120,83,50,0.65)] ring-4 ring-stone-300/40'
                    : isMissileStorm
                      ? 'absolute rounded-full border-2 border-sky-300/95 bg-gradient-to-br from-cyan-200/95 via-sky-400/90 to-indigo-600/95 shadow-[0_0_18px_rgba(56,189,248,0.95)] ring-2 ring-cyan-100/55'
                      : isDragonBreath
                        ? 'absolute rounded-full border-2 border-orange-500/95 bg-gradient-to-br from-yellow-300/95 via-orange-500/90 to-red-700/95 shadow-[0_0_22px_rgba(249,115,22,0.95)] ring-2 ring-yellow-200/50'
                        : isArcane
                          ? 'absolute rounded-full border-2 border-purple-400/95 bg-gradient-to-br from-violet-300/95 via-purple-500/90 to-indigo-700/90 shadow-[0_0_20px_rgba(139,92,246,0.95)] ring-2 ring-purple-200/50'
                          : isReflect
                            ? 'absolute rounded-full border-2 border-amber-400/95 bg-gradient-to-br from-amber-200/95 via-yellow-400/90 to-orange-500/90 shadow-[0_0_18px_rgba(251,191,36,0.95)] ring-2 ring-amber-100/50'
                            : 'absolute rounded-full border-2 border-rose-800/95 bg-gradient-to-br from-rose-300/95 via-red-600/90 to-red-950/95 shadow-[0_0_22px_rgba(220,38,38,0.85)] ring-2 ring-rose-200/45'
                }
                style={{
                  width: sz,
                  height: sz,
                  opacity: 0,
                  willChange: 'transform, opacity',
                  contain: 'layout style',
                }}
              />
            );
          })}
        </div>
      )}

      {fateSwapFlights.length > 0 && (
        <div className="pointer-events-none absolute inset-0 z-[37]">
          {fateSwapFlights.map(flight => (
            <div
              key={flight.id}
              ref={el => {
                if (el) fateSwapFlightElementMapRef.current.set(flight.id, el);
                else fateSwapFlightElementMapRef.current.delete(flight.id);
              }}
              className="absolute fate-swap-flight-card"
              style={{
                width: cardWidth,
                height: cardHeight,
                opacity: 0,
                willChange: 'transform, opacity',
                contain: 'layout style',
              }}
            >
              <GameCard card={flight.card} disableInteractions />
            </div>
          ))}
        </div>
      )}

      {graveyardStackFlights.length > 0 && (
        <div className="pointer-events-none absolute inset-0 z-[38]">
          {graveyardStackFlights.map(flight => (
            <div
              key={flight.id}
              ref={el => {
                if (el) graveyardStackFlightElementMapRef.current.set(flight.id, el);
                else graveyardStackFlightElementMapRef.current.delete(flight.id);
              }}
              className="absolute"
              style={{
                width: cardWidth,
                height: cardHeight,
                opacity: 0,
                willChange: 'transform, opacity',
                contain: 'layout style',
                filter: 'drop-shadow(0 0 8px rgba(139, 92, 246, 0.7))',
              }}
            >
              <GameCard card={flight.card} disableInteractions />
            </div>
          ))}
        </div>
      )}
    </>
  );
}

export default memo(FlightOverlayLayerInner);
