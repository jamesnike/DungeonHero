import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Eye, Sparkles } from 'lucide-react';
import GameCard from '@/components/GameCard';
import type { DeckPeekModalState } from '@/components/game-board/types';

interface DeckPeekModalProps {
  state: DeckPeekModalState | null;
  onClose: () => void;
}

export default function DeckPeekModal({ state, onClose }: DeckPeekModalProps) {
  if (!state) return null;

  if (state.mode === 'dungeon-insight') {
    const { peekedCards, gains } = state;
    return (
      <Dialog open onOpenChange={v => { if (!v) onClose(); }}>
        <DialogContent className="sm:max-w-lg max-h-[95vh] overflow-y-auto" overlayClassName="bg-black/30">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-lg">
              <Sparkles className="w-5 h-5 text-amber-400" />
              万象探知
            </DialogTitle>
          </DialogHeader>

          <p className="text-sm text-muted-foreground text-center px-1">
            翻看牌堆顶的牌，根据卡牌类型获得永久增益。
          </p>

          <div className="flex items-center justify-center gap-3 py-4 flex-wrap">
            {peekedCards.length === 0 ? (
              <p className="text-sm text-muted-foreground">主牌堆已空。</p>
            ) : (
              peekedCards.map((card, idx) => (
                <div
                  key={card.id}
                  className={`w-[100px] h-[140px] flex-shrink-0 transition-transform duration-300 ${
                    card.type === 'monster' ? 'ring-2 ring-red-400 rounded-lg'
                    : card.type === 'weapon' || card.type === 'shield' ? 'ring-2 ring-blue-400 rounded-lg'
                    : card.type === 'magic' ? 'ring-2 ring-purple-400 rounded-lg'
                    : card.type === 'amulet' ? 'ring-2 ring-yellow-400 rounded-lg'
                    : card.type === 'potion' ? 'ring-2 ring-green-400 rounded-lg'
                    : ''
                  }`}
                  style={{ animationDelay: `${idx * 100}ms` }}
                >
                  <GameCard card={card} disableInteractions />
                </div>
              ))
            )}
          </div>

          {gains.length > 0 && (
            <div className="space-y-1 text-center">
              <p className="text-sm font-semibold text-foreground mb-2">获得增益：</p>
              {gains.map((g, i) => (
                <p key={i} className="text-sm text-amber-300">
                  {g.label} <span className="font-bold">×{g.count}</span>
                </p>
              ))}
            </div>
          )}

          {gains.length === 0 && (
            <p className="text-sm text-muted-foreground text-center">未翻看到任何卡牌，无增益。</p>
          )}

          <div className="flex justify-center pt-2">
            <Button variant="outline" onClick={onClose}>
              关闭
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    );
  }

  if (state.mode === 'deck-judge-delete') {
    const { peekedCards, monsterCount, deleteCount, gains } = state;
    return (
      <Dialog open onOpenChange={v => { if (!v) onClose(); }}>
        <DialogContent className="sm:max-w-lg max-h-[95vh] overflow-y-auto" overlayClassName="bg-black/30">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-lg">
              <Eye className="w-5 h-5 text-indigo-400" />
              命数裁断
            </DialogTitle>
          </DialogHeader>

          <p className="text-sm text-muted-foreground text-center px-1">
            翻看牌堆顶的牌，依类型获得增益或惩罚。
          </p>

          <div className="flex items-center justify-center gap-3 py-4 flex-wrap">
            {peekedCards.length === 0 ? (
              <p className="text-sm text-muted-foreground col-span-full">主牌堆已空。</p>
            ) : (
              peekedCards.map((card, idx) => (
                <div
                  key={card.id}
                  className={`w-[100px] h-[140px] flex-shrink-0 transition-transform duration-300 ${
                    card.type === 'monster' ? 'ring-2 ring-red-400 rounded-lg'
                    : card.type === 'event' || card.type === 'building' ? 'ring-2 ring-violet-400 rounded-lg'
                    : card.type === 'weapon' || card.type === 'shield' ? 'ring-2 ring-blue-400 rounded-lg'
                    : card.type === 'magic' ? 'ring-2 ring-purple-400 rounded-lg'
                    : card.type === 'potion' ? 'ring-2 ring-green-400 rounded-lg'
                    : ''
                  }`}
                  style={{ animationDelay: `${idx * 100}ms` }}
                >
                  <GameCard card={card} disableInteractions />
                </div>
              ))
            )}
          </div>

          {gains.length > 0 && (
            <div className="space-y-1 text-center">
              <p className="text-sm font-semibold text-foreground mb-2">效果：</p>
              {gains.map((g, i) => (
                <p key={i} className={`text-sm ${g.label.includes('删除') ? 'text-red-400' : 'text-amber-300'}`}>
                  {g.label} <span className="font-bold">×{g.count}</span>
                </p>
              ))}
            </div>
          )}

          {gains.length === 0 && peekedCards.length > 0 && (
            <p className="text-sm text-muted-foreground text-center">无效果。</p>
          )}

          <div className="flex justify-center pt-2">
            <Button variant="outline" onClick={onClose}>
              {deleteCount > 0 ? '确认' : '关闭'}
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    );
  }

  const { peekedCards, monsterCount, stunChance, targetMonsterName } = state;

  return (
    <Dialog open onOpenChange={v => { if (!v) onClose(); }}>
      <DialogContent className="sm:max-w-lg max-h-[95vh] overflow-y-auto" overlayClassName="bg-black/30">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-lg">
            <Eye className="w-5 h-5 text-indigo-400" />
            牌堆透视
          </DialogTitle>
        </DialogHeader>

        <div className="flex items-center justify-center gap-3 py-4">
          {peekedCards.map((card, idx) => (
            <div
              key={card.id}
              className={`w-[100px] h-[140px] flex-shrink-0 transition-transform duration-300 ${
                card.type === 'monster' ? 'ring-2 ring-red-400 rounded-lg' : ''
              }`}
              style={{ animationDelay: `${idx * 100}ms` }}
            >
              <GameCard card={card} disableInteractions />
            </div>
          ))}
        </div>

        <div className="space-y-2 text-center">
          <p className="text-sm text-muted-foreground">
            发现 <span className="font-bold text-red-400">{monsterCount}</span> 张怪物牌
          </p>

          {monsterCount > 0 ? (
            <>
              <p className="text-sm">
                击晕概率：<span className="font-bold text-amber-400">{stunChance}%</span>
              </p>
              <p className="text-sm text-amber-300 animate-pulse">
                关闭后掷骰判定是否击晕 {targetMonsterName}
              </p>
            </>
          ) : (
            <p className="text-sm text-muted-foreground">
              未发现怪物牌，无法判定击晕。
            </p>
          )}
        </div>

        <div className="flex justify-center pt-2">
          <Button variant="outline" onClick={onClose}>
            {monsterCount > 0 ? '确认并掷骰' : '关闭'}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
