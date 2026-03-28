import { Card } from '@/components/ui/card';
import { Shield, Droplet, Skull, Heart, Coins, Ghost, HandCoins, Waves, Swords, HeartPulse, Zap, ShieldAlert, BookOpen, Cat, ArrowLeftRight } from 'lucide-react';
import { heroSkills } from '@/lib/heroSkills';
import { useOverlayScale } from '@/hooks/use-overlay-scale';

import skillScrollImage from '@assets/generated_images/chibi_skill_scroll.png';

interface HeroSkillSelectionProps {
  isOpen: boolean;
  onSelectSkill: (skillId: string) => void;
}

export default function HeroSkillSelection({ isOpen, onSelectSkill }: HeroSkillSelectionProps) {
  const overlayScale = useOverlayScale();
  const getSkillIcon = (skillId: string) => {
    const cls = "w-4 h-4 md:w-5 md:h-5";
    switch (skillId) {
      case 'armor-pact':
        return <Shield className={cls} />;
      case 'durability-for-blood':
        return <Droplet className={cls} />;
      case 'blood-strike':
        return <Skull className={cls} />;
      case 'vitality-well':
        return <Heart className={cls} />;
      case 'gold-discovery':
        return <Coins className={cls} />;
      case 'graveyard-recall':
        return <Ghost className={cls} />;
      case 'discard-profit':
        return <HandCoins className={cls} />;
      case 'waterfall-heal':
        return <Waves className={cls} />;
      case 'discard-empower':
        return <Swords className={cls} />;
      case 'heal-to-damage':
        return <HeartPulse className={cls} />;
      case 'early-surge':
        return <Zap className={cls} />;
      case 'shield-wall':
        return <ShieldAlert className={cls} />;
      case 'blood-draw':
        return <BookOpen className={cls} />;
      case 'summon-minion':
        return <Cat className={cls} />;
      case 'vanguard-swap':
        return <ArrowLeftRight className={cls} />;
      default:
        return <Shield className={cls} />;
    }
  };

  return (
    <div 
      className={`fixed inset-0 z-50 flex items-center justify-center bg-black/80 transition-opacity duration-200 ${
        isOpen ? 'opacity-100 pointer-events-auto' : 'opacity-0 pointer-events-none'
      }`}
    >
      <div
        className={`bg-background rounded-xl p-5 md:p-7 lg:p-9 max-w-lg md:max-w-4xl lg:max-w-[95vw] w-full mx-2 md:mx-4 max-h-[95vh] overflow-y-auto shadow-2xl border-2 border-primary transform transition-transform duration-200 ${
          isOpen ? 'scale-100' : 'scale-95'
        }`}
        style={{ zoom: overlayScale }}
      >
        <div className="text-center mb-3 md:mb-4 lg:mb-5">
          <h2 className="font-serif text-xl md:text-2xl lg:text-3xl font-bold mb-1.5 text-primary">选择英雄技能</h2>
          <p className="text-muted-foreground text-sm md:text-base">
            选择一项技能开始冒险
          </p>
        </div>

        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-2.5 md:gap-3 lg:gap-4 mb-3 md:mb-4 lg:mb-5">
          {heroSkills.map((skill) => (
            <Card
              key={skill.id}
              onClick={() => onSelectSkill(skill.id)}
              className="relative cursor-pointer transition-[transform,ring,box-shadow] duration-200 hover:scale-[1.03] hover:shadow-lg hover:ring-2 hover:ring-primary active:scale-[0.98]"
              data-testid={`skill-card-${skill.id}`}
            >
              <div className="p-2.5 md:p-3 lg:p-4">
                <div className="flex items-center gap-2 mb-1.5">
                  <div className="text-primary bg-muted rounded-full p-2 shrink-0">
                    {getSkillIcon(skill.id)}
                  </div>
                  <h3 className="font-serif text-sm md:text-base font-bold truncate">
                    {skill.name}
                  </h3>
                </div>

                <div className="bg-primary/10 rounded p-2 border border-primary/30">
                  <p className="text-xs md:text-sm font-medium leading-snug">
                    {skill.effect}
                  </p>
                </div>

                <div className="absolute inset-0 opacity-5 pointer-events-none">
                  <img 
                    src={skillScrollImage} 
                    alt="" 
                    className="w-full h-full object-cover rounded-lg"
                  />
                </div>
              </div>
            </Card>
          ))}
        </div>

        <p className="text-xs md:text-sm text-muted-foreground text-center">
          点击技能卡牌以选择
        </p>
      </div>
    </div>
  );
}
