import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Coins, ShoppingBag, Trash2 } from 'lucide-react';
import type { GameCardData } from './GameCard';

export interface ShopOffering {
  card: GameCardData;
  price: number;
  sold?: boolean;
}

interface ShopModalProps {
  open: boolean;
  offerings: ShopOffering[];
  gold: number;
  backpackCount: number;
  backpackCapacity: number;
  shopLevel: number;
  discountPercent: number;
  canDeleteCard: boolean;
  deleteDisabledReason?: string;
  onDeleteRequest: () => void;
  onBuy: (cardId: string) => void;
  onFinish: () => void;
  sourceEventName?: string;
}

export default function ShopModal({
  open,
  offerings,
  gold,
  backpackCount,
  backpackCapacity,
  shopLevel,
  discountPercent,
  canDeleteCard,
  deleteDisabledReason,
  onDeleteRequest,
  onBuy,
  onFinish,
  sourceEventName,
}: ShopModalProps) {
  const isBackpackFull = backpackCount >= backpackCapacity;
  const deleteOptionDisabled = !canDeleteCard;

  const handleOpenChange = (nextOpen: boolean) => {
    if (!nextOpen) {
      onFinish();
    }
  };

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent className="sm:max-w-3xl max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <ShoppingBag className="w-5 h-5 text-amber-500" />
            冒险者商店
          </DialogTitle>
          <DialogDescription>
            {sourceEventName ? `${sourceEventName}向你展示了他的藏品。每张卡牌都可以用金币购买。` : '使用金币购买心仪的 Class 卡牌。'}
          </DialogDescription>
        </DialogHeader>

        <div className="flex flex-col gap-4 mt-4">
          <div className="flex flex-wrap items-center gap-4 rounded-md border border-border/60 bg-muted/40 p-3 text-sm">
            <span className="flex items-center gap-1 font-semibold">
              <Coins className="w-4 h-4 text-yellow-500" />
              金币：{gold}
            </span>
            <span>
              背包：{backpackCount}/{backpackCapacity}
              {isBackpackFull && <span className="ml-2 text-destructive text-xs">背包已满，无法再购买</span>}
            </span>
            <span className="flex items-center gap-2">
              <Badge variant="secondary" className="text-[11px] uppercase tracking-wide">
                Lv.{shopLevel}
              </Badge>
              <span className="text-xs text-muted-foreground">
                价格 -{discountPercent}% · 额外商品 +{shopLevel}
              </span>
            </span>
          </div>

          {offerings.length === 0 && (
            <div className="text-center text-muted-foreground py-12 text-sm">
              今天的商店暂时没有可卖的 Class 卡牌。
            </div>
          )}

          <div className="grid grid-cols-1 gap-4">
            {offerings.map(offering => {
              const { card, price, sold } = offering;
              const canAfford = gold >= price;
              const canBuy = !sold && canAfford && !isBackpackFull;
              const typeLabel = card.type ? card.type.toUpperCase() : 'CARD';

              return (
                <div
                  key={card.id}
                  className="flex flex-col gap-3 rounded-md border border-border/60 bg-card/70 p-4 shadow-sm sm:flex-row sm:items-center"
                >
                  <div className="flex gap-3 flex-1">
                    <div className="relative h-20 w-16 overflow-hidden rounded-sm bg-muted">
                      {card.image && (
                        <img src={card.image} alt={card.name} className="h-full w-full object-cover" />
                      )}
                      <Badge className="absolute top-1 right-1 text-[10px] px-1 py-0" variant="secondary">
                        {typeLabel}
                      </Badge>
                    </div>
                    <div className="space-y-1">
                      <div className="flex items-center gap-2">
                        <p className="text-base font-semibold">{card.name}</p>
                        {sold && (
                          <Badge variant="destructive" className="text-[10px]">
                            已售出
                          </Badge>
                        )}
                      </div>
                      <p className="text-xs text-muted-foreground capitalize">{card.type}</p>
                      {card.description && (
                        <p className="text-sm text-muted-foreground line-clamp-2">{card.description}</p>
                      )}
                    </div>
                  </div>
                  <div className="flex flex-col items-end gap-2">
                    <span className="text-sm text-muted-foreground">
                      价格：<span className="text-lg font-semibold text-yellow-500">{price}</span> 金币
                    </span>
                    {!sold && !canAfford && <span className="text-xs text-destructive">金币不足</span>}
                    <Button variant={sold ? 'secondary' : 'default'} disabled={!canBuy} onClick={() => onBuy(card.id)}>
                      {sold ? '已购入' : '购买'}
                    </Button>
                  </div>
                </div>
              );
            })}

            <div
              className={`flex flex-col gap-3 rounded-md border border-destructive/40 bg-destructive/5 p-4 shadow-sm sm:flex-row sm:items-center ${deleteOptionDisabled ? 'opacity-70' : ''}`}
            >
              <div className="flex gap-3 flex-1">
                <div className="relative h-20 w-16 overflow-hidden rounded-sm bg-destructive/10 text-destructive flex items-center justify-center">
                  <Trash2 className="w-6 h-6" />
                </div>
                <div className="space-y-1">
                  <div className="flex items-center gap-2">
                    <p className="text-base font-semibold text-destructive">删一张牌</p>
                    <Badge variant="outline" className="text-[10px] border-destructive/50 text-destructive">
                      每次商店限一次
                    </Badge>
                  </div>
                  <p className="text-sm text-muted-foreground">从手牌或背包中选择一张卡牌，将其直接送入坟场。</p>
                  {!canDeleteCard && deleteDisabledReason && (
                    <p className="text-xs text-destructive">{deleteDisabledReason}</p>
                  )}
                </div>
              </div>
              <div className="flex flex-col items-end gap-2">
                <span className="text-xs text-muted-foreground">无需花费金币</span>
                <Button variant="destructive" disabled={deleteOptionDisabled} onClick={onDeleteRequest}>
                  删牌
                </Button>
              </div>
            </div>
          </div>

          <div className="flex justify-end">
            <Button variant="outline" onClick={onFinish}>
              结束购买
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}

