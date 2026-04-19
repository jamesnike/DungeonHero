import { createContext, useContext } from 'react';
import type { GameCardData } from '@/components/GameCard';
import type { EventChoiceAvailability } from '@/components/EventChoiceModal';
import type { HeroMagicDisplayInfo } from '@/components/HeroDetailsModal';

export interface ModalUIState {
  selectedCard: GameCardData | null;
  detailsModalOpen: boolean;
  deckViewerOpen: boolean;
  backpackViewerOpen: boolean;
  heroDetailsOpen: boolean;
  gameOverMinimized: boolean;
  daggerSelfDestructPrompt: { weaponName: string; remainingDurability: number } | null;
  wraithPassiveUnlockPopup: boolean;
  eventDiceRollKey: number;
  persuadeRollKey: number;
  eventChoiceStates: EventChoiceAvailability[];
  overlayZoom: number;
  stageScale: number;
  headerHeight: number;
  classCardPreview: GameCardData | null;
  heroMagicInfo: HeroMagicDisplayInfo[] | undefined;
  endHeroTurnDisabled: boolean;
  fullBoardInteractionLocked: boolean;
}

const ModalUIContext = createContext<ModalUIState | null>(null);

export function useModalUI(): ModalUIState {
  const ctx = useContext(ModalUIContext);
  if (!ctx) throw new Error('useModalUI must be used within ModalUIProvider');
  return ctx;
}

export const ModalUIProvider = ModalUIContext.Provider;
