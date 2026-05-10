/**
 * CardStampFloater — transient "stamp drift" animation overlay.
 *
 * Displays each preset emoji stamp + each freeform message as an individual
 * floating element that drifts upward from the card's center, fades in, holds
 * briefly, then fades out. Stamps are staggered by `STAGGER_MS` apart so a
 * card with many stamps (e.g. multiplayer popular cards) plays out as a
 * sequence rather than overlapping in one frame.
 *
 * Lifecycle:
 *   1. Mount when `useCardStamps.getPendingFloat(card, sourceRow)` returns
 *      a non-null entry for the given `(rowSignature, cardName)` key.
 *   2. Each child element runs the `card-stamp-float` keyframe animation
 *      with a per-item `animation-delay` (= index × STAGGER_MS).
 *   3. After the LAST item's animation finishes (delay + duration), invoke
 *      `onComplete` so the parent can call `markAnimated(...)` and unmount.
 *
 * Pure UI overlay — never mutates `GameState`, never blocks player input
 * (`pointer-events: none`).
 *
 * Per `.cursor/rules/draw-cards-defaults-to-backpack.mdc` and friends, this
 * file is purely client-side; no reducers, no actions, no side effects on the
 * game engine.
 */

import { memo, useEffect, useMemo, useRef } from 'react';
import { STAMP_DEFINITIONS, type CardStampEntry, type PresetStampId } from '@/lib/cardStamps';

interface CardStampFloaterProps {
  entry: CardStampEntry;
  /**
   * Called once after the LAST staggered item's animation completes. The
   * parent should invalidate `getPendingFloat` for this key so the floater
   * unmounts and never replays this session.
   */
  onComplete: () => void;
}

const STAGGER_MS = 200;
const ITEM_DURATION_MS = 1800;

interface FloatItem {
  key: string;
  /** What to render — either a preset emoji or a freeform message string. */
  content: string;
  variant: 'emoji' | 'freeform';
}

/**
 * Build the ordered list of float items from a stamp entry.
 *
 * Per design (per-stamp-instance, not per-emoji-type), each preset count of
 * N renders N copies of that emoji. Freeform messages render as text bubbles
 * in newest-first order (the server already sorts them desc by created_at).
 */
function buildFloatItems(entry: CardStampEntry): FloatItem[] {
  const items: FloatItem[] = [];
  for (const def of STAMP_DEFINITIONS) {
    const count = entry.stampCounts[def.id as PresetStampId] ?? 0;
    for (let i = 0; i < count; i++) {
      items.push({
        key: `preset:${def.id}:${i}`,
        content: def.emoji,
        variant: 'emoji',
      });
    }
  }
  for (const msg of entry.freeform) {
    items.push({
      key: `freeform:${msg.id}`,
      content: msg.message,
      variant: 'freeform',
    });
  }
  return items;
}

export const CardStampFloater = memo(function CardStampFloater(
  props: CardStampFloaterProps,
) {
  const { entry, onComplete } = props;

  const items = useMemo(() => buildFloatItems(entry), [entry]);
  const onCompleteRef = useRef(onComplete);
  onCompleteRef.current = onComplete;

  useEffect(() => {
    if (items.length === 0) {
      // Nothing to animate — fire onComplete next tick so parent can clear.
      const id = setTimeout(() => onCompleteRef.current(), 0);
      return () => clearTimeout(id);
    }
    // Total time = (last item's delay) + (one full item duration) + a small
    // buffer for layout / paint slack so we don't unmount mid-fade.
    const totalMs = (items.length - 1) * STAGGER_MS + ITEM_DURATION_MS + 80;
    const id = setTimeout(() => onCompleteRef.current(), totalMs);
    return () => clearTimeout(id);
  }, [items]);

  if (items.length === 0) return null;

  return (
    <div className="card-stamp-floater" aria-hidden>
      {items.map((item, idx) => (
        <span
          key={item.key}
          className={`card-stamp-floater__item card-stamp-floater__item--${item.variant}`}
          style={{ animationDelay: `${idx * STAGGER_MS}ms` }}
        >
          {item.content}
        </span>
      ))}
    </div>
  );
});

export default CardStampFloater;
