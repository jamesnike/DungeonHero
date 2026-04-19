import { useCallback, useEffect, useRef } from 'react';
import type { EquipmentSlotId } from '../types';

const COMBAT_ANIMATION_DURATION = 1200;
const COMBAT_ANIMATION_STAGGER = 180;

export interface CombatAnimationSetters {
  setHeroBleedActive: React.Dispatch<React.SetStateAction<boolean>>;
  setMonsterBleedStates: React.Dispatch<React.SetStateAction<Record<string, number>>>;
  setMonsterHealStates: React.Dispatch<React.SetStateAction<Record<string, number>>>;
  setWeaponSwingStates: React.Dispatch<React.SetStateAction<Record<EquipmentSlotId, number>>>;
  setShieldBlockStates: React.Dispatch<React.SetStateAction<Record<EquipmentSlotId, number>>>;
  setWeaponSwingVariant: React.Dispatch<React.SetStateAction<Record<EquipmentSlotId, 0 | 1>>>;
  setShieldBlockVariant: React.Dispatch<React.SetStateAction<Record<EquipmentSlotId, 0 | 1>>>;
}

export interface CombatAnimationTriggers {
  triggerHeroBleedAnimation: (delay?: number) => void;
  triggerMonsterBleedAnimation: (monsterId: string, delay?: number) => void;
  triggerMonsterHealAnimation: (monsterId: string, delay?: number) => void;
  triggerWeaponSwingAnimation: (slotId: EquipmentSlotId, delay?: number, options?: { echoes?: number }) => void;
  triggerShieldBlockAnimation: (slotId: EquipmentSlotId, delay?: number, options?: { echoes?: number }) => void;
  /** Refs exposed for reset/cleanup by GameBoard during game init / undo */
  animationDelayTimeoutsRef: React.MutableRefObject<ReturnType<typeof setTimeout>[]>;
  heroBleedTimeoutRef: React.MutableRefObject<ReturnType<typeof setTimeout> | null>;
  monsterBleedTimeoutsRef: React.MutableRefObject<Record<string, ReturnType<typeof setTimeout>[]>>;
  monsterHealTimeoutsRef: React.MutableRefObject<Record<string, ReturnType<typeof setTimeout>[]>>;
  weaponSwingTimeoutsRef: React.MutableRefObject<Record<EquipmentSlotId, ReturnType<typeof setTimeout>[]>>;
  shieldBlockTimeoutsRef: React.MutableRefObject<Record<EquipmentSlotId, ReturnType<typeof setTimeout>[]>>;
}

export function useCombatAnimationTriggers(
  setters: CombatAnimationSetters,
  animSpeed: (ms: number) => number,
): CombatAnimationTriggers {
  const animationDelayTimeoutsRef = useRef<ReturnType<typeof setTimeout>[]>([]);
  const heroBleedTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const monsterBleedTimeoutsRef = useRef<Record<string, ReturnType<typeof setTimeout>[]>>({});
  const monsterHealTimeoutsRef = useRef<Record<string, ReturnType<typeof setTimeout>[]>>({});
  const weaponSwingTimeoutsRef = useRef<Record<EquipmentSlotId, ReturnType<typeof setTimeout>[]>>({
    equipmentSlot1: [],
    equipmentSlot2: [],
  });
  const shieldBlockTimeoutsRef = useRef<Record<EquipmentSlotId, ReturnType<typeof setTimeout>[]>>({
    equipmentSlot1: [],
    equipmentSlot2: [],
  });

  const scheduleAnimationStart = useCallback((fn: () => void, delay = 0) => {
    const run = () => {
      if (typeof window !== 'undefined' && typeof window.requestAnimationFrame === 'function') {
        window.requestAnimationFrame(() => fn());
      } else {
        fn();
      }
    };
    if (delay <= 0) {
      run();
      return;
    }
    const timeoutId = setTimeout(() => {
      animationDelayTimeoutsRef.current = animationDelayTimeoutsRef.current.filter(id => id !== timeoutId);
      run();
    }, delay);
    animationDelayTimeoutsRef.current.push(timeoutId);
  }, []);

  const triggerHeroBleedAnimation = useCallback(
    (delay = 0) => {
      if (heroBleedTimeoutRef.current) {
        clearTimeout(heroBleedTimeoutRef.current);
        heroBleedTimeoutRef.current = null;
      }
      setters.setHeroBleedActive(false);
      const start = () => {
        setters.setHeroBleedActive(true);
        heroBleedTimeoutRef.current = setTimeout(() => {
          setters.setHeroBleedActive(false);
          heroBleedTimeoutRef.current = null;
        }, animSpeed(COMBAT_ANIMATION_DURATION));
      };
      scheduleAnimationStart(start, delay);
    },
    [scheduleAnimationStart, setters, animSpeed],
  );

  const triggerMonsterBleedAnimation = useCallback(
    (monsterId: string, delay = 0) => {
      if (!monsterId) return;
      scheduleAnimationStart(() => {
        setters.setMonsterBleedStates(prev => ({
          ...prev,
          [monsterId]: (prev[monsterId] ?? 0) + 1,
        }));
        const timeoutId = setTimeout(() => {
          setters.setMonsterBleedStates(prev => {
            const current = prev[monsterId];
            if (!current) return prev;
            if (current <= 1) {
              const next = { ...prev };
              delete next[monsterId];
              return next;
            }
            return { ...prev, [monsterId]: current - 1 };
          });
          monsterBleedTimeoutsRef.current[monsterId] =
            (monsterBleedTimeoutsRef.current[monsterId] || []).filter(id => id !== timeoutId);
          if (!monsterBleedTimeoutsRef.current[monsterId]?.length) {
            delete monsterBleedTimeoutsRef.current[monsterId];
          }
        }, animSpeed(COMBAT_ANIMATION_DURATION));
        monsterBleedTimeoutsRef.current[monsterId] = [
          ...(monsterBleedTimeoutsRef.current[monsterId] || []),
          timeoutId];
      }, delay);
    },
    [scheduleAnimationStart, setters, animSpeed],
  );

  const triggerMonsterHealAnimation = useCallback(
    (monsterId: string, delay = 0) => {
      if (!monsterId) return;
      scheduleAnimationStart(() => {
        setters.setMonsterHealStates(prev => ({
          ...prev,
          [monsterId]: (prev[monsterId] ?? 0) + 1,
        }));
        const timeoutId = setTimeout(() => {
          setters.setMonsterHealStates(prev => {
            const current = prev[monsterId];
            if (!current) return prev;
            if (current <= 1) {
              const next = { ...prev };
              delete next[monsterId];
              return next;
            }
            return { ...prev, [monsterId]: current - 1 };
          });
          monsterHealTimeoutsRef.current[monsterId] =
            (monsterHealTimeoutsRef.current[monsterId] || []).filter(id => id !== timeoutId);
          if (!monsterHealTimeoutsRef.current[monsterId]?.length) {
            delete monsterHealTimeoutsRef.current[monsterId];
          }
        }, animSpeed(COMBAT_ANIMATION_DURATION));
        monsterHealTimeoutsRef.current[monsterId] = [
          ...(monsterHealTimeoutsRef.current[monsterId] || []),
          timeoutId];
      }, delay);
    },
    [scheduleAnimationStart, setters, animSpeed],
  );

  const startWeaponSwingPulse = useCallback(
    (slotId: EquipmentSlotId, delay = 0) => {
      scheduleAnimationStart(() => {
        setters.setWeaponSwingStates(prev => ({
          ...prev,
          [slotId]: (prev[slotId] ?? 0) + 1,
        }));
        const timeoutId = setTimeout(() => {
          setters.setWeaponSwingStates(prev => {
            const current = prev[slotId] ?? 0;
            const nextCount = Math.max(0, current - 1);
            return { ...prev, [slotId]: nextCount };
          });
          weaponSwingTimeoutsRef.current[slotId] = (weaponSwingTimeoutsRef.current[slotId] || []).filter(
            id => id !== timeoutId,
          );
        }, animSpeed(COMBAT_ANIMATION_DURATION));
        weaponSwingTimeoutsRef.current[slotId] = [
          ...(weaponSwingTimeoutsRef.current[slotId] || []),
          timeoutId];
      }, delay);
    },
    [scheduleAnimationStart, setters, animSpeed],
  );

  const startShieldBlockPulse = useCallback(
    (slotId: EquipmentSlotId, delay = 0) => {
      scheduleAnimationStart(() => {
        setters.setShieldBlockStates(prev => ({
          ...prev,
          [slotId]: (prev[slotId] ?? 0) + 1,
        }));
        const timeoutId = setTimeout(() => {
          setters.setShieldBlockStates(prev => {
            const current = prev[slotId] ?? 0;
            const nextCount = Math.max(0, current - 1);
            return { ...prev, [slotId]: nextCount };
          });
          shieldBlockTimeoutsRef.current[slotId] = (shieldBlockTimeoutsRef.current[slotId] || []).filter(
            id => id !== timeoutId,
          );
        }, animSpeed(COMBAT_ANIMATION_DURATION));
        shieldBlockTimeoutsRef.current[slotId] = [
          ...(shieldBlockTimeoutsRef.current[slotId] || []),
          timeoutId];
      }, delay);
    },
    [scheduleAnimationStart, setters, animSpeed],
  );

  const triggerWeaponSwingAnimation = useCallback(
    (slotId: EquipmentSlotId, delay = 0, options?: { echoes?: number }) => {
      const echoes = Math.max(1, options?.echoes ?? 1);
      for (let i = 0; i < echoes; i += 1) {
        startWeaponSwingPulse(slotId, delay + i * Math.floor(COMBAT_ANIMATION_STAGGER / 2));
      }
      setters.setWeaponSwingVariant(prev => ({
        ...prev,
        [slotId]: prev[slotId] === 0 ? 1 : 0,
      }));
    },
    [startWeaponSwingPulse, setters],
  );

  const triggerShieldBlockAnimation = useCallback(
    (slotId: EquipmentSlotId, delay = 0, options?: { echoes?: number }) => {
      const echoes = Math.max(1, options?.echoes ?? 2);
      for (let i = 0; i < echoes; i += 1) {
        startShieldBlockPulse(slotId, delay + i * Math.floor(COMBAT_ANIMATION_STAGGER / 2));
      }
      setters.setShieldBlockVariant(prev => ({
        ...prev,
        [slotId]: prev[slotId] === 0 ? 1 : 0,
      }));
    },
    [startShieldBlockPulse, setters],
  );

  useEffect(() => {
    return () => {
      if (heroBleedTimeoutRef.current) {
        clearTimeout(heroBleedTimeoutRef.current);
      }
      animationDelayTimeoutsRef.current.forEach(timeout => clearTimeout(timeout));
      Object.values(monsterBleedTimeoutsRef.current).forEach(timeouts => {
        timeouts.forEach(timeout => clearTimeout(timeout));
      });
      Object.values(weaponSwingTimeoutsRef.current).forEach(timeouts => {
        timeouts.forEach(timeout => clearTimeout(timeout));
      });
      Object.values(shieldBlockTimeoutsRef.current).forEach(timeouts => {
        timeouts.forEach(timeout => clearTimeout(timeout));
      });
    };
  }, []);

  return {
    triggerHeroBleedAnimation,
    triggerMonsterBleedAnimation,
    triggerMonsterHealAnimation,
    triggerWeaponSwingAnimation,
    triggerShieldBlockAnimation,
    animationDelayTimeoutsRef,
    heroBleedTimeoutRef,
    monsterBleedTimeoutsRef,
    monsterHealTimeoutsRef,
    weaponSwingTimeoutsRef,
    shieldBlockTimeoutsRef,
  };
}
