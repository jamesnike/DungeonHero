import { memo } from 'react';
import { useShallowGameState } from '@/hooks/useGameEngine';
import EternalRelicBar from '@/components/EternalRelicBar';
import type { EternalRelic } from '@/game-core/types';

function EternalRelicContainerInner({
  onRelicClick,
}: {
  onRelicClick: (relic: EternalRelic) => void;
}) {
  const { eternalRelics } = useShallowGameState(s => ({
    eternalRelics: s.eternalRelics,
  }));
  return <EternalRelicBar relics={eternalRelics} onRelicClick={onRelicClick} />;
}

export default memo(EternalRelicContainerInner);
