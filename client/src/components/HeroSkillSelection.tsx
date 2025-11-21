import { useState } from 'react';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
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
  const [selectedSkill, setSelectedSkill] = useState<string | null>(null);

  const handleConfirm = () => {
    if (selectedSkill) {
      onSelectSkill(selectedSkill);
    }
  };

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
              onClick={() => setSelectedSkill(skill.id)}
              className={`
                relative cursor-pointer transition-all duration-300 hover-elevate active-elevate-2
                ${selectedSkill === skill.id 
                  ? 'ring-4 ring-primary scale-105 shadow-xl' 
                  : 'hover:scale-102 hover:shadow-lg'
                }
              `}
              data-testid={`skill-card-${skill.id}`}
            >
              {/* Selection indicator */}
              {selectedSkill === skill.id && (
                <div className="absolute -top-3 -right-3 bg-primary text-primary-foreground rounded-full w-8 h-8 flex items-center justify-center font-bold shadow-lg z-10">
                  ✓
                </div>
              )}

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

                {/* Effect - Click to directly select and confirm */}
                <div 
                  className="bg-primary/10 rounded-lg p-3 border border-primary/30 cursor-pointer hover:bg-primary/20 transition-colors"
                  onClick={(e) => {
                    e.stopPropagation();
                    onSelectSkill(skill.id);
                  }}
                >
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

        {/* Confirm Button */}
        <div className="flex justify-center">
          <Button
            onClick={handleConfirm}
            disabled={!selectedSkill}
            className="px-8 py-3 text-lg font-semibold min-w-[200px]"
            data-testid="confirm-skill-button"
          >
            {selectedSkill ? 'Begin Adventure' : 'Select a Skill'}
          </Button>
        </div>

        {/* Tip */}
        <p className="text-xs text-muted-foreground text-center mt-4">
          Click on the skill effect box to instantly select and start your adventure
        </p>
      </div>
    </div>
  );
}