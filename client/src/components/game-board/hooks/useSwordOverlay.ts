import { useState, useCallback, useEffect, useMemo, type RefObject } from 'react';
import { useShallowGameState, useGameEngine } from '@/hooks/useGameEngine';

import type { SwordVector } from '../types';

export interface SwordOverlayRefs {
  boardRef: RefObject<HTMLDivElement | null>;
  heroCellRef: RefObject<HTMLDivElement | null>;
  monsterCellRefs: React.MutableRefObject<Record<string, HTMLDivElement | null>>;
}

export interface SwordOverlayState {
  swordVectors: Record<string, SwordVector>;
  showMonsterAttackIndicator: boolean;
  activeSwordMonsterId: string | null;
}

export function useSwordOverlay(refs: SwordOverlayRefs): SwordOverlayState {
  const engine = useGameEngine();
  const [swordVectors, setSwordVectors] = useState<Record<string, SwordVector>>({});

  const gs = useShallowGameState(s => ({
    engagedMonsterIds: s.combatState.engagedMonsterIds,
    currentTurn: s.combatState.currentTurn,
    pendingBlock: s.combatState.pendingBlock,
  }));

  const handLockedForMonsterPhase = useMemo(
    () =>
      gs.engagedMonsterIds.length > 0 &&
      (gs.currentTurn === 'monster' || Boolean(gs.pendingBlock)),
    [gs.engagedMonsterIds, gs.currentTurn, gs.pendingBlock],
  );

  const showMonsterAttackIndicator = handLockedForMonsterPhase && gs.engagedMonsterIds.length > 0;
  const activeSwordMonsterId = gs.pendingBlock?.monsterId ?? null;

  const updateSwordVectors = useCallback(() => {
    const s = engine.getState();
    const engaged = s.combatState.engagedMonsterIds;
    if (engaged.length === 0) {
      setSwordVectors({});
      return;
    }

    const boardEl = refs.boardRef.current;
    const heroEl = refs.heroCellRef.current;
    if (!boardEl || !heroEl) {
      setSwordVectors({});
      return;
    }

    const boardRect = boardEl.getBoundingClientRect();
    const heroRect = heroEl.getBoundingClientRect();
    const heroCenter = {
      x: heroRect.left + heroRect.width / 2,
      y: heroRect.top + heroRect.height / 2,
    };

    const vectors: Record<string, SwordVector> = {};
    engaged.forEach(monsterId => {
      const monsterEl = refs.monsterCellRefs.current[monsterId];
      if (!monsterEl) return;

      const monsterRect = monsterEl.getBoundingClientRect();
      const monsterCenter = {
        x: monsterRect.left + monsterRect.width / 2,
        y: monsterRect.top + monsterRect.height / 2,
      };

      const dx = heroCenter.x - monsterCenter.x;
      const dy = heroCenter.y - monsterCenter.y;
      const length = Math.sqrt(dx * dx + dy * dy);
      if (!length) return;
      const angle = (Math.atan2(dy, dx) * 180) / Math.PI;

      const midX = (monsterCenter.x + heroCenter.x) / 2 - boardRect.left;
      const midY = (monsterCenter.y + heroCenter.y) / 2 - boardRect.top;

      vectors[monsterId] = { left: midX, top: midY, angle, length };
    });

    setSwordVectors(vectors);
  }, [engine, refs.boardRef, refs.heroCellRef, refs.monsterCellRefs]);

  useEffect(() => {
    if (!showMonsterAttackIndicator) {
      setSwordVectors({});
      return;
    }

    updateSwordVectors();
    const handleResize = () => updateSwordVectors();
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, [showMonsterAttackIndicator, updateSwordVectors]);

  return { swordVectors, showMonsterAttackIndicator, activeSwordMonsterId };
}
