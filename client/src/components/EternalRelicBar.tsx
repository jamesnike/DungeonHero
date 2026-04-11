import type { EternalRelic } from '@/game-core/types';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';

interface EternalRelicBarProps {
  relics: EternalRelic[];
  onRelicClick: (relic: EternalRelic) => void;
}

const RELIC_ICON_SIZE = 32;

export default function EternalRelicBar({ relics, onRelicClick }: EternalRelicBarProps) {
  if (relics.length === 0) return null;

  return (
    <div className="flex-shrink-0 relative w-full flex justify-center pointer-events-none" style={{ height: 0 }}>
      <div
        className="absolute flex items-center gap-1.5 pointer-events-auto z-20"
        style={{ bottom: 0, transform: 'translateY(50%)' }}
      >
        <TooltipProvider delayDuration={200}>
          {relics.map((relic) => (
            <Tooltip key={relic.id}>
              <TooltipTrigger asChild>
                <button
                  type="button"
                  className="relative rounded-full border-2 border-amber-400/70 bg-background/80 shadow-md hover:border-amber-300 hover:scale-110 transition-all duration-150 cursor-pointer focus:outline-none focus-visible:ring-2 focus-visible:ring-amber-400"
                  style={{ width: RELIC_ICON_SIZE + 8, height: RELIC_ICON_SIZE + 8, padding: 3 }}
                  onClick={() => onRelicClick(relic)}
                >
                  <img
                    src={relic.image}
                    alt={relic.name}
                    className="w-full h-full rounded-full object-cover"
                    draggable={false}
                  />
                  <div className="absolute inset-0 rounded-full ring-1 ring-amber-500/30 pointer-events-none" />
                </button>
              </TooltipTrigger>
              <TooltipContent side="top" className="max-w-[220px]">
                <p className="font-semibold text-amber-300 text-xs">{relic.name}</p>
                <p className="text-xs text-muted-foreground">{relic.description}</p>
              </TooltipContent>
            </Tooltip>
          ))}
        </TooltipProvider>
      </div>
    </div>
  );
}
