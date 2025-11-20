import { useState, useEffect } from 'react';
import { Card } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Dices } from 'lucide-react';

interface DiceRollerProps {
  onRoll?: (value: number) => void;
  className?: string;
}

export default function DiceRoller({ onRoll, className = '' }: DiceRollerProps) {
  const [currentValue, setCurrentValue] = useState<number>(12);
  const [isRolling, setIsRolling] = useState(false);
  const [rollHistory, setRollHistory] = useState<number[]>([]);

  // Roll dice function that can be exposed
  const rollDice = () => {
    if (isRolling) return;
    
    setIsRolling(true);
    
    // Simulate rolling animation with rapid value changes
    const animationDuration = 1000;
    const animationSteps = 15;
    const stepDuration = animationDuration / animationSteps;
    
    let step = 0;
    const animationInterval = setInterval(() => {
      if (step < animationSteps - 1) {
        // Random values during animation
        setCurrentValue(Math.floor(Math.random() * 12) + 1);
        step++;
      } else {
        // Final value
        const finalValue = Math.floor(Math.random() * 12) + 1;
        setCurrentValue(finalValue);
        setRollHistory(prev => [finalValue, ...prev.slice(0, 4)]);
        setIsRolling(false);
        clearInterval(animationInterval);
        
        // Call the onRoll callback if provided
        onRoll?.(finalValue);
      }
    }, stepDuration);
  };

  // D12 shape representation using SVG
  const renderD12 = () => {
    return (
      <div 
        className={`relative flex items-center justify-center transition-all duration-200 ${
          isRolling ? 'animate-spin' : ''
        }`}
        style={{ 
          animation: isRolling ? 'spin 0.5s linear infinite, bounce 0.5s ease-in-out infinite' : undefined 
        }}
      >
        <svg
          width="80"
          height="80"
          viewBox="0 0 100 100"
          className="fill-primary/10 stroke-primary stroke-2"
        >
          {/* Dodecagon (12-sided polygon) */}
          <polygon
            points="50,5 73,11 88,28 94,50 88,72 73,89 50,95 27,89 12,72 6,50 12,28 27,11"
            className={`${isRolling ? 'fill-primary/20' : 'fill-primary/10'} transition-all`}
          />
        </svg>
        <div className="absolute inset-0 flex items-center justify-center">
          <span className={`font-mono font-bold text-3xl ${isRolling ? 'text-primary-foreground' : 'text-primary'}`}>
            {currentValue}
          </span>
        </div>
      </div>
    );
  };

  return (
    <Card 
      className={`
        relative cursor-pointer transition-all duration-200
        hover-elevate active-elevate-2
        bg-card border-2 border-card-border
        ${className}
      `}
      onClick={rollDice}
      data-testid="dice-roller"
    >
      <div className="flex flex-col items-center justify-center p-4 gap-2">
        {/* D12 Icon at top */}
        <div className="flex items-center gap-1 text-xs text-muted-foreground">
          <Dices className="w-3 h-3" />
          <span className="font-medium">D12</span>
        </div>
        
        {/* Dice display */}
        {renderD12()}
        
        {/* Roll instruction or status */}
        <span className="text-xs text-muted-foreground">
          {isRolling ? 'Rolling...' : 'Click to roll'}
        </span>
        
        {/* Recent rolls (optional - can be hidden if not needed) */}
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
export const rollD12 = () => {
  return Math.floor(Math.random() * 12) + 1;
};
