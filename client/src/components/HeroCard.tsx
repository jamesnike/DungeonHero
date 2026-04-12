import { Card } from '@/components/ui/card';
import { Heart, AlertTriangle, Sparkles, Droplets, Zap } from 'lucide-react';
import { Progress } from '@/components/ui/progress';
import React, { memo, useEffect, useRef } from 'react';
import type { RefObject } from 'react';
import { initMobileDrop } from '../utils/mobileDragDrop';
import type { CSSProperties } from 'react';
import type { HeroMagicId } from '@/components/GameCard';
import { useGameViewport } from '@/contexts/GameViewportContext';
import { FLAT_ASPECT_RATIO } from './game-board/constants';

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
  extraHeroSkillInfos?: ExtraHeroSkillUiState[];
  heroSkillMessage?: string | null;
  onHeroSkillClick?: () => void;
  onHeroSkillCancel?: () => void;
  onExtraHeroSkillClick?: (skillId: string) => void;
  heroSkillButtonRef?: RefObject<HTMLButtonElement>;
  heroMagicInfo?: HeroMagicUiState[] | null;
  onHeroMagicTrigger?: (id: HeroMagicId) => void;
  heroMagicChoice?: HeroMagicChoicePrompt | null;
  onHeroMagicChoice?: (choice: 'heal' | 'purge') => void;
  onHeroMagicCancel?: () => void;
  potionChoice?: { prompt: string; options: { label: string; value: string }[] } | null;
  onPotionChoice?: (value: string) => void;
  onPotionCancel?: () => void;
  bleedAnimation?: boolean;
  weaponSwingAnimation?: boolean;
  shieldBlockAnimation?: boolean;
  spellDamageBonus?: number;
  spellLifesteal?: number;
  stunCap?: number;
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

interface ExtraHeroSkillUiState extends HeroSkillUiState {
  skillId: string;
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

function HeroCardInner({ 
  hp, 
  maxHp, 
  scaleMultiplier = 1,
  onDrop, 
  isDropTarget,
  image,
  name,
  classTitle,
  takingDamage = false,
  healing = false,
  showAttackIndicator = false,
  heroSkillInfo = null,
  extraHeroSkillInfos,
  heroSkillMessage = null,
  onHeroSkillClick,
  onHeroSkillCancel,
  onExtraHeroSkillClick,
  heroSkillButtonRef,
  heroMagicInfo = null,
  onHeroMagicTrigger,
  heroMagicChoice = null,
  onHeroMagicChoice,
  onHeroMagicCancel,
  potionChoice = null,
  onPotionChoice,
  onPotionCancel,
  bleedAnimation = false,
  weaponSwingAnimation = false,
  shieldBlockAnimation = false,
  spellDamageBonus = 0,
  spellLifesteal = 0,
  stunCap = 10,
  onHeroClick,
}: HeroCardProps) {
  const gameViewport = useGameViewport();
  const isCompact = gameViewport.width < 500;
  const isFlat = gameViewport.width / gameViewport.height > FLAT_ASPECT_RATIO;
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
  const showHealOverlay = Boolean(healing);
  const showWeaponSwing = Boolean(weaponSwingAnimation);
  const showShieldBlock = Boolean(shieldBlockAnimation);
  const heroSkillButtonClasses = heroSkillButtonDisabled
    ? 'bg-gray-400/60 text-gray-600 cursor-not-allowed border border-gray-500/40'
    : 'bg-blue-600 text-white hover:bg-blue-700 shadow-lg shadow-blue-600/30 ring-1 ring-blue-400/40';
  const heroMagicButtonClasses = (ready: boolean) =>
    ready
      ? 'bg-rose-500 text-white hover:bg-rose-600 shadow-lg shadow-rose-500/30 ring-1 ring-rose-400/40'
      : 'bg-gray-400/60 text-gray-600 cursor-not-allowed border border-gray-500/40';
  const spellDamageDisplay = spellDamageBonus;
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
      <div
        className={`pointer-events-none absolute left-1/2 z-30 flex items-center rounded-full border border-border bg-background/95 dh-hero-small dh-hero-stats-bar font-bold tracking-wide text-muted-foreground shadow-lg whitespace-nowrap ${isFlat ? 'dh-hero-stats-bar--flat' : ''}`}
        style={{ top: 'calc(-1 * var(--dh-grid-gap-y) / 2)', transform: 'translate(-50%, -50%)' }}
      >
        <span className="flex items-center gap-1 text-purple-500" title="法术伤害加成">
          <Sparkles className="dh-hero-icon" />
          <span className={`font-mono dh-hero-chip ${spellDamageDisplay < 0 ? 'text-red-500' : ''}`}>{spellDamageDisplay >= 0 ? `+${spellDamageDisplay}` : spellDamageDisplay}</span>
        </span>
        <span className="text-muted-foreground/50">|</span>
        <span className="flex items-center gap-1 text-rose-400" title="超杀吸血">
          <Droplets className="dh-hero-icon" />
          <span className="font-mono dh-hero-chip">{spellLifesteal}</span>
        </span>
        <span className="text-muted-foreground/50">|</span>
        <span className="flex items-center gap-1 text-orange-500" title="击晕上限">
          <Zap className="dh-hero-icon" />
          <span className="font-mono dh-hero-chip">{stunCap}%</span>
        </span>
      </div>
      <Card className={`
        relative h-full w-full border-4 border-amber-600 shadow-lg overflow-hidden
        transition-[border-color,transform,ring] duration-200
        ${isDropTarget ? 'border-destructive animate-pulse' : ''}
        ${isDropTarget && isOver ? 'scale-105 ring-4 ring-destructive bg-destructive/10' : ''}
        ${takingDamage ? 'animate-damage-flash' : ''}
        ${healing ? 'animate-heal-glow' : ''}
      `}>
        <div className="h-full flex flex-col relative overflow-hidden bg-amber-900/40">
          {/* Decorative corner ornaments */}
          <div className="absolute inset-0 pointer-events-none dh-card-deco--hero" />

          {/* Inner decorative border */}
          <div className={`absolute border border-amber-300/30 pointer-events-none rounded-sm ${isCompact ? 'inset-[3px]' : 'inset-[6px]'}`} />

          {/* Combat overlays */}
          {(showBleedOverlay || showHealOverlay || showWeaponSwing || showShieldBlock) && (
            <div className="combat-overlay">
              {showBleedOverlay && (
                <>
                  <span className="combat-overlay__shape combat-overlay__shape--bleed" />
                  <span className="combat-overlay__shape combat-overlay__shape--bleed-drip" data-stagger="1" />
                  <span className="combat-overlay__shape combat-overlay__shape--bleed-ring" data-stagger="2" />
                </>
              )}
              {showHealOverlay && (
                <>
                  <span className="combat-overlay__shape combat-overlay__shape--heal" />
                  <span className="combat-overlay__shape combat-overlay__shape--heal-rise" data-stagger="1" />
                  <span className="combat-overlay__shape combat-overlay__shape--heal-ring" data-stagger="2" />
                </>
              )}
              {showWeaponSwing && (
                <>
                  <span className="combat-overlay__shape combat-overlay__shape--swing" />
                  <span className="combat-overlay__shape combat-overlay__shape--swing-echo" data-stagger="1" />
                  <span className="combat-overlay__shape combat-overlay__shape--swing-spark" data-stagger="2" />
                </>
              )}
              {showShieldBlock && (
                <>
                  <span className="combat-overlay__shape combat-overlay__shape--block" />
                  <span className="combat-overlay__shape combat-overlay__shape--block-ripple" data-stagger="1" />
                  <span className="combat-overlay__shape combat-overlay__shape--block-spark" data-stagger="2" />
                </>
              )}
            </div>
          )}

          {!isFlat && (
            <>
              {/* HP Section */}
              <div className={`relative z-10 py-1.5 ${isCompact ? 'px-1' : 'px-3'}`}>
                <div className={`bg-background/95 rounded-lg ${isCompact ? 'p-1' : 'p-1.5'}`}>
                  <div className="flex items-center justify-between mb-0.5">
                    <Heart className="dh-hero-icon text-destructive" />
                    <span className="dh-hero-hp font-mono font-bold" data-testid="hero-hp">
                      {hp}/{maxHp}
                    </span>
                  </div>
                  <Progress value={hpPercentage} className="h-1.5" />
                </div>
              </div>

              {/* Thin separator */}
              <div className="h-px mx-6 bg-gradient-to-r from-transparent via-amber-500/30 to-transparent" />
            </>
          )}

          {/* Content area - skills and magic */}
          <div className={`relative z-10 flex-1 overflow-y-auto py-1.5 flex flex-col gap-1.5 items-stretch justify-start ${isCompact ? 'px-0.5' : 'px-2'}`}>
            {heroSkillInfo && (
              <div className="flex flex-col items-center gap-1">
                {isPassiveSkill ? (
                  <span className="dh-hero-btn font-semibold uppercase tracking-wide text-amber-950 bg-amber-300/30 rounded-full border border-amber-400/40">
                    Passive: {heroSkillInfo.name}
                  </span>
                ) : (
                  <div className="flex items-center gap-2 flex-wrap justify-center">
                    <button
                      type="button"
                      className={`dh-hero-btn font-bold uppercase tracking-wide rounded-full transition-[background-color,opacity] ${heroSkillButtonClasses}`}
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
                        className="dh-hero-btn-sm font-semibold text-amber-900/60 hover:text-amber-950 transition-colors"
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
            {extraHeroSkillInfos && extraHeroSkillInfos.length > 0 && extraHeroSkillInfos.map(extraSkill => {
              const extraIsPassive = Boolean(extraSkill.isPassive);
              const extraDisabled = extraIsPassive || extraSkill.isUsed || !extraSkill.isReady;
              const extraBtnClasses = extraDisabled
                ? 'bg-gray-400/60 text-gray-600 cursor-not-allowed border border-gray-500/40'
                : 'bg-indigo-600 text-white hover:bg-indigo-700 shadow-lg shadow-indigo-600/30 ring-1 ring-indigo-400/40';
              return (
                <div key={extraSkill.skillId} className="flex flex-col items-center gap-1">
                  {extraIsPassive ? (
                    <span className={`dh-hero-btn font-semibold uppercase tracking-wide rounded-full border ${
                      extraSkill.isUsed
                        ? 'text-gray-500 bg-gray-300/20 border-gray-400/30'
                        : 'text-amber-950 bg-amber-300/30 border-amber-400/40'
                    }`}>
                      Passive: {extraSkill.name}{extraSkill.isUsed ? ' ✓' : ''}
                    </span>
                  ) : (
                    <button
                      type="button"
                      className={`dh-hero-btn font-bold uppercase tracking-wide rounded-full transition-[background-color,opacity] ${extraBtnClasses}`}
                      disabled={extraDisabled}
                      onClick={(event) => {
                        event.stopPropagation();
                        onExtraHeroSkillClick?.(extraSkill.skillId);
                      }}
                      onTouchEnd={(event) => event.stopPropagation()}
                      title={extraSkill.disabledReason}
                    >
                      {extraSkill.buttonLabel ?? extraSkill.name}
                    </button>
                  )}
                </div>
              );
            })}
            {heroSkillMessage && (
              <div className="flex items-center gap-1 dh-hero-small text-amber-900/70 text-center justify-center">
                <AlertTriangle className="w-3 h-3" />
                <span>{heroSkillMessage}</span>
              </div>
            )}
            {potionChoice && (
              <div className="w-full rounded-md border border-emerald-500/40 bg-emerald-500/10 p-1.5 space-y-1.5">
                <span className="dh-hero-small font-semibold text-emerald-700">{potionChoice.prompt}</span>
                <div className="flex flex-wrap gap-1.5">
                  {potionChoice.options.map(opt => (
                    <button
                      key={opt.value}
                      type="button"
                      className="dh-hero-btn-sm font-semibold rounded-full bg-emerald-500 text-white hover:bg-emerald-600 transition"
                      onClick={(event) => {
                        event.stopPropagation();
                        onPotionChoice?.(opt.value);
                      }}
                    >
                      {opt.label}
                    </button>
                  ))}
                  {onPotionCancel && (
                    <button
                      type="button"
                      className="dh-hero-btn-sm font-semibold rounded-full border border-border text-emerald-900/60 hover:text-emerald-950 transition"
                      onClick={(event) => {
                        event.stopPropagation();
                        onPotionCancel();
                      }}
                    >
                      取消
                    </button>
                  )}
                </div>
              </div>
            )}
            {heroMagicInfo && heroMagicInfo.length > 0 && (
              <div className="w-full space-y-1">
                {heroMagicInfo.map(magic => (
                  <div
                    key={magic.id}
                    className="w-full rounded-md border border-amber-400/30 bg-amber-800/15 p-1.5 space-y-0.5"
                  >
                    <div className="flex items-center justify-between dh-hero-small font-semibold">
                      <span className="text-amber-950">{magic.name}</span>
                      <span className="font-mono text-amber-800/70">
                        {magic.unlocked ? `${magic.gauge}/${magic.gaugeMax}` : '未解锁'}
                      </span>
                    </div>
                    <Progress
                      value={magic.unlocked ? (magic.gauge / magic.gaugeMax) * 100 : 0}
                      className="h-1.5"
                    />
                    <div className="flex items-center justify-center">
                      <button
                        type="button"
                        className={`dh-hero-btn-sm font-bold uppercase tracking-wide rounded-full transition-[background-color,opacity] ${heroMagicButtonClasses(
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
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Bottom decorative bar */}
          <div className="h-px mx-3 bg-gradient-to-r from-transparent via-amber-400/50 to-transparent" />
          <div className="relative z-10 py-1 bg-amber-800/20" />
        </div>
      </Card>
    </div>
  );
}

export default memo(HeroCardInner);
