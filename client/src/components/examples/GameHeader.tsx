import GameHeader from '../GameHeader';

export default function GameHeaderExample() {
  return (
    <div className="bg-background p-8 space-y-4">
      <GameHeader hp={13} maxHp={13} gold={0} cardsRemaining={54} />
      <GameHeader hp={8} maxHp={13} gold={25} cardsRemaining={32} />
      <GameHeader hp={3} maxHp={13} gold={50} cardsRemaining={10} />
    </div>
  );
}
