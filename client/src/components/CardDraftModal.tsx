import { useState, useCallback, useMemo } from 'react';
import GameCard, { type GameCardData } from './GameCard';

export type DraftRoundType = 'general' | 'equipment' | 'potion' | 'amulet';

export interface CardDraftModalProps {
  isOpen: boolean;
  pool: GameCardData[];
  totalRounds: number;
  choicesPerRound: number;
  onComplete: (picks: GameCardData[]) => void;
  overlayZoom?: number;
  classCardPreview?: GameCardData | null;
  /** Per-round type overrides. Unspecified rounds default to 'general'. */
  roundTypes?: DraftRoundType[];
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
  classCardPreview,
  roundTypes,
}: CardDraftModalProps) {
  const poolsByType = useMemo(() => {
    const equipmentOnly = pool.filter(c => c.type === 'weapon' || c.type === 'shield');
    const potionOnly = pool.filter(c => c.type === 'potion');
    const amuletOnly = pool.filter(c => c.type === 'amulet');
    const general = pool.filter(c => c.type !== 'potion' && c.type !== 'amulet' && c.type !== 'weapon' && c.type !== 'shield');
    return { general, equipment: equipmentOnly, potion: potionOnly, amulet: amuletOnly } as const;
  }, [pool]);

  const getRoundType = useCallback(
    (r: number): DraftRoundType => roundTypes?.[r] ?? 'general',
    [roundTypes],
  );

  const getPoolForRound = useCallback(
    (r: number) => poolsByType[getRoundType(r)],
    [poolsByType, getRoundType],
  );

  const [round, setRound] = useState(0);
  const [picks, setPicks] = useState<GameCardData[]>([]);
  const [currentChoices, setCurrentChoices] = useState<GameCardData[]>(() =>
    sampleFromPool(getPoolForRound(0), choicesPerRound),
  );
  const [picking, setPicking] = useState(false);

  const currentRoundType = getRoundType(round);

  const regenerateChoices = useCallback(() => {
    setCurrentChoices(sampleFromPool(getPoolForRound(round), choicesPerRound));
    setPicking(false);
  }, [getPoolForRound, round, choicesPerRound]);

  const handlePick = useCallback(
    (idx: number) => {
      if (picking) return;
      setPicking(true);

      const chosen = currentChoices[idx];
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
      setCurrentChoices(sampleFromPool(getPoolForRound(nextRound), choicesPerRound));
      setPicking(false);
    },
    [picking, currentChoices, picks, round, totalRounds, choicesPerRound, onComplete, getPoolForRound],
  );

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
            第 {round + 1} / {totalRounds} 轮 — {
              currentRoundType === 'equipment' ? '从下方装备中选择一件加入背包' :
              currentRoundType === 'potion' ? '从下方药水中选择一瓶加入背包' :
              currentRoundType === 'amulet' ? '从下方护符中选择一枚加入背包' :
              '从下方三张牌中选择一张加入背包'}
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
              className="card-draft-choice"
              onClick={() => handlePick(idx)}
            >
              <GameCard card={card} />
              <div className="card-draft-choice-name">{card.name}</div>
              <div className="card-draft-choice-desc">{card.description || card.magicEffect || ''}</div>
            </div>
          ))}
        </div>

        {classCardPreview && (
          <div className="class-card-preview">
            <div className="class-card-preview-label">即将获得的专属卡</div>
            <div className="class-card-preview-card">
              {classCardPreview.image && (
                <img src={classCardPreview.image} alt={classCardPreview.name} className="class-card-preview-img" />
              )}
              <div className="class-card-preview-info">
                <div className="class-card-preview-name">{classCardPreview.name}</div>
                <div className="class-card-preview-desc">{classCardPreview.description || classCardPreview.magicEffect || ''}</div>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
