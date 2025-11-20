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

  // 3D D20 using CSS transforms - realistic icosahedron
  const renderD20_3D = () => {
    return (
      <div 
        className="relative w-24 h-24 preserve-3d"
        style={{ 
          transformStyle: 'preserve-3d',
          transform: isRolling 
            ? 'rotateX(720deg) rotateY(720deg) rotateZ(360deg)' 
            : 'rotateX(-30deg) rotateY(45deg)',
          transition: isRolling ? 'transform 1.5s cubic-bezier(0.4, 0.0, 0.2, 1)' : 'transform 0.3s ease'
        }}
      >
        {/* Create multiple triangular faces for realistic D20 */}
        <div className="absolute inset-0">
          {/* Top pyramid */}
          {[0, 72, 144, 216, 288].map((angle, i) => (
            <div
              key={`top-${i}`}
              className="absolute w-full h-full flex items-center justify-center"
              style={{
                transform: `rotateY(${angle}deg) rotateX(26.57deg) translateZ(30px)`,
                transformStyle: 'preserve-3d',
              }}
            >
              <div
                style={{
                  width: '50px',
                  height: '43px',
                  background: `linear-gradient(135deg, 
                    hsl(280 50% ${35 + (i % 2) * 10}%) 0%, 
                    hsl(280 40% ${25 + (i % 2) * 5}%) 100%)`,
                  clipPath: 'polygon(50% 0%, 100% 100%, 0% 100%)',
                  border: '1px solid hsl(280 60% 20%)',
                  boxShadow: 'inset 0 2px 5px rgba(255,255,255,0.2), inset 0 -2px 5px rgba(0,0,0,0.3)',
                }}
              >
                {i === 0 && (
                  <div className="flex items-center justify-center h-full pt-3">
                    <span className="font-mono font-bold text-lg text-white/90 drop-shadow-lg">
                      {currentValue}
                    </span>
                  </div>
                )}
              </div>
            </div>
          ))}
          
          {/* Middle band */}
          {[0, 36, 72, 108, 144, 180, 216, 252, 288, 324].map((angle, i) => (
            <div
              key={`mid-${i}`}
              className="absolute w-full h-full"
              style={{
                transform: `rotateY(${angle}deg) translateZ(30px)`,
                transformStyle: 'preserve-3d',
              }}
            >
              <div
                style={{
                  width: '50px',
                  height: '43px',
                  background: `linear-gradient(135deg, 
                    hsl(280 50% ${30 + (i % 3) * 10}%) 0%, 
                    hsl(280 40% ${20 + (i % 3) * 5}%) 100%)`,
                  clipPath: i % 2 === 0 
                    ? 'polygon(50% 0%, 100% 100%, 0% 100%)' 
                    : 'polygon(50% 100%, 100% 0%, 0% 0%)',
                  border: '1px solid hsl(280 60% 20%)',
                  boxShadow: 'inset 0 1px 3px rgba(255,255,255,0.15), inset 0 -1px 3px rgba(0,0,0,0.25)',
                  opacity: 0.9
                }}
              />
            </div>
          ))}
          
          {/* Bottom pyramid */}
          {[0, 72, 144, 216, 288].map((angle, i) => (
            <div
              key={`bottom-${i}`}
              className="absolute w-full h-full"
              style={{
                transform: `rotateY(${angle}deg) rotateX(-26.57deg) translateZ(30px)`,
                transformStyle: 'preserve-3d',
              }}
            >
              <div
                style={{
                  width: '50px',
                  height: '43px',
                  background: `linear-gradient(135deg, 
                    hsl(280 45% ${25 + (i % 2) * 8}%) 0%, 
                    hsl(280 35% ${15 + (i % 2) * 5}%) 100%)`,
                  clipPath: 'polygon(50% 100%, 100% 0%, 0% 0%)',
                  border: '1px solid hsl(280 60% 15%)',
                  boxShadow: 'inset 0 1px 3px rgba(255,255,255,0.1), inset 0 -1px 3px rgba(0,0,0,0.4)',
                  opacity: 0.85
                }}
              />
            </div>
          ))}
          
          {/* Metallic shine overlay */}
          <div 
            className="absolute inset-0 pointer-events-none rounded-full"
            style={{
              background: 'radial-gradient(circle at 35% 35%, rgba(255,255,255,0.5) 0%, transparent 40%)',
              filter: 'blur(2px)',
              transform: 'scale(0.8)',
            }}
          />
        </div>
        
        {/* Shadow */}
        <div 
          className="absolute -bottom-4 left-1/2 transform -translate-x-1/2 w-20 h-4 bg-black/30 rounded-full blur-lg"
          style={{
            transform: `translateX(-50%) ${isRolling ? 'scale(0.7)' : 'scale(1)'}`,
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
