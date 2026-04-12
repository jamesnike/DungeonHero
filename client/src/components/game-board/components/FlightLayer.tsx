/**
 * FlightLayer — renders all in-flight card animations.
 *
 * Covers: backpack draw flights, discard shock flights, and directed
 * combat FX flights (shield reflect, boss retaliation).
 */

import { memo } from 'react';
import GameCard from '@/components/GameCard';
import type { GameCardData } from '@/components/GameCard';

export interface BackpackFlight {
  id: string;
  card: GameCardData;
}

export interface DiscardShockFlight {
  id: string;
  projectileImage?: string;
}

export interface DirectedCombatFxFlight {
  id: string;
  kind: 'shield-reflect' | 'boss-retaliation' | 'arcane-blade-spell' | 'dragon-breath';
}

export interface FlightLayerProps {
  backpackFlights: BackpackFlight[];
  discardShockFlights: DiscardShockFlight[];
  directedCombatFxFlights: DirectedCombatFxFlight[];
  gridCardSize: { width: number; height: number } | null;
  discardShockProjectileSize: number;
  reflectProjectileSize: number;
  retaliationProjectileSize: number;
  backpackFlightElementMapRef: React.MutableRefObject<Map<string, HTMLDivElement>>;
  discardShockElementMapRef: React.MutableRefObject<Map<string, HTMLDivElement>>;
  directedCombatFxElementMapRef: React.MutableRefObject<Map<string, HTMLDivElement>>;
}

function FlightLayerInner({
  backpackFlights,
  discardShockFlights,
  directedCombatFxFlights,
  gridCardSize,
  discardShockProjectileSize,
  reflectProjectileSize,
  retaliationProjectileSize,
  backpackFlightElementMapRef,
  discardShockElementMapRef,
  directedCombatFxElementMapRef,
}: FlightLayerProps) {
  const cardWidth = gridCardSize?.width ?? 140;
  const cardHeight = gridCardSize?.height ?? 210;

  return (
    <>
      {backpackFlights.length > 0 && (
        <div className="pointer-events-none absolute inset-0 z-[34]">
          {backpackFlights.map((flight) => (
            <div
              key={flight.id}
              ref={(el) => {
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
          {discardShockFlights.map((flight) => (
            <div
              key={flight.id}
              ref={(el) => {
                if (el) discardShockElementMapRef.current.set(flight.id, el);
                else discardShockElementMapRef.current.delete(flight.id);
              }}
              className="absolute rounded-full border-2 border-amber-300/90 bg-amber-500/20 shadow-[0_0_16px_rgba(251,191,36,0.9)] overflow-hidden ring-2 ring-yellow-200/40"
              style={{
                width: discardShockProjectileSize,
                height: discardShockProjectileSize,
                opacity: 0,
                willChange: 'transform, opacity',
                contain: 'layout style',
              }}
            >
              {flight.projectileImage ? (
                <img
                  src={flight.projectileImage}
                  alt=""
                  className="h-full w-full object-cover"
                  draggable={false}
                />
              ) : (
                <div className="h-full w-full bg-gradient-to-br from-amber-200 via-yellow-400 to-amber-600" />
              )}
            </div>
          ))}
        </div>
      )}

      {directedCombatFxFlights.length > 0 && (
        <div className="pointer-events-none absolute inset-0 z-[36]">
          {directedCombatFxFlights.map((flight) => {
            const sz =
              flight.kind === 'shield-reflect'
                ? reflectProjectileSize
                : flight.kind === 'arcane-blade-spell'
                  ? Math.round(reflectProjectileSize * 0.88)
                  : retaliationProjectileSize;
            const isReflect = flight.kind === 'shield-reflect';
            const isArcane = flight.kind === 'arcane-blade-spell';
            return (
              <div
                key={flight.id}
                ref={(el) => {
                  if (el) directedCombatFxElementMapRef.current.set(flight.id, el);
                  else directedCombatFxElementMapRef.current.delete(flight.id);
                }}
                className={
                  isArcane
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
    </>
  );
}

export default memo(FlightLayerInner);
