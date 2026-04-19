import { memo } from 'react';
import { useShallowGameState } from '@/hooks/useGameEngine';
import { useModalCallbacks } from '../contexts/ModalCallbacksContext';
import { useModalUI } from '../contexts/ModalUIContext';

import EventChoiceModal from '@/components/EventChoiceModal';
import EventDiceModal from '@/components/EventDiceModal';
import MagicChoiceModal from '@/components/MagicChoiceModal';
import EquipmentSelectModal from '@/components/EquipmentSelectModal';
import CardFlipOverlay from '@/components/CardFlipOverlay';

function EventContainerInner() {
  const cb = useModalCallbacks();
  const ui = useModalUI();

  const gs = useShallowGameState(s => ({
    eventModalOpen: s.eventModalOpen,
    eventModalMinimized: s.eventModalMinimized,
    currentEventCard: s.currentEventCard,
    eventDiceModal: s.eventDiceModal,
    magicChoiceModal: s.magicChoiceModal,
    equipmentPrompt: s.equipmentPrompt,
    eventTransformState: s.eventTransformState,
    equipmentSlot1: s.equipmentSlot1,
    equipmentSlot2: s.equipmentSlot2,
  }));

  return (
    <>
      <EventChoiceModal
        open={gs.eventModalOpen && !gs.eventModalMinimized}
        eventCard={gs.currentEventCard}
        onChoice={cb.onEventChoice}
        choiceStates={ui.eventChoiceStates}
        onMinimize={cb.onEventMinimize}
      />

      {gs.eventDiceModal && (
        <EventDiceModal
          open
          title={gs.eventDiceModal.title}
          subtitle={gs.eventDiceModal.subtitle}
          entries={gs.eventDiceModal.entries}
          rolledValue={gs.eventDiceModal.rolledValue}
          resolvedEntryId={gs.eventDiceModal.highlightedId}
          autoRollTrigger={ui.eventDiceRollKey}
          onRollResult={cb.onDiceRollResult}
          onClose={cb.onDiceModalClose}
          predeterminedRoll={gs.eventDiceModal.predeterminedRoll}
        />
      )}

      <MagicChoiceModal
        open={Boolean(gs.magicChoiceModal)}
        state={gs.magicChoiceModal}
        onChoice={cb.onMagicChoice}
      />

      {gs.equipmentPrompt && (
        <EquipmentSelectModal
          open
          prompt={gs.equipmentPrompt.prompt}
          subtext={gs.equipmentPrompt.subtext}
          leftItem={gs.equipmentSlot1}
          rightItem={gs.equipmentSlot2}
          onSelect={cb.onEquipmentPromptSelect}
          onCancel={cb.onEquipmentPromptCancel}
        />
      )}

      {gs.eventTransformState && <CardFlipOverlay state={gs.eventTransformState} />}
    </>
  );
}

export const EventContainer = memo(EventContainerInner);
