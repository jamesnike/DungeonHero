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
        const innerClass = `${cellInnerClass} relative z-10 ${slot.innerClassName ?? ''}`.trim();
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
