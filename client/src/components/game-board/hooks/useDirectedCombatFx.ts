import { useCallback, useEffect, useRef, useState, type RefObject } from 'react';
import { clamp, easeInOutCubic } from '@/components/game-board/utils';
import type { DirectedCombatFxFlight, EquipmentSlotId, Point } from '../types';

const DIRECTED_REFLECT_PROJECTILE_SIZE = 50;
const DIRECTED_RETALIATION_PROJECTILE_SIZE = 52;
const DIRECTED_ARCANE_PROJECTILE_SIZE = 44;
const DIRECTED_GOLEM_LAYER_PROJECTILE_SIZE = 48;
const DIRECTED_DRAGON_BREATH_PROJECTILE_SIZE = 50;
const DIRECTED_MISSILE_STORM_PROJECTILE_SIZE = 38;
const ARCANE_BLADE_SPELL_ANIM_MS = 780;
const DRAGON_BREATH_ANIM_MS = 880;
const SHIELD_REFLECT_ANIM_MS = 1020;
const BOSS_RETALIATION_ANIM_MS = 920;
const GOLEM_LAYER_REFLECT_ANIM_MS = 850;
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
  tryStartGolemLayerReflectFx: (monsterId: string) => boolean;
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
            : flight.kind === 'golem-layer-reflect'
              ? DIRECTED_GOLEM_LAYER_PROJECTILE_SIZE
              : flight.kind === 'dragon-breath'
                ? DIRECTED_DRAGON_BREATH_PROJECTILE_SIZE
                : flight.kind === 'missile-storm'
                  ? DIRECTED_MISSILE_STORM_PROJECTILE_SIZE
                  : DIRECTED_RETALIATION_PROJECTILE_SIZE;
      const el = directedCombatFxElementMapRef.current.get(flight.id);
      if (el) {
        const eased = easeInOutCubic(clamp(progress));
        const x = flight.start.x + (flight.end.x - flight.start.x) * eased;
        const linearY = flight.start.y + (flight.end.y - flight.start.y) * eased;
        const arcOffset = Math.sin(Math.PI * eased) * flight.arcHeight;
        const y = linearY - arcOffset;
        const isArcane = flight.kind === 'arcane-blade-spell';
        const isMissileStorm = flight.kind === 'missile-storm';
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

  const tryStartGolemLayerReflectFx = useCallback(
    (monsterId: string): boolean => {
      if (typeof window === 'undefined') return false;
      const monsterCell = refs.monsterCellRefs.current[monsterId];
      const heroCell = refs.heroRowCellRefs.current[HERO_ROW_HERO_INDEX];
      if (!monsterCell || !heroCell) return false;
      const pts = computeFlightEndpoints(monsterCell, heroCell, 10);
      if (!pts) return false;
      pushFlight({
        id: `golem-layer-reflect-${monsterId}-${performance.now()}`,
        kind: 'golem-layer-reflect',
        start: pts.start,
        end: pts.end,
        startTime: performance.now(),
        duration: animSpeed(Math.max(320, GOLEM_LAYER_REFLECT_ANIM_MS - 60 + Math.random() * 40)),
        progress: 0,
        arcHeight: 40 + Math.random() * 48,
      });
      return true;
    },
    [computeFlightEndpoints, pushFlight, animSpeed, refs.monsterCellRefs, refs.heroRowCellRefs],
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
    tryStartGolemLayerReflectFx,
    tryStartArcaneBladeSpellFx,
    tryStartDragonBreathFx,
    tryStartMissileStormFx,
    setDirectedCombatFxFlights,
  };
}
