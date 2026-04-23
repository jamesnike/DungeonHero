import { useState, useCallback, useMemo, useRef } from 'react';
import GameCard, { type GameCardData } from './GameCard';
import { useFitToViewport } from '@/hooks/use-fit-to-viewport';
import type { RngState } from '@/game-core/rng';
import { shuffle as rngShuffle, pickRandom, nextId } from '@/game-core/rng';

export type DraftRoundType = 'general' | 'equipment' | 'potion' | 'amulet';

export interface CardDraftModalProps {
  isOpen: boolean;
  pool: GameCardData[];
  totalRounds: number;
  choicesPerRound: number;
  onComplete: (picks: GameCardData[]) => void;
  /** Per-round type overrides. Unspecified rounds default to 'general'. */
  roundTypes?: DraftRoundType[];
  rng: RngState;
  onRngUpdate: (rng: RngState) => void;
}

function sampleFromPool(pool: GameCardData[], count: number, rng: RngState): [GameCardData[], RngState] {
  if (pool.length === 0) return [[], rng];
  let currentRng = rng;
  let shuffled: GameCardData[];
  [shuffled, currentRng] = rngShuffle(pool, currentRng);
  const result: GameCardData[] = [];
  const usedNames = new Set<string>();
  for (const card of shuffled) {
    if (result.length >= count) break;
    if (!usedNames.has(card.name)) {
      let id: string;
      [id, currentRng] = nextId(currentRng, `${card.id}-draft`);
      result.push({ ...card, id });
      usedNames.add(card.name);
    }
  }
  while (result.length < count && shuffled.length > 0) {
    let c: GameCardData;
    [c, currentRng] = pickRandom(shuffled, currentRng);
    let id: string;
    [id, currentRng] = nextId(currentRng, `${c.id}-draft`);
    result.push({ ...c, id });
  }
  return [result, currentRng];
}

export default function CardDraftModal({
  isOpen,
  pool,
  totalRounds,
  choicesPerRound,
  onComplete,
  roundTypes,
  rng,
  onRngUpdate,
}: CardDraftModalProps) {
  const modalRef = useRef<HTMLDivElement | null>(null);
  const overlayZoom = useFitToViewport(modalRef);
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
  const [currentChoices, setCurrentChoices] = useState<GameCardData[]>(() => {
    const [sampled, nextRng] = sampleFromPool(getPoolForRound(0), choicesPerRound, rng);
    Promise.resolve().then(() => onRngUpdate(nextRng));
    return sampled;
  });
  const [picking, setPicking] = useState(false);

  const currentRoundType = getRoundType(round);

  const regenerateChoices = useCallback(() => {
    const [sampled, nextRng] = sampleFromPool(getPoolForRound(round), choicesPerRound, rng);
    setCurrentChoices(sampled);
    onRngUpdate(nextRng);
    setPicking(false);
  }, [getPoolForRound, round, choicesPerRound, rng, onRngUpdate]);

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
      const [sampled, nextRng] = sampleFromPool(getPoolForRound(nextRound), choicesPerRound, rng);
      setCurrentChoices(sampled);
      onRngUpdate(nextRng);
      setPicking(false);
    },
    [picking, currentChoices, picks, round, totalRounds, choicesPerRound, onComplete, getPoolForRound, rng, onRngUpdate],
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
    <div className="card-draft-overlay">
      <div
        className="card-draft-modal"
        ref={modalRef}
        style={{ transform: `scale(${overlayZoom})`, transformOrigin: 'center center' }}
      >
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
              <div className="aspect-[3/4.2] w-[160px]">
                <GameCard card={card} />
              </div>
              <div className="card-draft-choice-name">{card.name}</div>
              <div className="card-draft-choice-desc">{card.description || card.magicEffect || ''}</div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
