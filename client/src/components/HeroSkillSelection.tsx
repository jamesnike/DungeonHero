import { useState, useCallback, useEffect, useRef } from 'react';
import { Shield, Droplet, Skull, Heart, Coins, Ghost, HandCoins, Waves, Swords, HeartPulse, Zap, ShieldAlert, BookOpen, Cat, ArrowLeftRight } from 'lucide-react';
import { heroSkills, type HeroSkillDefinition } from '@/lib/heroSkills';
import { useOverlayScale } from '@/hooks/use-overlay-scale';
import type { GameCardData } from './GameCard';

import skillScrollImage from '@assets/generated_images/chibi_skill_scroll.png';

interface HeroSkillSelectionProps {
  isOpen: boolean;
  onSelectSkill: (skillId: string) => void;
  classCardPreview?: GameCardData | null;
}

function sampleSkills(count: number): HeroSkillDefinition[] {
  const shuffled = [...heroSkills].sort(() => Math.random() - 0.5);
  return shuffled.slice(0, count);
}

function getSkillIcon(skillId: string) {
  const cls = "w-6 h-6";
  switch (skillId) {
    case 'armor-pact': return <Shield className={cls} />;
    case 'durability-for-blood': return <Droplet className={cls} />;
    case 'blood-strike': return <Skull className={cls} />;
    case 'vitality-well': return <Heart className={cls} />;
    case 'gold-discovery': return <Coins className={cls} />;
    case 'graveyard-recall': return <Ghost className={cls} />;
    case 'discard-profit': return <HandCoins className={cls} />;
    case 'waterfall-heal': return <Waves className={cls} />;
    case 'discard-empower': return <Swords className={cls} />;
    case 'heal-to-damage': return <HeartPulse className={cls} />;
    case 'early-surge': return <Zap className={cls} />;
    case 'shield-wall': return <ShieldAlert className={cls} />;
    case 'blood-draw': return <BookOpen className={cls} />;
    case 'summon-minion': return <Cat className={cls} />;
    case 'vanguard-swap': return <ArrowLeftRight className={cls} />;
    default: return <Shield className={cls} />;
  }
}

export default function HeroSkillSelection({ isOpen, onSelectSkill, classCardPreview }: HeroSkillSelectionProps) {
  const overlayScale = useOverlayScale();
  const [choices, setChoices] = useState<HeroSkillDefinition[]>([]);
  const prevIsOpen = useRef(false);

  useEffect(() => {
    if (isOpen && !prevIsOpen.current) {
      setChoices(sampleSkills(3));
    }
    prevIsOpen.current = isOpen;
  }, [isOpen]);

  const handleReroll = useCallback(() => {
    setChoices(sampleSkills(3));
  }, []);

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

        <div className="card-draft-choices">
          {choices.map((skill) => (
            <div
              key={skill.id}
              className="card-draft-choice"
              onClick={() => onSelectSkill(skill.id)}
            >
              <div className="skill-draft-card">
                <div className="skill-draft-card-bg">
                  <img src={skillScrollImage} alt="" />
                </div>
                <div className="skill-draft-card-content">
                  <div className="skill-draft-icon">
                    {getSkillIcon(skill.id)}
                  </div>
                  <div className="skill-draft-name">{skill.name}</div>
                  <div className={`skill-draft-type ${skill.type === 'active' ? 'skill-draft-type-active' : 'skill-draft-type-passive'}`}>
                    {skill.type === 'active' ? '主动' : '被动'}
                  </div>
                  <div className="skill-draft-divider" />
                  <div className="skill-draft-effect">{skill.effect}</div>
                </div>
              </div>
              <div className="card-draft-choice-name">{skill.name}</div>
              <div className="card-draft-choice-desc">{skill.description}</div>
            </div>
          ))}
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
