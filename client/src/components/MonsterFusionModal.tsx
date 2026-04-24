import { useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Combine } from 'lucide-react';
import GameCard, { type GameCardData } from './GameCard';
import type { MonsterFusionSelection } from '@/game-core/types';

interface MonsterFusionModalProps {
  open: boolean;
  onClose: () => void;
  equipmentSlot1: GameCardData | null;
  equipmentSlot2: GameCardData | null;
  equipmentSlot1Reserve: GameCardData[];
  equipmentSlot2Reserve: GameCardData[];
  handCards: GameCardData[];
  backpackItems: GameCardData[];
  onConfirm: (selection: MonsterFusionSelection) => void;
}

type SourceLabel = string;

interface CandidateEntry {
  card: GameCardData;
  source: SourceLabel;
}

const RACE_CN: Record<string, string> = {
  Dragon: '龙族',
  Skeleton: '骷髅',
  Goblin: '哥布林',
  Ogre: '食人魔',
  Wraith: '幽灵',
  Swarm: '虫群',
  Golem: '魔像',
};

function getRace(card: GameCardData): string {
  return ((card as any).monsterType ?? card.name) as string;
}

export default function MonsterFusionModal({
  open,
  onClose,
  equipmentSlot1,
  equipmentSlot2,
  equipmentSlot1Reserve,
  equipmentSlot2Reserve,
  handCards,
  backpackItems,
  onConfirm,
}: MonsterFusionModalProps) {
  const { t } = useTranslation();
  const [selectedIds, setSelectedIds] = useState<string[]>([]);

  // 弹窗关闭时清空已选 —— 避免下次打开继承上次的脏状态
  useEffect(() => {
    if (!open) setSelectedIds([]);
  }, [open]);

  // ----- 收集 4 个来源里所有 monster 类型的候选卡 -----
  const candidates: CandidateEntry[] = useMemo(() => {
    const list: CandidateEntry[] = [];
    if (equipmentSlot1 && equipmentSlot1.type === 'monster') {
      list.push({ card: equipmentSlot1, source: t('common.section.leftEquip') });
    }
    for (const c of equipmentSlot1Reserve) {
      if (c.type === 'monster') list.push({ card: c, source: t('common.section.leftBattle') });
    }
    if (equipmentSlot2 && equipmentSlot2.type === 'monster') {
      list.push({ card: equipmentSlot2, source: t('common.section.rightEquip') });
    }
    for (const c of equipmentSlot2Reserve) {
      if (c.type === 'monster') list.push({ card: c, source: t('common.section.rightBattle') });
    }
    for (const c of handCards) {
      if (c.type === 'monster') list.push({ card: c, source: t('common.section.hand') });
    }
    for (const c of backpackItems) {
      if (c.type === 'monster') list.push({ card: c, source: t('common.section.backpack') });
    }
    return list;
  }, [equipmentSlot1, equipmentSlot2, equipmentSlot1Reserve, equipmentSlot2Reserve, handCards, backpackItems, t]);

  // ----- 按种族分组 + 仅保留「该种族卡数 ≥ 2」的组（少于 2 张永远凑不齐融合） -----
  const groups = useMemo(() => {
    const map = new Map<string, CandidateEntry[]>();
    for (const e of candidates) {
      const race = getRace(e.card);
      if (!map.has(race)) map.set(race, []);
      map.get(race)!.push(e);
    }
    const out: { race: string; entries: CandidateEntry[] }[] = [];
    map.forEach((entries, race) => {
      if (entries.length >= 2) out.push({ race, entries });
    });
    out.sort((a, b) => b.entries.length - a.entries.length);
    return out;
  }, [candidates]);

  const togglePick = (cardId: string) => {
    setSelectedIds(prev => {
      if (prev.includes(cardId)) return prev.filter(id => id !== cardId);
      // 上限 3 张（Skeleton 用），多选超过 3 自动忽略
      if (prev.length >= 3) return prev;
      return [...prev, cardId];
    });
  };

  // ----- 校验：当前选择是否构成合法融合 -----
  const validation = useMemo(() => {
    if (selectedIds.length === 0) {
      return { valid: false, hint: '请选择 2 张同种族怪物装备（或 3 张 Skeleton）。' };
    }
    const picked = candidates.filter(e => selectedIds.includes(e.card.id));
    const races = picked.map(p => getRace(p.card));
    const allSameRace = races.every(r => r === races[0]);
    if (!allSameRace) {
      return { valid: false, hint: '所选卡种族不一致——必须为同种族。' };
    }
    if (selectedIds.length === 2) {
      return { valid: true, hint: `融合 2 个 ${RACE_CN[races[0]] ?? races[0]} 装备 → 精英${RACE_CN[races[0]] ?? races[0]}（Lv3）` };
    }
    if (selectedIds.length === 3) {
      if (races[0] !== 'Skeleton') {
        return { valid: false, hint: '3 张融合仅适用于 Skeleton 种族（→ 骷髅王）。' };
      }
      return { valid: true, hint: '融合 3 个 Skeleton 装备 → 骷髅王（10/10，4 耐久）' };
    }
    return { valid: false, hint: '请选择 2 张同种族（或 3 张 Skeleton）。' };
  }, [selectedIds, candidates]);

  const handleConfirm = () => {
    if (!validation.valid) return;
    onConfirm({ cardIds: [...selectedIds] });
    setSelectedIds([]);
  };

  const handleClose = () => {
    setSelectedIds([]);
    onClose();
  };

  const hasAny = groups.length > 0;

  return (
    <Dialog open={open} onOpenChange={v => { if (!v) handleClose(); }}>
      {/*
        魔物融合弹窗：玩家挑选 2/3 张同种族怪物装备进行融合。
        外点 / ESC 不关——避免误关浪费这张「魔物融合」magic 卡。
        显式关闭路径："取消" / X / "确认融合"。
      */}
      <DialogContent
        className="sm:max-w-2xl max-h-[95vh] overflow-y-auto"
        onInteractOutside={(e) => e.preventDefault()}
        onEscapeKeyDown={(e) => e.preventDefault()}
      >
        <DialogHeader>
          <DialogTitle className="text-lg font-semibold flex items-center gap-2">
            <Combine className="w-5 h-5 text-orange-500" />
            {t('modal.monsterFusion.title')}
          </DialogTitle>
          <DialogDescription className="text-sm text-muted-foreground">
            {t('modal.monsterFusion.description1')}<b>{t('modal.monsterFusion.description1Bold')}</b>{t('modal.monsterFusion.description2')}<b>{t('modal.monsterFusion.description2Bold')}</b>{t('modal.monsterFusion.description3')}
          </DialogDescription>
        </DialogHeader>

        <div className="mt-2 space-y-4">
          {!hasAny ? (
            <div className="text-center py-8 text-muted-foreground">
              {t('modal.monsterFusion.empty')}
            </div>
          ) : (
            groups.map(({ race, entries }) => {
              const cn = RACE_CN[race] ?? race;
              return (
                <div key={race}>
                  <div className="text-xs font-medium text-muted-foreground mb-2">
                    {cn} <span className="text-[10px]">{t('modal.monsterFusion.raceCount', { race, count: entries.length })}</span>
                  </div>
                  <div className="upgrade-modal-card-grid">
                    {entries.map(({ card, source }) => {
                      const picked = selectedIds.includes(card.id);
                      return (
                        <div key={card.id} className="space-y-1">
                          <div className="text-[10px] text-center text-muted-foreground">{source}</div>
                          <div
                            className={`upgrade-modal-card-slot${picked ? ' upgrade-modal-card-slot--selected' : ''}`}
                            onClick={() => togglePick(card.id)}
                          >
                            <GameCard card={card} disableInteractions />
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              );
            })
          )}

          {hasAny && (
            <div
              className={`text-xs text-center px-3 py-2 rounded border ${
                validation.valid
                  ? 'bg-orange-50 border-orange-300 text-orange-800'
                  : 'bg-muted/40 border-border text-muted-foreground'
              }`}
            >
              {validation.hint}
            </div>
          )}

          <div className="flex justify-end gap-2 pt-2 border-t border-border">
            <Button variant="outline" size="sm" onClick={handleClose}>
              {hasAny ? t('common.cancel') : t('common.close')}
            </Button>
            {hasAny && (
              <Button
                size="sm"
                disabled={!validation.valid}
                onClick={handleConfirm}
                className="bg-orange-600 hover:bg-orange-700 text-white"
              >
                <Combine className="w-4 h-4 mr-1" />
                {t('modal.monsterFusion.confirm')}
              </Button>
            )}
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
