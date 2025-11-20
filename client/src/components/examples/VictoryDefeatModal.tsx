import { useState } from 'react';
import VictoryDefeatModal from '../VictoryDefeatModal';
import { Button } from '@/components/ui/button';

export default function VictoryDefeatModalExample() {
  const [showVictory, setShowVictory] = useState(false);
  const [showDefeat, setShowDefeat] = useState(false);

  return (
    <div className="p-8 bg-background flex gap-4">
      <Button onClick={() => setShowVictory(true)}>Show Victory</Button>
      <Button onClick={() => setShowDefeat(true)} variant="destructive">Show Defeat</Button>

      <VictoryDefeatModal
        open={showVictory}
        isVictory={true}
        gold={75}
        hpRemaining={8}
        onRestart={() => {
          console.log('Restarting game...');
          setShowVictory(false);
        }}
      />

      <VictoryDefeatModal
        open={showDefeat}
        isVictory={false}
        gold={35}
        hpRemaining={0}
        onRestart={() => {
          console.log('Restarting game...');
          setShowDefeat(false);
        }}
      />
    </div>
  );
}
