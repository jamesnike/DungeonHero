# Dungeon Hero — 游戏机制完整参考手册

> **用途：** 本文件是代码层面的机制参考文档，用于确保修改代码时不违反已有规则。所有数值、流程、边界情况均以当前实现为准。

---

## 目录

1. [卡牌类型与区域](#1-卡牌类型与区域)
2. [牌组构成](#2-牌组构成)
3. [瀑流系统 (Waterfall)](#3-瀑流系统-waterfall)
4. [战斗系统](#4-战斗系统)
5. [装备系统 (武器与盾牌)](#5-装备系统-武器与盾牌)
6. [护符系统 (Amulet)](#6-护符系统-amulet)
7. [永久牌与回收袋系统 (Permanent & Recycle Bag)](#7-永久牌与回收袋系统-permanent--recycle-bag)
8. [弃牌与删牌规则](#8-弃牌与删牌规则)
9. [怪物系统](#9-怪物系统)
10. [魔法系统](#10-魔法系统)
11. [药水系统](#11-药水系统)
12. [事件系统](#12-事件系统)
13. [骑士职业卡牌](#13-骑士职业卡牌)
14. [英雄魔法 (Hero Magic)](#14-英雄魔法-hero-magic)
15. [技能系统 (Skills)](#15-技能系统-skills)
16. [商店系统](#16-商店系统)
17. [怪物战利品](#17-怪物战利品)
18. [翻转系统 (Card Flip)](#18-翻转系统-card-flip)
19. [回响机制 (Echo)](#19-回响机制-echo)
20. [关键常量表](#20-关键常量表)

---

## 1. 卡牌类型与区域

### 1.1 卡牌类型 (`CardType`)

| 类型 | 说明 |
|------|------|
| `monster` | 怪物，有血量、血层、攻击力 |
| `weapon` | 武器，装备到左/右槽位 |
| `shield` | 盾牌，装备到左/右槽位 |
| `potion` | 药水，一次性消耗品 |
| `amulet` | 护符，装备到护符槽 |
| `magic` | 魔法牌，分即时/永久两种 |
| `hero-magic` | 英雄魔法牌（圣光/狂战秘典） |
| `event` | 事件牌，提供选择 |
| `skill` | 技能牌 |
| `coin` | 金币牌（已弃用） |

### 1.2 卡牌区域

| 区域 | 状态变量 | 说明 |
|------|----------|------|
| **牌堆** | `remainingDeck` | 未翻开的牌 |
| **预览区** | `previewCards` | 瀑流时先展示在顶行 |
| **场上** | `activeCards` | 5列活跃卡牌行 |
| **手牌** | `handCards` | 上限 `HAND_LIMIT(5) + handLimitBonus` |
| **背包** | `backpackItems` | LIFO，基础容量 `BASE_BACKPACK_CAPACITY(10)` + 修正 |
| **回收袋** | `permanentMagicRecycleBag` | 永久牌等待回收的区域 |
| **坟场** | `discardedCards` | 已消耗/销毁的牌（按ID去重） |
| **职业牌堆** | `classDeck` | 骑士职业专属卡牌 |
| **装备槽** | `equipmentSlot1`, `equipmentSlot2` | 左右各一个主槽 |
| **装备预备** | `equipmentSlot1Reserve`, `equipmentSlot2Reserve` | 每槽的预备栈 |
| **护符槽** | `amuletSlots` | 最多 `maxAmuletSlots(默认2)` 个 |

---

## 2. 牌组构成

### 2.1 主牌堆 (`createDeck`)

| 类别 | 数量 | 说明 |
|------|------|------|
| 怪物 | 15 | 5种族 × 3（Dragon, Skeleton, Goblin, Ogre, Wraith） |
| 武器 | 6 | Holy Blade, Swift Blade, Mace, Dagger, Sword×2 |
| 盾牌 | 6 | Wooden×2, Iron×2, Heavy×2 |
| 药水 | 6 | 治疗/修复/背包/洞察等 |
| 护符 | 6 | Heal, Balance, Life, Guardian, Flash, Strength |
| 魔法 | 6 | 瀑流重置, 风暴箭雨, 回响行囊, 壁垒猛击, 血债清算, 永恒修复 |
| 事件 | 14 | 各类事件 |

### 2.2 初始背包 (`createStarterBackpack`)

6 张牌：5张永久魔法 + 1把新手短剑

| 名称 | `recycleDelay` | 效果 |
|------|---------------|------|
| 战斗鼓舞 | 1 | 下一次武器攻击 +3 × echo |
| 精工修复 | 1 | 修复1耐久 × echo |
| 汰旧迎新 | 1 | 弃1抽2 × echo |
| 迷宫回溯 | 2 | 1张地牢牌放到牌堆底 × echo |
| 乾坤挪移 | 2 | 交换场上最左与最右的牌 × echo |

### 2.3 骑士职业牌堆

21 张牌，详见 [§13 骑士职业卡牌](#13-骑士职业卡牌)。

### 2.4 牌序规则

- 精英怪只出现在牌堆**后半段**
- 每5张牌中至少有1张怪物
- 牌堆最后3张中必有1张怪物
- 牌堆中最后一只怪物标记为"最终之敌"(`isFinalMonster: true`)

---

## 3. 瀑流系统 (Waterfall)

### 3.1 触发流程

1. `turnCount` +1
2. 如果有"潮涌回春"技能：回复 4 HP（有治疗护符时翻倍为 8）
3. 如果有"壁垒猛击"被动：随机装备槽永久护甲 +1
4. **执行回收袋恢复** (`restorePermanentMagicFromRecycleBag`)
5. 预览区卡牌落入场上空列
6. 多余的预览卡牌被挤出（按倒序）
7. 从牌堆翻新卡牌到预览区

### 3.2 预览挤出规则

- **最终之敌（Boss变身前）**：不会被挤出；如果无空位则放回**牌堆顶**
- 怪物的 `waterfallEffect.type === 'returnToDeck'`：放回牌堆（不进坟场）
- 其他情况：进入坟场，并执行 `waterfallEffect`（如有）

### 3.3 瀑流效果 (`waterfallEffect`)

| 类型 | 效果 |
|------|------|
| `returnToDeck` | 随机插入牌堆或放底 |
| `bonusDecay` | 所有永久伤害/护甲/法术加成 -N |
| `gold` | 获得金币 |
| `damage` | 对英雄造成伤害 |
| `turnBoost` | `turnCount` +N |
| `boostRowMonsterAttack` | 同行怪物攻击力 +3 |
| `destroyAllEquipment` | 摧毁所有装备 |
| 默认 | `discardCardToGraveyard` |

### 3.4 回收袋恢复

- 每次瀑流时，回收袋中每张牌的 `_recycleWaits` -1
- `_recycleWaits ≤ 0` 的牌回到**背包**（需有空位）
- 永久装备回收时**耐久恢复至满**

### 3.5 时间常量

| 常量 | 值 |
|------|-----|
| `WATERFALL_DROP_DURATION` | 650ms |
| `WATERFALL_DISCARD_DURATION` | 450ms |
| `WATERFALL_DEAL_DURATION` | 550ms |

---

## 4. 战斗系统

### 4.1 战斗开始

- **英雄发起**：拖动武器到怪物，`beginCombat(monster, 'hero')`，英雄先攻
- **怪物发起**：拖动怪物到英雄，`beginCombat(monster, 'monster')`，怪物先攻
- Ogre 的 `enterEffect: 'auto-engage'`：进入场上时自动与所有怪物开战（英雄先攻）
- 如果战斗已在进行，新怪物加入 `monsterAttackQueue`

### 4.2 英雄回合

- 每个英雄回合有 2 次基础攻击机会（`heroAttacksRemaining: 2`）
- 每个装备槽**每回合**只能攻击一次（`heroAttacksThisTurn` 追踪）
- 额外攻击需要消耗 `extraAttackCharges`
- 狂战士之怒激活时，每槽额外获得1次免耐久消耗攻击

### 4.3 武器伤害公式

```
baseDamage = max(0,
    weaponValue
  + attackBonus            // 全局攻击加成
  + slotDamageBonus        // 槽位永久伤害加成
  + nextWeaponBonus        // 战斗鼓舞等一次性加成
  + slotBurstBonus         // 爆发加成（裂隙契约等）
  + berserkTurnBuff        // 孤注一掷回合加成
  + balanceBonus/Penalty   // 平衡护符：左+3 / 右-1
  - flashPenalty            // 闪光护符：-3
)
```

**全局攻击加成 (`attackBonus`)：**
- 护符光环 `amuletEffects.aura.attack`（力量护符 +4）
- 武器大师技能 +1
- `weaponMasterBonus`（职业加成）
- 狂战士之怒被动：`floor((maxHp - hp) / 2)`
- 战斗狂热技能：`hp < maxHp / 2` 时 +2

**暴击判定：**
- 有 `critChance` 的武器（如匕首）：`threshold = round((critChance/100) × 20)`
- D20 掷骰，≤ threshold 时暴击 → 最终伤害**翻倍**

### 4.4 武器疲劳判定 (`isExhaustedThisTurn` → 红叉)

武器显示红叉的条件 **全部同时满足**：

1. 存在至少一只**存活**（非死亡动画中）的交战怪物
2. 该槽位本回合**已攻击** (`heroAttacksThisTurn[slot] === true`)
3. 没有额外攻击次数 (`extraAttackCharges <= 0`)
4. 狂战士之怒未激活，或该槽位的狂战额外攻击已使用

> **重要：** `engagedMonsters` 中在死亡动画中的怪物（`monsterDefeatStates[id]` 存在）不计入判定。

### 4.5 闪光护符 (Flash Amulet)

- `attackIterations = hasFlash ? 2 : 1`
- 每次攻击迭代使用相同的最终伤害值
- 全局 -3 攻击力
- 两次攻击**都**计入狂战仪表

### 4.6 力量护符 (Strength Amulet)

- 全局 +4 攻击力（通过 `amuletAuraBonus.attack`）
- 每次攻击迭代后受到 `STRENGTH_SELF_DAMAGE(2)` 点伤害
- 闪光 + 力量 = 2次攻击 × 2点自伤 = 4点自伤

### 4.7 结束英雄回合

1. 从背包抽1张到手牌
2. 按列索引排序交战怪物
3. 切换到怪物回合
4. 重置 `heroAttacksThisTurn`、`heroAttacksRemaining`
5. 重置 `berserkerSlotUsed`

### 4.8 怪物回合

- 按 `monsterAttackQueue` 顺序，每只怪物发起一次攻击
- 设置 `pendingBlock`（怪物攻击值）等待玩家格挡
- 队列清空后切换回英雄回合

### 4.9 格挡机制

1. **铁壁塔盾** (`fullBlock`)：所有伤害归零
2. **普通盾**：`blocked = min(remainingDamage, shieldValue)`
3. **反射**：`reflectHalfDamage` → `ceil(attackValue / 2)` 反弹伤害
4. **双守护** (`dualGuard`)：完美格挡时永久 +1 护甲到该槽位
5. **守护护符** (`guardian`)：有盾时，溢出伤害**全部吸收**
6. **盾牌耐久**：格挡后 -1 耐久（`unbreakableUntilWaterfall` 除外）
7. **完美格挡**：铁壁塔盾或 `remainingDamage === 0`
8. **完美格挡保护**：`shieldPerfectBlockSaveChance`（守护圣盾70%）→ D20 判定免耐久消耗
9. 盾牌破碎 → `disposeOwnedEquipmentCard` → 预备栏顶替

### 4.10 Boss反击伤害

- `bossRetaliationDamage: 3`
- 英雄每次攻击Boss，Boss反击造成 3 点伤害

---

## 5. 装备系统 (武器与盾牌)

### 5.1 装备槽

- 左槽 (`equipmentSlot1`)、右槽 (`equipmentSlot2`)
- 每槽有预备栏 (`Reserve`)，预备栏大小 = `equipmentSlotCapacity`（默认各1）
- 装备新武器/盾时，如果主槽和预备栏都满，最旧的装备被**挤出** → `disposeOwnedEquipmentCard`

### 5.2 耐久度

- 武器：每次攻击 -1 耐久（狂战额外攻击**不消耗**耐久）
- 盾牌：每次格挡 -1 耐久
- 耐久为 0 → 武器/盾牌损毁 → `disposeOwnedEquipmentCard`
- 击杀怪物 + `restoreDurabilityOnKill`：恢复耐久到满
- `unbreakableUntilWaterfall`：当前瀑流周期内不消耗耐久

### 5.3 永久装备 (`permEquipment`)

- 标记 `permEquipment: true` 的武器/盾牌
- 损毁/挤出时进**回收袋**（而非坟场）
- 回收时**耐久恢复至满**
- 判定函数：`isPermRecycleEquipment(card)` → `card.type in ['weapon','shield'] && card.permEquipment`

### 5.4 装备处置 (`disposeOwnedEquipmentCard`)

1. 如果是 `isPermRecycleEquipment` → `addPermanentMagicToRecycleBag`（进回收袋）
2. 否则 → `addToGraveyard`（进坟场）
3. **始终**触发 `applyDiscardSideEffects`

### 5.5 平衡护符对装备的影响

| 槽位 | 攻击力修正 | 护甲修正 |
|------|-----------|---------|
| 左 (slot1) | +3 | -1 |
| 右 (slot2) | -1 | +3 |

---

## 6. 护符系统 (Amulet)

### 6.1 基本规则

- 护符**不是永久牌 (Perm)**
- 最多装备 `maxAmuletSlots`（默认 2）个
- 可以手动拖到回收袋 → 进入**回收袋**
- 被自动弃置（瀑流挤掉、被其他效果弃掉、装备时被挤掉）→ 进入**坟场**

### 6.2 装备护符

- 从手牌/背包拖到护符槽
- 如果槽位已满：最旧的护符被挤出 → `discardCardToGraveyard` → 进坟场
- 已装备的护符不会重复装备

### 6.3 手动弃置护符（拖到回收袋）

- 从**手牌**拖到回收袋：`addPermanentMagicToRecycleBag` + `applyDiscardSideEffects`
- 从**护符槽**拖到回收袋：`addPermanentMagicToRecycleBag` + `applyDiscardSideEffects`
- 这是**唯一**让护符进入回收袋的路径

### 6.4 自动弃置护符

以下情况护符进**坟场**：
- 装备新护符时被挤出
- 被瀑流挤出
- 被事件/魔法效果弃置
- `removeAllAmulets` 效果

### 6.5 主牌堆护符

| 名称 | `amuletEffect` | 效果 |
|------|----------------|------|
| Heal Amulet | `heal` | 所有回血效果翻倍 |
| Balance Amulet | `balance` | 左攻+3防-1，右防+3攻-1 |
| Life Amulet | `life` | 超出怪物血量的伤害转化为回血 |
| Guardian Amulet | `guardian` | 有盾时溢出伤害全部吸收 |
| Flash Amulet | `flash` | 攻击两次，攻击力-3 |
| Strength Amulet | `strength` | 攻击力+4，每次攻击自损2HP |

### 6.6 骑士职业护符

| 名称 | `amuletEffect` | 效果 |
|------|----------------|------|
| 双守护圣盾 | `dual-guard` | 完美格挡时永久+1护甲到该槽位 |
| 雷霆符印 | `discard-zap` | 弃牌时对随机怪物造成伤害 |

### 6.7 特殊护符（翻转获得）

| 名称 | `amuletEffect` | 效果 |
|------|----------------|------|
| 熔炉之心 | `flip-gold` | 每次卡牌翻转获得 3 金币 |

---

## 7. 永久牌与回收袋系统 (Permanent & Recycle Bag)

### 7.1 什么是永久牌

永久牌 = 使用后不进坟场，进入回收袋等待回收的牌。

**判定 `isPermanentMagicCard`：** `card.type === 'magic' && card.magicType === 'permanent'`

### 7.2 什么牌可以被手动拖到回收袋 (`isRecyclableFromHand`)

以下**任一**条件满足即可拖到回收袋：
- 永久魔法 (`type === 'magic' && magicType === 'permanent'`)
- 护符 (`type === 'amulet'`)
- 永久事件 (`isPermanentEvent === true`)
- 永久装备 (`isPermRecycleEquipment` → `type in ['weapon','shield'] && permEquipment`)

### 7.3 回收袋流程

1. 牌进入回收袋时：`_recycleWaits = recycleDelay ?? 1`
2. 每次瀑流：`_recycleWaits` -1
3. `_recycleWaits ≤ 0` 且背包有空位 → 牌回到背包
4. 永久装备回收时耐久恢复至满

### 7.4 `recycleDelay` 值（默认 1）

| 牌名 | `recycleDelay` |
|------|---------------|
| 精工修复 | 1 |
| 迷宫回溯 | 2 |
| 乾坤挪移 | 2 |
| 其他永久牌 | 1（默认） |

### 7.5 重要区分：回收袋 vs 坟场

| 情况 | 目的地 |
|------|--------|
| 永久魔法使用后 | 回收袋 |
| 永久魔法被弃置 | 回收袋 |
| 永久装备损毁/挤出 | 回收袋 |
| 护符手动拖到回收袋 | 回收袋 |
| 护符被自动弃置（挤出等） | **坟场** |
| 即时魔法使用后 | 坟场 |
| 药水使用后（无翻转） | 坟场 |
| 非永久装备损毁 | 坟场 |
| 被"删牌"效果删除的任何牌 | 坟场 |

---

## 8. 弃牌与删牌规则

### 8.1 `discardCardToGraveyard` 完整流程

```
1. 如果是玩家牌且有 knightEffect === 'grave-nova'：
   → triggerGraveNova()（对所有怪物造成伤害）
   → addPermanentMagicToRecycleBag（坟火新星本身进回收袋）

2. 否则如果：非 forceGraveyard、isRecyclableFromHand(card)、且 card.type !== 'amulet'：
   → addPermanentMagicToRecycleBag（进回收袋）

3. 否则：
   → addToGraveyard（进坟场）

4. 始终执行 applyDiscardSideEffects(card, owner)
```

### 8.2 弃牌副作用 (`applyDiscardSideEffects`)

| 条件 | 效果 |
|------|------|
| 技能"弃牌获利" (`discard-profit`) | +2 金币 |
| 牌的 `magicEffect === 'honor-blood'` | 对每个怪物造成 `getSpellDamage(1)` 伤害 |
| 牌有 `onDiscardDamage` | 对随机怪物造成 `getSpellDamage(amount)` 伤害 |
| 雷霆符印护符在场 | `triggerDiscardShock()` |

### 8.3 删牌 vs 弃牌

| 操作 | 路径 | 触发效果？ | 目的地 |
|------|------|-----------|--------|
| **删牌** (delete) | `addToGraveyard(card)` | **不触发**任何效果 | 坟场 |
| **弃牌** (discard) | `discardCardToGraveyard(card)` | 触发坟火新星、回收、弃牌副作用 | 回收袋或坟场 |

> **规则：** 删牌效果是最强的——无视所有其他效果（坟火新星、回收、弃牌获利等），直接将牌送入坟场。

### 8.4 手动拖到回收袋 vs 自动弃置

| 操作 | 护符行为 | 永久牌行为 |
|------|---------|-----------|
| 手动拖到回收袋 | 进回收袋 | 进回收袋 |
| 自动弃置（瀑流/效果） | 进坟场 | 进回收袋 |

### 8.5 诅咒牌弃置

- 弃置诅咒牌（手动拖到回收袋）时受到 3 点伤害
- 使用诅咒牌时也受到 3 点伤害

### 8.6 坟火新星 (`grave-nova`)

- 触发时机：该牌被**弃置**时（不是被删除时）
- 效果：对当前行所有怪物造成 `getSpellDamage(3)` 伤害
- 牌本身进入回收袋（永久牌）
- 使用 `activeCardsLatestRef.current` 获取最新怪物列表（避免闭包过时）

---

## 9. 怪物系统

### 9.1 基础怪物

| 种族 | 基础特性 |
|------|---------|
| Dragon | `bleedEffect: 'attack+2'`（每失去1血层，攻击+2） |
| Skeleton | `hasRevive: true`（首次击杀后复生1层血） |
| Goblin | `onAttackEffect: 'steal-gold-3'`（攻击偷3金） |
| Ogre | `enterEffect: 'auto-engage'`（进场自动开战） |
| Wraith | `lastWords: 'wraith-haunt-2'`（遗言：同行怪物攻击+2并打乱位置） |

### 9.2 血层系统

- 怪物有多层血量（`fury`/`hpLayers` → `currentLayer`）
- 每层有独立HP（`hp`/`maxHp`）
- 扣光一层HP后掉一层，HP恢复至 `maxHp`
- `bleedEffect`：每失去一层，攻击力 +N

### 9.3 精英怪物

每个种族随机选1只成为精英，获得 `monsterSpecial` 标签：

| 种族 | 精英能力 | 说明 |
|------|---------|------|
| Dragon | `ember-fury` | 流血效果升级为+3；Hero回合未掉血层则恢复一层 |
| Skeleton | `bone-regen` | 虚骨再生：失去血层后50%概率恢复一层（D20 ≤ 10） |
| Wraith | `wraith-rebirth` | 幽魂重生：血层降至1时50%概率全满（D20 ≤ 10） |
| Ogre | `ogre-crit` | 蛮力暴击：攻击50%概率双倍伤害 + 狂暴连击：50%概率攻击两次 |
| Goblin | `goblin-elite` | 偷取6金币；玩家金币≤10时攻击力与血量翻倍 |

精英怪还有特殊遗言：
- 精英 Skeleton：`discard-hand-3`（随机弃置3张手牌）
- 精英 Wraith：`wraith-haunt-4`（同行怪物攻击+4并打乱位置）

### 9.4 遗言系统 (`lastWords`)

遗言触发时机：
1. 怪物**最终击败**时
2. 最终之敌**变身Boss**时（变身前触发）
3. 有"复生"能力的怪物**首次死亡**时（复生前触发）

> **规则：** 遗言 + 复生 → 遗言先触发，然后复生生效，怪物回到1层血。

遗言效果：

| 效果ID | 行为 |
|--------|------|
| `discard-hand-3` | 随机弃置最多3张手牌 |
| `wraith-haunt-N` | 同行怪物攻击+N，同行卡牌位置随机打乱 |

### 9.5 复生系统 (`hasRevive`)

- 基础Skeleton有 `hasRevive: true`
- 首次击杀时：`reviveUsed: true`，`currentLayer: 1`，HP恢复满
- 第二次击杀时：正常死亡
- Boss变身后也有 `hasRevive`

### 9.6 最终之敌与Boss变身

**最终之敌**：牌堆中最后一只怪物，标记 `isFinalMonster: true`

**特殊规则：**
- 被瀑流从预览区挤出时**不进坟场**，放回牌堆底（不打乱牌序）
- 首次击败时触发变身（不离场）

**Boss变身** (`bossPhase: true`)：
- HP全满，血层数 = 原 `fury`
- `hasRevive: true`
- `bossRetaliationDamage: 3`（每次被攻击反击3点）
- `bossLastStandAura: true`
- `bossFuryDiceChance: true`

**Boss末日光环** (`bossLastStandAura`)：
- 当Boss只剩1层血时，在怪物回合开始：
  - 攻击力 +5
  - 血层 +1，HP恢复满

**Boss韧性** (`bossFuryDiceChance`)：
- 攻击后50%概率不掉血层（D20 ≤ 10）

---

## 10. 魔法系统

### 10.1 魔法类型

| `magicType` | 使用后去向 | 说明 |
|-------------|-----------|------|
| `instant` | 坟场 | 一次性使用 |
| `permanent` | 回收袋 | 使用后进入回收袋，等待回收后重复使用 |

### 10.2 主牌堆魔法

| 名称 | `magicType` | 效果 |
|------|-------------|------|
| 瀑流重置 | instant | 场上牌放回牌堆底，立即触发瀑流 |
| 风暴箭雨 | instant | 对行中所有怪物造成 `getSpellDamage(3) × echo` 伤害；命中 ≥4 只怪物时翻转为「箭雨余韵」(permanent) |
| 箭雨余韵 | permanent | 对行中所有怪物造成 `getSpellDamage(1) × echo` 伤害，每命中 1 只怪物从回收袋随机抽 1 张牌入手牌（不含自身） |
| 回响行囊 | instant | 弃 `2×echo` 张手牌 → 从坟场发现 `2×echo` 张 → 从背包抽 `2×echo` 张 |
| 壁垒猛击 | instant | 被动：每次瀑流随机装备槽永久护甲+1 |
| 血债清算 | instant | 伤害 = `getSpellDamage(gold) × echo`，回复等量HP |
| 永恒修复 | instant | 武器本瀑流内不消耗耐久 |

### 10.3 骑士职业魔法

| 名称 | `magicType` | `knightEffect` | 效果 |
|------|-------------|----------------|------|
| 浴血贪念 | instant | `blood-greed` | 获得金币 = `max(0, maxHp - hp)`，添加贪婪诅咒到背包 |
| 铠甲贯刺 | permanent | `armor-strike` | 选择装备槽的护甲值 → 对怪物造成 `getSpellDamage(armor)` |
| 残血终焉 | permanent | `missing-hp-smite` | 伤害 = `getSpellDamage(maxHp - hp)` |
| 坟火新星 | permanent | `grave-nova` | 永久：被弃置时对所有怪物造成 `getSpellDamage(3)` |
| 孤注一掷 | instant | `berserk-gambit` | HP降至1，本回合武器+4，额外攻击+1 |
| 回收灵焰 | permanent | `recycle-flare` | 立即恢复回收袋中的牌，从背包抽最多2张 |
| 不灭守护 | instant | `death-ward` | 致命时触发（特殊） |
| 混沌骰运 | permanent | `chaos-dice` | D20掷骰，5种随机效果 |
| 冥途拾遗 | instant | `graveyard-recall` | 从坟场召回最多3张 → 翻转为冥途幻变事件 |

### 10.4 混沌骰运效果表

| 骰值 | 效果 |
|------|------|
| 1–4 | 所有已装备武器/盾/预备栏 → 手牌或回收袋；清空槽位 |
| 5–8 | 发现1张职业牌（3选1） |
| 9–12 | 临时商店 |
| 13–16 | 随机怪物受到 `getSpellDamage(3)` × 2次 |
| 17–20 | 弃2张手牌 → 从背包抽2张 |

### 10.5 其他永久魔法（通过翻转/事件获得）

| 名称 | 来源 | 效果 |
|------|------|------|
| 治愈余韵 | 治疗药水翻转 | 回复 2×echo HP |
| 暗影之刺 | 暗影契约翻转 | `scalingDamage`：叠加伤害 |
| 战血之印 | 战血荣誉翻转 | `honor-blood`：弃置时对每个怪物造成 `getSpellDamage(1)` |
| 血金术 | 奇术商会翻转 | `guild-blood-gold`：-1 HP → +2 金 × echo |
| 法术回响 | 裂隙契约翻转 | 下一张魔法效果翻倍 |
| 哥布林的戏法 | 怪物击杀 | 其他手牌全部回收 |

---

## 11. 药水系统

### 11.1 使用规则

- 药水是消耗品，使用后进坟场（除非有 `flipTarget` 翻转）
- 从手牌使用

### 11.2 主牌堆药水

| 名称 | `potionEffect` | 效果 |
|------|----------------|------|
| 治疗药水 | `heal-5` | 回复5HP → 翻转为"治愈余韵"永久魔法 |
| 浓缩治疗药水 | `heal-14` | 回复14HP |
| 装备修复剂 | `repair-choice` | 选择修复哪个装备 |
| 高级修复剂 | `boost-both-slots` | 所有装备槽加成+1 |
| 背包觉醒药 | `draw-backpack-4` | 背包容量+1，手牌上限+1，从背包抽牌 |
| 洞察药剂 | `discover-class-3` | 从职业牌堆发现3张 |
| 魔法平衡药剂 | `discover-graveyard-magic` | 从坟场魔法中选择 → 翻转 |

### 11.3 骑士职业药水

| 名称 | `potionEffect` | 效果 |
|------|----------------|------|
| 奥术灌注 | `dice-arcane-infusion` | D20：槽位伤害/护甲翻倍 或 法术伤害翻倍 |
| 无尽背袋灵药 | `dice-backpack-expand` | D20：护符+1 / 装备容量+1 / 背包+3 |

---

## 12. 事件系统

### 12.1 事件结构

- 事件牌有 `eventChoices: EventChoiceDefinition[]`
- 每个选择可有前置条件 (`requires`)、骰子表 (`diceTable`)、是否跳过翻转 (`skipFlip`)
- 事件完成后可翻转 (`flipTarget`)

### 12.2 事件翻转目的地

| `destination` | 行为 |
|---------------|------|
| `stay` | 翻转后留在场上（如秘藏宝库、命运骰盅） |
| `backpack` | 翻转后进入背包 |
| `hand` | 翻转后进入手牌 |
| `graveyard` | 翻转后进入坟场 |

### 12.3 永久事件 (`isPermanentEvent`)

- 标记 `isPermanentEvent: true` 的事件留在场上
- 可以手动拖到回收袋
- 例：命运之刃（`fate-dice-strike`）

### 12.4 主要事件效果字符串

| 效果 | 行为 |
|------|------|
| `hp-N` | 受到N点伤害 |
| `heal+N` | 回复NHP |
| `fullheal` | 全回复 |
| `gold-N` / `gold+N` | 扣/加金币 |
| `maxhpperm+N` | 永久最大HP+N |
| `discoverClass` | 从职业牌堆发现 |
| `openShop` | 打开商店 |
| `drawHeroCards:N` | 从背包抽N张 |
| `spellDamage+N` | 永久法术伤害+N |
| `backpackSize+N` / `backpackSize-N` | 背包容量修正 |
| `handLimit+1` | 手牌上限+1 |
| `amuletCapacity+1` | 护符槽+1 |
| `equipSlot1Capacity+1` / `equipSlot2Capacity+1` | 装备预备容量+1 |
| `discardHandAll` | 弃置所有手牌 |
| `deleteCard:N` | 删除N张牌（进坟场，无视其他效果） |
| `randomDiscardHand:N` | 随机弃置N张手牌 |
| `graveyardDiscover` | 从坟场选牌 |
| `removeAllAmulets` | 所有护符进坟场 |
| `destroyEquipment:any` | 选择牺牲一件装备 |
| `flipToCurse` / `addCurse` | 添加诅咒 |
| `flipToDoubleNextMagic` | 获得法术回响 |
| `flipToHonorBloodMagic` | 获得战血之印 |
| `equipBurst+N` | 装备爆发+N |
| `turnCount-N` | 瀑流计数-N |
| `amuletsToGold+N` | 所有护符转化为金币，每个N金 |
| `destroyAllEquipment` | 摧毁所有装备 |
| `repairAll` / `repairAllDurability+1` | 修复所有装备 |
| `crossroads-destroy-below` | 命运十字路口破坏下方 |

---

## 13. 骑士职业卡牌

### 13.1 武器

| 名称 | 攻击力 | 耐久 | 特殊 |
|------|-------|------|------|
| 圣光之刃 | 6 | 2/2 | `healOnAttack: 2`（攻击回2HP） |
| 疾风短剑 | 4 | 3/3 | `restoreDurabilityOnKill: true`（击杀恢复耐久） |
| 碎雷战锤 | 4 | 2/2 | `weaponBonus: 1`（槽位永久+1伤害） |

### 13.2 盾牌

| 名称 | 护甲 | 耐久 | 特殊 |
|------|------|------|------|
| 铁壁塔盾 | 5 | 1/1 | `permEquipment`，`fullBlock`（完全格挡） |
| 棘刺反盾 | 4 | 2/2 | `reflectHalfDamage`（反弹半数伤害） |
| 守护圣盾 | 3 | 2/2 | `shieldPerfectBlockSaveChance: 70`（完美格挡70%保护盾） |

### 13.3 护符

| 名称 | 效果 |
|------|------|
| 双守护圣盾 | 完美格挡时永久+1护甲到该槽位 |
| 雷霆符印 | 弃牌时对随机怪物造成伤害（`max(0, 1 + permanentSpellDamageBonus)`） |

### 13.4 药水

| 名称 | 效果 |
|------|------|
| 奥术灌注 | D20掷骰增强 |
| 无尽背袋灵药 | D20掷骰扩容 |

### 13.5 英雄魔法牌

| 名称 | 效果 |
|------|------|
| 圣光秘术 | 解锁/充满圣光仪表 |
| 狂战秘典 | 解锁/充满狂战仪表 |

### 13.6 魔法牌

详见 [§10.3 骑士职业魔法](#103-骑士职业魔法)

---

## 14. 英雄魔法 (Hero Magic)

### 14.1 圣光 (Holy Light)

| 属性 | 值 |
|------|-----|
| 仪表上限 | 8 |
| 充能来源 | 每次受到伤害 +1 |
| 激活条件 | 仪表已满 |
| 效果选择 | 全回复HP **或** 选择一个怪物清除所有 fury（血层归零） |
| 使用限制 | 每瀑流周期只能使用一次 (`usedThisWave`) |

### 14.2 狂战士之怒 (Berserker Rage)

| 属性 | 值 |
|------|-----|
| 仪表上限 | 8 |
| 充能来源 | 每次武器攻击 +1（闪光护符双击算+2） |
| 激活条件 | 仪表已满 |
| 效果 | 每个武器槽获得1次额外攻击（不消耗耐久）；持续到下次瀑流 |

### 14.3 解锁与充能

- 首次使用英雄魔法牌：解锁对应仪表，初始值0
- 再次使用英雄魔法牌：仪表直接充满

---

## 15. 技能系统 (Skills)

### 15.1 初始技能选择

游戏开始时从以下技能中选择：

| ID | 类型 | 效果 |
|----|------|------|
| `armor-pact` | 主动 | 空槽位+1永久护甲；可拉装备 |
| `durability-for-blood` | 主动 | -1 HP，+1 耐久 |
| `blood-strike` | 主动 | -3 HP，对怪物造成3伤害 |
| `vitality-well` | 被动 | +8 最大HP，+8 初始金币 |
| `gold-discovery` | 主动 | 6金 → 随机职业牌；+2初始背包 |
| `graveyard-recall` | 主动 | 弃2 → 坟场3选1 |
| `discard-profit` | 被动 | 每次弃牌+2金；初始商店等级1 |
| `waterfall-heal` | 被动 | 每次瀑流回复4HP（治疗护符翻倍为8） |
| `discard-empower` | 主动 | 随机弃1+选槽：下次攻击+2且吸血 |
| `heal-to-damage` | 被动 | 每有效治疗5点 → 双槽各+1永久伤害；自带治愈余韵 |
| `early-surge` | 被动 | 初始瀑流+2，抽3张职业牌 |
| `shield-wall` | 被动 | 雷霆符印入背包；只出盾牌；新手武器→新手盾 |
| `blood-draw` | 主动 | -3 HP，从背包抽2张；+1手牌上限 |
| `summon-minion` | 被动 | 召唤物进背包 |

### 15.2 额外技能

- 商店花费 `SHOP_SKILL_DISCOVER_COST(10)` 金发现
- 事件也可能赋予随机被动技能（"Iron Skin"或"Weapon Master"）

### 15.3 被动战斗加成

| 被动名称 | 效果 |
|---------|------|
| Weapon Master | +1 攻击力 |
| Iron Skin | +1 防御 |
| Iron Will | +3 最大HP |
| Berserker Rage | +`floor((maxHp-hp)/2)` 攻击力 |
| Battle Frenzy | `hp < maxHp/2` 时 +2 攻击力 |

---

## 16. 商店系统

### 16.1 常量

| 常量 | 值 |
|------|-----|
| `SHOP_MAX_OFFERINGS` | 5 |
| `SHOP_HEAL_COST` | 5 |
| `SHOP_HEAL_AMOUNT` | 5 |
| `SHOP_LEVEL_UP_COST` | 10 |
| `MAX_SHOP_LEVEL` | 3 |
| `SHOP_SKILL_DISCOVER_COST` | 10 |
| `INITIAL_GOLD` | 10 |

### 16.2 卡牌价格

| 类型 | 基础价格 |
|------|---------|
| weapon | 10 |
| shield | 8 |
| magic | 7 |
| hero-magic | 9 |
| amulet | 6 |
| 其他 | `max(5, card.value || 5)` |

### 16.3 等级折扣

`最终价格 = floor(基础价格 × (1 - 商店等级 × 0.1))`，最低 1

### 16.4 必出类型

每次刷新商店必出：weapon, shield, magic, amulet（各至少1张）

---

## 17. 怪物战利品

### 17.1 生成规则

击败怪物后随机生成 2 个奖励选项。

### 17.2 可能的奖励

| 奖励 | 内容 |
|------|------|
| 槽位加成 | 随机左/右，+1 伤害或+1 护甲 |
| 金币 | 5–8 金 |
| 治疗 | 2–4 HP（非满血时） |
| 修复 | +1 耐久（有损坏装备时） |
| 抽牌 | 从背包抽1张（背包非空且手牌未满） |
| 发现职业牌 | 仅精英；职业牌堆非空且背包有空位 |
| 坟场发现 | 仅精英；坟场非空且背包有空位 |
| 最大HP +2 | 永久最大HP +2 |
| 法术伤害 +1 | 永久法术伤害 +1 |

---

## 18. 翻转系统 (Card Flip)

### 18.1 `applyCardFlip` 流程

1. 触发翻转动画
2. 根据 `destination` 放置翻转后的牌：
   - `stay`：替换原位（场上），可附带 `_flipBackCard`
   - `backpack`：放入背包
   - `hand`：放入手牌
   - 默认/`graveyard`：进坟场
3. 如果有"熔炉之心"护符 (`hasFlipGold`)：获得 `FLIP_GOLD_REWARD(3)` 金币

### 18.2 翻转回退 (`_flipBackCard`)

某些牌翻转后可翻回（如秘藏宝库、命运骰盅），`_flipBackCard` 存储原始状态。

---

## 19. 回响机制 (Echo)

### 19.1 触发条件

- `doubleNextMagic === true`
- 使用的牌是 `type === 'magic'`
- 使用的牌**不是** `magicEffect === 'double-next-magic'`（法术回响本身不自我回响）

### 19.2 效果

- `echoMultiplier = 2`
- 所有数值效果 × 2
- 部分多步流程使用 `echoRemaining` 逐步执行

### 19.3 来源

- 使用"法术回响"牌（`magicEffect: 'double-next-magic'`）
- 裂隙契约事件翻转

---

## 20. 关键常量表

| 常量 | 值 | 所在文件 |
|------|-----|---------|
| `INITIAL_HP` | 20 | constants.ts |
| `HAND_LIMIT` | 5 | constants.ts |
| `BASE_BACKPACK_CAPACITY` | 10 | GameBoard.tsx |
| `MAX_AMULET_SLOTS` | 2 | GameBoard.tsx |
| `BALANCE_ATTACK_BONUS` | 3 | GameBoard.tsx |
| `BALANCE_SHIELD_BONUS` | 3 | GameBoard.tsx |
| `BALANCE_ATTACK_PENALTY` | 1 | GameBoard.tsx |
| `BALANCE_SHIELD_PENALTY` | 1 | GameBoard.tsx |
| `FLASH_ATTACK_PENALTY` | 3 | GameBoard.tsx |
| `STRENGTH_SELF_DAMAGE` | 2 | GameBoard.tsx |
| `FLIP_GOLD_REWARD` | 3 | GameBoard.tsx |
| `DEFEAT_ANIMATION_DURATION` | 950ms | GameBoard.tsx |
| `COMBAT_ANIMATION_DURATION` | 1200ms | GameBoard.tsx |
| `COMBAT_ANIMATION_STAGGER` | 180ms | GameBoard.tsx |
| `SHOP_HEAL_COST` | 5 | GameBoard.tsx |
| `SHOP_HEAL_AMOUNT` | 5 | GameBoard.tsx |
| `SHOP_LEVEL_UP_COST` | 10 | GameBoard.tsx |
| `MAX_SHOP_LEVEL` | 3 | GameBoard.tsx |
| `SHOP_SKILL_DISCOVER_COST` | 10 | GameBoard.tsx |
| `INITIAL_GOLD` | 10 | constants.ts |
| `DECK_SIZE` | 64 | GameBoard.tsx |
| D20 50%阈值 | 1–10 vs 11–20 | 通用 |
| 坟火新星基础伤害 | 3 | GameBoard.tsx |
| 雷霆符印伤害 | `max(0, 1 + permanentSpellDamageBonus)` | GameBoard.tsx |
| 荣誉之血弃置伤害 | `getSpellDamage(1)` | GameBoard.tsx |
| Boss反击伤害 | 3 | GameBoard.tsx |
| Boss末日光环攻击加成 | +5 | GameBoard.tsx |
| 诅咒弃置/使用伤害 | 3 | GameBoard.tsx |
| 潮涌回春治疗量 | 4（治疗护符翻倍为8） | GameBoard.tsx |
| 最大HP战利品值 | +2 | GameBoard.tsx |
| 怪物战利品金币 | 5–8 | GameBoard.tsx |
| 怪物战利品治疗 | 2–4 | GameBoard.tsx |

---

> **维护须知：** 修改任何游戏机制时，请先查阅本文档确认不会违反已有规则。如需修改规则，请同步更新本文档。
