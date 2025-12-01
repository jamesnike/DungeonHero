import cardBackImage from '@assets/generated_images/card_back_design.png';
import { cn } from '@/lib/utils';
import { motion } from 'framer-motion';
import { useMemo } from 'react';

type StackVariant = 'bright' | 'muted';

interface StackedCardPileProps {
  count: number;
  maxLayers?: number;
  className?: string;
  cardBackSrc?: string;
  emptyLabel?: string;
  variant?: StackVariant;
  label?: string;
}

const paletteMap: Record<StackVariant, {
  shadow: string;
  outline: string;
  cardFill: string;
  edgeFill: string;
  labelColor: string;
  badgeBg: string;
}> = {
  bright: {
    shadow: 'rgba(248, 187, 208, 0.4)',
    outline: '#2f1e3d',
    cardFill: '#fed7aa',
    edgeFill: '#fcd34d',
    labelColor: '#2f1e3d',
    badgeBg: '#f472b6'
  },
  muted: {
    shadow: 'rgba(15, 23, 42, 0.35)',
    outline: '#1f2937',
    cardFill: '#cbd5f5',
    edgeFill: '#94a3b8',
    labelColor: '#1f2937',
    badgeBg: '#94a3b8'
  }
};

export default function StackedCardPile({
  count,
  maxLayers = 16,
  className,
  cardBackSrc = cardBackImage,
  emptyLabel = 'Empty',
  variant = 'muted',
  label,
}: StackedCardPileProps) {
  const hasCards = count > 0;
  const layersToRender = hasCards ? Math.min(count, maxLayers) : 1;
  const palette = paletteMap[variant];

  const layerConfigs = useMemo(() => {
    return Array.from({ length: layersToRender }, (_, idx) => {
      const depth = layersToRender - idx - 1;
      return {
        id: `stack-${idx}`,
        translateY: depth * 2.2,
        translateX: (Math.random() - 0.5) * Math.min(6, depth + 1),
        rotateZ: (Math.random() - 0.5) * 3,
        scale: 1 - depth * 0.02,
        opacity: hasCards ? 0.98 - depth * 0.04 : 0.3,
        brightness: 0.95 - depth * 0.03,
      };
    });
  }, [layersToRender, hasCards]);

  return (
    <div className={cn('relative h-full w-full overflow-visible', className)}>
      <motion.div
        className="absolute inset-x-8 bottom-1 h-6 rounded-full blur-xl"
        style={{ backgroundColor: palette.shadow }}
        animate={{ opacity: hasCards ? 1 : 0.35, scale: hasCards ? 1 : 0.8 }}
        transition={{ duration: 0.6 }}
      />
      {layerConfigs.map((config, index) => (
        <motion.div
          key={config.id}
          className="absolute inset-0"
          style={{ zIndex: layersToRender - index }}
          animate={{
            y: -config.translateY,
            x: config.translateX,
            rotateZ: config.rotateZ,
            scale: config.scale,
          }}
          transition={{ type: 'spring', stiffness: 160, damping: 20, mass: 0.7 }}
        >
          <motion.div
            className="h-full w-full rounded-[0.6rem] shadow-xl"
            style={{
              boxShadow: `0 3px 8px ${palette.shadow}`,
              border: `2px solid ${palette.outline}`,
              backgroundColor: palette.cardFill,
              backgroundImage: `linear-gradient(120deg, rgba(255,255,255,0.4), transparent 55%), url(${cardBackSrc})`,
              backgroundSize: 'cover',
              filter: `brightness(${config.brightness})`,
              opacity: config.opacity,
            }}
            whileHover={{ y: -4, rotateZ: config.rotateZ * 1.5 }}
          />
        </motion.div>
      ))}

      {!hasCards && (
        <div className="absolute inset-0 flex items-center justify-center text-[10px] uppercase tracking-widest text-muted-foreground">
          {emptyLabel}
        </div>
      )}

      {hasCards && (
        <motion.div
          className="absolute inset-0 flex items-center justify-center"
          style={{ zIndex: layersToRender + 2 }}
          animate={{ y: -layersToRender * 1.5 }}
          transition={{ type: 'spring', stiffness: 140, damping: 18 }}
        >
          <div
            className="h-[86%] w-[84%] rounded-2xl flex flex-col items-center justify-center px-4"
            style={{
              border: `3px solid ${palette.outline}`,
              backgroundColor: palette.cardFill,
              boxShadow: `0 6px 12px ${palette.shadow}`,
            }}
          >
            <div
              className="px-3 py-1 rounded-full text-[11px] font-semibold uppercase tracking-[0.2em]"
              style={{
                backgroundColor: palette.badgeBg,
                color: palette.labelColor,
                border: `2px solid ${palette.outline}`,
              }}
            >
              {label || 'Deck'}
            </div>
            <p
              className="mt-2 text-sm font-bold"
              style={{ color: palette.labelColor }}
            >
              {count} cards
            </p>
          </div>
        </motion.div>
      )}
    </div>
  );
}