import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { ArrowUpCircle, Coins, Heart, RefreshCw, Shield, ShoppingBag, Sparkles, Sword, Trash2 } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import type { GameCardData } from './GameCard';
import {
  EventPatternPreview,
  MagicSpellPreview,
  isEventCardType,
  isMagicSpellCardType,
} from './MagicNameFlankIcons';
import { getStarterBaseId } from '@/game-core/deck';
import { isUniqueLocked } from '@/game-core/uniqueClass';

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
  shopEquipBoostCost?: number;
  shopEquipAttackUsed?: boolean;
  shopEquipArmorUsed?: boolean;
  onShopEquipAttackRequest?: () => void;
  onShopEquipArmorRequest?: () => void;
  shopRefreshCost?: number;
  shopRefreshUsed?: boolean;
  onShopRefreshRequest?: () => void;
  acquiredUniqueClassCardIds?: string[];
}

export default function ShopModal({
  open,
  offerings,
  gold,
  backpackCount,
  backpackCapacity,
  shopLevel,
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
  shopEquipBoostCost = 15,
  shopEquipAttackUsed,
  shopEquipArmorUsed,
  onShopEquipAttackRequest,
  onShopEquipArmorRequest,
  shopRefreshCost = 5,
  shopRefreshUsed,
  onShopRefreshRequest,
  acquiredUniqueClassCardIds,
}: ShopModalProps) {
  const { t } = useTranslation();
  const isBackpackFull = backpackCount >= backpackCapacity;
  const deleteOptionDisabled = !canDeleteCard;
  const acquiredUniqueSet = new Set(acquiredUniqueClassCardIds ?? []);

  const handleOpenChange = (nextOpen: boolean) => {
    if (!nextOpen && onMinimize) {
      onMinimize();
    } else if (!nextOpen) {
      onFinish();
    }
  };

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      {/*
        Layout：flex 列 + 中间区滚动 + footer 固定。详见 CardDeletionModal 同款注释——
        商店有大量商品时，「完成购物」按钮原本被挤到滚动区底部 + mobile 浏览器
        chrome 遮挡，玩家很难退出。
      */}
      <DialogContent className="sm:max-w-2xl max-h-[95dvh] flex flex-col">
        <DialogHeader className="flex-shrink-0">
          <DialogTitle className="flex items-center gap-2">
            <ShoppingBag className="w-5 h-5 text-amber-500" />
            {t('modal.shop.title')}
          </DialogTitle>
          <DialogDescription>
            {sourceEventName
              ? t('modal.shop.descriptionFromEvent', { name: sourceEventName })
              : t('modal.shop.descriptionDefault')}
          </DialogDescription>
        </DialogHeader>

        <div className="flex flex-col gap-4 mt-4 flex-1 min-h-0 overflow-y-auto">
          <div className="flex flex-wrap items-center gap-4 rounded-md border border-border/60 bg-muted/40 p-3 text-sm">
            <span className="flex items-center gap-1 font-semibold">
              <Coins className="w-4 h-4 text-yellow-500" />
              {t('modal.shop.goldLabel')}{gold}
            </span>
            <span>
              {t('modal.shop.backpackLabel')}{backpackCount}/{backpackCapacity}
              {isBackpackFull && <span className="ml-2 text-destructive text-xs">{t('modal.shop.backpackFull')}</span>}
            </span>
            <span className="flex items-center gap-2">
              <Badge variant="secondary" className="text-[11px] uppercase tracking-wide">
                Lv.{shopLevel}
              </Badge>
              <span className="text-xs text-muted-foreground">
                {t('modal.shop.extraOffers', { count: shopLevel })}
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
                {t('modal.shop.priceLabel')}<span className="text-lg font-semibold text-yellow-500">{skillOffer.cost}</span> {t('modal.shop.priceUnit')}
              </span>
              {!skillOffer.canAfford && !skillOffer.purchased && (
                <span className="text-xs text-destructive">{t('modal.shop.notEnoughGold')}</span>
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
                {skillOffer.purchased ? t('modal.shop.skillLearned') : t('modal.shop.learnSkill')}
              </Button>
            </div>
          </div>
        )}

          {(() => {
            const canAffordRefresh = gold >= shopRefreshCost;
            const refreshDisabled = Boolean(shopRefreshUsed) || !canAffordRefresh;
            return (
              <div
                className={`flex flex-col gap-3 rounded-md border border-cyan-500/40 bg-cyan-500/5 p-4 shadow-sm sm:flex-row sm:items-center ${refreshDisabled ? 'opacity-70' : ''}`}
              >
                <div className="flex gap-3 flex-1">
                  <div className="relative h-20 w-16 overflow-hidden rounded-sm bg-cyan-500/10 text-cyan-600 flex items-center justify-center">
                    <RefreshCw className="w-6 h-6" />
                  </div>
                  <div className="space-y-1">
                    <div className="flex items-center gap-2">
                      <p className="text-base font-semibold text-cyan-700 dark:text-cyan-400">{t('modal.shop.refreshTitle')}</p>
                      <Badge variant="outline" className="text-[10px] border-cyan-500/50 text-cyan-700 dark:text-cyan-400">
                        {t('modal.shop.perVisitOnce')}
                      </Badge>
                    </div>
                    <p className="text-sm text-muted-foreground">
                      {t('modal.shop.refreshDesc', { cost: shopRefreshCost })}
                    </p>
                    {shopRefreshUsed && (
                      <p className="text-xs text-cyan-700 dark:text-cyan-400">{t('modal.shop.refreshUsedNote')}</p>
                    )}
                    {!shopRefreshUsed && !canAffordRefresh && (
                      <p className="text-xs text-destructive">{t('modal.shop.notEnoughGoldPeriod')}</p>
                    )}
                  </div>
                </div>
                <div className="flex flex-col items-end gap-2">
                  <span className="text-sm text-muted-foreground">
                    {t('modal.shop.priceLabel')}<span className="text-lg font-semibold text-yellow-500">{shopRefreshCost}</span> {t('modal.shop.priceUnit')}
                  </span>
                  <Button
                    className="bg-cyan-600 hover:bg-cyan-700 text-white"
                    disabled={refreshDisabled}
                    onClick={onShopRefreshRequest}
                  >
                    {t('modal.shop.refreshButton')}
                  </Button>
                </div>
              </div>
            );
          })()}

          {offerings.length === 0 && (
            <div className="text-center text-muted-foreground py-12 text-sm">
              {t('modal.shop.emptyOfferings')}
            </div>
          )}

          <div className="grid grid-cols-1 gap-4">
            {offerings.map(offering => {
              const { card, price, sold } = offering;
              const locked = isUniqueLocked(card, acquiredUniqueSet);
              const canAfford = gold >= price;
              const canBuy = !sold && !locked && canAfford && !isBackpackFull;
              const typeLabel = card.type ? card.type.toUpperCase() : 'CARD';

              return (
                <div
                  key={card.id}
                  className={`flex flex-col gap-3 rounded-md border border-border/60 bg-card/70 p-4 shadow-sm sm:flex-row sm:items-center ${locked ? 'opacity-70' : ''}`}
                  data-testid={`shop-offering-${getStarterBaseId(card.id)}`}
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
                      {card.unique && (
                        <Badge
                          variant="outline"
                          className="absolute top-1 left-1 text-[10px] px-1 py-0 bg-amber-500/90 text-white border-amber-300"
                        >
                          唯一
                        </Badge>
                      )}
                      {locked && (
                        <div className="absolute inset-0 bg-black/40 flex items-center justify-center">
                          <Badge variant="secondary" className="text-[10px] bg-amber-200/95 text-amber-900 border-amber-400">
                            已获得
                          </Badge>
                        </div>
                      )}
                    </div>
                    <div className="space-y-1">
                      <div className="flex items-center gap-2">
                        <p className="text-base font-semibold">{card.name}</p>
                        {sold && (
                          <Badge variant="destructive" className="text-[10px]">
                            {t('modal.shop.soldOut')}
                          </Badge>
                        )}
                        {locked && !sold && (
                          <Badge variant="outline" className="text-[10px] bg-amber-100 text-amber-900 border-amber-400">
                            已获得 (唯一)
                          </Badge>
                        )}
                      </div>
                      <p className="text-xs text-muted-foreground capitalize">{card.type}</p>
                      {card.description && (
                        <p className="text-sm text-muted-foreground line-clamp-2">{card.description}</p>
                      )}
                      {locked && !sold && (
                        <p className="text-xs text-amber-700 dark:text-amber-400">
                          唯一卡，本局已获得，无法购买。
                        </p>
                      )}
                    </div>
                  </div>
                  <div className="flex flex-col items-end gap-2">
                    <span className="text-sm text-muted-foreground">
                      {t('modal.shop.priceLabel')}<span className="text-lg font-semibold text-yellow-500">{price}</span> {t('modal.shop.priceUnit')}
                    </span>
                    {!sold && !locked && !canAfford && <span className="text-xs text-destructive">{t('modal.shop.notEnoughGold')}</span>}
                    <Button variant={sold || locked ? 'secondary' : 'default'} disabled={!canBuy} onClick={() => onBuy(card.id)}>
                      {sold ? t('modal.shop.bought') : locked ? '已获得' : t('modal.shop.purchase')}
                    </Button>
                  </div>
                </div>
              );
            })}

            {(
              <div
                className={`flex flex-col gap-3 rounded-md border border-destructive/40 bg-destructive/5 p-4 shadow-sm sm:flex-row sm:items-center ${deleteOptionDisabled ? 'opacity-70' : ''}`}
              >
                <div className="flex gap-3 flex-1">
                  <div className="relative h-20 w-16 overflow-hidden rounded-sm bg-destructive/10 text-destructive flex items-center justify-center">
                    <Trash2 className="w-6 h-6" />
                  </div>
                  <div className="space-y-1">
                    <div className="flex items-center gap-2">
                      <p className="text-base font-semibold text-destructive">{t('modal.shop.deleteCardTitle')}</p>
                      <Badge variant="outline" className="text-[10px] border-destructive/50 text-destructive">
                        {t('modal.shop.perVisitOnce')}
                      </Badge>
                    </div>
                    <p className="text-sm text-muted-foreground">{t('modal.shop.deleteCardDesc')}</p>
                    {!canDeleteCard && deleteDisabledReason && (
                      <p className="text-xs text-destructive">{deleteDisabledReason}</p>
                    )}
                  </div>
                </div>
                <div className="flex flex-col items-end gap-2">
                  <span className="text-xs text-muted-foreground">{t('modal.shop.freeOption')}</span>
                  <Button variant="destructive" disabled={deleteOptionDisabled} onClick={onDeleteRequest}>
                    {t('modal.shop.deleteButton')}
                  </Button>
                </div>
              </div>
            )}

            {shopLevel >= 1 && (() => {
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
                        <p className="text-base font-semibold text-green-700 dark:text-green-400">{t('modal.shop.healTitle')}</p>
                        <Badge variant="outline" className="text-[10px] border-green-500/50 text-green-700 dark:text-green-400">
                          {t('modal.shop.perVisitOnce')}
                        </Badge>
                      </div>
                      <p className="text-sm text-muted-foreground">
                        {t('modal.shop.healDesc', { cost: healCost })}
                        {typeof hp === 'number' && typeof maxHp === 'number' && (
                          <span className="ml-1">{t('modal.shop.healHpStatus', { hp, max: maxHp })}</span>
                        )}
                      </p>
                      {shopHealUsed && <p className="text-xs text-green-700 dark:text-green-400">{t('modal.shop.healUsedNote')}</p>}
                      {!shopHealUsed && isFullHp && <p className="text-xs text-muted-foreground">{t('modal.shop.healFullNote')}</p>}
                      {!shopHealUsed && !isFullHp && !canAffordHeal && <p className="text-xs text-destructive">{t('modal.shop.notEnoughGoldPeriod')}</p>}
                    </div>
                  </div>
                  <div className="flex flex-col items-end gap-2">
                    <span className="text-sm text-muted-foreground">
                      {t('modal.shop.priceLabel')}<span className="text-lg font-semibold text-yellow-500">{healCost}</span> {t('modal.shop.priceUnit')}
                    </span>
                    <Button
                      className="bg-green-600 hover:bg-green-700 text-white"
                      disabled={healDisabled}
                      onClick={onHealRequest}
                    >
                      {t('modal.shop.healButton')}
                    </Button>
                  </div>
                </div>
              );
            })()}

            {shopLevel >= 2 && (() => {
              const canAffordAttack = gold >= shopEquipBoostCost;
              const attackDisabled = shopEquipAttackUsed || !canAffordAttack;
              const canAffordArmor = gold >= shopEquipBoostCost;
              const armorDisabled = shopEquipArmorUsed || !canAffordArmor;
              return (
                <>
                  <div
                    className={`flex flex-col gap-3 rounded-md border border-red-500/40 bg-red-500/5 p-4 shadow-sm sm:flex-row sm:items-center ${attackDisabled ? 'opacity-70' : ''}`}
                  >
                    <div className="flex gap-3 flex-1">
                      <div className="relative h-20 w-16 overflow-hidden rounded-sm bg-red-500/10 text-red-600 flex items-center justify-center">
                        <Sword className="w-6 h-6" />
                      </div>
                      <div className="space-y-1">
                        <div className="flex items-center gap-2">
                          <p className="text-base font-semibold text-red-700 dark:text-red-400">{t('modal.shop.attackTitle')}</p>
                          <Badge variant="outline" className="text-[10px] border-red-500/50 text-red-700 dark:text-red-400">
                            {t('modal.shop.perVisitOnce')}
                          </Badge>
                        </div>
                        <p className="text-sm text-muted-foreground">
                          {t('modal.shop.attackDesc', { cost: shopEquipBoostCost })}
                        </p>
                        {shopEquipAttackUsed && <p className="text-xs text-red-700 dark:text-red-400">{t('modal.shop.attackUsedNote')}</p>}
                        {!shopEquipAttackUsed && !canAffordAttack && <p className="text-xs text-destructive">{t('modal.shop.notEnoughGoldPeriod')}</p>}
                      </div>
                    </div>
                    <div className="flex flex-col items-end gap-2">
                      <span className="text-sm text-muted-foreground">
                        {t('modal.shop.priceLabel')}<span className="text-lg font-semibold text-yellow-500">{shopEquipBoostCost}</span> {t('modal.shop.priceUnit')}
                      </span>
                      <Button
                        className="bg-red-600 hover:bg-red-700 text-white"
                        disabled={attackDisabled}
                        onClick={onShopEquipAttackRequest}
                      >
                        {t('modal.shop.attackButton')}
                      </Button>
                    </div>
                  </div>

                  <div
                    className={`flex flex-col gap-3 rounded-md border border-sky-500/40 bg-sky-500/5 p-4 shadow-sm sm:flex-row sm:items-center ${armorDisabled ? 'opacity-70' : ''}`}
                  >
                    <div className="flex gap-3 flex-1">
                      <div className="relative h-20 w-16 overflow-hidden rounded-sm bg-sky-500/10 text-sky-600 flex items-center justify-center">
                        <Shield className="w-6 h-6" />
                      </div>
                      <div className="space-y-1">
                        <div className="flex items-center gap-2">
                          <p className="text-base font-semibold text-sky-700 dark:text-sky-400">{t('modal.shop.armorTitle')}</p>
                          <Badge variant="outline" className="text-[10px] border-sky-500/50 text-sky-700 dark:text-sky-400">
                            {t('modal.shop.perVisitOnce')}
                          </Badge>
                        </div>
                        <p className="text-sm text-muted-foreground">
                          {t('modal.shop.armorDesc', { cost: shopEquipBoostCost })}
                        </p>
                        {shopEquipArmorUsed && <p className="text-xs text-sky-700 dark:text-sky-400">{t('modal.shop.armorUsedNote')}</p>}
                        {!shopEquipArmorUsed && !canAffordArmor && <p className="text-xs text-destructive">{t('modal.shop.notEnoughGoldPeriod')}</p>}
                      </div>
                    </div>
                    <div className="flex flex-col items-end gap-2">
                      <span className="text-sm text-muted-foreground">
                        {t('modal.shop.priceLabel')}<span className="text-lg font-semibold text-yellow-500">{shopEquipBoostCost}</span> {t('modal.shop.priceUnit')}
                      </span>
                      <Button
                        className="bg-sky-600 hover:bg-sky-700 text-white"
                        disabled={armorDisabled}
                        onClick={onShopEquipArmorRequest}
                      >
                        {t('modal.shop.armorButton')}
                      </Button>
                    </div>
                  </div>
                </>
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
                        <p className="text-base font-semibold text-amber-700 dark:text-amber-400">{t('modal.shop.levelUpTitle')}</p>
                        <Badge variant="outline" className="text-[10px] border-amber-500/50 text-amber-700 dark:text-amber-400">
                          {t('modal.shop.perVisitOnce')}
                        </Badge>
                      </div>
                      <p className="text-sm text-muted-foreground">
                        {t('modal.shop.levelUpDesc', { cost: shopLevelUpCost })}
                      </p>
                      {shopLevelUpUsed && <p className="text-xs text-amber-700 dark:text-amber-400">{t('modal.shop.levelUpUsedNote')}</p>}
                      {!shopLevelUpUsed && !canAffordLevelUp && <p className="text-xs text-destructive">{t('modal.shop.notEnoughGoldPeriod')}</p>}
                    </div>
                  </div>
                  <div className="flex flex-col items-end gap-2">
                    <span className="text-sm text-muted-foreground">
                      {t('modal.shop.priceLabel')}<span className="text-lg font-semibold text-yellow-500">{shopLevelUpCost}</span> {t('modal.shop.priceUnit')}
                    </span>
                    <Button
                      className="bg-amber-600 hover:bg-amber-700 text-white"
                      disabled={levelUpDisabled}
                      onClick={onShopLevelUpRequest}
                    >
                      {t('modal.shop.levelUpButton')}
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
                        <p className="text-base font-semibold text-purple-700 dark:text-purple-400">{t('modal.shop.discoverSkillTitle')}</p>
                        <Badge variant="outline" className="text-[10px] border-purple-500/50 text-purple-700 dark:text-purple-400">
                          {t('modal.shop.perVisitOnce')}
                        </Badge>
                      </div>
                      <p className="text-sm text-muted-foreground">
                        {t('modal.shop.discoverSkillDesc', { cost: shopSkillDiscoverCost })}
                      </p>
                      {shopSkillDiscoverUsed && <p className="text-xs text-purple-700 dark:text-purple-400">{t('modal.shop.discoverSkillUsedNote')}</p>}
                      {!shopSkillDiscoverUsed && !canDiscoverSkill && discoverSkillDisabledReason && (
                        <p className="text-xs text-muted-foreground">{discoverSkillDisabledReason}</p>
                      )}
                      {!shopSkillDiscoverUsed && canDiscoverSkill && !canAffordDiscover && <p className="text-xs text-destructive">{t('modal.shop.notEnoughGoldPeriod')}</p>}
                    </div>
                  </div>
                  <div className="flex flex-col items-end gap-2">
                    <span className="text-sm text-muted-foreground">
                      {t('modal.shop.priceLabel')}<span className="text-lg font-semibold text-yellow-500">{shopSkillDiscoverCost}</span> {t('modal.shop.priceUnit')}
                    </span>
                    <Button
                      className="bg-purple-600 hover:bg-purple-700 text-white"
                      disabled={discoverDisabled}
                      onClick={onShopSkillDiscoverRequest}
                    >
                      {t('modal.shop.discoverSkillButton')}
                    </Button>
                  </div>
                </div>
              );
            })()}
          </div>

        </div>

        <div className="flex justify-center pt-2 px-1 flex-shrink-0">
          <Button
            variant="ghost"
            className="w-full max-w-[min(22rem,calc(100vw-2rem))] sm:max-w-none sm:w-auto min-h-[clamp(2.5rem,7vmin,3.75rem)] min-w-[clamp(10.5rem,58vw,17.5rem)] sm:min-w-[clamp(11rem,36vw,17.5rem)] px-[clamp(1rem,5.5vw,2.75rem)] py-[clamp(0.45rem,2.2vmin,1.6rem)] text-[clamp(0.8125rem,2.6vmin,1.125rem)] rounded-xl font-bold text-white bg-gradient-to-b from-amber-500 to-amber-600 hover:from-amber-400 hover:to-amber-500 border-0 shadow-lg shadow-amber-900/30 ring-2 ring-amber-300/80 ring-offset-[clamp(2px,0.5vmin,4px)] ring-offset-background"
            onClick={onFinish}
          >
            {t('modal.shop.finishShopping')}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}

