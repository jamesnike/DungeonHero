import { useState, useCallback, useEffect, useRef } from 'react';
import { useOverlayScale } from '@/hooks/use-overlay-scale';
import type { GameCardData } from './GameCard';
import { heroSkills, type HeroSkillDefinition } from '@/lib/heroSkills';
import { getEternalRelic } from '@/lib/eternalRelics';
import type { EternalRelicId } from '@/game-core/types';
import type { RngState } from '@/game-core/rng';
import { shuffle as rngShuffle } from '@/game-core/rng';

interface HeroSkillSelectionProps {
  isOpen: boolean;
  onSelectSkill: (skillId: string) => void;
  classCardPreview?: GameCardData | null;
  rng: RngState;
  onRngUpdate: (rng: RngState) => void;
}

function sampleSkills(count: number, rng: RngState): [HeroSkillDefinition[], RngState] {
  const [shuffled, nextRng] = rngShuffle(heroSkills, rng);
  return [shuffled.slice(0, count), nextRng];
}

export default function HeroSkillSelection({ isOpen, onSelectSkill, classCardPreview, rng, onRngUpdate }: HeroSkillSelectionProps) {
  const overlayScale = useOverlayScale();
  const [choices, setChoices] = useState<HeroSkillDefinition[]>([]);
  const prevIsOpen = useRef(false);

  useEffect(() => {
    if (isOpen && !prevIsOpen.current) {
      const [sampled, nextRng] = sampleSkills(3, rng);
      setChoices(sampled);
      onRngUpdate(nextRng);
    }
    prevIsOpen.current = isOpen;
  }, [isOpen]); // eslint-disable-line react-hooks/exhaustive-deps

  const handleReroll = useCallback(() => {
    const [sampled, nextRng] = sampleSkills(3, rng);
    setChoices(sampled);
    onRngUpdate(nextRng);
  }, [rng, onRngUpdate]);

  if (!isOpen) return null;

  return (
    <div className="card-draft-overlay" style={{ zoom: overlayScale }}>
      <div className="card-draft-modal">
        <div className="card-draft-header">
          <h2 className="card-draft-title">选择英雄技能</h2>
          <p className="card-draft-subtitle">
            从下方三个技能中选择一个开始冒险
          </p>
        </div>

        <div className="card-draft-choices" style={{ justifyContent: 'center' }}>
          {choices.map((skill) => {
            const isPassive = skill.type === 'passive';
            const relic = isPassive ? getEternalRelic(skill.id as EternalRelicId) : null;

            return (
              <div
                key={skill.id}
                className="card-draft-choice"
                onClick={() => onSelectSkill(skill.id)}
              >
                <div className="skill-draft-card">
                  {isPassive && relic ? (
                    <div className="skill-draft-card-bg" style={{ display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                      <img
                        src={relic.image}
                        alt={relic.name}
                        style={{ width: '80%', height: '80%', objectFit: 'cover', borderRadius: '50%', border: '3px solid rgba(245, 158, 11, 0.5)' }}
                      />
                    </div>
                  ) : (
                    <div className="skill-draft-card-bg" />
                  )}
                  <div className="skill-draft-card-content">
                    <div className="skill-draft-name" style={isPassive ? { marginTop: 4 } : undefined}>
                      {isPassive && relic ? relic.name : skill.name}
                    </div>
                    <div className={`skill-draft-type ${isPassive ? 'skill-draft-type-passive' : 'skill-draft-type-active'}`}>
                      {isPassive ? '永恒护符' : '主动技能'}
                    </div>
                    <div className="skill-draft-divider" />
                    <div className="skill-draft-effect">
                      {isPassive && relic ? relic.description : skill.effect}
                    </div>
                  </div>
                </div>
                <div className="card-draft-choice-name">
                  {isPassive && relic ? relic.name : skill.name}
                </div>
                <div className="card-draft-choice-desc">
                  {isPassive && relic ? relic.description : skill.description}
                </div>
              </div>
            );
          })}
        </div>

        <button className="skill-draft-reroll" onClick={handleReroll}>
          换一批
        </button>

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
