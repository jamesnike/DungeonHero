import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs';
import { HelpCircle, Package } from 'lucide-react';
import { useTranslation, Trans } from 'react-i18next';

import heroPortrait from '@assets/generated_images/chibi_hero_adventurer_character.png';
import dragonImage from '@assets/generated_images/cute_chibi_dragon_monster.png';
import skeletonImage from '@assets/generated_images/cute_chibi_skeleton_monster.png';
import swordImage from '@assets/generated_images/cute_cartoon_medieval_sword.png';
import axeImage from '@assets/generated_images/cute_cartoon_battle_axe.png';
import woodenShieldImage from '@assets/generated_images/cute_wooden_shield.png';
import ironShieldImage from '@assets/generated_images/cute_iron_shield.png';
import potionImage from '@assets/generated_images/cute_cartoon_healing_potion.png';
import lifeAmuletImage from '@assets/generated_images/chibi_life_amulet.png';
import flashAmuletImage from '@assets/generated_images/chibi_flash_amulet.png';
import skillScrollImage from '@assets/generated_images/chibi_skill_scroll.png';
import eventScrollImage from '@assets/generated_images/chibi_event_scroll.png';

function CardImg({ src, alt, size = 40 }: { src: string; alt: string; size?: number }) {
  return (
    <img
      src={src}
      alt={alt}
      className="inline-block rounded-md object-contain flex-shrink-0"
      style={{ width: size, height: size }}
      draggable={false}
    />
  );
}

export default function HelpDialog({ buttonClassName: _buttonClassName }: { buttonClassName?: string } = {}) {
  const { t } = useTranslation();
  return (
    <Dialog>
      <DialogTrigger asChild>
        <button
          type="button"
          data-testid="button-help"
          className="game-header__sticker-icon game-header__sticker-icon--help"
          aria-label={t('header.guide')}
        >
          <HelpCircle />
        </button>
      </DialogTrigger>
      <DialogContent className="max-w-[min(95vw,540px)] max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="font-serif text-2xl flex items-center gap-3">
            <CardImg src={heroPortrait} alt="hero" size={36} />
            {t('help.title')}
          </DialogTitle>
        </DialogHeader>

        <Tabs defaultValue="goal" className="w-full">
          <TabsList className="w-full grid grid-cols-5 h-auto">
            <TabsTrigger value="goal" className="text-xs px-1 py-1.5">{t('help.tab.goal')}</TabsTrigger>
            <TabsTrigger value="cards" className="text-xs px-1 py-1.5">{t('help.tab.cards')}</TabsTrigger>
            <TabsTrigger value="combat" className="text-xs px-1 py-1.5">{t('help.tab.combat')}</TabsTrigger>
            <TabsTrigger value="actions" className="text-xs px-1 py-1.5">{t('help.tab.actions')}</TabsTrigger>
            <TabsTrigger value="tips" className="text-xs px-1 py-1.5">{t('help.tab.tips')}</TabsTrigger>
          </TabsList>

          {/* ─── Goal & Flow ─── */}
          <TabsContent value="goal" className="space-y-4 text-sm text-muted-foreground mt-4">
            <div className="p-4 bg-primary/10 rounded-lg border border-primary/20">
              <h3 className="font-semibold text-foreground text-base mb-2">{t('help.goal.objectiveTitle')}</h3>
              <p className="leading-relaxed">
                {t('help.goal.objectiveBody1')}
                <strong className="text-foreground">{t('help.goal.objectiveCards')}</strong>
                {t('help.goal.objectiveBody2')}
                <strong className="text-foreground">{t('help.goal.objectiveHpZero')}</strong>
                {t('help.goal.objectiveBody3')}
              </p>
            </div>

            <div className="p-4 bg-muted rounded-lg space-y-3">
              <h3 className="font-semibold text-foreground text-base">{t('help.goal.loopTitle')}</h3>
              <p className="leading-relaxed">
                {t('help.goal.loopIntro1')}
                <strong className="text-foreground">{t('help.goal.loopWord')}</strong>
                {t('help.goal.loopIntro2')}
              </p>
              <div className="space-y-2 pl-1">
                <Step n={1}>
                  {t('help.goal.loopStep1Pre')}<strong>{t('help.goal.loopStep1Bold')}</strong>{t('help.goal.loopStep1Post')}
                </Step>
                <Step n={2}>
                  {t('help.goal.loopStep2Pre')}<strong>{t('help.goal.loopStep2Bold')}</strong>{t('help.goal.loopStep2Post')}
                </Step>
                <Step n={3}>
                  {t('help.goal.loopStep3Pre')}<strong>{t('help.goal.loopStep3Bold')}</strong>{t('help.goal.loopStep3Post')}
                </Step>
                <Step n={4}>{t('help.goal.loopStep4')}</Step>
              </div>
            </div>

            <div className="p-4 bg-muted rounded-lg space-y-3">
              <h3 className="font-semibold text-foreground text-base">{t('help.goal.layoutTitle')}</h3>
              <div className="grid grid-cols-[auto_1fr] gap-x-3 gap-y-2 text-xs">
                <span className="font-mono text-primary font-bold">{t('help.goal.layoutTopBar')}</span>
                <span>{t('help.goal.layoutTopBarDesc')}</span>
                <span className="font-mono text-primary font-bold">{t('help.goal.layoutRow1')}</span>
                <span>{t('help.goal.layoutRow1Desc')}</span>
                <span className="font-mono text-primary font-bold">{t('help.goal.layoutRow2')}</span>
                <span>{t('help.goal.layoutRow2Desc')}</span>
                <span className="font-mono text-primary font-bold">{t('help.goal.layoutRow3')}</span>
                <span>{t('help.goal.layoutRow3Desc')}</span>
              </div>
            </div>

            <div className="p-4 bg-muted rounded-lg space-y-3">
              <h3 className="font-semibold text-foreground text-base">{t('help.goal.recycleBagTitle')}</h3>
              <p className="leading-relaxed text-xs">
                <strong className="text-foreground">{t('help.goal.recycleBagBodyA1')}</strong>
                {t('help.goal.recycleBagBodyA2')}
                <strong className="text-foreground">{t('help.goal.recycleBagBodyB')}</strong>
                {t('help.goal.recycleBagBodyA3')}
              </p>
            </div>

            <div className="p-4 bg-muted rounded-lg space-y-3">
              <h3 className="font-semibold text-foreground text-base">{t('help.goal.classDeckTitle')}</h3>
              <p className="leading-relaxed text-xs">
                {t('help.goal.classDeckIntroPre')}
                <strong className="text-foreground">{t('help.goal.classDeckIntroBold')}</strong>
                {t('help.goal.classDeckIntroPost')}
              </p>
              <ul className="text-xs space-y-1 pl-4 list-disc">
                <li>
                  {t('help.goal.classDeckListItem1Pre')}
                  <strong>{t('help.goal.classDeckListItem1A')}</strong>
                  {t('help.goal.classDeckListItem1Mid')}
                  <strong>{t('help.goal.classDeckListItem1B')}</strong>
                  {t('help.goal.classDeckListItem1Mid')}
                  <strong>{t('help.goal.classDeckListItem1C')}</strong>
                  {t('help.goal.classDeckListItem1Post')}
                </li>
                <li>
                  {t('help.goal.classDeckListItem2Pre')}
                  <strong>{t('help.goal.classDeckListItem2Bold')}</strong>
                  {t('help.goal.classDeckListItem2Post')}
                </li>
                <li>{t('help.goal.classDeckListItem3')}</li>
              </ul>
            </div>
          </TabsContent>

          {/* ─── Card Types ─── */}
          <TabsContent value="cards" className="space-y-3 text-sm text-muted-foreground mt-4">
            <CardTypeRow
              images={[dragonImage, skeletonImage]}
              title={t('help.cards.monster.title')}
              color="text-red-400"
              desc={t('help.cards.monster.desc')}
            />
            <CardTypeRow
              images={[swordImage, axeImage]}
              title={t('help.cards.weapon.title')}
              color="text-amber-400"
              desc={t('help.cards.weapon.desc')}
            />
            <CardTypeRow
              images={[woodenShieldImage, ironShieldImage]}
              title={t('help.cards.shield.title')}
              color="text-blue-400"
              desc={t('help.cards.shield.desc')}
            />
            <CardTypeRow
              images={[potionImage]}
              title={t('help.cards.potion.title')}
              color="text-green-400"
              desc={t('help.cards.potion.desc')}
            />
            <CardTypeRow
              images={[lifeAmuletImage, flashAmuletImage]}
              title={t('help.cards.amulet.title')}
              color="text-purple-400"
              desc={t('help.cards.amulet.desc')}
            />
            <CardTypeRow
              images={[skillScrollImage]}
              title={t('help.cards.magic.title')}
              color="text-violet-400"
              desc={t('help.cards.magic.desc')}
            />
            <CardTypeRow
              images={[eventScrollImage]}
              title={t('help.cards.event.title')}
              color="text-cyan-400"
              desc={t('help.cards.event.desc')}
            />
            <div className="flex items-start gap-3 p-3 bg-muted rounded-lg">
              <div className="flex gap-1 flex-shrink-0">
                <span className="inline-flex items-center justify-center w-9 h-9 rounded-md bg-orange-900/30">
                  <Package className="w-5 h-5 text-orange-400" />
                </span>
              </div>
              <div className="min-w-0">
                <strong className="text-orange-400 text-sm">{t('help.cards.backpack.title')}</strong>
                <p className="text-xs text-muted-foreground mt-0.5 leading-relaxed">
                  {t('help.cards.backpack.desc')}
                </p>
              </div>
            </div>
          </TabsContent>

          {/* ─── Combat ─── */}
          <TabsContent value="combat" className="space-y-4 text-sm text-muted-foreground mt-4">
            <div className="p-4 bg-red-950/30 rounded-lg border border-red-900/30 space-y-3">
              <h3 className="font-semibold text-foreground text-base flex items-center gap-2">
                <CardImg src={dragonImage} alt="monster" size={28} />
                {t('help.combat.flowTitle')}
              </h3>
              <p className="leading-relaxed text-xs">
                {t('help.combat.flowIntroPre')}
                <strong className="text-foreground">{t('help.combat.flowIntroBold')}</strong>
                {t('help.combat.flowIntroPost')}
              </p>
              <div className="space-y-2 pl-1">
                <Step n={1}>
                  <strong>{t('help.combat.flowHeroFirstBold')}</strong>
                  {t('help.combat.flowHeroFirstA')}
                  <strong className="text-amber-400">{t('help.combat.flowHeroFirstWeapon')}</strong>
                  {t('help.combat.flowHeroFirstB')}
                </Step>
                <Step n={2}>
                  <strong>{t('help.combat.flowMonsterFirstBold')}</strong>
                  {t('help.combat.flowMonsterFirstA')}
                  <strong className="text-red-400">{t('help.combat.flowMonsterFirstMonster')}</strong>
                  {t('help.combat.flowMonsterFirstB')}
                </Step>
              </div>
            </div>

            <div className="p-4 bg-muted rounded-lg space-y-3">
              <h3 className="font-semibold text-foreground text-base flex items-center gap-2">
                <CardImg src={swordImage} alt="weapon" size={24} />
                {t('help.combat.heroAttackTitle')}
              </h3>
              <ul className="text-xs space-y-1.5 list-none pl-0">
                <li className="flex items-start gap-2">
                  <span className="text-amber-400 flex-shrink-0">▸</span>
                  <span>
                    {t('help.combat.heroAttack1Pre')}
                    <strong className="text-foreground">{t('help.combat.heroAttack1Bold')}</strong>
                    {t('help.combat.heroAttack1Post')}
                  </span>
                </li>
                <li className="flex items-start gap-2">
                  <span className="text-amber-400 flex-shrink-0">▸</span>
                  <span>{t('help.combat.heroAttack2')}</span>
                </li>
                <li className="flex items-start gap-2">
                  <span className="text-amber-400 flex-shrink-0">▸</span>
                  <span>
                    {t('help.combat.heroAttack3Pre')}
                    <strong className="text-foreground">{t('help.combat.heroAttack3Bold')}</strong>
                    {t('help.combat.heroAttack3Post')}
                  </span>
                </li>
                <li className="flex items-start gap-2">
                  <span className="text-amber-400 flex-shrink-0">▸</span>
                  <span>
                    {t('help.combat.heroAttack4Pre')}
                    <strong className="text-foreground">{t('help.combat.heroAttack4Bold')}</strong>
                    {t('help.combat.heroAttack4Post')}
                  </span>
                </li>
              </ul>
            </div>

            <div className="p-4 bg-muted rounded-lg space-y-3">
              <h3 className="font-semibold text-foreground text-base flex items-center gap-2">
                <CardImg src={dragonImage} alt="monster" size={24} />
                {t('help.combat.layersTitle')}
              </h3>
              <p className="text-xs leading-relaxed">
                {t('help.combat.layersBodyA')}
                <strong className="text-foreground">{t('help.combat.layersBodyB')}</strong>
                {t('help.combat.layersBodyC')}
                <strong className="text-foreground">{t('help.combat.layersBodyD')}</strong>
                {t('help.combat.layersBodyE')}
              </p>
            </div>

            <div className="p-4 bg-muted rounded-lg space-y-3">
              <h3 className="font-semibold text-foreground text-base flex items-center gap-2">
                <CardImg src={woodenShieldImage} alt="shield" size={24} />
                {t('help.combat.blockTitle')}
              </h3>
              <ul className="text-xs space-y-1.5 list-none pl-0">
                <li className="flex items-start gap-2">
                  <span className="text-blue-400 flex-shrink-0">▸</span>
                  <span>
                    {t('help.combat.block1Pre')}
                    <strong className="text-foreground">{t('help.combat.block1A')}</strong>
                    {t('help.combat.block1Mid')}
                    <strong className="text-foreground">{t('help.combat.block1B')}</strong>
                    {t('help.combat.block1Post')}
                  </span>
                </li>
                <li className="flex items-start gap-2">
                  <span className="text-blue-400 flex-shrink-0">▸</span>
                  <span>{t('help.combat.block2')}</span>
                </li>
                <li className="flex items-start gap-2">
                  <span className="text-blue-400 flex-shrink-0">▸</span>
                  <span>{t('help.combat.block3')}</span>
                </li>
                <li className="flex items-start gap-2">
                  <span className="text-blue-400 flex-shrink-0">▸</span>
                  <span>{t('help.combat.block4')}</span>
                </li>
              </ul>
            </div>

            <div className="p-4 bg-muted rounded-lg space-y-3">
              <h3 className="font-semibold text-foreground text-base">{t('help.combat.turnTitle')}</h3>
              <p className="text-xs leading-relaxed">
                {t('help.combat.turnBodyPre')}
                <strong className="text-foreground">{t('help.combat.turnBodyBold')}</strong>
                {t('help.combat.turnBodyPost')}
              </p>
            </div>

            <div className="p-4 bg-primary/10 rounded-lg border border-primary/20 space-y-2">
              <h3 className="font-semibold text-foreground text-base">{t('help.combat.eliteTitle')}</h3>
              <ul className="text-xs space-y-1.5 list-none pl-0">
                <li className="flex items-start gap-2">
                  <span className="text-red-400 flex-shrink-0">▸</span>
                  <span>
                    <strong>{t('help.combat.elite1Bold')}</strong>
                    {t('help.combat.elite1Post')}
                  </span>
                </li>
                <li className="flex items-start gap-2">
                  <span className="text-red-400 flex-shrink-0">▸</span>
                  <span>
                    <strong>{t('help.combat.elite2Bold')}</strong>
                    {t('help.combat.elite2Post')}
                  </span>
                </li>
                <li className="flex items-start gap-2">
                  <span className="text-red-400 flex-shrink-0">▸</span>
                  <span>
                    {t('help.combat.elite3Pre')}
                    <strong className="text-foreground">{t('help.combat.elite3Bold')}</strong>
                    {t('help.combat.elite3Post')}
                  </span>
                </li>
              </ul>
            </div>
          </TabsContent>

          {/* ─── Actions ─── */}
          <TabsContent value="actions" className="space-y-3 text-sm text-muted-foreground mt-4">
            <ActionRow badge={t('help.actions.attackBadge')} desc={t('help.actions.attackDesc')} />
            <ActionRow badge={t('help.actions.blockBadge')} desc={t('help.actions.blockDesc')} />
            <ActionRow badge={t('help.actions.equipBadge')} desc={t('help.actions.equipDesc')} />
            <ActionRow badge={t('help.actions.storeBadge')} desc={t('help.actions.storeDesc')} />
            <ActionRow badge={t('help.actions.amuletBadge')} desc={t('help.actions.amuletDesc')} />
            <ActionRow badge={t('help.actions.magicBadge')} desc={t('help.actions.magicDesc')} />
            <ActionRow badge={t('help.actions.eventBadge')} desc={t('help.actions.eventDesc')} />
            <ActionRow badge={t('help.actions.discardBadge')} desc={t('help.actions.discardDesc')} />
            <ActionRow badge={t('help.actions.skillBadge')} desc={t('help.actions.skillDesc')} />
            <ActionRow badge={t('help.actions.diceBadge')} desc={t('help.actions.diceDesc')} />
            <ActionRow badge={t('help.actions.logBadge')} desc={t('help.actions.logDesc')} />
          </TabsContent>

          {/* ─── Tips ─── */}
          <TabsContent value="tips" className="space-y-3 text-sm text-muted-foreground mt-4">
            <div className="p-4 bg-primary/10 rounded-lg border border-primary/20 space-y-3">
              <h3 className="font-semibold text-foreground text-base">{t('help.tips.tipsTitle')}</h3>
              <ul className="space-y-2 list-none pl-0">
                <Tip>
                  <strong>{t('help.tips.tip1Bold')}</strong>{t('help.tips.tip1Body')}
                </Tip>
                <Tip>
                  <strong>{t('help.tips.tip2Bold')}</strong>{t('help.tips.tip2Body')}
                </Tip>
                <Tip>
                  <strong>{t('help.tips.tip3Bold')}</strong>{t('help.tips.tip3Body')}
                </Tip>
                <Tip>
                  <strong>{t('help.tips.tip4Bold')}</strong>{t('help.tips.tip4Body')}
                </Tip>
                <Tip>
                  <strong>{t('help.tips.tip5Bold')}</strong>{t('help.tips.tip5Body')}
                </Tip>
                <Tip>
                  <strong>{t('help.tips.tip6Bold')}</strong>{t('help.tips.tip6Body')}
                </Tip>
                <Tip>
                  <strong>{t('help.tips.tip7Bold')}</strong>{t('help.tips.tip7Body')}
                </Tip>
                <Tip>
                  <strong>{t('help.tips.tip8Bold')}</strong>{t('help.tips.tip8Body')}
                </Tip>
              </ul>
            </div>

            <div className="p-4 bg-muted rounded-lg space-y-2">
              <h3 className="font-semibold text-foreground text-base">{t('help.tips.uiTitle')}</h3>
              <ul className="space-y-1.5 list-none pl-0 text-xs">
                <li><Trans i18nKey="help.tips.uiClickDeck" components={[<strong />]} /></li>
                <li><Trans i18nKey="help.tips.uiClickGrave" components={[<strong />]} /></li>
                <li><Trans i18nKey="help.tips.uiClickBackpack" components={[<strong />]} /></li>
                <li><Trans i18nKey="help.tips.uiClickClassDeck" components={[<strong />]} /></li>
                <li><Trans i18nKey="help.tips.uiHover" components={[<strong />]} /></li>
                <li><Trans i18nKey="help.tips.uiLogPanel" components={[<strong />]} /></li>
                <li><Trans i18nKey="help.tips.uiCombatPanel" components={[<strong />]} /></li>
                <li><Trans i18nKey="help.tips.uiUndo" components={[<strong />]} /></li>
              </ul>
            </div>
          </TabsContent>
        </Tabs>
      </DialogContent>
    </Dialog>
  );
}

function Step({ n, children }: { n: number; children: React.ReactNode }) {
  return (
    <div className="flex items-start gap-2">
      <span className="flex-shrink-0 w-5 h-5 rounded-full bg-primary text-primary-foreground text-xs font-bold flex items-center justify-center mt-0.5">
        {n}
      </span>
      <span className="leading-relaxed">{children}</span>
    </div>
  );
}

function CardTypeRow({
  images,
  title,
  color,
  desc,
}: {
  images: string[];
  title: string;
  color: string;
  desc: string;
}) {
  return (
    <div className="flex items-start gap-3 p-3 bg-muted rounded-lg">
      <div className="flex gap-1 flex-shrink-0">
        {images.map((img, i) => (
          <CardImg key={i} src={img} alt={title} size={36} />
        ))}
      </div>
      <div className="min-w-0">
        <strong className={`${color} text-sm`}>{title}</strong>
        <p className="text-xs text-muted-foreground mt-0.5 leading-relaxed">{desc}</p>
      </div>
    </div>
  );
}

function ActionRow({ badge, desc }: { badge: string; desc: string }) {
  return (
    <div className="flex items-start gap-3 p-2.5 bg-muted rounded-lg">
      <span className="flex-shrink-0 font-semibold text-foreground text-sm whitespace-nowrap">{badge}</span>
      <span className="text-xs leading-relaxed">{desc}</span>
    </div>
  );
}

function Tip({ children }: { children: React.ReactNode }) {
  return (
    <li className="flex items-start gap-2">
      <span className="text-primary mt-0.5 flex-shrink-0">▸</span>
      <span className="leading-relaxed">{children}</span>
    </li>
  );
}
