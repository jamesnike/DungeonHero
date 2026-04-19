import { memo, useCallback, useEffect, useRef, useState } from 'react';
import { useGameEvent } from '@/hooks/useGameEngine';
import CombatDiceModal from '@/components/CombatDiceModal';

type DicePayload = {
  title: string;
  subtitle: string;
  roll: number;
  threshold: number;
  success: boolean;
};

const POST_ROLL_DISPLAY_MS = 700;

function CombatDiceContainerInner() {
  const [queue, setQueue] = useState<DicePayload[]>([]);
  const [current, setCurrent] = useState<DicePayload | null>(null);
  const [rollKey, setRollKey] = useState(0);
  const advanceTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useGameEvent('combat:diceRoll', (payload) => {
    setQueue((prev) => [...prev, { ...payload }]);
  });

  useEffect(() => {
    if (current !== null || queue.length === 0) return;
    const next = queue[0];
    setQueue((prev) => prev.slice(1));
    setCurrent(next);
    setRollKey((k) => k + 1);
  }, [current, queue]);

  const handleRollResult = useCallback(() => {
    if (advanceTimerRef.current) {
      clearTimeout(advanceTimerRef.current);
    }
    advanceTimerRef.current = setTimeout(() => {
      setCurrent(null);
      advanceTimerRef.current = null;
    }, POST_ROLL_DISPLAY_MS);
  }, []);

  useEffect(() => {
    return () => {
      if (advanceTimerRef.current) {
        clearTimeout(advanceTimerRef.current);
        advanceTimerRef.current = null;
      }
    };
  }, []);

  if (!current) return null;

  return (
    <CombatDiceModal
      open
      title={current.title}
      subtitle={current.subtitle}
      roll={current.roll}
      threshold={current.threshold}
      success={current.success}
      autoRollTrigger={rollKey}
      onRollResult={handleRollResult}
    />
  );
}

export const CombatDiceContainer = memo(CombatDiceContainerInner);
