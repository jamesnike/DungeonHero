import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Badge } from '@/components/ui/badge';
import type { HeroVariant } from '@/lib/heroes';
import type { HeroSkillDefinition } from '@/lib/heroSkills';
import { Coins, Heart, Shield, ShieldPlus, Sparkles, Sword, PlusCircle } from 'lucide-react';

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
    tempShield: number;
    permanentMaxHpBonus: number;
  };
  heroSkills: HeroSkillDefinition[];
  permanentSkills: string[];
}

const permanentSkillHints: Record<string, string> = {
  'Iron Will': '最大生命永久 +3，提升整体生存能力。',
  'Weapon Master': '所有武器获得 +1 伤害加成。',
  'Berserker Rage': '每损失 2 点生命，获得额外 +1 武器伤害。',
  'Battle Frenzy': '生命低于 50% 时，额外 +2 武器伤害。',
  'Iron Skin': '所有护甲获得 +1 防御加成。',
  Bloodthirsty: '击杀怪物后回复 2 点生命值。',
};

const formatSignedValue = (value: number) => (value >= 0 ? `+${value}` : `${value}`);

const describePermanentSkill = (skill: string) => {
  const normalized = skill?.trim() || '未命名效果';
  return {
    label: normalized,
    description: permanentSkillHints[normalized] ?? null,
  };
};

export default function HeroDetailsModal({
  open,
  onOpenChange,
  heroVariant,
  stats,
  heroSkills,
  permanentSkills,
}: HeroDetailsModalProps) {
  const statItems = [
    {
      key: 'hp',
      label: '生命值',
      value: `${stats.hp}/${stats.maxHp}`,
      icon: <Heart className="w-4 h-4 text-destructive" />,
    },
    {
      key: 'gold',
      label: '金币',
      value: stats.gold.toString(),
      icon: <Coins className="w-4 h-4 text-amber-500" />,
    },
    {
      key: 'attack',
      label: '攻击加成',
      value: formatSignedValue(stats.attackBonus),
      icon: <Sword className="w-4 h-4 text-amber-600" />,
    },
    {
      key: 'defense',
      label: '防御加成',
      value: formatSignedValue(stats.defenseBonus),
      icon: <Shield className="w-4 h-4 text-blue-500" />,
    },
    {
      key: 'spell',
      label: '法术伤害',
      value: formatSignedValue(stats.spellDamageBonus),
      icon: <Sparkles className="w-4 h-4 text-purple-500" />,
    },
    {
      key: 'tempShield',
      label: '临时护盾',
      value: formatSignedValue(stats.tempShield),
      icon: <ShieldPlus className="w-4 h-4 text-cyan-500" />,
    },
    {
      key: 'permHp',
      label: '永久生命奖励',
      value: formatSignedValue(stats.permanentMaxHpBonus),
      icon: <PlusCircle className="w-4 h-4 text-emerald-500" />,
    },
  ];

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-3xl">
        <DialogHeader>
          <DialogTitle className="text-2xl font-serif">{heroVariant.name}</DialogTitle>
          <DialogDescription className="flex items-center gap-2">
            <span className="font-semibold text-foreground">{heroVariant.classTitle}</span>
            <span className="text-muted-foreground text-sm">• 冒险者档案</span>
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-6 py-2">
          <div className="flex flex-col gap-4 lg:flex-row">
            <div className="overflow-hidden rounded-2xl border bg-muted/40 lg:w-1/3">
              <div className="relative aspect-[3/4] w-full bg-gradient-to-b from-background via-background/70 to-muted">
                {heroVariant.image ? (
                  <img
                    src={heroVariant.image}
                    alt={heroVariant.name}
                    className="h-full w-full object-cover"
                    draggable={false}
                  />
                ) : (
                  <div className="flex h-full items-center justify-center text-muted-foreground">暂无立绘</div>
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
            <div className="flex items-center justify-between">
              <h3 className="text-base font-semibold text-foreground">英雄技能</h3>
              <Badge variant="outline">{heroSkills.length}</Badge>
            </div>
            {heroSkills.length === 0 ? (
              <p className="text-sm text-muted-foreground italic">尚未学习任何英雄技能。</p>
            ) : (
              <div className="space-y-3">
                {heroSkills.map(skill => (
                  <div
                    key={skill.id}
                    className="rounded-2xl border border-border/70 bg-background/80 p-4 shadow-sm"
                  >
                    <div className="mb-2 flex items-center justify-between text-xs uppercase tracking-wide text-muted-foreground">
                      <span>{skill.type === 'active' ? '主动技能' : '被动技能'}</span>
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

          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <h3 className="text-base font-semibold text-foreground">已掌握的被动</h3>
              <Badge variant="outline">
                {permanentSkills.length === 0 ? '0' : permanentSkills.length.toString()}
              </Badge>
            </div>
            {permanentSkills.length === 0 ? (
              <p className="text-sm text-muted-foreground italic">尚未学习额外的被动技能。</p>
            ) : (
              <div className="grid gap-2 sm:grid-cols-2">
                {permanentSkills.map((skill, index) => {
                  const { label, description } = describePermanentSkill(skill);
                  return (
                    <div key={`${label}-${index}`} className="rounded-xl border border-border/60 bg-muted/30 p-3">
                      <div className="font-medium text-foreground">{label}</div>
                      {description ? (
                        <p className="mt-1 text-xs text-muted-foreground">{description}</p>
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
