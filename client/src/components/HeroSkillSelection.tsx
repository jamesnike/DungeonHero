import { Card } from '@/components/ui/card';
import { Sword, Heart, Skull } from 'lucide-react';

// Import skill scroll image for the cards
import skillScrollImage from '@assets/generated_images/chibi_skill_scroll.png';

interface HeroSkill {
  id: string;
  name: string;
  description: string;
  icon: React.ReactNode;
  effect: string;
  color: string;
}

const knightSkills: HeroSkill[] = [
  {
    id: 'weapon-master',
    name: 'Weapon Master',
    description: 'Years of training have honed your weapon expertise',
    icon: <Sword className="w-8 h-8" />,
    effect: 'All weapons gain +1 damage permanently',
    color: 'text-red-500'
  },
  {
    id: 'iron-will',
    name: 'Iron Will',
    description: 'Your unyielding spirit grants you greater vitality',
    icon: <Heart className="w-8 h-8" />,
    effect: 'Start with +5 max HP',
    color: 'text-green-500'
  },
  {
    id: 'bloodthirsty',
    name: 'Bloodthirsty',
    description: 'The thrill of battle restores your strength',
    icon: <Skull className="w-8 h-8" />,
    effect: 'Heal 2 HP when killing monsters',
    color: 'text-purple-500'
  }
];

interface HeroSkillSelectionProps {
  isOpen: boolean;
  onSelectSkill: (skillId: string) => void;
}

export default function HeroSkillSelection({ isOpen, onSelectSkill }: HeroSkillSelectionProps) {
  return (
    <div 
      className={`fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm transition-opacity duration-200 ${
        isOpen ? 'opacity-100 pointer-events-auto' : 'opacity-0 pointer-events-none'
      }`}
    >
      <div className={`bg-background rounded-2xl p-8 max-w-4xl w-full mx-4 shadow-2xl border-2 border-primary transform transition-transform duration-200 ${
        isOpen ? 'scale-100' : 'scale-95'
      }`}>
        {/* Header */}
        <div className="text-center mb-8">
          <h2 className="font-serif text-4xl font-bold mb-3 text-primary">Choose Your Skill</h2>
          <p className="text-muted-foreground text-lg">
            Select one skill to master before your adventure begins
          </p>
        </div>

        {/* Skills Grid */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-8">
          {knightSkills.map((skill) => (
            <Card
              key={skill.id}
              onClick={() => onSelectSkill(skill.id)}
              className={`
                relative cursor-pointer transition-all duration-300 hover-elevate active-elevate-2
                hover:scale-105 hover:shadow-xl hover:ring-4 hover:ring-primary
              `}
              data-testid={`skill-card-${skill.id}`}
            >

              <div className="p-6">
                {/* Icon and Title */}
                <div className="flex items-center justify-center mb-4">
                  <div className={`${skill.color} bg-muted rounded-full p-4`}>
                    {skill.icon}
                  </div>
                </div>

                <h3 className="font-serif text-xl font-bold text-center mb-2">
                  {skill.name}
                </h3>

                {/* Description */}
                <p className="text-sm text-muted-foreground text-center mb-4 italic">
                  {skill.description}
                </p>

                {/* Effect */}
                <div className="bg-primary/10 rounded-lg p-3 border border-primary/30">
                  <p className="text-sm font-medium text-center">
                    {skill.effect}
                  </p>
                </div>

                {/* Scroll image background */}
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

        {/* Tip */}
        <p className="text-sm text-muted-foreground text-center mt-6">
          Click on any skill box above to select and start your adventure
        </p>
      </div>
    </div>
  );
}