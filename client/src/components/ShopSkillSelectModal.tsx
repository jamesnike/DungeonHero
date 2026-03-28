import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Card } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Sparkles } from 'lucide-react';
import type { HeroSkillDefinition } from '@/lib/heroSkills';

interface ShopSkillSelectModalProps {
  open: boolean;
  options: HeroSkillDefinition[];
  onSelect: (skillId: string) => void;
}

export default function ShopSkillSelectModal({ open, options, onSelect }: ShopSkillSelectModalProps) {
  return (
    <Dialog open={open}>
      <DialogContent className="sm:max-w-2xl" onPointerDownOutside={(e) => e.preventDefault()}>
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Sparkles className="w-5 h-5 text-purple-500" />
            发现英雄技能
          </DialogTitle>
          <DialogDescription>
            从以下 3 个技能中选择 1 个学习。选择后将立即获得该技能。
          </DialogDescription>
        </DialogHeader>

        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 mt-4">
          {options.map((skill) => (
            <Card
              key={skill.id}
              onClick={() => onSelect(skill.id)}
              className="relative cursor-pointer transition-[transform,ring,box-shadow] duration-200 hover:scale-[1.03] hover:shadow-lg hover:ring-2 hover:ring-purple-500 active:scale-[0.98]"
            >
              <div className="p-4 space-y-3">
                <div className="flex items-center gap-2">
                  <Badge variant={skill.type === 'active' ? 'default' : 'secondary'} className="text-[10px]">
                    {skill.type === 'active' ? '主动' : '被动'}
                  </Badge>
                </div>
                <h3 className="text-lg font-bold font-serif">{skill.name}</h3>
                <p className="text-sm text-muted-foreground">{skill.description}</p>
                <div className="rounded-md border border-dashed border-purple-500/30 bg-purple-500/5 px-3 py-2 text-sm text-purple-700 dark:text-purple-400">
                  {skill.effect}
                </div>
              </div>
            </Card>
          ))}
        </div>

        <p className="text-xs text-muted-foreground text-center mt-2">
          点击技能卡牌以选择
        </p>
      </DialogContent>
    </Dialog>
  );
}
