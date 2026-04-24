import { useState, useCallback, useEffect, useRef } from 'react';
import { useTranslation } from 'react-i18next';
import { useFitToViewport } from '@/hooks/use-fit-to-viewport';
import { heroSkills, type HeroSkillDefinition } from '@/lib/heroSkills';
import { getEternalRelic } from '@/lib/eternalRelics';
import type { EternalRelicId } from '@/game-core/types';
import type { RngState } from '@/game-core/rng';
import { shuffle as rngShuffle } from '@/game-core/rng';

interface HeroSkillSelectionProps {
  isOpen: boolean;
  onSelectSkill: (skillId: string) => void;
  rng: RngState;
  onRngUpdate: (rng: RngState) => void;
}

function sampleSkills(count: number, rng: RngState): [HeroSkillDefinition[], RngState] {
  const [shuffled, nextRng] = rngShuffle(heroSkills, rng);
  return [shuffled.slice(0, count), nextRng];
}

export default function HeroSkillSelection({ isOpen, onSelectSkill, rng, onRngUpdate }: HeroSkillSelectionProps) {
  const { t } = useTranslation();
  const modalRef = useRef<HTMLDivElement | null>(null);
  const overlayScale = useFitToViewport(modalRef);
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
    <div className="card-draft-overlay">
      <div
        className="card-draft-modal"
        ref={modalRef}
        style={{ transform: `scale(${overlayScale})`, transformOrigin: 'center center' }}
      >
        <div className="card-draft-header">
          <h2 className="card-draft-title">{t('hero.select.title')}</h2>
          <p className="card-draft-subtitle">
            {t('hero.select.subtitle')}
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
                      {isPassive ? t('hero.select.passiveLabel') : t('hero.select.activeLabel')}
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
          {t('common.reroll')}
        </button>
      </div>
    </div>
  );
}
