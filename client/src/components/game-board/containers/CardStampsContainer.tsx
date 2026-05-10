/**
 * CardStampsContainer — root-level mount for the card-stamp picker portal.
 *
 * Pure UI overlay. Reads `pickerState` from the shared `CardStampsContext`
 * and renders a single `<CardStampPicker>`. The bubbles themselves render
 * inline inside `DungeonRow` / `PreviewRow` (they need per-cell positioning,
 * the picker doesn't).
 *
 * Mounted once in `GameBoard.tsx` near the other modal containers.
 */

import { memo } from 'react';
import { CardStampPicker } from '@/components/CardStampPicker';
import { useCardStampsContext } from '../contexts/CardStampsContext';

function CardStampsContainerInner() {
  const { pickerState, isOnline, submitStamp, closePicker } = useCardStampsContext();

  if (!pickerState || !pickerState.open) return null;

  return (
    <CardStampPicker
      open={pickerState.open}
      anchorEl={pickerState.anchorEl}
      isOnline={isOnline}
      onSelect={(stampId, messageText) => {
        submitStamp(pickerState.card, pickerState.sourceRow, stampId, messageText);
      }}
      onClose={closePicker}
    />
  );
}

export const CardStampsContainer = memo(CardStampsContainerInner);
