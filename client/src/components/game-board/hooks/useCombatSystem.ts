import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';

import * as BoardConstants from '../constants';
import type { EquipmentSlotId, SwordVector, CombatState } from '../types';

export function useCombatSystem() {
  const [combatState, setCombatState] = useState<CombatState>(BoardConstants.initialCombatState);
  const [swordVectors, setSwordVectors] = useState<Record<string, SwordVector>>({});
  const [heroBleedActive, setHeroBleedActive] = useState(false);
  const [monsterBleedStates, setMonsterBleedStates] = useState<Record<string, number>>({});
  const [weaponSwingStates, setWeaponSwingStates] = useState<Record<EquipmentSlotId, number>>({
    equipmentSlot1: 0,
    equipmentSlot2: 0,
  });
  const [shieldBlockStates, setShieldBlockStates] = useState<Record<EquipmentSlotId, number>>({
    equipmentSlot1: 0,
    equipmentSlot2: 0,
  });
  const [weaponSwingVariant, setWeaponSwingVariant] = useState<Record<EquipmentSlotId, 0 | 1>>({
    equipmentSlot1: 0,
    equipmentSlot2: 0,
  });
  const [shieldBlockVariant, setShieldBlockVariant] = useState<Record<EquipmentSlotId, 0 | 1>>({
    equipmentSlot1: 0,
    equipmentSlot2: 0,
  });

  const animationDelayTimeoutsRef = useRef<ReturnType<typeof setTimeout>[]>([]);
  const heroBleedTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const monsterBleedTimeoutsRef = useRef<Record<string, ReturnType<typeof setTimeout>[]>>({});
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
      setHeroBleedActive(false);
      const start = () => {
        setHeroBleedActive(true);
        heroBleedTimeoutRef.current = setTimeout(() => {
          setHeroBleedActive(false);
          heroBleedTimeoutRef.current = null;
        }, BoardConstants.COMBAT_ANIMATION_DURATION);
      };
      scheduleAnimationStart(start, delay);
    },
    [scheduleAnimationStart],
  );

  const triggerMonsterBleedAnimation = useCallback(
    (monsterId: string, delay = 0) => {
      if (!monsterId) return;
      scheduleAnimationStart(() => {
        setMonsterBleedStates(prev => ({
          ...prev,
          [monsterId]: (prev[monsterId] ?? 0) + 1,
        }));
        const timeoutId = setTimeout(() => {
          setMonsterBleedStates(prev => {
            const current = prev[monsterId];
            if (!current) {
              return prev;
            }
            if (current <= 1) {
              const next = { ...prev };
              delete next[monsterId];
              return next;
            }
            return {
              ...prev,
              [monsterId]: current - 1,
            };
          });
          monsterBleedTimeoutsRef.current[monsterId] =
            (monsterBleedTimeoutsRef.current[monsterId] || []).filter(id => id !== timeoutId);
          if (!monsterBleedTimeoutsRef.current[monsterId]?.length) {
            delete monsterBleedTimeoutsRef.current[monsterId];
          }
        }, BoardConstants.COMBAT_ANIMATION_DURATION);
        monsterBleedTimeoutsRef.current[monsterId] = [
          ...(monsterBleedTimeoutsRef.current[monsterId] || []),
          timeoutId,
        ];
      }, delay);
    },
    [scheduleAnimationStart],
  );

  const startWeaponSwingPulse = useCallback(
    (slotId: EquipmentSlotId, delay = 0) => {
      scheduleAnimationStart(() => {
        setWeaponSwingStates(prev => ({
          ...prev,
          [slotId]: (prev[slotId] ?? 0) + 1,
        }));
        const timeoutId = setTimeout(() => {
          setWeaponSwingStates(prev => {
            const current = prev[slotId] ?? 0;
            const nextCount = Math.max(0, current - 1);
            return {
              ...prev,
              [slotId]: nextCount,
            };
          });
          weaponSwingTimeoutsRef.current[slotId] = (weaponSwingTimeoutsRef.current[slotId] || []).filter(
            id => id !== timeoutId,
          );
        }, BoardConstants.COMBAT_ANIMATION_DURATION);
        weaponSwingTimeoutsRef.current[slotId] = [
          ...(weaponSwingTimeoutsRef.current[slotId] || []),
          timeoutId,
        ];
      }, delay);
    },
    [scheduleAnimationStart],
  );

  const startShieldBlockPulse = useCallback(
    (slotId: EquipmentSlotId, delay = 0) => {
      scheduleAnimationStart(() => {
        setShieldBlockStates(prev => ({
          ...prev,
          [slotId]: (prev[slotId] ?? 0) + 1,
        }));
        const timeoutId = setTimeout(() => {
          setShieldBlockStates(prev => {
            const current = prev[slotId] ?? 0;
            const nextCount = Math.max(0, current - 1);
            return {
              ...prev,
              [slotId]: nextCount,
            };
          });
          shieldBlockTimeoutsRef.current[slotId] = (shieldBlockTimeoutsRef.current[slotId] || []).filter(
            id => id !== timeoutId,
          );
        }, BoardConstants.COMBAT_ANIMATION_DURATION);
        shieldBlockTimeoutsRef.current[slotId] = [
          ...(shieldBlockTimeoutsRef.current[slotId] || []),
          timeoutId,
        ];
      }, delay);
    },
    [scheduleAnimationStart],
  );

  const triggerWeaponSwingAnimation = useCallback(
    (slotId: EquipmentSlotId, delay = 0, options?: { echoes?: number }) => {
      const echoes = Math.max(1, options?.echoes ?? 1);
      for (let i = 0; i < echoes; i += 1) {
        startWeaponSwingPulse(slotId, delay + i * Math.floor(BoardConstants.COMBAT_ANIMATION_STAGGER / 2));
      }
      setWeaponSwingVariant(prev => ({
        ...prev,
        [slotId]: prev[slotId] === 0 ? 1 : 0,
      }));
    },
    [startWeaponSwingPulse],
  );

  const triggerShieldBlockAnimation = useCallback(
    (slotId: EquipmentSlotId, delay = 0, options?: { echoes?: number }) => {
      const echoes = Math.max(1, options?.echoes ?? 2);
      for (let i = 0; i < echoes; i += 1) {
        startShieldBlockPulse(slotId, delay + i * Math.floor(BoardConstants.COMBAT_ANIMATION_STAGGER / 2));
      }
      setShieldBlockVariant(prev => ({
        ...prev,
        [slotId]: prev[slotId] === 0 ? 1 : 0,
      }));
    },
    [startShieldBlockPulse],
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
    combatState,
    setCombatState,
    swordVectors,
    setSwordVectors,
    heroBleedActive,
    triggerHeroBleedAnimation,
    monsterBleedStates,
    setMonsterBleedStates,
    triggerMonsterBleedAnimation,
    weaponSwingStates,
    setWeaponSwingStates,
    shieldBlockStates,
    setShieldBlockStates,
    weaponSwingVariant,
    shieldBlockVariant,
    triggerWeaponSwingAnimation,
    triggerShieldBlockAnimation,
  };
}
