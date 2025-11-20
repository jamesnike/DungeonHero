import { Card } from '@/components/ui/card';
import { Heart, Shield, Sword } from 'lucide-react';
import { Progress } from '@/components/ui/progress';

interface HeroCardProps {
  hp: number;
  maxHp: number;
  onDrop?: (card: any) => void;
  isDropTarget?: boolean;
  equippedWeapon?: { name: string; value: number } | null;
  equippedShield?: { name: string; value: number } | null;
  image?: string;
  takingDamage?: boolean;
  healing?: boolean;
}

export default function HeroCard({ 
  hp, 
  maxHp, 
  onDrop, 
  isDropTarget,
  equippedWeapon,
  equippedShield,
  image,
  takingDamage = false,
  healing = false
}: HeroCardProps) {
  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    const cardData = e.dataTransfer.getData('card');
    if (cardData) {
      onDrop?.(JSON.parse(cardData));
    }
  };

  const hpPercentage = (hp / maxHp) * 100;

  return (
    <div 
      onDragOver={handleDragOver}
      onDrop={handleDrop}
      style={{ 
        width: 'clamp(80px, 12vw, 160px)', 
        height: 'clamp(112px, 16.8vw, 224px)' 
      }}
      data-testid="hero-card"
    >
      <Card className={`
        w-full h-full border-4 border-primary shadow-2xl overflow-hidden
        transition-all duration-200
        ${isDropTarget ? 'scale-105 border-destructive animate-pulse' : ''}
        ${takingDamage ? 'animate-damage-flash' : ''}
        ${healing ? 'animate-heal-glow' : ''}
      `}>
        <div className="h-full flex flex-col">
          <div className="relative h-[70%] bg-gradient-to-b from-primary/20 to-card overflow-hidden">
            {image && (
              <img 
                src={image} 
                alt="Hero"
                className="w-full h-full object-cover"
              />
            )}
            
            <div className="absolute top-2 left-2 right-2">
              <div className="bg-background/90 backdrop-blur-sm rounded-lg p-1.5">
                <div className="flex items-center justify-between mb-0.5">
                  <Heart className="w-4 h-4 text-destructive" />
                  <span className="font-mono text-lg font-bold" data-testid="hero-hp">
                    {hp}/{maxHp}
                  </span>
                </div>
                <Progress value={hpPercentage} className="h-1.5" />
              </div>
            </div>

            {(equippedWeapon || equippedShield) && (
              <div className="absolute bottom-2 left-2 right-2 flex gap-1">
                {equippedWeapon && (
                  <div className="bg-background/90 backdrop-blur-sm rounded-md px-1.5 py-0.5 flex items-center gap-1 flex-1">
                    <Sword className="w-3 h-3 text-amber-500" />
                    <span className="text-xs font-mono">{equippedWeapon.value}</span>
                  </div>
                )}
                {equippedShield && (
                  <div className="bg-background/90 backdrop-blur-sm rounded-md px-1.5 py-0.5 flex items-center gap-1 flex-1">
                    <Shield className="w-3 h-3 text-blue-500" />
                    <span className="text-xs font-mono">{equippedShield.value}</span>
                  </div>
                )}
              </div>
            )}
          </div>
          
          <div className="h-[30%] p-2 flex flex-col items-center justify-center bg-card">
            <h2 className="font-serif font-bold text-base text-center" data-testid="hero-name">
              Hero
            </h2>
            <p className="text-xs text-muted-foreground">Adventurer</p>
          </div>
        </div>
      </Card>
    </div>
  );
}
