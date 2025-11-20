import { useState } from 'react';
import { Card } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Dices } from 'lucide-react';

interface DiceRollerProps {
  onRoll?: (value: number) => void;
  className?: string;
}

export default function DiceRoller({ onRoll, className = '' }: DiceRollerProps) {
  const [currentValue, setCurrentValue] = useState<number>(20);
  const [isRolling, setIsRolling] = useState(false);
  const [rollHistory, setRollHistory] = useState<number[]>([]);

  // Roll dice function that can be exposed
  const rollDice = () => {
    if (isRolling) return;
    
    setIsRolling(true);
    
    // Simulate rolling animation with rapid value changes
    const animationDuration = 1500;
    const animationSteps = 20;
    const stepDuration = animationDuration / animationSteps;
    
    let step = 0;
    const animationInterval = setInterval(() => {
      if (step < animationSteps - 1) {
        // Random values during animation
        setCurrentValue(Math.floor(Math.random() * 20) + 1);
        step++;
      } else {
        // Final value
        const finalValue = Math.floor(Math.random() * 20) + 1;
        setCurrentValue(finalValue);
        setRollHistory(prev => [finalValue, ...prev.slice(0, 4)]);
        setIsRolling(false);
        clearInterval(animationInterval);
        
        // Call the onRoll callback if provided
        onRoll?.(finalValue);
      }
    }, stepDuration);
  };

  // 3D D20 using CSS transforms
  const renderD20_3D = () => {
    return (
      <div 
        className="relative w-20 h-20 preserve-3d"
        style={{ 
          transformStyle: 'preserve-3d',
          transform: isRolling 
            ? 'rotateX(720deg) rotateY(720deg) rotateZ(360deg)' 
            : 'rotateX(-25deg) rotateY(25deg)',
          transition: isRolling ? 'transform 1.5s cubic-bezier(0.4, 0.0, 0.2, 1)' : 'transform 0.3s ease'
        }}
      >
        {/* 3D icosahedron effect using multiple faces */}
        <div className="absolute inset-0 flex items-center justify-center">
          {/* Main face */}
          <div 
            className="absolute w-full h-full flex items-center justify-center"
            style={{
              background: 'linear-gradient(135deg, hsl(var(--primary) / 0.9), hsl(var(--primary) / 0.6))',
              clipPath: 'polygon(50% 0%, 100% 38%, 82% 100%, 18% 100%, 0% 38%)',
              boxShadow: 'inset 0 2px 10px rgba(255, 255, 255, 0.3), inset 0 -2px 10px rgba(0, 0, 0, 0.2)',
              backfaceVisibility: 'hidden'
            }}
          >
            <span className="font-mono font-bold text-2xl text-primary-foreground drop-shadow-md">
              {currentValue}
            </span>
          </div>
          
          {/* Additional 3D faces for depth */}
          {[...Array(3)].map((_, i) => (
            <div 
              key={i}
              className="absolute w-full h-full"
              style={{
                background: `linear-gradient(${120 * i}deg, hsl(var(--primary) / ${0.6 - i * 0.1}), hsl(var(--primary) / ${0.4 - i * 0.1}))`,
                clipPath: 'polygon(50% 0%, 100% 38%, 82% 100%, 18% 100%, 0% 38%)',
                transform: `rotateY(${120 * (i + 1)}deg) translateZ(10px)`,
                transformStyle: 'preserve-3d',
                backfaceVisibility: 'visible',
                opacity: isRolling ? 0.8 : 0.6
              }}
            />
          ))}
          
          {/* Shiny effect */}
          <div 
            className="absolute inset-0 pointer-events-none"
            style={{
              background: 'radial-gradient(circle at 30% 30%, rgba(255, 255, 255, 0.4) 0%, transparent 50%)',
              clipPath: 'polygon(50% 0%, 100% 38%, 82% 100%, 18% 100%, 0% 38%)'
            }}
          />
        </div>
        
        {/* Shadow */}
        <div 
          className="absolute -bottom-2 left-1/2 transform -translate-x-1/2 w-16 h-3 bg-black/20 rounded-full blur-md"
          style={{
            transform: `translateX(-50%) ${isRolling ? 'scale(0.8)' : 'scale(1)'}`,
            transition: 'transform 0.3s ease'
          }}
        />
      </div>
    );
  };

  return (
    <Card 
      className={`
        relative cursor-pointer transition-all duration-200
        hover-elevate active-elevate-2
        bg-card border-2 border-card-border overflow-visible
        ${className}
      `}
      onClick={rollDice}
      data-testid="dice-roller"
      style={{ perspective: '200px' }}
    >
      <div className="flex flex-col items-center justify-center p-3 gap-1">
        {/* D20 Icon at top */}
        <div className="flex items-center gap-1 text-xs text-muted-foreground">
          <Dices className="w-3 h-3" />
          <span className="font-medium">D20</span>
        </div>
        
        {/* 3D Dice display */}
        {renderD20_3D()}
        
        {/* Roll instruction or status */}
        <span className="text-xs text-muted-foreground mt-1">
          {isRolling ? 'Rolling...' : 'Click to roll'}
        </span>
        
        {/* Recent rolls */}
        {rollHistory.length > 0 && (
          <div className="flex gap-1 absolute top-2 right-2">
            {rollHistory.slice(0, 3).map((value, idx) => (
              <Badge 
                key={idx}
                variant="outline" 
                className={`text-xs px-1 py-0 ${idx === 0 ? 'bg-primary/10' : 'opacity-50'}`}
              >
                {value}
              </Badge>
            ))}
          </div>
        )}
      </div>
    </Card>
  );
}

// Export the roll function for external use
export const rollD20 = () => {
  return Math.floor(Math.random() * 20) + 1;
};
