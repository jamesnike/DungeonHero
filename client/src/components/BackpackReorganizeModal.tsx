import { useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Backpack, Check, Hand, Shield, Sparkles } from 'lucide-react';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import type { GameCardData } from './GameCard';
import {
  EventPatternPreview,
  MagicSpellPreview,
  isEventCardType,
  isMagicSpellCardType,
} from './MagicNameFlankIcons';

/**
 * 整顿背囊 (Knight Perm 2 magic) — multi-select modal.
 *
 * UI for the 'reorganize-backpack' / 'multi-select' pending magic action.
 * The reducer has already applied the +1 backpack capacity by the time this
 * modal opens; the player now picks up to `maxSelections` cards from
 * 手牌 / 护符栏 / 装备栏 and confirms. Confirming with 0 selections is allowed
 * (the player keeps just the +1 capacity).
 *
 * Closing the dialog (X / outside click) is treated as confirming with the
 * current selections — never as cancel — to avoid leaving the game stuck on a
 * pending action that's already paid its capacity bump.
 *
 * Each selection key is `${source}:${cardId}`, mirroring the deletion modal
 * convention. The played magic card itself is excluded from the candidate list
 * (it has already been removed from hand by PLAY_CARD before the modal opens,
 * but we filter defensively too).
 */

export type BackpackReorganizeSource = 'hand' | 'amulet' | 'equipment';

export type BackpackReorganizeSelection = {
  source: BackpackReorganizeSource;
  id: string;
};

interface BackpackReorganizeModalProps {
  open: boolean;
  prompt: string;
  maxSelections: number;
  /** Cards currently in hand (already excludes the played card). */
  handCards: GameCardData[];
  /** Cards in amulet slots. */
  amuletCards: GameCardData[];
  /** Card in equipmentSlot1, or null. */
  equipmentSlot1: GameCardData | null;
  /** Card in equipmentSlot2, or null. */
  equipmentSlot2: GameCardData | null;
  onConfirm: (selections: BackpackReorganizeSelection[]) => void;
}

const sourceIconMap: Record<BackpackReorganizeSource, typeof Backpack> = {
  hand: Hand,
  amulet: Sparkles,
  equipment: Shield,
};

type EquipmentSelectable = { card: GameCardData; slotId: 'equipmentSlot1' | 'equipmentSlot2'; sectionLabel: string };

export default function BackpackReorganizeModal({
  open,
  prompt,
  maxSelections,
  handCards,
  amuletCards,
  equipmentSlot1,
  equipmentSlot2,
  onConfirm,
}: BackpackReorganizeModalProps) {
  const { t } = useTranslation();
  // selectedKeys preserves insertion order, which we use as the push order.
  const [selectedKeys, setSelectedKeys] = useState<string[]>(() => []);

  useEffect(() => {
    if (open) setSelectedKeys([]);
  }, [open]);

  const equipmentEntries = useMemo<EquipmentSelectable[]>(() => {
    const out: EquipmentSelectable[] = [];
    if (equipmentSlot1) out.push({ card: equipmentSlot1, slotId: 'equipmentSlot1', sectionLabel: t('common.section.leftEquip') });
    if (equipmentSlot2) out.push({ card: equipmentSlot2, slotId: 'equipmentSlot2', sectionLabel: t('common.section.rightEquip') });
    return out;
  }, [equipmentSlot1, equipmentSlot2, t]);

  const keyOf = (source: BackpackReorganizeSource, id: string) => `${source}:${id}`;

  const sourceLookup = useMemo(() => {
    // Map key → { source, id, name } for translating selections back at confirm.
    const m = new Map<string, BackpackReorganizeSelection>();
    for (const c of handCards) m.set(keyOf('hand', c.id), { source: 'hand', id: c.id });
    for (const c of amuletCards) m.set(keyOf('amulet', c.id), { source: 'amulet', id: c.id });
    for (const eq of equipmentEntries) m.set(keyOf('equipment', eq.slotId), { source: 'equipment', id: eq.slotId });
    return m;
  }, [handCards, amuletCards, equipmentEntries]);

  const toggle = (source: BackpackReorganizeSource, id: string) => {
    const k = keyOf(source, id);
    setSelectedKeys(prev => {
      if (prev.includes(k)) return prev.filter(x => x !== k);
      if (prev.length >= maxSelections) return prev;
      return [...prev, k];
    });
  };

  const handleConfirm = () => {
    const selections: BackpackReorganizeSelection[] = [];
    for (const k of selectedKeys) {
      const entry = sourceLookup.get(k);
      if (entry) selections.push(entry);
    }
    onConfirm(selections);
  };

  const renderSection = (
    sectionTitle: string,
    cards: GameCardData[],
    source: BackpackReorganizeSource,
    keyForCard: (c: GameCardData) => string,
    cardLabel?: (c: GameCardData) => string,
  ) => {
    const Icon = sourceIconMap[source];
    if (cards.length === 0) {
      return (
        <div className="space-y-2">
          <div className="flex items-center gap-2 text-sm font-semibold">
            <Icon className="w-4 h-4" />
            <span>{sectionTitle}（{t('common.countCards', { count: 0 })}）</span>
          </div>
          <p className="text-xs text-muted-foreground">{t('common.noCardsAvailable')}</p>
        </div>
      );
    }
    return (
      <div className="space-y-3">
        <div className="flex items-center gap-2 text-sm font-semibold">
          <Icon className="w-4 h-4" />
          <span>{sectionTitle}（{t('common.countCards', { count: cards.length })}）</span>
        </div>
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          {cards.map(card => {
            const k = keyForCard(card);
            const isSelected = selectedKeys.includes(k);
            const reachedMax = !isSelected && selectedKeys.length >= maxSelections;
            const orderIdx = isSelected ? selectedKeys.indexOf(k) + 1 : 0;
            return (
              <Card
                key={k}
                className={`relative flex gap-3 p-3 cursor-pointer border-border/60 hover:bg-muted focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none ${
                  isSelected ? 'ring-2 ring-amber-500 bg-amber-500/10' : ''
                } ${reachedMax ? 'opacity-50' : ''}`}
                onClick={() => {
                  // Strip the source prefix to recover the raw id stored in `selectedKeys`.
                  const id = k.slice(source.length + 1);
                  toggle(source, id);
                }}
                role="button"
                tabIndex={0}
                onKeyDown={event => {
                  if (event.key === 'Enter' || event.key === ' ') {
                    event.preventDefault();
                    const id = k.slice(source.length + 1);
                    toggle(source, id);
                  }
                }}
              >
                {isSelected && (
                  <div className="absolute top-1 left-1 flex items-center justify-center rounded-full bg-amber-500 text-amber-950 px-1.5 py-0.5 text-[10px] font-bold leading-none">
                    {orderIdx}
                    <Check className="w-3 h-3 ml-0.5" />
                  </div>
                )}
                <div className="relative h-16 w-12 overflow-hidden rounded-sm bg-muted">
                  {isMagicSpellCardType(card.type) ? (
                    <MagicSpellPreview card={card} aspect="none" className="absolute inset-0 h-full w-full rounded-sm" />
                  ) : isEventCardType(card.type) ? (
                    <EventPatternPreview card={card} aspect="none" className="absolute inset-0 h-full w-full rounded-sm" />
                  ) : (
                    card.image && <img src={card.image} alt={card.name} className="h-full w-full object-cover" />
                  )}
                  <Badge className="absolute top-1 right-1 text-[10px] px-1 py-0" variant="secondary">
                    {card.type.toUpperCase()}
                  </Badge>
                </div>
                <div className="space-y-1">
                  <p className="text-sm font-semibold">
                    {card.name}
                    {cardLabel ? <span className="text-xs text-muted-foreground"> · {cardLabel(card)}</span> : null}
                  </p>
                  <p className="text-xs text-muted-foreground capitalize">{card.type}</p>
                  {card.description && (
                    <p className="text-xs text-muted-foreground line-clamp-2">{card.description}</p>
                  )}
                </div>
              </Card>
            );
          })}
        </div>
      </div>
    );
  };

  // Equipment cards are keyed by slotId, not card id (multiple slots could
  // hold the same card definition). Build a flat list with a slot label.
  const equipmentCardsForRender = equipmentEntries.map(e => e.card);
  const equipmentLabelOf = (c: GameCardData): string => {
    const e = equipmentEntries.find(x => x.card.id === c.id);
    return e?.sectionLabel ?? '';
  };
  const equipmentKeyOf = (c: GameCardData): string => {
    const e = equipmentEntries.find(x => x.card.id === c.id);
    return keyOf('equipment', e?.slotId ?? c.id);
  };

  return (
    <Dialog
      open={open}
      onOpenChange={next => {
        // Closing via X / outside click is treated as confirming with the
        // current selection (the +1 capacity is already applied; we must not
        // leave a permanent pendingMagicAction stuck on the state).
        if (!next) handleConfirm();
      }}
    >
      <DialogContent className="max-w-2xl max-h-[95vh] overflow-y-auto" overlayClassName="bg-black/30">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Backpack className="w-5 h-5 text-amber-500" />
            {t('modal.backpackReorganize.title')}
          </DialogTitle>
          <DialogDescription>
            {t('modal.backpackReorganize.description', { max: maxSelections })}
            <br />
            <span className="text-[11px]">{t('modal.backpackReorganize.noteSmall')}</span>
          </DialogDescription>
          <p className="text-xs text-muted-foreground">
            {t('modal.backpackReorganize.selectedCount', { count: selectedKeys.length, max: maxSelections })}
          </p>
          {prompt && <p className="text-[11px] text-muted-foreground italic">{prompt}</p>}
        </DialogHeader>

        <div className="space-y-6 py-2">
          {renderSection(t('common.section.hand'), handCards, 'hand', c => keyOf('hand', c.id))}
          {renderSection(t('common.section.amulet'), amuletCards, 'amulet', c => keyOf('amulet', c.id))}
          {renderSection(t('common.section.equipment'), equipmentCardsForRender, 'equipment', equipmentKeyOf, equipmentLabelOf)}
        </div>

        <DialogFooter className="gap-2 sm:gap-2">
          <Button variant="outline" onClick={() => onConfirm([])}>
            {t('modal.backpackReorganize.skipZero')}
          </Button>
          <Button onClick={handleConfirm}>
            {t('modal.backpackReorganize.confirmReturn')}
            {selectedKeys.length > 0 ? `（${selectedKeys.length}）` : ''}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
