import React, { memo, type Ref } from 'react';
import type { HeroRowSlotConfig } from '../types';

interface HeroRowSectionProps {
  heroRowSlots: HeroRowSlotConfig[];
  cellWrapperClass: string;
  cellInnerClass: string;
  registerHeroRowCellRef: (index: number) => (el: HTMLDivElement | null) => void;
  getHeroRowMagicDropHandlers: (dropZone: 'backpack' | 'other') => Record<string, any>;
}

export const HeroRowSection = memo(function HeroRowSection({
  heroRowSlots,
  cellWrapperClass,
  cellInnerClass,
  registerHeroRowCellRef,
  getHeroRowMagicDropHandlers,
}: HeroRowSectionProps) {
  return (
    <>
      {heroRowSlots.map((slot, index) => {
        // z-30 (not z-10): the hero-row inner forms a stacking context that
        // CONTAINS the chips above each cell (临时攻击/护甲、超杀吸血、下次劝降).
        // Those chips are pushed upward by `top: calc(-1 * --dh-grid-gap-y / 2)`
        // and on tighter layouts (especially `isFlat`) overlap downward into the
        // active-row cells just above. The active-row cell inner uses `relative z-20`
        // (its own stacking context). With the old z-10 here, every hero-row chip
        // was painted at z=10 in the root context — i.e. UNDER the active-row card
        // at z=20. Raising this to z-30 ensures chips win over any active-row
        // overlap. (Flight overlays / modals live at higher levels and are unaffected.)
        const innerClass = `${cellInnerClass} relative z-30 ${slot.innerClassName ?? ''}`.trim();
        return (
          <div
            key={slot.id}
            className={`${cellWrapperClass} ${slot.wrapperClassName ?? ''}`.trim()}
            ref={registerHeroRowCellRef(index)}
            {...getHeroRowMagicDropHandlers(slot.dropZone)}
          >
            <div className={innerClass} ref={slot.innerRef}>
              {slot.render()}
            </div>
          </div>
        );
      })}
    </>
  );
});

export default HeroRowSection;
