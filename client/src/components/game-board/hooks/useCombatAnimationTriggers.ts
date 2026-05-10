import { useCallback, useEffect, useRef } from 'react';
import type { EquipmentSlotId } from '../types';

const COMBAT_ANIMATION_DURATION = 1200;
const COMBAT_ANIMATION_STAGGER = 180;
// Mine explosion total visible duration. Must cover the longest of the three
// child keyframes (flash 650ms / shock 720ms / bolt 700ms+60ms delay) plus a
// small buffer so React unmounts the overlay only after every layer fades
// completely. Tuned with `animSpeed` so it scales the same as other combat FX.
const MINE_EXPLODE_DURATION = 800;

export interface CombatAnimationSetters {
  setHeroBleedActive: React.Dispatch<React.SetStateAction<boolean>>;
  setMonsterBleedStates: React.Dispatch<React.SetStateAction<Record<string, number>>>;
  setMonsterHealStates: React.Dispatch<React.SetStateAction<Record<string, number>>>;
  setWeaponSwingStates: React.Dispatch<React.SetStateAction<Record<EquipmentSlotId, number>>>;
  setShieldBlockStates: React.Dispatch<React.SetStateAction<Record<EquipmentSlotId, number>>>;
  setWeaponSwingVariant: React.Dispatch<React.SetStateAction<Record<EquipmentSlotId, 0 | 1>>>;
  setShieldBlockVariant: React.Dispatch<React.SetStateAction<Record<EquipmentSlotId, 0 | 1>>>;
  setMineExplodeStates: React.Dispatch<React.SetStateAction<Record<number, number>>>;
}

export interface CombatAnimationTriggers {
  triggerHeroBleedAnimation: (delay?: number) => void;
  triggerMonsterBleedAnimation: (monsterId: string, delay?: number) => void;
  triggerMonsterHealAnimation: (monsterId: string, delay?: number) => void;
  triggerWeaponSwingAnimation: (slotId: EquipmentSlotId, delay?: number, options?: { echoes?: number }) => void;
  triggerShieldBlockAnimation: (slotId: EquipmentSlotId, delay?: number, options?: { echoes?: number }) => void;
  triggerMineExplosionAnimation: (slotIdx: number, delay?: number) => void;
  /** Refs exposed for reset/cleanup by GameBoard during game init / undo */
  animationDelayTimeoutsRef: React.MutableRefObject<ReturnType<typeof setTimeout>[]>;
  heroBleedTimeoutRef: React.MutableRefObject<ReturnType<typeof setTimeout> | null>;
  monsterBleedTimeoutsRef: React.MutableRefObject<Record<string, ReturnType<typeof setTimeout>[]>>;
  monsterHealTimeoutsRef: React.MutableRefObject<Record<string, ReturnType<typeof setTimeout>[]>>;
  weaponSwingTimeoutsRef: React.MutableRefObject<Record<EquipmentSlotId, ReturnType<typeof setTimeout>[]>>;
  shieldBlockTimeoutsRef: React.MutableRefObject<Record<EquipmentSlotId, ReturnType<typeof setTimeout>[]>>;
  mineExplodeTimeoutsRef: React.MutableRefObject<Record<number, ReturnType<typeof setTimeout>[]>>;
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
  const mineExplodeTimeoutsRef = useRef<Record<number, ReturnType<typeof setTimeout>[]>>({});

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

  // 地雷爆炸：slot 索引粒度的 in-place burst（不是 directional projectile）。
  // 跟 monsterBleed / weaponSwing 同 pattern：counter 累加 → 等动画时长 → 减 1。
  // 多枚地雷在同一回合先后触发（理论可能：多个 mine cell 同时被怪物落中）会让
  // counter > 1，overlay 仍然渲染同一帧动画——这跟 monster bleed 多次叠加显示一致。
  const triggerMineExplosionAnimation = useCallback(
    (slotIdx: number, delay = 0) => {
      if (typeof slotIdx !== 'number' || slotIdx < 0) return;
      scheduleAnimationStart(() => {
        setters.setMineExplodeStates(prev => ({
          ...prev,
          [slotIdx]: (prev[slotIdx] ?? 0) + 1,
        }));
        const timeoutId = setTimeout(() => {
          setters.setMineExplodeStates(prev => {
            const current = prev[slotIdx];
            if (!current) return prev;
            if (current <= 1) {
              const next = { ...prev };
              delete next[slotIdx];
              return next;
            }
            return { ...prev, [slotIdx]: current - 1 };
          });
          mineExplodeTimeoutsRef.current[slotIdx] =
            (mineExplodeTimeoutsRef.current[slotIdx] || []).filter(id => id !== timeoutId);
          if (!mineExplodeTimeoutsRef.current[slotIdx]?.length) {
            delete mineExplodeTimeoutsRef.current[slotIdx];
          }
        }, animSpeed(MINE_EXPLODE_DURATION));
        mineExplodeTimeoutsRef.current[slotIdx] = [
          ...(mineExplodeTimeoutsRef.current[slotIdx] || []),
          timeoutId,
        ];
      }, delay);
    },
    [scheduleAnimationStart, setters, animSpeed],
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
      Object.values(mineExplodeTimeoutsRef.current).forEach(timeouts => {
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
    triggerMineExplosionAnimation,
    animationDelayTimeoutsRef,
    heroBleedTimeoutRef,
    monsterBleedTimeoutsRef,
    monsterHealTimeoutsRef,
    weaponSwingTimeoutsRef,
    shieldBlockTimeoutsRef,
    mineExplodeTimeoutsRef,
  };
}
