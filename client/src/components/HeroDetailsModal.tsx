import { useTranslation } from 'react-i18next';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Badge } from '@/components/ui/badge';
import { Progress } from '@/components/ui/progress';
import type { HeroVariant } from '@/lib/heroes';
import type { HeroSkillDefinition } from '@/lib/heroSkills';
import type { HeroMagicId } from '@/components/GameCard';
import { getHeroMagicDefinition } from '@/lib/heroMagic';
import {
  Backpack,
  Coins,
  Droplets,
  Flame,
  Hand,
  Heart,
  LayoutGrid,
  PlusCircle,
  Shield,
  ShieldPlus,
  Sparkles,
  Sword,
  Zap,
} from 'lucide-react';

export interface HeroMagicDisplayInfo {
  id: HeroMagicId;
  name: string;
  gauge: number;
  gaugeMax: number;
  unlocked: boolean;
  ready: boolean;
  chargeHint: string;
  disabledReason?: string;
}

interface HeroDetailsModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  heroVariant: HeroVariant;
  stats: {
    hp: number;
    maxHp: number;
    gold: number;
    attackBonus: number;
    defenseBonus: number;
    spellDamageBonus: number;
    spellLifesteal: number;
    tempShield: number;
    permanentMaxHpBonus: number;
    stunCap: number;
  };
  heroSkills: HeroSkillDefinition[];
  permanentSkills: string[];
  permanentSkillStacks?: Record<string, number>;
  heroMagicInfo?: HeroMagicDisplayInfo[];
  /** 当前局内各区域卡牌上限 */
  capacityLimits: {
    hand: number;
    backpack: number;
    amuletSlots: number;
    equipmentSlotLeft: number;
    equipmentSlotRight: number;
  };
}

const permanentSkillHints: Record<string, string> = {
  'Iron Will': '最大生命永久 +3，提升整体生存能力。',
  'Weapon Master': '所有武器获得 +1 伤害加成。',
  'Berserker Rage': '每损失 2 点生命，获得额外 +1 武器伤害。',
  'Battle Frenzy': '生命低于 50% 时，额外 +2 武器伤害。',
  'Iron Skin': '所有护甲获得 +1 防御加成。',
  Bloodthirsty: '击杀怪物后回复 2 点生命值。',
  '潮涌铸甲': '永恒护符·瀑流铸剑 / 格挡铸甲（见下方子效果）。',
  '幽魂净化': '当背包为空时，自动将回收袋里的牌洗回背包（没有使用上限）。',
};

const formatSignedValue = (value: number) => (value >= 0 ? `+${value}` : `${value}`);

export default function HeroDetailsModal({
  open,
  onOpenChange,
  heroVariant,
  stats,
  heroSkills,
  permanentSkills,
  permanentSkillStacks,
  heroMagicInfo,
  capacityLimits,
}: HeroDetailsModalProps) {
  const { t } = useTranslation();

  const describePermanentSkill = (skill: string) => {
    const normalized = skill?.trim() || t('hero.unnamedEffect');
    return {
      label: normalized,
      description: permanentSkillHints[normalized] ?? null,
    };
  };

  const statItems = [
    {
      key: 'hp',
      label: t('hero.stat.hp'),
      value: `${stats.hp}/${stats.maxHp}`,
      icon: <Heart className="w-4 h-4 text-destructive" />,
    },
    {
      key: 'gold',
      label: t('hero.stat.gold'),
      value: stats.gold.toString(),
      icon: <Coins className="w-4 h-4 text-amber-500" />,
    },
    {
      key: 'attack',
      label: t('hero.stat.attack'),
      value: formatSignedValue(stats.attackBonus),
      icon: <Sword className="w-4 h-4 text-amber-600" />,
    },
    {
      key: 'defense',
      label: t('hero.stat.defense'),
      value: formatSignedValue(stats.defenseBonus),
      icon: <Shield className="w-4 h-4 text-blue-500" />,
    },
    {
      key: 'spell',
      label: t('hero.stat.spell'),
      value: formatSignedValue(stats.spellDamageBonus),
      icon: <Sparkles className="w-4 h-4 text-purple-500" />,
    },
    {
      key: 'spellLifesteal',
      label: t('hero.stat.spellLifesteal'),
      value: String(stats.spellLifesteal),
      icon: <Droplets className="w-4 h-4 text-rose-400" />,
    },
    {
      key: 'tempShield',
      label: t('hero.stat.tempShield'),
      value: formatSignedValue(stats.tempShield),
      icon: <ShieldPlus className="w-4 h-4 text-cyan-500" />,
    },
    {
      key: 'permHp',
      label: t('hero.stat.permHp'),
      value: formatSignedValue(stats.permanentMaxHpBonus),
      icon: <PlusCircle className="w-4 h-4 text-emerald-500" />,
    },
    {
      key: 'stunCap',
      label: t('hero.stat.stunCap'),
      value: `${stats.stunCap}%`,
      icon: <Zap className="w-4 h-4 text-orange-500" />,
    },
  ];

  const capacityItems = [
    {
      key: 'hand',
      label: t('hero.capacity.hand'),
      value: t('hero.capacity.cardsUnit', { count: capacityLimits.hand }),
      icon: <Hand className="w-4 h-4 text-sky-500" />,
    },
    {
      key: 'backpack',
      label: t('hero.capacity.backpack'),
      value: t('hero.capacity.cardsUnit', { count: capacityLimits.backpack }),
      icon: <Backpack className="w-4 h-4 text-amber-700 dark:text-amber-500" />,
    },
    {
      key: 'amulet',
      label: t('hero.capacity.amulet'),
      value: t('hero.capacity.piecesUnit', { count: capacityLimits.amuletSlots }),
      icon: <Sparkles className="w-4 h-4 text-violet-500" />,
    },
    {
      key: 'equipL',
      label: t('hero.capacity.equipL'),
      value: t('hero.capacity.itemsUnit', { count: capacityLimits.equipmentSlotLeft }),
      icon: <LayoutGrid className="w-4 h-4 text-blue-600" />,
    },
    {
      key: 'equipR',
      label: t('hero.capacity.equipR'),
      value: t('hero.capacity.itemsUnit', { count: capacityLimits.equipmentSlotRight }),
      icon: <LayoutGrid className="w-4 h-4 text-indigo-600" />,
    },
  ];

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-2xl max-h-[95vh] flex flex-col">
        <DialogHeader className="flex-shrink-0">
          <DialogTitle className="text-2xl font-serif">{heroVariant.name}</DialogTitle>
          <DialogDescription className="flex items-center gap-2">
            <span className="font-semibold text-foreground">{heroVariant.classTitle}</span>
            <span className="text-muted-foreground text-sm">• {t('hero.adventurerProfile')}</span>
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-6 py-2 overflow-y-auto flex-1 min-h-0 pr-1">
          <div className="flex flex-col gap-4 lg:flex-row">
            <div className="overflow-hidden rounded-2xl border bg-muted/40 max-h-[30vh] lg:max-h-none lg:w-1/3">
              <div className="relative h-full w-full bg-gradient-to-b from-background via-background/70 to-muted flex items-center justify-center">
                {heroVariant.image ? (
                  <img
                    src={heroVariant.image}
                    alt={heroVariant.name}
                    className="max-h-full max-w-full object-contain"
                    draggable={false}
                  />
                ) : (
                  <div className="flex h-full items-center justify-center text-muted-foreground aspect-[3/4]">{t('hero.noPortrait')}</div>
                )}
              </div>
            </div>

            <div className="grid flex-1 grid-cols-2 gap-3 sm:grid-cols-3">
              {statItems.map(stat => (
                <div key={stat.key} className="rounded-xl border border-border/60 bg-card/40 p-3">
                  <div className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                    {stat.label}
                  </div>
                  <div className="mt-2 flex items-center gap-2">
                    {stat.icon}
                    <span className="text-lg font-semibold">{stat.value}</span>
                  </div>
                </div>
              ))}
            </div>
          </div>

          <div className="space-y-3">
            <h3 className="text-base font-semibold text-foreground">{t('hero.capacity.title')}</h3>
            <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
              {capacityItems.map(row => (
                <div
                  key={row.key}
                  className="flex items-center justify-between gap-3 rounded-xl border border-border/60 bg-muted/25 px-3 py-2.5"
                >
                  <div className="flex min-w-0 items-center gap-2">
                    {row.icon}
                    <span className="text-sm font-medium text-foreground">{row.label}</span>
                  </div>
                  <span className="shrink-0 text-sm font-semibold tabular-nums">{row.value}</span>
                </div>
              ))}
            </div>
          </div>

          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <h3 className="text-base font-semibold text-foreground">{t('hero.skill.title')}</h3>
              <Badge variant="outline">{heroSkills.length}</Badge>
            </div>
            {heroSkills.length === 0 ? (
              <p className="text-sm text-muted-foreground italic">{t('hero.skill.empty')}</p>
            ) : (
              <div className="space-y-3">
                {heroSkills.map(skill => (
                  <div
                    key={skill.id}
                    className="rounded-2xl border border-border/70 bg-background/80 p-4 shadow-sm"
                  >
                    <div className="mb-2 flex items-center justify-between text-xs uppercase tracking-wide text-muted-foreground">
                      <span>{skill.type === 'active' ? t('hero.skill.active') : t('hero.skill.passive')}</span>
                      <Badge variant={skill.type === 'active' ? 'default' : 'secondary'}>
                        {skill.type === 'active' ? 'Active' : 'Passive'}
                      </Badge>
                    </div>
                    <div className="text-xl font-semibold text-foreground">{skill.name}</div>
                    {skill.description && (
                      <p className="mt-2 text-sm leading-relaxed text-muted-foreground">
                        {skill.description}
                      </p>
                    )}
                    {skill.effect && skill.effect !== skill.description && (
                      <div className="mt-1 rounded-lg border border-dashed border-primary/30 bg-primary/5 px-3 py-2 text-sm text-primary">
                        {skill.effect}
                      </div>
                    )}
                  </div>
                ))}
              </div>
            )}
          </div>

          {heroMagicInfo && heroMagicInfo.length > 0 && (
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <h3 className="text-base font-semibold text-foreground">{t('hero.magic.title')}</h3>
                <Badge variant="outline">{heroMagicInfo.length}</Badge>
              </div>
              <div className="space-y-3">
                {heroMagicInfo.map(magic => {
                  const def = getHeroMagicDefinition(magic.id);
                  const gaugePercent = magic.gaugeMax > 0 ? (magic.gauge / magic.gaugeMax) * 100 : 0;
                  return (
                    <div
                      key={magic.id}
                      className="rounded-2xl border border-amber-400/40 bg-amber-50/50 dark:bg-amber-900/10 p-4 shadow-sm space-y-2"
                    >
                      <div className="flex items-center gap-2">
                        <Flame className="w-4 h-4 text-amber-500" />
                        <span className="text-xl font-semibold text-foreground">{magic.name}</span>
                        <Badge variant={magic.ready ? 'default' : 'secondary'} className="ml-auto">
                          {magic.ready ? t('hero.magic.ready') : t('hero.magic.charging')}
                        </Badge>
                      </div>
                      <p className="text-sm leading-relaxed text-muted-foreground">{def.description}</p>
                      <div className="rounded-lg border border-dashed border-amber-500/30 bg-amber-500/5 px-3 py-2 text-sm text-amber-700 dark:text-amber-400">
                        {def.cardEffect}
                      </div>
                      <div className="space-y-1">
                        <div className="flex items-center justify-between text-xs text-muted-foreground">
                          <span>{def.chargeHint}</span>
                          <span className="font-mono font-semibold">{magic.gauge}/{magic.gaugeMax}</span>
                        </div>
                        <Progress value={gaugePercent} className="h-2" />
                      </div>
                      {magic.disabledReason && !magic.ready && (
                        <p className="text-xs text-muted-foreground italic">{magic.disabledReason}</p>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <h3 className="text-base font-semibold text-foreground">{t('hero.permSkill.title')}</h3>
              <Badge variant="outline">
                {permanentSkills.length === 0 ? '0' : permanentSkills.length.toString()}
              </Badge>
            </div>
            {permanentSkills.length === 0 ? (
              <p className="text-sm text-muted-foreground italic">{t('hero.permSkill.empty')}</p>
            ) : (
              <div className="grid gap-2 sm:grid-cols-2">
                {permanentSkills.map((skill, index) => {
                  const { label, description } = describePermanentSkill(skill);
                  const stacks = permanentSkillStacks?.[skill] ?? 0;

                  if (skill === '潮涌铸甲') {
                    const waterfallStacks = permanentSkillStacks?.['潮涌铸甲·瀑流'] ?? 0;
                    const blockStacks = permanentSkillStacks?.['潮涌铸甲·格挡'] ?? 0;
                    const parts: string[] = [];
                    if (waterfallStacks > 0) {
                      const tempGainAtk = 2 * waterfallStacks;
                      const suffix = waterfallStacks > 1 ? `（×${waterfallStacks}层）` : '';
                      parts.push(`瀑流铸剑${suffix}：每次攻击，该装备栏临时攻击 +${tempGainAtk}。`);
                    }
                    if (blockStacks > 0) {
                      const tempGain = 2 * blockStacks;
                      const suffix = blockStacks > 1 ? `（×${blockStacks}层）` : '';
                      parts.push(`格挡铸甲${suffix}：每次格挡，该装备栏临时护甲 +${tempGain}。`);
                    }
                    return (
                      <div key={`${label}-${index}`} className="rounded-xl border border-border/60 bg-muted/30 p-3">
                        <div className="flex items-center gap-2 font-medium text-foreground">
                          <span>{label}</span>
                          {stacks > 1 && (
                            <Badge variant="secondary" className="text-xs px-1.5 py-0">
                              ×{stacks}
                            </Badge>
                          )}
                        </div>
                        {parts.length > 0 ? (
                          <div className="mt-1 space-y-0.5">
                            {parts.map((p, pi) => (
                              <p key={pi} className="text-xs text-muted-foreground">{p}</p>
                            ))}
                          </div>
                        ) : null}
                      </div>
                    );
                  }

                  return (
                    <div key={`${label}-${index}`} className="rounded-xl border border-border/60 bg-muted/30 p-3">
                      <div className="flex items-center gap-2 font-medium text-foreground">
                        <span>{label}</span>
                        {stacks > 1 && (
                          <Badge variant="secondary" className="text-xs px-1.5 py-0">
                            ×{stacks}
                          </Badge>
                        )}
                      </div>
                      {description ? (
                        <p className="mt-1 text-xs text-muted-foreground">
                          {stacks > 1
                            ? description.replace(/\+1/, `+${stacks}`)
                            : description}
                        </p>
                      ) : null}
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
