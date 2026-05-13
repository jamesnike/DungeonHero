import { useCallback, useEffect, useRef, useState, type RefObject } from 'react';
import { clamp, easeInOutCubic } from '@/components/game-board/utils';
import type { DirectedCombatFxFlight, EquipmentSlotId, Point } from '../types';

const DIRECTED_REFLECT_PROJECTILE_SIZE = 50;
const DIRECTED_RETALIATION_PROJECTILE_SIZE = 52;
const DIRECTED_ARCANE_PROJECTILE_SIZE = 44;
// Golem 反震 shockwave: base ring diameter; ringScale (per-flight) inflates
// it to ~3.6× peak so the wave visibly engulfs adjacent cells.
const DIRECTED_GOLEM_SHOCKWAVE_BASE_SIZE = 96;
const DIRECTED_DRAGON_BREATH_PROJECTILE_SIZE = 50;
const DIRECTED_MISSILE_STORM_PROJECTILE_SIZE = 38;
const ARCANE_BLADE_SPELL_ANIM_MS = 780;
const DRAGON_BREATH_ANIM_MS = 880;
const SHIELD_REFLECT_ANIM_MS = 1020;
const BOSS_RETALIATION_ANIM_MS = 920;
// Shockwave is shorter-lived than the old projectile (it expands & fades fast).
const GOLEM_SHOCKWAVE_ANIM_MS = 720;
// Visual sequencing: the user-reported bug was that the reflect animation
// fired SIMULTANEOUSLY with the shield-break animation, making it look like
// the reflect was hitting the broken shield slot. The Golem 反震 shockwave is
// now intentionally delayed by this many ms after the `combat:golemReflect`
// event arrives — the gap matches the typical shield-break dissolve duration
// (~500–600ms) so the shield visibly disappears FIRST, then the shockwave
// erupts from the Golem cell.
export const GOLEM_SHOCKWAVE_TRIGGER_DELAY_MS = 600;
const MISSILE_STORM_ANIM_MS = 520;

const HERO_ROW_EQUIPMENT_1_INDEX = 1;
const HERO_ROW_HERO_INDEX = 2;
const HERO_ROW_EQUIPMENT_2_INDEX = 3;

export interface DirectedCombatFxRefs {
  gameSurfaceRef: RefObject<HTMLDivElement | null>;
  heroRowCellRefs: React.MutableRefObject<Array<HTMLDivElement | null>>;
  monsterCellRefs: React.MutableRefObject<Record<string, HTMLDivElement | null>>;
}

export interface DirectedCombatFxResult {
  directedCombatFxFlights: DirectedCombatFxFlight[];
  directedCombatFxFlightsRef: React.MutableRefObject<DirectedCombatFxFlight[]>;
  directedCombatFxElementMapRef: React.MutableRefObject<Map<string, HTMLDivElement>>;
  directedCombatFxFlightAnimationRef: React.MutableRefObject<number | null>;
  tryStartShieldReflectDirectedFx: (slotId: EquipmentSlotId, monsterId: string) => boolean;
  tryStartBossRetaliationDirectedFx: (monsterId: string) => boolean;
  tryStartGolemShockwaveFx: (monsterId: string) => boolean;
  tryStartArcaneBladeSpellFx: (slotId: EquipmentSlotId, monsterId: string) => boolean;
  tryStartDragonBreathFx: (monsterId: string, targetSlotId: EquipmentSlotId | 'hero') => boolean;
  tryStartMissileStormFx: (monsterId: string) => boolean;
  setDirectedCombatFxFlights: React.Dispatch<React.SetStateAction<DirectedCombatFxFlight[]>>;
}

export function useDirectedCombatFx(
  refs: DirectedCombatFxRefs,
  animSpeed: (ms: number) => number,
): DirectedCombatFxResult {
  const directedCombatFxFlightsRef = useRef<DirectedCombatFxFlight[]>([]);
  const directedCombatFxElementMapRef = useRef<Map<string, HTMLDivElement>>(new Map());
  const directedCombatFxFlightAnimationRef = useRef<number | null>(null);

  const [directedCombatFxFlights, setDirectedCombatFxFlights] = useState<DirectedCombatFxFlight[]>([]);

  const updateDirectedCombatFxFlightAnimation = useCallback((timestamp: number) => {
    const flights = directedCombatFxFlightsRef.current;
    if (!flights.length) {
      directedCombatFxFlightAnimationRef.current = null;
      return;
    }
    for (let i = 0; i < flights.length; i++) {
      const flight = flights[i];
      const elapsed = timestamp - flight.startTime;
      const progress = elapsed < 0 ? 0 : clamp(elapsed / flight.duration);
      flight.progress = progress;
      const projectileSize =
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
      const el = directedCombatFxElementMapRef.current.get(flight.id);
      if (el) {
        const eased = easeInOutCubic(clamp(progress));
        const isArcane = flight.kind === 'arcane-blade-spell';
        const isMissileStorm = flight.kind === 'missile-storm';
        const isGolemShockwave = flight.kind === 'golem-shockwave';

        if (isGolemShockwave) {
          // Shockwave: ring stays centered on Golem cell (no translation),
          // expands outward with linear scale (eased growth feels too soft —
          // sqrt makes it explode out fast then settle), peaks early, then
          // fades to transparent.
          const peakScale = flight.ringScale ?? 3.6;
          const expansion = Math.sqrt(progress); // 0 → 1, fast at start
          const scale = 0.25 + (peakScale - 0.25) * expansion;
          // Opacity profile: punch-in (first 8%), full hold (8–35%), long
          // fade out (35–100%). Long fade lets the ring's silhouette persist
          // visually even as the wave physically expands past the screen.
          const fadeIn = progress < 0.08 ? clamp(progress / 0.08) : 1;
          const fadeOut = progress > 0.35 ? clamp(1 - (progress - 0.35) / 0.65) : 1;
          // Centered: no path translation, just keep at start point.
          const x = flight.start.x;
          const y = flight.start.y;
          el.style.transform = `translate(${x - projectileSize / 2}px, ${y - projectileSize / 2}px) scale(${scale})`;
          el.style.opacity = String(fadeIn * fadeOut);
        } else {
          const x = flight.start.x + (flight.end.x - flight.start.x) * eased;
          const linearY = flight.start.y + (flight.end.y - flight.start.y) * eased;
          const arcOffset = Math.sin(Math.PI * eased) * flight.arcHeight;
          const y = linearY - arcOffset;
          const scale = isArcane
            ? 0.6 + eased * 0.5
            : isMissileStorm
              ? 0.55 + eased * 0.5
              : 0.78 + eased * 0.35;
          const fadeIn = eased < 0.08 ? clamp(eased / 0.08) : 1;
          const fadeOut = eased > 0.88 ? clamp(1 - (eased - 0.88) / 0.12) : 1;
          el.style.transform = `translate(${x - projectileSize / 2}px, ${y - projectileSize / 2}px) scale(${scale})`;
          el.style.opacity = String(fadeIn * fadeOut);
        }
      }
    }
    const remaining = flights.filter(f => f.progress < 1);
    if (remaining.length !== flights.length) {
      directedCombatFxFlightsRef.current = remaining;
      setDirectedCombatFxFlights(remaining);
    }
    if (remaining.length > 0) {
      directedCombatFxFlightAnimationRef.current = window.requestAnimationFrame(updateDirectedCombatFxFlightAnimation);
    } else {
      directedCombatFxFlightAnimationRef.current = null;
    }
  }, []);

  const startDirectedCombatFxFlightAnimation = useCallback(() => {
    if (typeof window === 'undefined') return;
    if (directedCombatFxFlightAnimationRef.current !== null) return;
    directedCombatFxFlightAnimationRef.current = window.requestAnimationFrame(updateDirectedCombatFxFlightAnimation);
  }, [updateDirectedCombatFxFlightAnimation]);

  useEffect(() => {
    return () => {
      if (directedCombatFxFlightAnimationRef.current !== null) {
        cancelAnimationFrame(directedCombatFxFlightAnimationRef.current);
      }
    };
  }, []);

  const computeFlightEndpoints = useCallback(
    (sourceEl: HTMLElement, targetEl: HTMLElement, jitter = 10): { start: Point; end: Point } | null => {
      const surfaceEl = refs.gameSurfaceRef.current;
      if (!surfaceEl) return null;
      const surfaceRect = surfaceEl.getBoundingClientRect();
      const startRect = sourceEl.getBoundingClientRect();
      const endRect = targetEl.getBoundingClientRect();
      return {
        start: {
          x: startRect.left + startRect.width / 2 - surfaceRect.left + (Math.random() - 0.5) * jitter,
          y: startRect.top + startRect.height / 2 - surfaceRect.top + (Math.random() - 0.5) * jitter,
        },
        end: {
          x: endRect.left + endRect.width / 2 - surfaceRect.left + (Math.random() - 0.5) * jitter,
          y: endRect.top + endRect.height / 2 - surfaceRect.top + (Math.random() - 0.5) * jitter,
        },
      };
    },
    [refs.gameSurfaceRef],
  );

  const pushFlight = useCallback(
    (flight: DirectedCombatFxFlight) => {
      directedCombatFxFlightsRef.current = [...directedCombatFxFlightsRef.current, flight];
      setDirectedCombatFxFlights(directedCombatFxFlightsRef.current);
      startDirectedCombatFxFlightAnimation();
    },
    [startDirectedCombatFxFlightAnimation],
  );

  const tryStartShieldReflectDirectedFx = useCallback(
    (slotId: EquipmentSlotId, monsterId: string): boolean => {
      if (typeof window === 'undefined') return false;
      const equipIdx = slotId === 'equipmentSlot1' ? HERO_ROW_EQUIPMENT_1_INDEX : HERO_ROW_EQUIPMENT_2_INDEX;
      const equipCell = refs.heroRowCellRefs.current[equipIdx];
      const monsterCell = refs.monsterCellRefs.current[monsterId];
      if (!equipCell || !monsterCell) return false;
      const pts = computeFlightEndpoints(equipCell, monsterCell, 8);
      if (!pts) return false;
      pushFlight({
        id: `shield-reflect-${monsterId}-${performance.now()}`,
        kind: 'shield-reflect',
        start: pts.start,
        end: pts.end,
        startTime: performance.now(),
        duration: animSpeed(Math.max(380, SHIELD_REFLECT_ANIM_MS - 80 + Math.random() * 60)),
        progress: 0,
        arcHeight: 32 + Math.random() * 48,
      });
      return true;
    },
    [computeFlightEndpoints, pushFlight, animSpeed, refs.heroRowCellRefs, refs.monsterCellRefs],
  );

  const tryStartBossRetaliationDirectedFx = useCallback(
    (monsterId: string): boolean => {
      if (typeof window === 'undefined') return false;
      const monsterCell = refs.monsterCellRefs.current[monsterId];
      const heroCell = refs.heroRowCellRefs.current[HERO_ROW_HERO_INDEX];
      if (!monsterCell || !heroCell) return false;
      const pts = computeFlightEndpoints(monsterCell, heroCell, 10);
      if (!pts) return false;
      pushFlight({
        id: `boss-retaliation-${monsterId}-${performance.now()}`,
        kind: 'boss-retaliation',
        start: pts.start,
        end: pts.end,
        startTime: performance.now(),
        duration: animSpeed(Math.max(360, BOSS_RETALIATION_ANIM_MS - 80 + Math.random() * 50)),
        progress: 0,
        arcHeight: 36 + Math.random() * 52,
      });
      return true;
    },
    [computeFlightEndpoints, pushFlight, animSpeed, refs.monsterCellRefs, refs.heroRowCellRefs],
  );

  /**
   * Golem 反震 shockwave: a circular shock ring that EXPANDS in place from the
   * Golem cell — it does not travel toward the hero. Visually distinct from
   * the projectile-style boss-retaliation / shield-reflect arcs, conveying
   * the "pulse of stone-energy radiating outward" semantic of 反震 (counter-
   * shock). The hero/shield damage is settled by the reducer; this animation
   * is purely cosmetic.
   *
   * Caller (`useCombatActions` listener for 'combat:golemReflect') typically
   * wraps this in a `setTimeout(..., GOLEM_SHOCKWAVE_TRIGGER_DELAY_MS)` so it
   * fires AFTER the shield-break animation finishes — addressing the user-
   * reported visual bug where the reflect appeared to "still hit the broken
   * shield" because both animations played simultaneously.
   */
  const tryStartGolemShockwaveFx = useCallback(
    (monsterId: string): boolean => {
      if (typeof window === 'undefined') return false;
      const monsterCell = refs.monsterCellRefs.current[monsterId];
      if (!monsterCell) return false;
      // Anchor on Golem cell only — start === end (shockwave doesn't travel).
      const surfaceEl = refs.gameSurfaceRef.current;
      if (!surfaceEl) return false;
      const surfaceRect = surfaceEl.getBoundingClientRect();
      const startRect = monsterCell.getBoundingClientRect();
      const center = {
        x: startRect.left + startRect.width / 2 - surfaceRect.left,
        y: startRect.top + startRect.height / 2 - surfaceRect.top,
      };
      pushFlight({
        id: `golem-shockwave-${monsterId}-${performance.now()}`,
        kind: 'golem-shockwave',
        start: center,
        end: center,
        startTime: performance.now(),
        duration: animSpeed(Math.max(420, GOLEM_SHOCKWAVE_ANIM_MS - 40 + Math.random() * 60)),
        progress: 0,
        arcHeight: 0,
        ringScale: 3.4 + Math.random() * 0.6,
      });
      return true;
    },
    [pushFlight, animSpeed, refs.monsterCellRefs, refs.gameSurfaceRef],
  );

  const tryStartArcaneBladeSpellFx = useCallback(
    (slotId: EquipmentSlotId, monsterId: string): boolean => {
      if (typeof window === 'undefined') return false;
      const equipIdx = slotId === 'equipmentSlot1' ? HERO_ROW_EQUIPMENT_1_INDEX : HERO_ROW_EQUIPMENT_2_INDEX;
      const equipCell = refs.heroRowCellRefs.current[equipIdx];
      const monsterCell = refs.monsterCellRefs.current[monsterId];
      if (!equipCell || !monsterCell) return false;
      const pts = computeFlightEndpoints(equipCell, monsterCell, 6);
      if (!pts) return false;
      pushFlight({
        id: `arcane-blade-spell-${monsterId}-${performance.now()}`,
        kind: 'arcane-blade-spell',
        start: pts.start,
        end: pts.end,
        startTime: performance.now(),
        duration: animSpeed(Math.max(350, ARCANE_BLADE_SPELL_ANIM_MS - 60 + Math.random() * 50)),
        progress: 0,
        arcHeight: 28 + Math.random() * 40,
      });
      return true;
    },
    [computeFlightEndpoints, pushFlight, animSpeed, refs.heroRowCellRefs, refs.monsterCellRefs],
  );

  const tryStartMissileStormFx = useCallback(
    (monsterId: string): boolean => {
      if (typeof window === 'undefined') return false;
      const monsterCell = refs.monsterCellRefs.current[monsterId];
      const heroCell = refs.heroRowCellRefs.current[HERO_ROW_HERO_INDEX];
      if (!monsterCell || !heroCell) return false;
      const pts = computeFlightEndpoints(heroCell, monsterCell, 14);
      if (!pts) return false;
      pushFlight({
        id: `missile-storm-${monsterId}-${performance.now()}-${Math.random().toString(36).slice(2, 7)}`,
        kind: 'missile-storm',
        start: pts.start,
        end: pts.end,
        startTime: performance.now(),
        duration: animSpeed(Math.max(280, MISSILE_STORM_ANIM_MS - 60 + Math.random() * 80)),
        progress: 0,
        arcHeight: 24 + Math.random() * 36,
      });
      return true;
    },
    [computeFlightEndpoints, pushFlight, animSpeed, refs.heroRowCellRefs, refs.monsterCellRefs],
  );

  const tryStartDragonBreathFx = useCallback(
    (monsterId: string, targetSlotId: EquipmentSlotId | 'hero'): boolean => {
      if (typeof window === 'undefined') return false;
      const monsterCell = refs.monsterCellRefs.current[monsterId];
      const targetIdx =
        targetSlotId === 'hero'
          ? HERO_ROW_HERO_INDEX
          : targetSlotId === 'equipmentSlot1'
            ? HERO_ROW_EQUIPMENT_1_INDEX
            : HERO_ROW_EQUIPMENT_2_INDEX;
      const targetCell = refs.heroRowCellRefs.current[targetIdx];
      if (!monsterCell || !targetCell) return false;
      const pts = computeFlightEndpoints(monsterCell, targetCell, 10);
      if (!pts) return false;
      pushFlight({
        id: `dragon-breath-${monsterId}-${performance.now()}`,
        kind: 'dragon-breath',
        start: pts.start,
        end: pts.end,
        startTime: performance.now(),
        duration: animSpeed(Math.max(360, DRAGON_BREATH_ANIM_MS - 80 + Math.random() * 50)),
        progress: 0,
        arcHeight: 36 + Math.random() * 48,
      });
      return true;
    },
    [computeFlightEndpoints, pushFlight, animSpeed, refs.monsterCellRefs, refs.heroRowCellRefs],
  );

  return {
    directedCombatFxFlights,
    directedCombatFxFlightsRef,
    directedCombatFxElementMapRef,
    directedCombatFxFlightAnimationRef,
    tryStartShieldReflectDirectedFx,
    tryStartBossRetaliationDirectedFx,
    tryStartGolemShockwaveFx,
    tryStartArcaneBladeSpellFx,
    tryStartDragonBreathFx,
    tryStartMissileStormFx,
    setDirectedCombatFxFlights,
  };
}
