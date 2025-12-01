import { Card } from '@/components/ui/card';
import { Heart, Shield, Sword, AlertTriangle } from 'lucide-react';
import { Progress } from '@/components/ui/progress';
import React, { useEffect, useRef } from 'react';
import type { RefObject } from 'react';
import { initMobileDrop } from '../utils/mobileDragDrop';

interface HeroCardProps {
  hp: number;
  maxHp: number;
  onDrop?: (card: any) => void;
  isDropTarget?: boolean;
  equippedWeapon?: { name: string; value: number } | null;
  equippedShield?: { name: string; value: number } | null;
  image?: string;
  name?: string;
  classTitle?: string;
  takingDamage?: boolean;
  healing?: boolean;
  showAttackIndicator?: boolean;
  heroSkillInfo?: HeroSkillUiState | null;
  heroSkillMessage?: string | null;
  onHeroSkillClick?: () => void;
  onHeroSkillCancel?: () => void;
  heroSkillButtonRef?: RefObject<HTMLButtonElement>;
  bleedAnimation?: boolean;
  weaponSwingAnimation?: boolean;
  shieldBlockAnimation?: boolean;
}

interface HeroSkillUiState {
  name: string;
  effect?: string;
  buttonLabel?: string;
  isPassive?: boolean;
  isReady?: boolean;
  isUsed?: boolean;
  isPending?: boolean;
  disabledReason?: string;
}

export default function HeroCard({ 
  hp, 
  maxHp, 
  onDrop, 
  isDropTarget,
  equippedWeapon,
  equippedShield,
  image,
  name = 'Hero',
  classTitle = 'Knight',
  takingDamage = false,
  healing = false,
  showAttackIndicator = false,
  heroSkillInfo = null,
  heroSkillMessage = null,
  onHeroSkillClick,
  onHeroSkillCancel,
  heroSkillButtonRef,
  bleedAnimation = false,
  weaponSwingAnimation = false,
  shieldBlockAnimation = false,
}: HeroCardProps) {
  const [dragDepth, setDragDepth] = React.useState(0);
  const isOver = dragDepth > 0;
  const heroRef = useRef<HTMLDivElement>(null);
  
  // Set up mobile drop support
  useEffect(() => {
    if (!heroRef.current || !onDrop) return;
    
    const cleanup = initMobileDrop(
      heroRef.current,
      (dragData) => {
        if (dragData.type === 'card') {
          onDrop(dragData.data);
        }
      },
      ['card'] // Accept only card drops
    );
    
    return cleanup;
  }, [onDrop]);

  const handleDragEnter = (e: React.DragEvent) => {
    e.preventDefault();
    if (isDropTarget) {
      setDragDepth(prev => prev + 1);
    }
  };

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    if (isDropTarget && dragDepth === 0) {
      setDragDepth(1);
    }
  };

  const handleDragLeave = (e: React.DragEvent) => {
    e.preventDefault();
    if (isDropTarget) {
      setDragDepth(prev => Math.max(0, prev - 1));
    }
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setDragDepth(0);
    const cardData = e.dataTransfer.getData('card');
    if (cardData) {
      onDrop?.(JSON.parse(cardData));
    }
  };

  const hpPercentage = (hp / maxHp) * 100;
  const heroSkillButtonLabel = heroSkillInfo?.buttonLabel ?? heroSkillInfo?.name ?? 'Hero Skill';
  const isPassiveSkill = Boolean(heroSkillInfo?.isPassive);
  const heroSkillButtonDisabled =
    !heroSkillInfo ||
    isPassiveSkill ||
    heroSkillInfo.isUsed ||
    !heroSkillInfo.isReady;
  const showBleedOverlay = Boolean(bleedAnimation);
  const showWeaponSwing = Boolean(weaponSwingAnimation);
  const showShieldBlock = Boolean(shieldBlockAnimation);
  const heroSkillButtonClasses = heroSkillButtonDisabled
    ? 'bg-muted text-muted-foreground cursor-not-allowed border border-border'
    : 'bg-primary text-primary-foreground hover:bg-primary/90 shadow';

  return (
    <div 
      ref={heroRef}
      onDragEnter={handleDragEnter}
      onDragOver={handleDragOver}
      onDragLeave={handleDragLeave}
      onDrop={handleDrop}
      className="h-full w-full"
      data-testid="hero-card"
    >
      <Card className={`
        relative h-full w-full border-4 border-primary shadow-2xl overflow-hidden
        transition-all duration-200
        ${isDropTarget ? 'border-destructive animate-pulse' : ''}
        ${isDropTarget && isOver ? 'scale-105 ring-4 ring-destructive bg-destructive/10' : ''}
        ${takingDamage ? 'animate-damage-flash' : ''}
        ${healing ? 'animate-heal-glow' : ''}
      `}>
        {showAttackIndicator && (
          <div className="absolute top-2 left-2 z-30 bg-primary text-primary-foreground rounded-full px-2 py-1 flex items-center gap-1 shadow-lg animate-pulse">
            <Sword className="w-4 h-4" />
            <span className="text-[10px] font-bold uppercase">Attack</span>
          </div>
        )}
        <div className="h-full flex flex-col">
          <div className="relative h-[60%] bg-gradient-to-b from-primary/20 to-card overflow-hidden">
            {image && (
              <img 
                src={image} 
                alt="Hero"
                className="w-full h-full object-cover"
                draggable={false}
                onDragStart={(e) => e.preventDefault()}
              />
            )}
            
            {(showBleedOverlay || showWeaponSwing || showShieldBlock) && (
              <div className="combat-overlay">
                {showBleedOverlay && (
                  <>
                    <span className="combat-overlay__shape combat-overlay__shape--bleed" />
                    <span
                      className="combat-overlay__shape combat-overlay__shape--bleed-drip"
                      data-stagger="1"
                    />
                    <span
                      className="combat-overlay__shape combat-overlay__shape--bleed-ring"
                      data-stagger="2"
                    />
                  </>
                )}
                {showWeaponSwing && (
                  <>
                    <span className="combat-overlay__shape combat-overlay__shape--swing" />
                    <span
                      className="combat-overlay__shape combat-overlay__shape--swing-echo"
                      data-stagger="1"
                    />
                    <span
                      className="combat-overlay__shape combat-overlay__shape--swing-spark"
                      data-stagger="2"
                    />
                  </>
                )}
                {showShieldBlock && (
                  <>
                    <span className="combat-overlay__shape combat-overlay__shape--block" />
                    <span
                      className="combat-overlay__shape combat-overlay__shape--block-ripple"
                      data-stagger="1"
                    />
                    <span
                      className="combat-overlay__shape combat-overlay__shape--block-spark"
                      data-stagger="2"
                    />
                  </>
                )}
              </div>
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
          
          <div className="h-[40%] px-2 pb-3 pt-3 flex flex-col items-center justify-start bg-card">
            <h2 className="font-serif font-bold text-base text-center" data-testid="hero-name">
              {name}
            </h2>
            <p className="text-xs text-muted-foreground">{classTitle}</p>
            {heroSkillInfo && (
              <div className="mt-2 flex flex-col items-center gap-1">
                {isPassiveSkill ? (
                  <span className="text-[11px] uppercase tracking-wide text-muted-foreground">
                    Passive Skill: {heroSkillInfo.name}
                  </span>
                ) : (
                  <div className="flex items-center gap-2 flex-wrap justify-center">
                    <button
                      type="button"
                      className={`text-[11px] font-semibold uppercase tracking-wide px-4 py-1.5 rounded-full transition ${heroSkillButtonClasses}`}
                      disabled={heroSkillButtonDisabled}
                      onClick={onHeroSkillClick}
                      title={heroSkillInfo.disabledReason}
                      ref={heroSkillButtonRef}
                    >
                      {heroSkillButtonLabel}
                    </button>
                    {heroSkillInfo.isPending && onHeroSkillCancel && (
                      <button
                        type="button"
                        className="text-[11px] font-semibold text-muted-foreground hover:text-foreground transition-colors"
                        onClick={onHeroSkillCancel}
                      >
                        Cancel
                      </button>
                    )}
                  </div>
                )}
              </div>
            )}
            {heroSkillMessage && (
              <div className="mt-1 flex items-center gap-1 text-[11px] text-muted-foreground text-center justify-center">
                <AlertTriangle className="w-3 h-3" />
                <span>{heroSkillMessage}</span>
              </div>
            )}
          </div>
        </div>
      </Card>
    </div>
  );
}
