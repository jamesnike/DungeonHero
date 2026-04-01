import { useState, useCallback, useMemo } from 'react';
import GameCard, { type GameCardData } from './GameCard';

export interface CardDraftModalProps {
  isOpen: boolean;
  pool: GameCardData[];
  totalRounds: number;
  choicesPerRound: number;
  onComplete: (picks: GameCardData[]) => void;
  overlayZoom?: number;
}

function sampleFromPool(pool: GameCardData[], count: number): GameCardData[] {
  if (pool.length === 0) return [];
  const shuffled = [...pool].sort(() => Math.random() - 0.5);
  const result: GameCardData[] = [];
  const usedNames = new Set<string>();
  for (const card of shuffled) {
    if (result.length >= count) break;
    if (!usedNames.has(card.name)) {
      result.push({ ...card, id: `${card.id}-draft-${Date.now()}-${Math.random().toString(36).slice(2, 6)}` });
      usedNames.add(card.name);
    }
  }
  while (result.length < count && shuffled.length > 0) {
    const c = shuffled[Math.floor(Math.random() * shuffled.length)];
    result.push({ ...c, id: `${c.id}-draft-${Date.now()}-${Math.random().toString(36).slice(2, 6)}` });
  }
  return result;
}

export default function CardDraftModal({
  isOpen,
  pool,
  totalRounds,
  choicesPerRound,
  onComplete,
  overlayZoom = 1,
}: CardDraftModalProps) {
  const [round, setRound] = useState(0);
  const [picks, setPicks] = useState<GameCardData[]>([]);
  const [currentChoices, setCurrentChoices] = useState<GameCardData[]>(() =>
    sampleFromPool(pool, choicesPerRound),
  );
  const [selectedIdx, setSelectedIdx] = useState<number | null>(null);
  const [confirming, setConfirming] = useState(false);

  const regenerateChoices = useCallback(() => {
    setCurrentChoices(sampleFromPool(pool, choicesPerRound));
    setSelectedIdx(null);
    setConfirming(false);
  }, [pool, choicesPerRound]);

  const handleSelect = useCallback(
    (idx: number) => {
      if (confirming) return;
      setSelectedIdx(idx);
    },
    [confirming],
  );

  const handleConfirm = useCallback(() => {
    if (selectedIdx == null) return;
    const chosen = currentChoices[selectedIdx];
    const baseId = chosen.id.replace(/-draft-.*$/, '');
    const finalCard: GameCardData = {
      ...chosen,
      id: `${baseId}-pick-${round}`,
    };
    const newPicks = [...picks, finalCard];
    setPicks(newPicks);

    const nextRound = round + 1;
    if (nextRound >= totalRounds) {
      onComplete(newPicks);
      return;
    }
    setRound(nextRound);
    setCurrentChoices(sampleFromPool(pool, choicesPerRound));
    setSelectedIdx(null);
    setConfirming(false);
  }, [selectedIdx, currentChoices, picks, round, totalRounds, pool, choicesPerRound, onComplete]);

  const pickedSummary = useMemo(() => {
    const counts: Record<string, number> = {};
    for (const p of picks) {
      counts[p.name] = (counts[p.name] ?? 0) + 1;
    }
    return Object.entries(counts)
      .map(([name, count]) => (count > 1 ? `${name} ×${count}` : name))
      .join('、');
  }, [picks]);

  if (!isOpen) return null;

  return (
    <div className="card-draft-overlay" style={{ zoom: overlayZoom }}>
      <div className="card-draft-modal">
        <div className="card-draft-header">
          <h2 className="card-draft-title">选择起始卡牌</h2>
          <p className="card-draft-subtitle">
            第 {round + 1} / {totalRounds} 轮 — 从下方三张牌中选择一张加入背包
          </p>
        </div>

        {picks.length > 0 && (
          <div className="card-draft-picked">
            <span className="card-draft-picked-label">已选：</span>
            <span className="card-draft-picked-list">{pickedSummary}</span>
          </div>
        )}

        <div className="card-draft-choices">
          {currentChoices.map((card, idx) => (
            <div
              key={card.id}
              className={`card-draft-choice ${selectedIdx === idx ? 'card-draft-choice-selected' : ''}`}
              onClick={() => handleSelect(idx)}
            >
              <GameCard card={card} />
              <div className="card-draft-choice-name">{card.name}</div>
              <div className="card-draft-choice-desc">{card.description || card.magicEffect || ''}</div>
            </div>
          ))}
        </div>

        <button
          className="card-draft-confirm-btn"
          disabled={selectedIdx == null}
          onClick={handleConfirm}
        >
          {round + 1 < totalRounds ? '确认选择' : '确认并开始'}
        </button>
      </div>
    </div>
  );
}
