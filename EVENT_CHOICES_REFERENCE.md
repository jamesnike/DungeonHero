# Event 全部候选选项参考表

> 游戏启动时，每张 Event 卡会从下列候选选项中随机抽取 **2 个**；骰子结果表同样随机保留 **2 条**。
> 未被选中的选项在该局游戏中完全隐藏。

---

## 1. 命运十字路口

> 打开时向左平移至被阻挡位置。

| # | 选项 | 效果 | 条件 |
|---|------|------|------|
| 1 | 倾听命运的低语（发现2张专属卡） | `drawClass2` | — |
| 2 | 与命运商贩交谈（商店等级+1 并 打开商店） | `shopLevel+1, openShop` | — |
| 3 | 献祭体魄（永久 +8 生命上限） | `maxhpperm+8` | — |
| 4 | 拓展行囊（背包上限 +5） | `backpackSize+5` | — |
| 5 | 选择两张牌升级 | `upgradeCard:2` | — |

**运行时动态追加选项（不参与裁剪）：**

| 条件 | 追加选项 | 效果 |
|------|----------|------|
| 从地城激活行触发，且平移后正下方有装备 | 破坏下方装备「{装备名}」，获得全部效果 | `crossroads-destroy-below` |
| 从地城激活行触发，且平移后正下方有护符 | 破坏下方护符「{护符名}」，获得全部效果 | `crossroads-destroy-below` |

> 注：从手牌打出时该动态选项会被移除（手牌没有"下方"概念）。
> 下方位置映射：第 1 列=护符栏、第 2 列=左装备栏、第 3 列=英雄（无）、第 4 列=右装备栏、第 5 列=无。

翻转：无

---

## 2. 秘藏宝库

| # | 选项 | 效果 | 条件 |
|---|------|------|------|
| 1 | 搜刮遗物（获得两张专属卡，随机弃回两张手牌） | `drawClass2, randomDiscardHand:2` | 手牌 ≥ 2 |
| 2 | 🎲 翻找黄金（掷骰决定收益） | 见骰子表 A | — |
| 3 | 🎲 翻出药剂（掷骰决定效果） | 见骰子表 B | — |
| 4 | 🎲 寻找怀柔之道（掷骰决定劝降优惠） | 见骰子表 C | — |
| 5 | 🎲 激励锋芒（掷骰为装备附加临时攻击） | 见骰子表 D | — |
| 6 | 🎲 召唤巡商（掷骰决定商店命运） | 见骰子表 E | — |

**骰子表 A — 翻找黄金：**

| 范围 | 结果 | 效果 |
|------|------|------|
| 1-5 | +20 金币 | `gold+20` |
| 6-10 | +30 金币 | `gold+30` |
| 11-15 | -10 金币 | `gold-10` |
| 16-20 | -10 金币，弃回 1 张手牌 | `gold-10, randomDiscardHand:1` |

**骰子表 B — 翻出药剂：**

| 范围 | 结果 | 效果 |
|------|------|------|
| 1-6 | 恢复 5 HP | `heal+5` |
| 7-12 | 恢复 10 HP | `heal+10` |
| 13-20 | 受到 8 点伤害 | `hp-8` |

**骰子表 C — 寻找怀柔之道：**

| 范围 | 结果 | 效果 |
|------|------|------|
| 1-12 | 本回合劝降金币 -5 | `persuadeNextCostReduction:5` |
| 13-20 | 本回合劝降成功率 -10% | `persuadeNextRatePenalty:10` |

**骰子表 D — 激励锋芒：**

| 范围 | 结果 | 效果 |
|------|------|------|
| 1-12 | 所有装备栏临时攻击力 +4 | `allSlotTempAttack:4` |
| 13-20 | 受到 5 点伤害 | `hp-5` |

**骰子表 E — 召唤巡商：**

| 范围 | 结果 | 效果 |
|------|------|------|
| 1-12 | 商店等级 +1，打开商店 | `['shopLevel+1', 'openShop']` |
| 13-20 | 商店等级 -1 | `shopLevel-1` |

翻转 → **秘藏宝库（已开启）**（留在原位）

### 秘藏宝库（已开启）

| # | 选项 | 效果 |
|---|------|------|
| 1 | 翻阅卷轴（抽 3 张牌） | `drawHeroCards:3` |
| 2 | 联络商贩（商店等级 +1，劝降等级 +1） | `shopLevel+1, persuadeLevel+1` |
| 3 | 召唤商队（金币+10 且 打开商店） | `gold+10, openShop` |
| 4 | 深入探索（受 3 伤害，瀑流+1，翻转回去） | `vault-flipback` |
| 5 | 展示权威（劝降等级 +1，击晕上限+10%） | `persuadeLevel+1, stunCap+10` |
| 6 | 护甲加持（所有装备栏 临时护甲+4） | `allSlotTempArmor:4` |

---

## 3. 暗影契约

| # | 选项 | 效果 | 条件 | 特殊 |
|---|------|------|------|------|
| 1 | 签下血约（受到 8 点伤害） | `hp-8` | — | — |
| 2 | 献出装备（破坏任一装备） | `destroyEquipment:any` | 需要至少一件装备 | — |
| 3 | 支付赎金（损失 15 金币） | `gold-15` | 金币 ≥ 15 | — |
| 4 | 扩展手牌（手牌上限 +1，跳过翻转） | `handLimit+1` | — | `skipFlip`：选此项后不会翻转为暗影之刺 |
| 5 | 贬低商贩（商店等级 -1） | `shopLevel-1` | 商店等级 ≥ 1 | — |
| 6 | 削弱威慑（劝降等级 -1） | `persuadeLevel-1` | 劝降等级 ≥ 2 | — |
| 7 | 血之代价（失去 8 点生命） | `hp-8` | 选项 2/3/5/6 全部不可用 | 备用选项：当所有有条件的选项都无法选择时启用 |
| 8 | 召唤夜市（打开商店，跳过翻转） | `openShop` | — | `skipFlip`：选此项后不会翻转为暗影之刺 |

翻转 → **暗影之刺**（永久魔法，对怪物造成伤害，每使用一次叠刺 +1，放入背包。选项 4/8 时跳过翻转）

---

## 4. 共鸣熔炉

| # | 选项 | 效果 | 条件 |
|---|------|------|------|
| 1 | 左槽淬火（左槽永久伤害 +2，恢复1耐久） | `slotLeftDamage+2, repairSlot:left:1` | — |
| 2 | 右槽固化（右槽永久护甲 +2，恢复1耐久） | `slotRightDefense+2, repairSlot:right:1` | — |
| 3 | 翻转轨道（左右装备互换，各恢复1耐久） | `swapEquipmentSlots, repairSlot:both:1` | — |
| 4 | 左槽铸盾（左槽永久护甲 +2，恢复1耐久） | `slotLeftDefense+2, repairSlot:left:1` | — |
| 5 | 右槽磨刃（右槽永久伤害 +2，恢复1耐久） | `slotRightDamage+2, repairSlot:right:1` | — |
| 6 | 双向加固（左右装备耐久上限各 +1） | `['slotLeftDurMax+1', 'slotRightDurMax+1']` | 至少一件装备 |

翻转 → **熔炉之心**（护符，翻转获金，放入背包）

---

## 5. 破坏祭坛

| # | ID | 选项 | 效果 | 条件 |
|---|-----|------|------|------|
| 1 | `greedy-left` | 献祭所有左手装备（每个 +10 金币） | `discardAllLeftForGold+10` | 左装备栏非空 |
| 2 | `greedy-right` | 献祭所有右手装备（每个 +10 金币） | `discardAllRightForGold+10` | 右装备栏非空 |
| 3 | `greedy-current-left` | 献祭当前左手装备（金币 +15） | `discardCurrentLeftForGold+15` | 左装备栏非空 |
| 4 | `greedy-current-right` | 献祭当前右手装备（金币 +15） | `discardCurrentRightForGold+15` | 右装备栏非空 |
| 5 | `greedy-amulet` | 粉碎所有护符（每个 +10 金币） | `amuletsToGold+10` | 需要护符 |
| 6 | `greedy-blood` | 献血离开（掉 8 HP） | `hp-8` | `requiresDisabledChoices`: 1/2/3/4/5 全部不可用时才解锁 |
| 7 | `greedy-delete` | 焚毁卡牌（选择至多 3 张牌删除，每张 -5 金币） | `deleteCardForGold:3:-5` | 手牌+背包 ≥ 1 |
| 8 | `greedy-discard-all` | 弃回所有手牌（每张 +3 金币） | `discardAllHandForGold:3` | 手牌 ≥ 1 |

> **跨选项依赖**：选项 6 的 `requiresDisabledChoices` 引用了 `greedy-left`、`greedy-right`、`greedy-current-left`、`greedy-current-right`、`greedy-amulet`。
> 裁剪到 2 个选项后，引用列表会自动清理为仅包含仍存在的 ID。

特殊：被挤出时破坏玩家所有装备（`waterfallEffect: destroyAllEquipment`）

---

## 6. 战血荣誉

> 结算后此卡右侧所有怪物被激怒（进入交战）

| # | 选项 | 效果 | 条件 |
|---|------|------|------|
| 1 | 整理呼吸（回复 8 HP，超杀吸血+1） | `heal+8, spellLifesteal+1` | — |
| 2 | 回收战利品（金币 +15，打开商店） | `gold+15, openShop` | — |
| 3 | 唤醒底牌（获得底部三张专属卡） | `classBottom+3` | — |
| 4 | 战血铭刻（翻转为永久法术） | `flipToHonorBloodMagic` | 激活行最左非空格是怪物且已交战 |
| 5 | 战血横扫（翻转为即时法术） | `flipToHonorSweepMagic` | 激活行最左非空格是怪物且已交战 |
| 6 | 强化意志（击晕上限 +10%，翻转为即时魔法） | `stunCap+10, flipToMonsterAttackDebuff` | — |
| 7 | 选择至多两张牌升级 | `upgradeCard:2` | — |

**动态翻转产物（由选项 4/5/6 触发）：**

| 效果 | 产物名 | 类型 | 描述 | 去向 |
|------|--------|------|------|------|
| `flipToHonorBloodMagic` | 战血之印 | 永久魔法 | 打出时失去 1 HP，选一件装备恢复 1 耐久（法术回响时恢复 2）。被弃置时将激活行所有怪物攻击力 -2 | 背包 |
| `flipToHonorSweepMagic` | 战血横扫 | 即时魔法 | 选武器对激活行所有怪物造成等同攻击力的法术伤害，每击杀一个怪物升级一张牌 | 背包 |
| `flipToMonsterAttackDebuff` | 威压之令 | 即时魔法 | 激活行所有怪物攻击力 -3 | 背包 |

**结算后自动触发（非选项，固定行为）：**

| 时机 | 行为 |
|------|------|
| 事件结算完毕 | 该卡右侧格子上的所有怪物自动进入交战状态（激怒） |

---

## 7. 血咒仪式

| # | ID | 选项 | 效果 | 条件 |
|---|-----|------|------|------|
| 1 | `curse-flip` | 翻转卷轴（获得血咒） | `flipToCurse` | — |
| 2 | `curse-discard-hand` | 献祭手牌（手牌全部弃回） | `discardHandAll` | 手牌 ≥ 1 |
| 3 | `curse-pack-shrink` | 束缚空间（背包容量 -4） | `backpackSize-4` | — |
| 4 | `curse-hand-shrink` | 封印牌位（手牌上限 -1） | `handLimit-1` | — |
| 5 | `curse-atk-recall` | 血蚀锋刃（所有装备栏永久攻击 -1，翻转成「回收术」） | `allSlotDamage-1, flipToRecallEquip` | — |
| 6 | `curse-def-blessing` | 血蚀铠甲（所有装备栏永久护甲 -1，翻转成「不灭赐福」） | `allSlotShield-1, flipToUndyingBlessing` | — |
| 7 | `curse-blood-gold` | 血金祭典（金币减半，翻转成「血金术」） | `goldHalve, guildFlipToMagic` | — |

**动态翻转产物（由选项 1/5/6/7 触发）：**

| 效果 | 产物名 | 类型 | 描述 | 去向 |
|------|--------|------|------|------|
| `flipToCurse` | 血咒之印 | 永久魔法（诅咒） | 使用和弃置时，都失去 3 点生命值 | 背包 |
| `flipToRecallEquip` | 回收术 | 永久魔法 | 失去 2 点生命，回手一张牌（从装备栏或护符栏选择） | 背包 |
| `flipToUndyingBlessing` | 不灭赐福 | 永久魔法 | 选择一个装备，赋予其复生（首次毁坏时以 1 耐久复生），失去 2 点生命 | 背包 |
| `guildFlipToMagic` | 血金术 | 永久魔法 | 使用时受到 1 点伤害，获得 2 金币 | 背包 |

> `goldHalve`：金币 = `Math.floor(state.gold / 2)`。

特殊：被挤出时所有怪物攻击 +5

---

## 8. 双重燃烧

| # | 选项 | 效果 | 条件 |
|---|------|------|------|
| 1 | 血价交易（-2 HP，发现专属） | `hp-2, discoverClass` | — |
| 2 | 捐献财富（-4 金币，商店等级 +1） | `gold-4, shopLevel+1` | 金币 ≥ 4 |
| 3 | 焚尽旧物（随机弃回 2 张手牌，法伤 +1） | `randomDiscardHand:2, spellDamage+1` | 手牌 ≥ 2 |
| 4 | 血魂灌注（-3 血上限，超杀吸血 +1） | `maxhpperm-3, spellLifesteal+1` | — |
| 5 | 行囊交锋（-2 背包上限，劝降等级 +1） | `backpackSize-2, persuadeLevel+1` | — |
| 6 | 焚毁回响（随机移除回收袋 1 张牌至坟场，击晕上限 +10%） | `['recycleBagDelete:1', 'stunCap+10']` | 回收袋 ≥ 1 |

翻转 → **双重燃烧（觉醒）**（留在原位）

> `recycleBagDelete:N`：从 `permanentMagicRecycleBag` 随机选 N 张，经 `resetCardForGraveyard` 后移入 `discardedCards`（保证怪物 `currentLayer = 1`）。

### 双重燃烧（觉醒）

| # | 选项 | 效果 | 条件 |
|---|------|------|------|
| 1 | 鲜血献祭（-6 HP，发现专属） | `hp-6, discoverClass` | — |
| 2 | 黄金燃祭（-12 金币，商店等级 +1） | `gold-12, shopLevel+1` | 金币 ≥ 12 |
| 3 | 灵魂焚烧（随机弃回 4 张手牌，法伤 +1） | `randomDiscardHand:4, spellDamage+1` | 手牌 ≥ 4 |
| 4 | 觉醒血魂（-8 血上限，超杀吸血 +1） | `maxhpperm-8, spellLifesteal+1` | — |
| 5 | 觉醒行囊（-5 背包上限，劝降等级 +1） | `backpackSize-5, persuadeLevel+1` | — |
| 6 | 焚毁余烬（随机移除回收袋 2 张牌至坟场，击晕上限 +10%） | `['recycleBagDelete:2', 'stunCap+10']` | 回收袋 ≥ 2 |

觉醒版使用后进入墓地。若预览行正上方是魔法牌，触发**魔法共鸣**，翻转为「虚空置换」瞬发魔法（留在原位）。
虚空置换效果：将背包与永久魔法回收袋内的所有牌对换（一次性，使用后进入墓地）。

---

## 9. 药剂遗稿

> 所有选项都翻转，且翻转后**留在地城原格**（destination: stay）；需玩家自行取用，不会自动入背包。
> 卡面常驻「翻转」标识（占位 flipTarget「翻转结果由选项决定」），实际产物在 `RESOLVE_EVENT_CHOICE` 时被改写到 `currentEventCard.flipTarget` 上，由 `COMPLETE_EVENT` → `APPLY_CARD_FLIP` 完成原格替换。
>
> **被外部翻转源（「乾坤一翻」/「万象齐转」）命中**时，`reduceApplyCardFlip` 走 `rollPotionManuscriptFlip` 分支：从当前可见的 3 个 eventChoices 中**等概率随机**抽 1 个对应的 `flipToX`。抽中 `flipToTwoUpgradeScrolls` 时第 2 张卷轴依然会落入 `activeCardStacks[idx]`。翻出的卡 `_flipBackCard` 指回原「药剂遗稿」，下一次被「乾坤一翻」反翻会回到原卡。

| # | 选项 | 效果 |
|---|------|------|
| 1 | 翻转成「回响残页」 | `flipToDiscardDrawMagic` |
| 2 | 翻转成「纸灰药剂」 | `flipToPaperAsh` |
| 3 | 翻转成「淬炼药剂」 | `flipToLeftDurabilityPotion` |
| 4 | 翻转成「置换药剂」 | `flipToEquipSwapPotion` |
| 5 | 翻转成「扩容药剂」 | `flipToHandLimitPotion` |
| 6 | 翻转成「灵思药剂」 | `flipToClassMagicDiscoverPotion` |
| 7 | 翻转成两张「升级卷轴」 | `flipToTwoUpgradeScrolls` |

**动态翻转产物（由选项效果触发，写入 `currentEventCard.flipTarget`，destination: stay）：**

| 效果 | 产物名 | 类型 | 描述 | 去向 |
|------|--------|------|------|------|
| `flipToDiscardDrawMagic` | 回响残页 | 永久魔法 | 被弃回时，从背包抽 2 张牌 | 留原格 |
| `flipToPaperAsh` | 纸灰药剂 | 药水 | 使用时永久法术伤害 +2；最大生命值 -5 | 留原格 |
| `flipToLeftDurabilityPotion` | 淬炼药剂 | 药水 | 使用时左装备栏耐久上限 +2。翻转后变为「淬炼药剂（右）」：右装备栏耐久上限 +2 | 留原格 |
| `flipToEquipSwapPotion` | 置换药剂 | 药水 | 使用时选择一个装备回手牌；若另一栏有装备，则换到该位置 | 留原格 |
| `flipToHandLimitPotion` | 扩容药剂 | 药水 | 使用时永久手牌上限 +1 | 留原格 |
| `flipToClassMagicDiscoverPotion` | 灵思药剂 | 药水 | 使用时从专属魔法牌堆发现一张魔法牌（三选一） | 留原格 |
| `flipToTwoUpgradeScrolls` | 升级卷轴 ×2 | 即时魔法 | 顶层 1 张「升级卷轴」替换原格事件卡，第 2 张推入 `activeCardStacks[idx]` 在顶层取用后浮上来；每张一次性使用，选择一张牌进行升级 | 留原格（堆叠 2 张） |

---

## 10. 墓语密室

> 描述：处理后必定翻转——左右两侧是否都是怪物决定翻成哪种魔法。卡面显示「翻转」标识。

| # | 选项 | 效果 | 条件 |
|---|------|------|------|
| 1 | 净化杂质（删 3 张牌） | `deleteCard:3` | 手牌或背包 ≥ 3 |
| 2 | 坟场召回（召回2次） | `['graveyardDiscover', 'graveyardDiscover']` | 坟场 ≥ 1 |
| 3 | 召唤商贩（回收袋发现一张牌，打开商店） | `['recycleBagDiscover', 'openShop']` | — |
| 4 | 空间扩展（背包上限 +5） | `backpackSize+5` | — |
| 5 | 强化意志（发现专属武器，击晕上限 +10%） | `['stunCap+10', 'discoverClassWeapon']` | — |
| 6 | 威压交涉（劝降等级+1，劝降费用 -2） | `['persuadeLevel+1', 'persuadeCost-2']` | — |

**运行时动态行为（不参与裁剪，从地城触发时判断）：**

| 条件 | 翻转目标 | 落点 |
|------|---------|------|
| 左右两侧**都是**怪物 | 「**墓语回响**」（永久魔法 Perm 1：使用时回复 3 HP；被弃置时从背包抽 3 张牌） | `destination: 'stay'`（留在地城原格） |
| 左右两侧**不全是**怪物 | 「**墓语遗愿**」（即时魔法 `crypt-deathwish`：选一件装备触发遗言效果 2 次，抽 1 张牌） | `destination: 'stay'`（留在地城原格） |

> 卡定义携带一个静态 `flipTarget` 占位（指向 `墓语遗愿`）以便 `hasFlipTarget` 在地城里一直为真、卡面常驻"翻转"徽章；`handleCardToHero` 在打开事件弹窗时根据左右邻居改写为正确的目标。两条路径的 `destination` 都是 `stay`，因此每次翻转都会触发增幅祭坛 / 翻印之符 / 翻覆震慑等"翻转事件"联动 amulet。

> 注：当两侧都是怪物且选择了占位选项对应的 `crypt-all-effects` 效果时，实际会一次性触发全部效果：删 3 张牌 + 坟场召回×2 + 回收袋发现 + 背包上限 +5 + 发现专属武器 + 击晕上限 +10% + 劝降等级+1 + 劝降费用 -2 + 打开商店。

---

## 11. 奇术商会

| # | 选项 | 效果 | 条件 |
|---|------|------|------|
| 1 | 思绪翻涌（获得2张专属牌，加入手上） | `drawClassToHand:2` | — |
| 2 | 扩张人脉（商店等级 +1，打开商店） | `['shopLevel+1', 'openShop']` | — |
| 3 | 挖掘遗物（坟场发现 2 张） | `['graveyardDiscover', 'graveyardDiscover']` | 坟场 ≥ 1 |
| 4 | 翻转商会卷轴 | `guildFlipToMagic` | — |
| 5 | 展示权威（劝降等级 +1，下次劝降免费） | `['persuadeLevel+1', 'persuadeNextFree']` | — |
| 6 | 整合回收袋（回收袋洗回背包） | `recycleToBackpack` | — |
| 7 | 翻转为「奇术轮转」 | `guildFlipToHandRecycleMagic` | — |

**动态翻转产物（由选项 4 / 7 触发）：**

| 效果 | 产物名 | 类型 | 描述 | 去向 |
|------|--------|------|------|------|
| `guildFlipToMagic` | 血金术 | 永久魔法 | 使用时受到 1 点伤害，获得 2 金币 | 背包 |
| `guildFlipToHandRecycleMagic` | 奇术轮转 | 永久魔法 | 使用时所有手牌移入回收袋，再从回收袋随机 2 张移到手上 | 背包 |

---

## 12. 命运骰盅

| # | 选项 | 效果 |
|---|------|------|
| 1 | 🎲 掷骰（见骰子表） | 见下表 |

**骰子表：**

| 范围 | 结果 | 效果 |
|------|------|------|
| 1-4 | 金币+10，打开商店 | `['gold+10', 'openShop']` |
| 5-8 | 商店等级 +1，劝降费用-2 | `['shopLevel+1', 'persuadeCost-2']` |
| 9-12 | 法术伤害 +1，超杀吸血+1 | `['spellDamage+1', 'spellLifesteal+1']` |
| 13-16 | 摧毁所有护符 | `removeAllAmulets` |
| 17-20 | 随机获得两张专属卡（加入手牌） | `drawClassToHand:2` |
| 1-10 | 超杀吸血 +2 | `spellLifesteal+2` |
| 11-20 | 交换左右装备，各恢复1耐久 | `['swapEquipmentSlots', 'repairSlot:both:1']` |

翻转 → **命运之刃**（永驻型事件，留在原位）

### 命运之刃

| # | 选项 | 效果 |
|---|------|------|
| 1 | 释放命运之刃 | `fate-dice-strike`（仅此 1 个选项，不参与裁剪） |

---

## 13. 混沌骰局

| # | 选项 | 效果 |
|---|------|------|
| 1 | 🎲 掷骰（见骰子表） | 见下表 |

**骰子表：**

| 范围 | 结果 | 效果 |
|------|------|------|
| 1-4 | 金币+10，打开商店 | `['gold+10', 'openShop']` |
| 5-8 | 背包加入一张诅咒 | `addCurse`（生成「血咒之印」，使用/弃置时失去 3 HP） |
| 9-12 | 删除 2 张牌 | `deleteCard:2` |
| 13-16 | 获得 2 张专属卡 | `drawClass2` |
| 17-20 | 回收袋洗回背包，抽 2 张牌 | `['recycleToBackpack', 'drawHeroCards:2']` |
| 1-20 | 下一次劝降费用 +10 | `persuadeNextCostIncrease:10` |
| 1-20 | 选择一张牌升级 | `upgradeCard` |

翻转 → **混沌冲击**（即时魔法，对怪物造成 3 点伤害。超杀：抽 2 张牌。放入背包）

---

## 14. 时空收缩

| # | 选项 | 效果 |
|---|------|------|
| 1 | 🎲 掷骰（见骰子表） | 见下表 |

**骰子表：**

| 范围 | 结果 | 效果 | 翻转 |
|------|------|------|------|
| 1-4 | 时空召商：金币 -10，打开商店 | `['gold-10', 'openShop']` | skipFlip |
| 5-11 | 锋刃祝福：所有装备栏临时攻击+4 | `allSlotTempAttack:4` | skipFlip |
| 12-16 | 时空收缩：Waterfall 进度 -2 | `turnCount-2` | 翻转为时空镜像 |
| 17-20 | 空间代价：背包 -2，获得法术回响 | `['backpackSize-2', 'flipToSpellEcho']` | skipFlip |
| 1-10 | 时空侵蚀：商店等级 -1，劝降等级-1 | `['shopLevel-1', 'persuadeLevel-1']` | 翻转为时空镜像 |
| 11-20 | 时空压缩：激活行怪物攻击力 -3 | `activeRowMonsterAttack-3` | skipFlip |

**动态翻转产物（由骰子结果 15-20 触发）：**

| 效果 | 产物名 | 类型 | 描述 | 去向 |
|------|--------|------|------|------|
| `flipToSpellEcho` | 法术回响 | 永久魔法（Perm 1） | 使用后，下一张法术的效果将触发两次 | 背包 |

**事件翻转产物（仅「时空收缩」或「时空侵蚀」结果触发）：**

| 产物名 | 类型 | magicEffect | 描述 | 去向 |
|--------|------|-------------|------|------|
| 时空镜像 | 永久魔法（Perm 2） | `equalize-temp-attack-armor` | 选择一个装备栏，临时攻击 +2，然后使得 (临时攻击+永久攻击) 与 (临时护甲+永久护甲) 相等（增加较低一方的临时值） | 背包 |

---

## 15. 奥术回廊

> 此处仅记录新增选项，完整选项详见 `client/src/game-core/deck.ts` 中的 `arcaneCorridor`。

| # | 选项 | 效果 | 翻转 |
|---|------|------|------|
| N | 召唤奥术商队（商店等级 +1，打开商店，跳过翻转） | `['shopLevel+1', 'openShop']` | skipFlip |

---

## 16. 诅咒骰局

- 被挤出时：摧毁所有护符，弃回所有手牌

| # | 选项 | 效果 |
|---|------|------|
| 1 | 🎲 掷骰（见骰子表） | 见下表 |

**骰子表：**

| 范围 | 结果 | 效果 |
|------|------|------|
| 1-4 | 所有装备栏永久攻击加成减半 | `halveSlotDamageBonus` |
| 5-8 | 法术伤害加成减半 | `halveSpellDamageBonus` |
| 9-11 | 所有装备栏永久护甲加成减半 | `halveSlotShieldBonus` |
| 12-14 | 超杀吸血 -3 | `spellLifesteal-3` |
| 15-16 | 护符栏上限 -1 | `amuletCapacity-1` |
| 17-20 | 击晕上限 -20% | `stunCap-20` |

翻转 → **诅咒碑**（建筑，血量 5，destination: stay）

- 光环（`stacked-magic-immune`）：堆叠在诅咒碑之上的怪物不受玩家魔法伤害
- 可被攻击摧毁（进坟场）

---

## 17. 劝降祭典

- 选项前置效果：升级已装备的劝降护符 → `upgradePersuadeAmulets`

| # | 选项 | 效果 |
|---|------|------|
| 1 | 🎲 掷骰（见骰子表） | 见下表 |

**骰子表：**

| 范围 | 结果 | 效果 |
|------|------|------|
| 1-4 | 劝降等级 +1 | `persuadeLevel+1` |
| 5-8 | 劝降费用永久 -2 | `persuadeCost-2` |
| 9-11 | 连续劝降同一怪物，第二次费用减半 | `persuadeSameTargetCostHalve` |
| 12-14 | Skeleton/Wraith 劝降率 +20% | `persuadeRaceBonus:Skeleton,Wraith:20` |
| 15-16 | 劝降成功的怪物起始耐久 +1 | `persuadeSuccessDurabilityBonus+1` |
| 17-20 | 下次劝降成功率 +50% | `persuadeNextRateBonus:50` |

**护符升级效果：**

- 怀柔之印升级：每获得一次临时攻击或临时护甲加成，下一次劝降率 +20%（原 +10%）
- 劝降归袋符升级：每劝降一次，将两张「归袋抽引」加入手牌（原 1 张）

---

## 18. 附魔祭坛

> 此处仅记录新增选项，完整选项详见 `client/src/game-core/deck.ts` 中的 `enchantmentAltar`。

| # | 选项 | 效果 | 条件 | 翻转 |
|---|------|------|------|------|
| N | 选一件装备赋予「遗言：生命值上限 +4」 | `grantLastWordsMaxHp:4` | 至少一件主装备 | skipFlip |

> `grantLastWordsMaxHp:4`：在选中装备上累加 `lastWordsMaxHpBoost +1`。装备销毁/换位时触发 `lastWords`，永久 `maxHp += 4 × stacks`（不立即回血，可叠加）。
> 触发位置：`computeEquipmentBreakEffects` + `computeEquipmentDisplacementLastWords`。
> 仅可选 `equipmentSlot1` / `equipmentSlot2`（reserve 不可选），可重复铭刻同一件装备。

---

## 19. 赋能神殿

> 此处仅记录新增骰子结果，完整骰子表详见 `client/src/game-core/deck.ts` 中的 `empowermentShrine`。

**骰子表（重平衡后）：**

| 范围 | 结果 | 效果 |
|------|------|------|
| 1-3 | 侧击：劝降费用永久 -1 | `grantFlankPersuadeCost:1` |
| 4-6 | 侧击：击晕上限 +5% | `grantFlankStunCap:5` |
| 7-9 | 转型：抽 1 张牌 | `grantTransformDraw:1` |
| 10-13 | 侧击：恢复 2 HP | `grantFlankHeal:2` |
| 14-17 | 侧击：对随机怪物造成 5 点伤害 | `grantFlankDamage:5` |
| 18-20 | 上手：恢复 1 HP | `grantHandOnHandHeal:1` |

> `grantHandOnHandHeal:1`：弹出手牌选择 modal（`PermGrantSourceType: 'on-hand-heal-grant'`），选定的手牌挂 `onEnterHandEffect: 'on-hand-heal-1'`，并立即触发一次回血 1 HP（不超过 maxHp）。已挂其他 `onEnterHandEffect` 的卡不可被选。

---

## 20. 增幅仪式

> 此处仅记录新增选项，完整选项详见 `client/src/game-core/deck.ts` 中的 `amplificationRitual`。

| # | 选项 | 效果 | 翻转 |
|---|------|------|------|
| N | 召唤随机专属装备增幅为祭坛，获得「维度扭曲」并加入手牌 | `amplify-altar-from-random-class-equip-with-warp` | 翻转为「增幅祭坛」建筑 |

> `amplify-altar-from-random-class-equip-with-warp`：
> 1. 从专属牌池（class deck）随机抽 1 件 `weapon` / `shield`，加入背包。
> 2. 事件卡翻转为「增幅祭坛」建筑，目标为该随机装备。
> 3. 额外发放一张「维度扭曲」（起始永久魔法）**直接加入手牌**（在 hook 中 inline 创建：`createStarterCardPool` → 克隆带 `-evt-1` 可解析后缀的实例 → `ADD_CARD_TO_HAND`）。

---

## 21. 英雄试炼

> 此处仅记录新增选项，完整选项详见 `client/src/game-core/deck.ts` 中的 `heroTrial`。

| # | 选项 | 效果 |
|---|------|------|
| N | 空间精研（生命上限 +5，获得「乾坤挪移」） | `['maxhpperm+5', 'grantStarterDungeonSwap']` |

> `grantStarterDungeonSwap`：复刻 `grantStarterWeaponBurst` 的发放路径（`STARTER_CARD_IDS.dungeonSwap`，suffix `-evt-1-<base36>` 保证 `getStarterBaseId` 能正确剥离），将「乾坤挪移」放入背包。

---

## 22. 翻转之契

> 命运反转，万物皆可翻面。本身右上角无翻转图标 —— 选项 3/4 通过 `flipTo*` token 让事件卡转化为新卡（放入背包/手牌），其它选项选完即消耗。

| # | 选项 | 效果 | 条件 |
|---|------|------|------|
| 1 | 万象齐转（翻转激活行所有可翻转/已翻转的牌；金币 +12） | `['flipAllActiveRow', 'gold+12']` | — |
| 2 | 掌握技艺（获得起始背包的「乾坤一翻」放入背包；商店等级 +1） | `['grantActiveRowFlip', 'shopLevel+1']` | — |
| 3 | 凝结翻印（翻转为护符「翻印之符」放入背包；左右装备栏 永久攻击+1） | `['flipToFlipPersuadeAmulet', 'allSlotDamage+1']` | — |
| 4 | 凝结震慑（翻转为一次性魔法「翻覆震慑」放入背包；劝降等级 +1） | `['flipToFlipMonsterDebuffMagic', 'persuadeLevel+1']` | — |
| 5 | 铭刻技艺（赋予一张手牌：每次上手击晕上限 +2%；击晕上限 +10%） | `['grantHandStunCapBonus', 'stunCap+10']` | 至少 1 张手牌 |
| 6 | 熔铸耐久（选一件装备：每翻转一次该装备恢复 1 耐久） | `grantEquipFlipRepairBuff` | 至少一件装备（含 reserve） |
| 7 | 镜面回响（翻转为 active row 任意另一张牌的复制） | `pactCopyActiveRow` | active row ≥ 1 张其他牌 |

**衍生卡效果说明：**

- **翻印之符（amulet）** `amuletEffect: 'persuade-on-flip'`：每次卡牌正向翻转，`persuadeAmuletBonus +10%`（多张同护符叠加），任何一次劝降尝试后清空。
- **翻覆震慑（一次性 magic）** `magicEffect: 'flip-monster-debuff'`：选择一个怪物，到下次瀑流前每翻转一张牌该怪物攻击力 -1（最低 0，叠加）。怪物离场或瀑流完成后失效。
- **铭刻技艺**：在选中手牌上挂 `onEnterHandEffect: 'stun-cap-bonus-2'`；进入手牌时 `stunCap +2%`（上限 100%）。施放时立即触发一次。已带其它 `onEnterHandEffect` 的卡不可被选。
- **熔铸耐久**：在选中装备上挂 `_flipRepairBuff: true`。每次正向翻转触发时该装备恢复 1 耐久（不超过 maxDurability）。可选目标包含两个主装备槽与两个 reserve 列表中的所有装备；已铭刻的装备不会重复铭刻。
- **镜面回响**：从 active row 选一张非自身的牌，深拷贝（保留 `currentLayer`/temp buffs/`flipTarget`/`recycleDelay`/`image`），分配新 ID，挂 `_skipOnEnterHand: true`，原地替换翻转之契；怪物副本不会自动 engage。

翻转：仅在选项 3/4/7 触发，事件卡变成对应新卡（选项 3/4 进背包；选项 7 直接替换 active row 槽位）；其它选项选完即消耗，事件卡不翻转。

---

## 裁剪规则说明

1. **选项裁剪**：`eventChoices.length > 2` 时，Fisher-Yates 洗牌后保留前 2 个。
2. **骰子表裁剪**：`diceTable.length > 2` 时，随机保留 2 条，范围重分配为 `[1, 10]` 和 `[11, 20]`（各 50%）。
3. **跨选项依赖**：`requiresDisabledChoices` 中引用的 ID 若被裁剪掉，自动清除引用。
4. **翻转卡递归**：`flipTarget.toCard` 为 event 时，递归执行相同裁剪。
5. **持久化**：裁剪在 `initGame()` 中执行，修改卡牌数据本身，存档/读档自动兼容。
