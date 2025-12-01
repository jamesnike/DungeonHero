import { Card } from '@/components/ui/card';
import { Shield, Droplet, Skull, Heart } from 'lucide-react';
import { heroSkills } from '@/lib/heroSkills';

// Import skill scroll image for the cards
import skillScrollImage from '@assets/generated_images/chibi_skill_scroll.png';

interface HeroSkillSelectionProps {
  isOpen: boolean;
  onSelectSkill: (skillId: string) => void;
}

export default function HeroSkillSelection({ isOpen, onSelectSkill }: HeroSkillSelectionProps) {
  const getSkillIcon = (skillId: string) => {
    switch (skillId) {
      case 'armor-pact':
        return <Shield className="w-5 h-5 md:w-6 md:h-6 lg:w-8 lg:h-8" />;
      case 'durability-for-blood':
        return <Droplet className="w-5 h-5 md:w-6 md:h-6 lg:w-8 lg:h-8" />;
      case 'blood-strike':
        return <Skull className="w-5 h-5 md:w-6 md:h-6 lg:w-8 lg:h-8" />;
      case 'vitality-well':
        return <Heart className="w-5 h-5 md:w-6 md:h-6 lg:w-8 lg:h-8" />;
      default:
        return <Shield className="w-5 h-5 md:w-6 md:h-6 lg:w-8 lg:h-8" />;
    }
  };

  return (
    <div 
      className={`fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm transition-opacity duration-200 ${
        isOpen ? 'opacity-100 pointer-events-auto' : 'opacity-0 pointer-events-none'
      }`}
    >
      <div className={`bg-background rounded-2xl p-4 md:p-6 lg:p-8 max-w-sm md:max-w-2xl lg:max-w-4xl w-full mx-2 md:mx-4 shadow-2xl border-2 border-primary transform transition-transform duration-200 ${
        isOpen ? 'scale-100' : 'scale-95'
      }`}>
        {/* Header */}
        <div className="text-center mb-4 md:mb-6 lg:mb-8">
          <h2 className="font-serif text-2xl md:text-3xl lg:text-4xl font-bold mb-2 md:mb-3 text-primary">Choose Your Skill</h2>
          <p className="text-muted-foreground text-sm md:text-base lg:text-lg">
            Select one skill to master before your adventure begins
          </p>
        </div>

        {/* Skills Grid */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-3 md:gap-4 lg:gap-6 mb-4 md:mb-6 lg:mb-8">
          {heroSkills.map((skill) => (
            <Card
              key={skill.id}
              onClick={() => onSelectSkill(skill.id)}
              className={`
                relative cursor-pointer transition-all duration-300 hover-elevate active-elevate-2
                hover:scale-105 hover:shadow-xl hover:ring-4 hover:ring-primary
              `}
              data-testid={`skill-card-${skill.id}`}
            >

              <div className="p-3 md:p-4 lg:p-6">
                {/* Icon and Title */}
                <div className="flex items-center justify-center mb-2 md:mb-3 lg:mb-4">
                  <div className="text-primary bg-muted rounded-full p-2 md:p-3 lg:p-4">
                    {getSkillIcon(skill.id)}
                  </div>
                </div>

                <h3 className="font-serif text-base md:text-lg lg:text-xl font-bold text-center mb-1 md:mb-2">
                  {skill.name}
                </h3>

                {/* Effect */}
                <div className="bg-primary/10 rounded-lg p-2 md:p-2.5 lg:p-3 border border-primary/30 mt-2">
                  <p className="text-xs md:text-sm font-medium text-center leading-relaxed">
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
        <p className="text-xs md:text-sm text-muted-foreground text-center mt-3 md:mt-4 lg:mt-6">
          Click on any skill box above to select and start your adventure
        </p>
      </div>
    </div>
  );
}