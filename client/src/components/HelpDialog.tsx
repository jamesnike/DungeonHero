import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs';
import { HelpCircle, Package } from 'lucide-react';

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
  return (
    <Dialog>
      <DialogTrigger asChild>
        <button
          type="button"
          data-testid="button-help"
          className="game-header__sticker-icon game-header__sticker-icon--help"
          aria-label="游戏指南"
        >
          <HelpCircle />
        </button>
      </DialogTrigger>
      <DialogContent className="max-w-[min(95vw,540px)] max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="font-serif text-2xl flex items-center gap-3">
            <CardImg src={heroPortrait} alt="hero" size={36} />
            游戏指南
          </DialogTitle>
        </DialogHeader>

        <Tabs defaultValue="goal" className="w-full">
          <TabsList className="w-full grid grid-cols-5 h-auto">
            <TabsTrigger value="goal" className="text-xs px-1 py-1.5">目标</TabsTrigger>
            <TabsTrigger value="cards" className="text-xs px-1 py-1.5">卡牌</TabsTrigger>
            <TabsTrigger value="combat" className="text-xs px-1 py-1.5">战斗</TabsTrigger>
            <TabsTrigger value="actions" className="text-xs px-1 py-1.5">操作</TabsTrigger>
            <TabsTrigger value="tips" className="text-xs px-1 py-1.5">攻略</TabsTrigger>
          </TabsList>

          {/* ─── 目标 & 流程 ─── */}
          <TabsContent value="goal" className="space-y-4 text-sm text-muted-foreground mt-4">
            <div className="p-4 bg-primary/10 rounded-lg border border-primary/20">
              <h3 className="font-semibold text-foreground text-base mb-2">🎯 游戏目标</h3>
              <p className="leading-relaxed">
                你是一名深入地牢的冒险者。牌堆中有 <strong className="text-foreground">64 张卡牌</strong>（怪物、武器、盾牌、药水、魔法、护符、事件），
                你要处理每一张牌，在 <strong className="text-foreground">HP 归零之前</strong> 击败所有怪物并清空牌堆。
              </p>
            </div>

            <div className="p-4 bg-muted rounded-lg space-y-3">
              <h3 className="font-semibold text-foreground text-base">🔄 核心循环：瀑流</h3>
              <p className="leading-relaxed">游戏按 <strong className="text-foreground">"瀑流"</strong> 节奏推进，每轮的流程如下：</p>
              <div className="space-y-2 pl-1">
                <Step n={1}>场上出现 <strong>5 张卡牌</strong>，上方有 5 张预览牌。</Step>
                <Step n={2}>你需要 <strong>处理掉 4 张</strong>（攻击怪物、装备武器/盾牌、收取药水等）。</Step>
                <Step n={3}>当场上只剩 <strong>1 张牌</strong> 时，瀑流触发 —— 这张牌被自动弃掉，预览牌落入场上，新的预览牌从牌堆翻出。</Step>
                <Step n={4}>循环往复，直到牌堆清空。</Step>
              </div>
            </div>

            <div className="p-4 bg-muted rounded-lg space-y-3">
              <h3 className="font-semibold text-foreground text-base">🗺️ 界面布局</h3>
              <div className="grid grid-cols-[auto_1fr] gap-x-3 gap-y-2 text-xs">
                <span className="font-mono text-primary font-bold">顶栏</span>
                <span>❤️ 生命值、🪙 金币、📦 牌堆数量、🌊 瀑流次数、🏪 商店等级</span>
                <span className="font-mono text-primary font-bold">第一行</span>
                <span>预览区（5 张半透明牌）＋ 🎲 骰子</span>
                <span className="font-mono text-primary font-bold">第二行</span>
                <span>场上区（5 张活跃牌）＋ 💀 坟场（弃牌记录）</span>
                <span className="font-mono text-primary font-bold">第三行</span>
                <span>护符槽（上限 2 个）→ 装备槽×2 → 英雄 → 背包 → 职业牌堆</span>
              </div>
            </div>

            <div className="p-4 bg-muted rounded-lg space-y-3">
              <h3 className="font-semibold text-foreground text-base">♻️ 回收袋</h3>
              <p className="leading-relaxed text-xs">
                <strong className="text-foreground">永久魔法</strong>使用后不会进坟场，而是进入 <strong className="text-foreground">回收袋</strong>。
                每次瀑流时回收袋中的牌会倒计时，等待数回合后自动回到背包，可以再次使用。
                护符和永久装备手动拖到回收袋也能循环利用。回收袋是游戏的核心循环引擎。
              </p>
            </div>

            <div className="p-4 bg-muted rounded-lg space-y-3">
              <h3 className="font-semibold text-foreground text-base">🃏 职业牌</h3>
              <p className="leading-relaxed text-xs">
                骑士拥有独立的 <strong className="text-foreground">职业牌堆</strong>（21 张），获取方式：
              </p>
              <ul className="text-xs space-y-1 pl-4 list-disc">
                <li>事件中的 <strong>古籍残卷</strong>、<strong>暗黑祭坛</strong>、<strong>宝藏</strong> 等可发现职业牌</li>
                <li>击败怪物后的战利品中有几率获得 <strong>发现</strong> 奖励</li>
                <li>商店中可以购买职业牌</li>
              </ul>
            </div>
          </TabsContent>

          {/* ─── 卡牌类型 ─── */}
          <TabsContent value="cards" className="space-y-3 text-sm text-muted-foreground mt-4">
            <CardTypeRow
              images={[dragonImage, skeletonImage]}
              title="怪物"
              color="text-red-400"
              desc="有血层和攻击力。武器打掉全部血层即击杀，否则怪物会反击。精英怪有特殊能力，最终之敌会变身为 Boss。"
            />
            <CardTypeRow
              images={[swordImage, axeImage]}
              title="武器"
              color="text-amber-400"
              desc="装备到左 / 右装备槽，有耐久度。拖到怪物上进行攻击。每回合每个槽只能攻击一次。"
            />
            <CardTypeRow
              images={[woodenShieldImage, ironShieldImage]}
              title="盾牌"
              color="text-blue-400"
              desc="装备到装备槽，用于抵挡怪物伤害。每次格挡消耗 1 点耐久。"
            />
            <CardTypeRow
              images={[potionImage]}
              title="药水"
              color="text-green-400"
              desc="一次性消耗品——回血、修武器、从背包抽牌等。可先存进背包备用。"
            />
            <CardTypeRow
              images={[lifeAmuletImage, flashAmuletImage]}
              title="护符"
              color="text-purple-400"
              desc="装入护符槽（最多 2 个），提供持续被动效果。放第 3 个时，最旧的自动弃掉。手动拖到回收袋可循环利用。"
            />
            <CardTypeRow
              images={[skillScrollImage]}
              title="魔法"
              color="text-violet-400"
              desc="分即时和永久两种。即时魔法使用后进坟场；永久魔法使用后进回收袋，经过数次瀑流后会回到背包，可反复使用。"
            />
            <CardTypeRow
              images={[eventScrollImage]}
              title="事件"
              color="text-cyan-400"
              desc="点击后出现选项。可能是商店、宝箱、祭坛、神殿等，做出选择获取奖励或承担风险。"
            />
            <div className="flex items-start gap-3 p-3 bg-muted rounded-lg">
              <div className="flex gap-1 flex-shrink-0">
                <span className="inline-flex items-center justify-center w-9 h-9 rounded-md bg-orange-900/30">
                  <Package className="w-5 h-5 text-orange-400" />
                </span>
              </div>
              <div className="min-w-0">
                <strong className="text-orange-400 text-sm">背包 & 手牌</strong>
                <p className="text-xs text-muted-foreground mt-0.5 leading-relaxed">
                  存放非怪物/非事件卡（上限 12~17 张）。每处理一张场上的牌，背包会自动抽一张到手牌。手牌上限 6~8 张。
                </p>
              </div>
            </div>
          </TabsContent>

          {/* ─── 战斗系统 ─── */}
          <TabsContent value="combat" className="space-y-4 text-sm text-muted-foreground mt-4">
            <div className="p-4 bg-red-950/30 rounded-lg border border-red-900/30 space-y-3">
              <h3 className="font-semibold text-foreground text-base flex items-center gap-2">
                <CardImg src={dragonImage} alt="monster" size={28} />
                战斗流程
              </h3>
              <p className="leading-relaxed text-xs">
                场上的怪物不会主动攻击你。战斗由 <strong className="text-foreground">你发起</strong>，有两种方式：
              </p>
              <div className="space-y-2 pl-1">
                <Step n={1}>
                  <strong>英雄先攻：</strong>拖动 <strong className="text-amber-400">武器</strong> 到怪物上 —— 你先打，打不死怪物才会反击。
                </Step>
                <Step n={2}>
                  <strong>怪物先攻：</strong>拖动 <strong className="text-red-400">怪物</strong> 到英雄身上 —— 怪物先打你，然后进入你的攻击回合。
                </Step>
              </div>
            </div>

            <div className="p-4 bg-muted rounded-lg space-y-3">
              <h3 className="font-semibold text-foreground text-base flex items-center gap-2">
                <CardImg src={swordImage} alt="weapon" size={24} />
                英雄攻击
              </h3>
              <ul className="text-xs space-y-1.5 list-none pl-0">
                <li className="flex items-start gap-2">
                  <span className="text-amber-400 flex-shrink-0">▸</span>
                  <span>每回合有 <strong className="text-foreground">2 次攻击机会</strong>，每个装备槽每回合只能攻击 1 次。</span>
                </li>
                <li className="flex items-start gap-2">
                  <span className="text-amber-400 flex-shrink-0">▸</span>
                  <span>武器伤害 = 武器数值 + 各种加成（护符、技能、职业等）。</span>
                </li>
                <li className="flex items-start gap-2">
                  <span className="text-amber-400 flex-shrink-0">▸</span>
                  <span>每次攻击消耗 <strong className="text-foreground">1 点武器耐久</strong>。耐久用完武器损毁。</span>
                </li>
                <li className="flex items-start gap-2">
                  <span className="text-amber-400 flex-shrink-0">▸</span>
                  <span>部分武器有 <strong className="text-foreground">暴击</strong>：掷骰成功时伤害翻倍。</span>
                </li>
              </ul>
            </div>

            <div className="p-4 bg-muted rounded-lg space-y-3">
              <h3 className="font-semibold text-foreground text-base flex items-center gap-2">
                <CardImg src={dragonImage} alt="monster" size={24} />
                怪物血层
              </h3>
              <p className="text-xs leading-relaxed">
                怪物的 HP 由多层 <strong className="text-foreground">"血层"</strong> 组成（显示为数字下方的叠层）。
                每次攻击伤害 ≥ 当前血层值时，打掉该层，溢出伤害不会穿透到下一层。
                所有血层归零即 <strong className="text-foreground">击杀</strong>。未击杀则怪物会反击。
              </p>
            </div>

            <div className="p-4 bg-muted rounded-lg space-y-3">
              <h3 className="font-semibold text-foreground text-base flex items-center gap-2">
                <CardImg src={woodenShieldImage} alt="shield" size={24} />
                格挡伤害
              </h3>
              <ul className="text-xs space-y-1.5 list-none pl-0">
                <li className="flex items-start gap-2">
                  <span className="text-blue-400 flex-shrink-0">▸</span>
                  <span>怪物反击时，你可以选择 <strong className="text-foreground">用盾牌格挡</strong> 或 <strong className="text-foreground">英雄硬扛</strong>。</span>
                </li>
                <li className="flex items-start gap-2">
                  <span className="text-blue-400 flex-shrink-0">▸</span>
                  <span>盾牌格挡吸收伤害（最多吸收 = 盾牌数值），溢出部分扣英雄 HP。格挡消耗 1 耐久。</span>
                </li>
                <li className="flex items-start gap-2">
                  <span className="text-blue-400 flex-shrink-0">▸</span>
                  <span>特殊盾（如铁壁塔盾）可完全抵挡所有伤害；反射盾可将一半伤害反弹给怪物。</span>
                </li>
                <li className="flex items-start gap-2">
                  <span className="text-blue-400 flex-shrink-0">▸</span>
                  <span>拖怪物到英雄身上 = 直接承受全部伤害（没有格挡）。</span>
                </li>
              </ul>
            </div>

            <div className="p-4 bg-muted rounded-lg space-y-3">
              <h3 className="font-semibold text-foreground text-base">⚡ 回合切换</h3>
              <p className="text-xs leading-relaxed">
                英雄攻击结束后（用完攻击机会或手动结束），进入 <strong className="text-foreground">怪物回合</strong> ——
                所有交战中的怪物依次攻击你。每只怪物攻击后你都要选择格挡方式。
                怪物全部攻击完后，回到英雄回合，攻击次数刷新。如此交替直到怪物被击杀或你阵亡。
              </p>
            </div>

            <div className="p-4 bg-primary/10 rounded-lg border border-primary/20 space-y-2">
              <h3 className="font-semibold text-foreground text-base">💀 精英 & Boss</h3>
              <ul className="text-xs space-y-1.5 list-none pl-0">
                <li className="flex items-start gap-2">
                  <span className="text-red-400 flex-shrink-0">▸</span>
                  <span><strong>精英怪</strong>（后半程出现）拥有特殊能力：骷髅有虚骨再生、幽灵有幽魂重生、食人魔会暴击连击等。</span>
                </li>
                <li className="flex items-start gap-2">
                  <span className="text-red-400 flex-shrink-0">▸</span>
                  <span><strong>最终之敌</strong> 被击败后会变身为 Boss，拥有复生、反击伤害、末路光环等强力能力。</span>
                </li>
                <li className="flex items-start gap-2">
                  <span className="text-red-400 flex-shrink-0">▸</span>
                  <span>击败怪物后可获得 <strong className="text-foreground">战利品</strong>（金币、回血、装备修复、发现职业牌等）。</span>
                </li>
              </ul>
            </div>
          </TabsContent>

          {/* ─── 操作方式 ─── */}
          <TabsContent value="actions" className="space-y-3 text-sm text-muted-foreground mt-4">
            <ActionRow
              badge="⚔️ 攻击"
              desc="拖动武器到怪物上（或把怪物拖到有武器的装备槽）。伤害 ≥ 血层则击杀，否则怪物反击。"
            />
            <ActionRow
              badge="🛡️ 格挡"
              desc="把怪物拖到有盾牌的装备槽（格挡后反击），或直接拖到英雄身上承受伤害。"
            />
            <ActionRow
              badge="🎒 装备"
              desc="武器 / 盾牌拖到装备槽。新装备会替换旧装备（旧的进坟场）。"
            />
            <ActionRow
              badge="📦 存放"
              desc="拖动卡牌到背包收纳。怪物和事件不能存。背包满了就存不下。"
            />
            <ActionRow
              badge="💎 护符"
              desc="拖护符到护符槽佩戴。超过上限会自动弃掉最早的护符。"
            />
            <ActionRow
              badge="✨ 魔法"
              desc="点击魔法牌，按提示选择目标释放。永久魔法用完会进回收袋，之后自动回到背包。"
            />
            <ActionRow
              badge="📜 事件"
              desc="点击事件牌，从弹出的选项中选择一个。有些需要掷骰子碰运气。"
            />
            <ActionRow
              badge="💀 弃牌"
              desc="拖卡牌到坟场区域（第二行最右），将其弃掉。弃掉的牌不再可用。"
            />
            <ActionRow
              badge="🦸 技能"
              desc="点击英雄卡上的技能按钮（每次瀑流可用一次），选择对应目标施展。"
            />
            <ActionRow
              badge="🎲 骰子"
              desc="点击右上角的 D20 掷骰子。事件中的 50/50 结果看骰子点数：≤ 10 成功，> 10 失败。"
            />
            <ActionRow
              badge="📋 日志"
              desc="屏幕右侧的日志面板实时记录所有战斗、伤害、治疗、装备、魔法、事件等信息。可以拖拽调整大小、最小化或清空。遇到不清楚发生了什么时，看日志回溯。"
            />
          </TabsContent>

          {/* ─── 攻略 & 小贴士 ─── */}
          <TabsContent value="tips" className="space-y-3 text-sm text-muted-foreground mt-4">
            <div className="p-4 bg-primary/10 rounded-lg border border-primary/20 space-y-3">
              <h3 className="font-semibold text-foreground text-base">💡 新手小贴士</h3>
              <ul className="space-y-2 list-none pl-0">
                <Tip>
                  <strong>合理安排瀑流弃牌：</strong>场上最后 1 张牌会被自动弃掉。尽量让不需要的牌留到最后。
                </Tip>
                <Tip>
                  <strong>善用背包：</strong>药水和好装备先存起来，需要时再从手牌打出。背包每次行动后自动抽牌，保持手牌充裕。
                </Tip>
                <Tip>
                  <strong>永久魔法是核心：</strong>用完会回到回收袋，数次瀑流后自动返回背包。循环使用是制胜关键。
                </Tip>
                <Tip>
                  <strong>注意装备耐久：</strong>武器和盾牌有耐久度，用光就坏。修复药水和"精工修复"魔法能续命。
                </Tip>
                <Tip>
                  <strong>金币很重要：</strong>打怪和事件获取金币。到了商店可以购买强力卡牌和额外技能。
                </Tip>
                <Tip>
                  <strong>看预览规划行动：</strong>上方预览行永远告诉你下一批来什么牌。据此规划装备更换和背包管理。
                </Tip>
                <Tip>
                  <strong>护符搭配很讲究：</strong>治愈、闪光、力量护符效果各异，搭配英雄技能可以事半功倍。
                </Tip>
                <Tip>
                  <strong>精英怪出没在后半程：</strong>牌堆前半段是普通怪，后半段才有精英怪。提前存好装备和药水应对。
                </Tip>
              </ul>
            </div>

            <div className="p-4 bg-muted rounded-lg space-y-2">
              <h3 className="font-semibold text-foreground text-base">⚙️ 界面操作</h3>
              <ul className="space-y-1.5 list-none pl-0 text-xs">
                <li>• 点击 <strong>牌堆数字</strong> 可查看剩余牌的构成</li>
                <li>• 点击 <strong>坟场</strong> 可查看弃牌历史</li>
                <li>• 点击 <strong>背包</strong> 可查看储存的卡牌</li>
                <li>• 点击 <strong>职业牌堆</strong>（最右下角）可查看骑士专属卡牌</li>
                <li>• 长按 / 悬浮任意卡牌可查看详细说明</li>
                <li>• <strong>📋 日志面板</strong>（右侧）：实时记录战斗、伤害、治疗、装备、魔法等所有事件。可拖拽调整大小和位置，支持最小化和清空</li>
                <li>• <strong>⚔️ 战斗面板</strong>（右侧）：进入战斗后自动弹出，显示当前回合（英雄/怪物）、剩余攻击次数、各装备槽状态、待格挡信息。英雄回合可点击"结束回合"主动交给怪物</li>
                <li>• <strong>↩️ 撤销按钮</strong>（右下角）：可撤销最近的操作（如装备、存放、弃牌等）。战斗中和瀑流期间无法撤销。按钮上的数字显示可撤销的步数</li>
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
