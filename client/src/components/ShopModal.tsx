import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { ArrowUpCircle, Coins, Heart, ShoppingBag, Sparkles, Trash2 } from 'lucide-react';
import type { GameCardData } from './GameCard';
import {
  EventPatternPreview,
  MagicSpellPreview,
  isEventCardType,
  isMagicSpellCardType,
} from './MagicNameFlankIcons';

export interface ShopOffering {
  card: GameCardData;
  price: number;
  sold?: boolean;
}

export interface ShopSkillDisplay {
  id: string;
  title: string;
  description: string;
  badge: string;
  detail?: string;
  cost: number;
  purchased: boolean;
  canAfford: boolean;
  disabledReason?: string;
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
  skillOffer?: ShopSkillDisplay | null;
  onBuySkill?: () => void;
  onFinish: () => void;
  onMinimize?: () => void;
  sourceEventName?: string;
  hp?: number;
  maxHp?: number;
  healCost?: number;
  shopHealUsed?: boolean;
  onHealRequest?: () => void;
  shopLevelUpCost?: number;
  shopLevelUpUsed?: boolean;
  onShopLevelUpRequest?: () => void;
  shopSkillDiscoverCost?: number;
  shopSkillDiscoverUsed?: boolean;
  canDiscoverSkill?: boolean;
  discoverSkillDisabledReason?: string;
  onShopSkillDiscoverRequest?: () => void;
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
  skillOffer,
  onBuySkill,
  onFinish,
  onMinimize,
  sourceEventName,
  hp,
  maxHp,
  healCost = 5,
  shopHealUsed,
  onHealRequest,
  shopLevelUpCost = 10,
  shopLevelUpUsed,
  onShopLevelUpRequest,
  shopSkillDiscoverCost = 10,
  shopSkillDiscoverUsed,
  canDiscoverSkill = true,
  discoverSkillDisabledReason,
  onShopSkillDiscoverRequest,
}: ShopModalProps) {
  const isBackpackFull = backpackCount >= backpackCapacity;
  const deleteOptionDisabled = !canDeleteCard;

  const handleOpenChange = (nextOpen: boolean) => {
    if (!nextOpen && onMinimize) {
      onMinimize();
    } else if (!nextOpen) {
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

        {skillOffer && (
          <div
            className={`flex flex-col gap-3 rounded-md border border-indigo-500/40 bg-indigo-500/5 p-4 shadow-sm sm:flex-row sm:items-center ${
              skillOffer.purchased ? 'opacity-70' : ''
            }`}
          >
            <div className="flex-1 space-y-1">
              <div className="flex items-center gap-2">
                <Badge variant="secondary" className="text-[10px] uppercase tracking-wide">
                  {skillOffer.badge}
                </Badge>
                <p className="text-base font-semibold">{skillOffer.title}</p>
              </div>
              <p className="text-sm text-muted-foreground">{skillOffer.description}</p>
              {skillOffer.detail && (
                <p className="text-xs text-muted-foreground">{skillOffer.detail}</p>
              )}
              {skillOffer.disabledReason && (
                <p className="text-xs text-destructive">{skillOffer.disabledReason}</p>
              )}
            </div>
            <div className="flex flex-col items-end gap-2">
              <span className="text-sm text-muted-foreground">
                价格：<span className="text-lg font-semibold text-yellow-500">{skillOffer.cost}</span> 金币
              </span>
              {!skillOffer.canAfford && !skillOffer.purchased && (
                <span className="text-xs text-destructive">金币不足</span>
              )}
              <Button
                disabled={
                  skillOffer.purchased ||
                  !skillOffer.canAfford ||
                  Boolean(skillOffer.disabledReason) ||
                  !onBuySkill
                }
                onClick={() => onBuySkill?.()}
              >
                {skillOffer.purchased ? '已学习' : '学习技能'}
              </Button>
            </div>
          </div>
        )}

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
                      {isMagicSpellCardType(card.type) ? (
                        <MagicSpellPreview card={card} aspect="none" className="absolute inset-0 h-full w-full rounded-sm" />
                      ) : isEventCardType(card.type) ? (
                        <EventPatternPreview card={card} aspect="none" className="absolute inset-0 h-full w-full rounded-sm" />
                      ) : (
                        card.image && (
                          <img src={card.image} alt={card.name} className="h-full w-full object-cover" />
                        )
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

            {shopLevel >= 1 && (
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
            )}

            {shopLevel >= 2 && (() => {
              const isFullHp = typeof hp === 'number' && typeof maxHp === 'number' && hp >= maxHp;
              const canAffordHeal = gold >= healCost;
              const healDisabled = shopHealUsed || isFullHp || !canAffordHeal;
              return (
                <div
                  className={`flex flex-col gap-3 rounded-md border border-green-500/40 bg-green-500/5 p-4 shadow-sm sm:flex-row sm:items-center ${healDisabled ? 'opacity-70' : ''}`}
                >
                  <div className="flex gap-3 flex-1">
                    <div className="relative h-20 w-16 overflow-hidden rounded-sm bg-green-500/10 text-green-600 flex items-center justify-center">
                      <Heart className="w-6 h-6" />
                    </div>
                    <div className="space-y-1">
                      <div className="flex items-center gap-2">
                        <p className="text-base font-semibold text-green-700 dark:text-green-400">恢复生命</p>
                        <Badge variant="outline" className="text-[10px] border-green-500/50 text-green-700 dark:text-green-400">
                          每次商店限一次
                        </Badge>
                      </div>
                      <p className="text-sm text-muted-foreground">
                        花费 {healCost} 金币恢复 5 点生命值。
                        {typeof hp === 'number' && typeof maxHp === 'number' && (
                          <span className="ml-1">（当前 {hp}/{maxHp}）</span>
                        )}
                      </p>
                      {shopHealUsed && <p className="text-xs text-green-700 dark:text-green-400">本次商店的回血机会已用完。</p>}
                      {!shopHealUsed && isFullHp && <p className="text-xs text-muted-foreground">生命值已满。</p>}
                      {!shopHealUsed && !isFullHp && !canAffordHeal && <p className="text-xs text-destructive">金币不足。</p>}
                    </div>
                  </div>
                  <div className="flex flex-col items-end gap-2">
                    <span className="text-sm text-muted-foreground">
                      价格：<span className="text-lg font-semibold text-yellow-500">{healCost}</span> 金币
                    </span>
                    <Button
                      className="bg-green-600 hover:bg-green-700 text-white"
                      disabled={healDisabled}
                      onClick={onHealRequest}
                    >
                      回血
                    </Button>
                  </div>
                </div>
              );
            })()}

            {shopLevel < 3 && (() => {
              const canAffordLevelUp = gold >= shopLevelUpCost;
              const levelUpDisabled = shopLevelUpUsed || !canAffordLevelUp;
              return (
                <div
                  className={`flex flex-col gap-3 rounded-md border border-amber-500/40 bg-amber-500/5 p-4 shadow-sm sm:flex-row sm:items-center ${levelUpDisabled ? 'opacity-70' : ''}`}
                >
                  <div className="flex gap-3 flex-1">
                    <div className="relative h-20 w-16 overflow-hidden rounded-sm bg-amber-500/10 text-amber-600 flex items-center justify-center">
                      <ArrowUpCircle className="w-6 h-6" />
                    </div>
                    <div className="space-y-1">
                      <div className="flex items-center gap-2">
                        <p className="text-base font-semibold text-amber-700 dark:text-amber-400">商店升级</p>
                        <Badge variant="outline" className="text-[10px] border-amber-500/50 text-amber-700 dark:text-amber-400">
                          每次商店限一次
                        </Badge>
                      </div>
                      <p className="text-sm text-muted-foreground">
                        花费 {shopLevelUpCost} 金币提升商店等级，下次光临时享受更多商品和折扣。
                      </p>
                      {shopLevelUpUsed && <p className="text-xs text-amber-700 dark:text-amber-400">本次商店的升级机会已使用。</p>}
                      {!shopLevelUpUsed && !canAffordLevelUp && <p className="text-xs text-destructive">金币不足。</p>}
                    </div>
                  </div>
                  <div className="flex flex-col items-end gap-2">
                    <span className="text-sm text-muted-foreground">
                      价格：<span className="text-lg font-semibold text-yellow-500">{shopLevelUpCost}</span> 金币
                    </span>
                    <Button
                      className="bg-amber-600 hover:bg-amber-700 text-white"
                      disabled={levelUpDisabled}
                      onClick={onShopLevelUpRequest}
                    >
                      升级
                    </Button>
                  </div>
                </div>
              );
            })()}

            {shopLevel >= 3 && (() => {
              const canAffordDiscover = gold >= shopSkillDiscoverCost;
              const discoverDisabled = shopSkillDiscoverUsed || !canAffordDiscover || !canDiscoverSkill;
              return (
                <div
                  className={`flex flex-col gap-3 rounded-md border border-purple-500/40 bg-purple-500/5 p-4 shadow-sm sm:flex-row sm:items-center ${discoverDisabled ? 'opacity-70' : ''}`}
                >
                  <div className="flex gap-3 flex-1">
                    <div className="relative h-20 w-16 overflow-hidden rounded-sm bg-purple-500/10 text-purple-600 flex items-center justify-center">
                      <Sparkles className="w-6 h-6" />
                    </div>
                    <div className="space-y-1">
                      <div className="flex items-center gap-2">
                        <p className="text-base font-semibold text-purple-700 dark:text-purple-400">发现英雄技能</p>
                        <Badge variant="outline" className="text-[10px] border-purple-500/50 text-purple-700 dark:text-purple-400">
                          每次商店限一次
                        </Badge>
                      </div>
                      <p className="text-sm text-muted-foreground">
                        花费 {shopSkillDiscoverCost} 金币发现一个全新的英雄技能，从 3 个技能中选择 1 个学习。
                      </p>
                      {shopSkillDiscoverUsed && <p className="text-xs text-purple-700 dark:text-purple-400">本次商店的发现机会已使用。</p>}
                      {!shopSkillDiscoverUsed && !canDiscoverSkill && discoverSkillDisabledReason && (
                        <p className="text-xs text-muted-foreground">{discoverSkillDisabledReason}</p>
                      )}
                      {!shopSkillDiscoverUsed && canDiscoverSkill && !canAffordDiscover && <p className="text-xs text-destructive">金币不足。</p>}
                    </div>
                  </div>
                  <div className="flex flex-col items-end gap-2">
                    <span className="text-sm text-muted-foreground">
                      价格：<span className="text-lg font-semibold text-yellow-500">{shopSkillDiscoverCost}</span> 金币
                    </span>
                    <Button
                      className="bg-purple-600 hover:bg-purple-700 text-white"
                      disabled={discoverDisabled}
                      onClick={onShopSkillDiscoverRequest}
                    >
                      发现技能
                    </Button>
                  </div>
                </div>
              );
            })()}
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

