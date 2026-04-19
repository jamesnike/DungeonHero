import { memo } from 'react';
import { useShallowGameState } from '@/hooks/useGameEngine';
import GameLogPanel from '@/components/GameLogPanel';

function GameLogContainerInner({
  onClear,
  stageScale,
}: {
  onClear: () => void;
  stageScale: number;
}) {
  const { gameLogEntries } = useShallowGameState(s => ({
    gameLogEntries: s.gameLogEntries,
  }));
  return <GameLogPanel entries={gameLogEntries} onClear={onClear} stageScale={stageScale} />;
}

export default memo(GameLogContainerInner);
