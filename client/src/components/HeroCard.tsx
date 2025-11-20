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
}

export default function HeroCard({ 
  hp, 
  maxHp, 
  onDrop, 
  isDropTarget,
  equippedWeapon,
  equippedShield,
  image
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
      className="w-48 h-64 md:w-56 md:h-80"
      data-testid="hero-card"
    >
      <Card className={`
        w-full h-full border-4 border-primary shadow-2xl overflow-hidden
        transition-all duration-200
        ${isDropTarget ? 'scale-105 border-destructive animate-pulse' : ''}
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
            
            <div className="absolute top-3 left-3 right-3">
              <div className="bg-background/90 backdrop-blur-sm rounded-lg p-2">
                <div className="flex items-center justify-between mb-1">
                  <Heart className="w-5 h-5 text-destructive" />
                  <span className="font-mono text-2xl font-bold" data-testid="hero-hp">
                    {hp}/{maxHp}
                  </span>
                </div>
                <Progress value={hpPercentage} className="h-2" />
              </div>
            </div>

            {(equippedWeapon || equippedShield) && (
              <div className="absolute bottom-3 left-3 right-3 flex gap-2">
                {equippedWeapon && (
                  <div className="bg-background/90 backdrop-blur-sm rounded-md px-2 py-1 flex items-center gap-1 flex-1">
                    <Sword className="w-4 h-4 text-amber-500" />
                    <span className="text-xs font-mono">{equippedWeapon.value}</span>
                  </div>
                )}
                {equippedShield && (
                  <div className="bg-background/90 backdrop-blur-sm rounded-md px-2 py-1 flex items-center gap-1 flex-1">
                    <Shield className="w-4 h-4 text-blue-500" />
                    <span className="text-xs font-mono">{equippedShield.value}</span>
                  </div>
                )}
              </div>
            )}
          </div>
          
          <div className="h-[30%] p-3 flex flex-col items-center justify-center bg-card">
            <h2 className="font-serif font-bold text-xl text-center" data-testid="hero-name">
              Hero
            </h2>
            <p className="text-xs text-muted-foreground">Adventurer</p>
          </div>
        </div>
      </Card>
    </div>
  );
}
