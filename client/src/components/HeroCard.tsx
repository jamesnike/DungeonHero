import { Card } from '@/components/ui/card';
import { Heart, AlertTriangle, Sparkles } from 'lucide-react';
import { Progress } from '@/components/ui/progress';
import React, { useEffect, useRef } from 'react';
import type { RefObject } from 'react';
import { initMobileDrop } from '../utils/mobileDragDrop';
import type { CSSProperties } from 'react';
import type { HeroMagicId } from '@/components/GameCard';

const BASE_HERO_WIDTH = 260;
const HERO_SCALE_MIN = 0.75;
const HERO_SCALE_MAX = 1.3;

const clamp = (value: number, min: number, max: number) => Math.min(max, Math.max(min, value));

interface HeroCardProps {
  hp: number;
  maxHp: number;
  scaleMultiplier?: number;
  onDrop?: (card: any) => void;
  onHeroClick?: () => void;
  isDropTarget?: boolean;
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
  heroMagicInfo?: HeroMagicUiState[] | null;
  onHeroMagicTrigger?: (id: HeroMagicId) => void;
  heroMagicChoice?: HeroMagicChoicePrompt | null;
  onHeroMagicChoice?: (choice: 'heal' | 'purge') => void;
  onHeroMagicCancel?: () => void;
  bleedAnimation?: boolean;
  weaponSwingAnimation?: boolean;
  shieldBlockAnimation?: boolean;
  spellDamageBonus?: number;
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

interface HeroMagicUiState {
  id: HeroMagicId;
  name: string;
  gauge: number;
  gaugeMax: number;
  unlocked: boolean;
  ready: boolean;
  usedThisWave: boolean;
  chargeHint: string;
  disabledReason?: string;
}

type HeroMagicChoicePrompt = {
  id: HeroMagicId;
  prompt: string;
};

export default function HeroCard({ 
  hp, 
  maxHp, 
  scaleMultiplier = 1,
  onDrop, 
  isDropTarget,
  image,
  takingDamage = false,
  healing = false,
  showAttackIndicator = false,
  heroSkillInfo = null,
  heroSkillMessage = null,
  onHeroSkillClick,
  onHeroSkillCancel,
  heroSkillButtonRef,
  heroMagicInfo = null,
  onHeroMagicTrigger,
  heroMagicChoice = null,
  onHeroMagicChoice,
  onHeroMagicCancel,
  bleedAnimation = false,
  weaponSwingAnimation = false,
  shieldBlockAnimation = false,
  spellDamageBonus = 0,
  onHeroClick,
}: HeroCardProps) {
  const [dragDepth, setDragDepth] = React.useState(0);
  const [heroScale, setHeroScale] = React.useState(1);
  const isOver = dragDepth > 0;
  const heroRef = useRef<HTMLDivElement>(null);
  const lastTapRef = useRef<{ time: number; x: number; y: number } | null>(null);
  const touchTimeoutRef = useRef<number | null>(null);
  
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

  useEffect(() => {
    return () => {
      if (touchTimeoutRef.current) {
        window.clearTimeout(touchTimeoutRef.current);
      }
    };
  }, []);

  useEffect(() => {
    if (typeof window === 'undefined' || typeof ResizeObserver === 'undefined') {
      return;
    }
    const target = heroRef.current;
    if (!target) {
      return;
    }

    const updateScale = () => {
      const { width } = target.getBoundingClientRect();
      if (!width) {
        return;
      }
      setHeroScale(prev => {
        const next = clamp(width / BASE_HERO_WIDTH, HERO_SCALE_MIN, HERO_SCALE_MAX);
        return Math.abs(prev - next) > 0.01 ? next : prev;
      });
    };

    updateScale();
    const observer = new ResizeObserver(updateScale);
    observer.observe(target);
    return () => observer.disconnect();
  }, []);

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
  const heroMagicButtonClasses = (ready: boolean) =>
    ready
      ? 'bg-rose-500 text-white hover:bg-rose-500/90 shadow'
      : 'bg-muted text-muted-foreground cursor-not-allowed border border-border';
  const spellDamageDisplay = Math.max(0, spellDamageBonus);
  const appliedHeroScale = clamp(
    heroScale * scaleMultiplier,
    HERO_SCALE_MIN * Math.min(1, scaleMultiplier),
    HERO_SCALE_MAX * Math.max(1, scaleMultiplier),
  );

  const handleHeroCardClick = (event: React.MouseEvent<HTMLDivElement>) => {
    if (!onHeroClick) {
      return;
    }
    event.stopPropagation();
    onHeroClick();
  };

  const handleHeroTouchEnd = (event: React.TouchEvent<HTMLDivElement>) => {
    if (!onHeroClick) {
      return;
    }
    const touch = event.changedTouches[0];
    if (!touch) {
      return;
    }
    const currentTime = Date.now();
    const { clientX, clientY } = touch;
    if (lastTapRef.current) {
      const timeDiff = currentTime - lastTapRef.current.time;
      const xDiff = Math.abs(clientX - lastTapRef.current.x);
      const yDiff = Math.abs(clientY - lastTapRef.current.y);
      if (timeDiff < 300 && xDiff < 50 && yDiff < 50) {
        event.preventDefault();
        event.stopPropagation();
        lastTapRef.current = null;
        if (touchTimeoutRef.current) {
          window.clearTimeout(touchTimeoutRef.current);
          touchTimeoutRef.current = null;
        }
        onHeroClick();
        return;
      }
    }
    lastTapRef.current = { time: currentTime, x: clientX, y: clientY };
    if (touchTimeoutRef.current) {
      window.clearTimeout(touchTimeoutRef.current);
    }
    touchTimeoutRef.current = window.setTimeout(() => {
      lastTapRef.current = null;
      touchTimeoutRef.current = null;
    }, 300);
  };

  return (
    <div 
      ref={heroRef}
      onDragEnter={handleDragEnter}
      onDragOver={handleDragOver}
      onDragLeave={handleDragLeave}
      onDrop={handleDrop}
      onClick={onHeroClick ? handleHeroCardClick : undefined}
      onTouchEnd={onHeroClick ? handleHeroTouchEnd : undefined}
      className="relative h-full w-full overflow-visible"
      data-testid="hero-card"
      style={{ '--dh-hero-instance-scale': appliedHeroScale.toString() } as CSSProperties}
    >
      <div className="pointer-events-none absolute -top-7 left-1/2 z-30 flex -translate-x-1/2 items-center gap-2 rounded-full border border-border bg-background/95 px-3 py-1 dh-hero-small font-bold tracking-wide text-muted-foreground shadow-lg whitespace-nowrap">
        <span className="flex items-center gap-1 text-purple-500">
          <Sparkles className="dh-hero-icon" />
          永久法术伤害
        </span>
        <span className="text-muted-foreground/50">|</span>
        <span className="font-mono text-primary dh-hero-chip">+{spellDamageDisplay}</span>
      </div>
      <Card className={`
        relative h-full w-full border-4 border-primary shadow-2xl overflow-hidden
        transition-all duration-200
        ${isDropTarget ? 'border-destructive animate-pulse' : ''}
        ${isDropTarget && isOver ? 'scale-105 ring-4 ring-destructive bg-destructive/10' : ''}
        ${takingDamage ? 'animate-damage-flash' : ''}
        ${healing ? 'animate-heal-glow' : ''}
      `}>
        <div className="h-full flex flex-col">
          <div className="relative h-[55%] bg-gradient-to-b from-primary/25 via-primary/15 to-card overflow-hidden">
            {image && (
              <img
                src={image}
                alt="Hero"
                className="w-full h-full object-cover transform scale-95 origin-top"
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
                  <Heart className="dh-hero-icon text-destructive" />
                  <span className="dh-hero-hp font-mono font-bold" data-testid="hero-hp">
                    {hp}/{maxHp}
                  </span>
                </div>
                <Progress value={hpPercentage} className="h-1.5" />
              </div>
            </div>

          </div>
          
          <div className="h-[40%] px-2 pb-3 pt-3 flex flex-col gap-2 items-stretch justify-start bg-card">
            {heroSkillInfo && (
              <div className="mt-2 flex flex-col items-center gap-1">
                {isPassiveSkill ? (
                  <span className="dh-hero-small uppercase tracking-wide text-muted-foreground">
                    Passive Skill: {heroSkillInfo.name}
                  </span>
                ) : (
                  <div className="flex items-center gap-2 flex-wrap justify-center">
                    <button
                      type="button"
                      className={`dh-hero-small font-semibold uppercase tracking-wide px-4 py-1.5 rounded-full transition ${heroSkillButtonClasses}`}
                      disabled={heroSkillButtonDisabled}
                      onClick={(event) => {
                        event.stopPropagation();
                        onHeroSkillClick?.();
                      }}
                      onTouchEnd={(event) => event.stopPropagation()}
                      title={heroSkillInfo.disabledReason}
                      ref={heroSkillButtonRef}
                    >
                      {heroSkillButtonLabel}
                    </button>
                    {heroSkillInfo.isPending && onHeroSkillCancel && (
                      <button
                        type="button"
                        className="dh-hero-small font-semibold text-muted-foreground hover:text-foreground transition-colors"
                        onClick={(event) => {
                          event.stopPropagation();
                          onHeroSkillCancel();
                        }}
                        onTouchEnd={(event) => event.stopPropagation()}
                      >
                        Cancel
                      </button>
                    )}
                  </div>
                )}
              </div>
            )}
            {heroSkillMessage && (
              <div className="mt-1 flex items-center gap-1 dh-hero-small text-muted-foreground text-center justify-center">
                <AlertTriangle className="w-3 h-3" />
                <span>{heroSkillMessage}</span>
              </div>
            )}
            {heroMagicChoice && (
              <div className="w-full rounded-md border border-amber-500/40 bg-amber-500/10 p-2 space-y-2">
                <span className="text-xs font-semibold text-amber-700">{heroMagicChoice.prompt}</span>
                <div className="flex flex-wrap gap-2">
                  <button
                    type="button"
                    className="dh-hero-small font-semibold px-3 py-1 rounded-full bg-emerald-500 text-white hover:bg-emerald-500/90 transition"
                    onClick={(event) => {
                      event.stopPropagation();
                      onHeroMagicChoice?.('heal');
                    }}
                  >
                    回满生命
                  </button>
                  <button
                    type="button"
                    className="dh-hero-small font-semibold px-3 py-1 rounded-full bg-sky-500 text-white hover:bg-sky-500/90 transition"
                    onClick={(event) => {
                      event.stopPropagation();
                      onHeroMagicChoice?.('purge');
                    }}
                  >
                    净化怒气
                  </button>
                  {onHeroMagicCancel && (
                    <button
                      type="button"
                      className="dh-hero-small font-semibold px-3 py-1 rounded-full border border-border text-muted-foreground hover:text-foreground transition"
                      onClick={(event) => {
                        event.stopPropagation();
                        onHeroMagicCancel();
                      }}
                    >
                      取消
                    </button>
                  )}
                </div>
              </div>
            )}
            {heroMagicInfo && heroMagicInfo.length > 0 && (
              <div className="w-full space-y-1.5">
                {heroMagicInfo.map(magic => (
                  <div
                    key={magic.id}
                    className="w-full rounded-md border border-border/50 bg-muted/30 p-2 space-y-1"
                  >
                    <div className="flex items-center justify-between text-xs font-semibold">
                      <span className="text-foreground">{magic.name}</span>
                      <span className="font-mono text-muted-foreground">
                        {magic.unlocked ? `${magic.gauge}/${magic.gaugeMax}` : '未解锁'}
                      </span>
                    </div>
                    <Progress
                      value={magic.unlocked ? (magic.gauge / magic.gaugeMax) * 100 : 0}
                      className="h-1.5"
                    />
                    <div className="flex items-center gap-2">
                      <button
                        type="button"
                        className={`dh-hero-small font-semibold uppercase tracking-wide px-3 py-1 rounded-full transition ${heroMagicButtonClasses(
                          Boolean(onHeroMagicTrigger) && magic.ready,
                        )}`}
                        disabled={!onHeroMagicTrigger || !magic.ready}
                        onClick={(event) => {
                          event.stopPropagation();
                          if (magic.ready) {
                            onHeroMagicTrigger?.(magic.id);
                          }
                        }}
                        title={magic.disabledReason}
                      >
                        释放
                      </button>
                      <span className="text-[10px] text-muted-foreground flex-1">{magic.chargeHint}</span>
                    </div>
                    {magic.disabledReason && !magic.ready && (
                      <div className="text-[10px] text-muted-foreground/80">{magic.disabledReason}</div>
                    )}
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      </Card>
    </div>
  );
}
