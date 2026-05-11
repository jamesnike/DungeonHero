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
8. [弃回与删牌规则](#8-弃回与删牌规则)
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

## 核心关键词

| 关键词 | 含义 | 触发副作用？ | 遵循路由规则？ |
|--------|------|:----------:|:------------:|
| **弃置** | 将卡牌送入**坟场**（Graveyard） | 是 | 是（仅非 Perm） |
| **回收** | 将卡牌送入**回收袋**（Recycle Bag） | 是 | 是（仅 Perm） |
| **弃回** | 弃置 + 回收的统称；每张牌按 Perm 自动路由 | 是 | 是 |
| **删除** | 从游戏中完全移除（送入坟场） | **否** | **否** |
| **移到** | 无视规则，强制移到指定区域 | **否** | **否** |
| **回手** | 从装备栏/护符栏移回手牌（保留当前属性与耐久） | **否** | **否** |

> **弃置/回收/弃回** 遵循 Perm 路由规则并触发弃牌副作用（弃牌获利、坟火新星、雷霆符印等）。
>
> **删除** 将卡牌送入坟场，**不触发**任何副作用。用于商店删牌、事件删牌等永久移除效果。
>
> **移到** 无视 Perm 路由规则，强制将卡牌放到指定区域（坟场/回收袋/背包/手牌等），**不触发**任何副作用。例如"将一张牌移到回收袋"，无论该牌是否 Perm，都直接放入回收袋。
>
> **回手** 将装备栏或护符栏中**最上面**的一件装备/护符移回手牌。玩家从**左装备栏、右装备栏、护符栏**三者中选择一个有物品的位置。卡牌回手后**保留当前属性与耐久**（不重置、不修复）。若装备栏有堆叠（Reserve），移除顶层后底层自动提升。效果令牌：`returnToHand:N`（N 为回手次数）。
>
> **Perm 路由规则：** Perm 卡牌只能回收（进回收袋），非 Perm 卡牌只能弃置（进坟场）。Perm 卡牌不可被手动拖到 Graveyard 区域。

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
| **手牌** | `handCards` | 上限 `HAND_LIMIT(6) + handLimitBonus` |
| **背包** | `backpackItems` | LIFO，基础容量 `BASE_BACKPACK_CAPACITY(15)` + 修正 |
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
| 怪物 | 18 | 6种族 × 3（Dragon, Skeleton, Goblin, Ogre, Wraith, Swarm） |
| 武器 | 6 | Holy Blade, 虚灵刀, Mace, Dagger, Sword, 奥术之刃 |
| 盾牌 | 6 | Wooden×2, Iron×2, Heavy×2 |
| 药水 | 6 | 治疗/修复/背包/洞察等 |
| 护符 | 6 | Heal, Balance, Life, Guardian, Flash, Strength |
| 魔法 | 5 | 瀑流重置, 风暴箭雨, 回响行囊, 潮涌铸甲, 点金裁决, 涌泉满手, 等价交换, 冥途拾遗, 怀柔令, 秘法精炼（候选10，每局选5） |
| 事件 | 14 | 各类事件 |

### 2.2 初始背包（选秀制）

游戏开始选择技能后，从候选牌中进行 **6 轮选秀**（每轮展示 3 张，选 1 张），组成初始背包。第 1 轮药水、第 2 轮装备、第 3 轮护符、第 4–6 轮通用（不含装备）。详见 `CARD_POOL_REFERENCE.md` 起始背包章节。

初始背包候选卡牌包含 6 把武器、2 面盾牌、3 个护符、14 张永久魔法、4 张即时魔法、9 张药水。

### 2.3 骑士职业牌堆

18 张牌，详见 [§13 骑士职业卡牌](#13-骑士职业卡牌)。

### 2.4 牌序规则

- 1只精英怪出现在牌堆**前半段**（第13–30张），其余精英怪在**后半段**
- 每6张牌中至少有1张怪物，至多2张怪物
- 牌堆最后3张中必有1张怪物
- 牌堆中最后一只怪物在 init 时直接被烘焙为 Boss（`isFinalMonster: true` + `bossPhase: true` + `(Boss)` 名字后缀，自带 `亡灵召唤` + `复生`），详见 §9.7 最终之敌（Boss）

---

## 3. 瀑流系统 (Waterfall)

### 3.1 触发流程

1. `turnCount` +1
2. 如果有"潮涌回春"技能：回复 4 HP（有治疗护符时翻倍为 8）
3. 如果有"潮涌铸甲·格挡铸甲"被动：该栏临时护甲 +2（"瀑流铸剑"被动在攻击时触发，不在瀑流时触发）
4. **执行回收袋恢复** (`restorePermanentMagicFromRecycleBag`)
5. 预览区卡牌落入场上空列
6. 多余的预览卡牌被挤出（按倒序）
7. 从牌堆翻新卡牌到预览区

### 3.2 预览挤出规则

- **最终之敌（Boss）**：不会进坟场；从预览被挤出时放回**牌堆底**（不打乱其余牌序）
- 怪物的 `waterfallEffect.type === 'returnToDeck'`：放回牌堆（不进坟场）
- 其他情况：弃回（Perm→回收袋，非Perm→坟场），并执行 `waterfallEffect`（如有）

### 3.3 瀑流效果 (`waterfallEffect`)

| 类型 | 效果 |
|------|------|
| `returnToDeck` | 随机插入牌堆或放底 |
| `bonusDecay` | 所有装备栏永久伤害/护甲 -N，超杀吸血 -N |
| `gold` | 获得金币 |
| `damage` | 对英雄造成伤害 |
| `turnBoost` | `turnCount` +N |
| `boostRowMonsterAttack` | 同行怪物攻击力 +3 |
| `destroyAllEquipment` | 摧毁所有装备 |
| `swarmInfest` | 在主牌堆顶加入 N 只小虫子 |
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
- 狂战士之怒激活时，每槽额外获得1次攻击，且所有攻击不消耗耐久（持续到下次瀑流）

### 4.3 武器伤害公式

```
baseDamage = max(0,
    weaponValue
  + attackBonus            // 全局攻击加成
  + slotDamageBonus        // 槽位永久伤害加成
  + nextWeaponBonus        // 战斗鼓舞等一次性加成
  + slotBurstBonus         // 爆发加成（时空收缩等）
  + berserkTurnBuff        // 孤注一掷回合加成
  + slotTempAttack         // 临时攻击（力量护符 / 均衡护符等，瀑流后重置）
)

// 闪光护符减半（光环效果，总是最后计算）
finalDamage = hasFlash ? floor(baseDamage / 2) : baseDamage
```

**全局攻击加成 (`attackBonus`)：**
- 护符光环 `amuletEffects.aura.attack`
- 武器大师技能 +1
- `weaponMasterBonus`（职业加成）
- 狂战士之怒被动：`floor((maxHp - hp) / 2)`
- 战斗狂热技能：`hp < maxHp / 2` 时 +2

**暴击判定：**
- 有 `critChance` 的武器（如幸运匕首）：`threshold = round((critChance/100) × 20)`
- D20 掷骰，≤ threshold 时暴击 → 最终伤害**翻倍**

**匕首自毁发现：**
- 主牌堆 Dagger 攻击后，若武器仍有耐久，弹窗询问玩家是否自毁
- 确认后毁坏武器，发现 N 张专属牌（N = 剩余耐久）

### 4.4 武器疲劳判定 (`isExhaustedThisTurn` → 红叉)

武器显示红叉的条件 **全部同时满足**：

1. 存在至少一只**存活**（非死亡动画中）的交战怪物
2. 该槽位本回合**已攻击** (`heroAttacksThisTurn[slot] === true`)
3. 没有额外攻击次数 (`extraAttackCharges <= 0`)
4. 狂战士之怒未激活，或该槽位的狂战额外攻击已使用

> **重要：** `engagedMonsters` 中在死亡动画中的怪物（`monsterDefeatStates[id]` 存在）不计入判定。

### 4.5 闪光护符 (Flash Amulet)

- 所有装备攻击力减半（计算完所有其他 buff 后 `÷2`，向下取整），因为是光环效果总是最后计算
- 每个装备槽每回合攻击次数 +1（类似狂战，使用 `flashSlotUsed` 追踪每槽额外攻击是否已用）
- `flashSlotUsed` 在每个英雄回合开始时重置
- 卡牌上直接显示减半后的最终攻击力数字

### 4.6 力量护符 (Strength Amulet)

- 每波开始时为所有装备栏施加 +4 临时攻击（通过 `slotTempAttack`，瀑流后重置再重新施加）
- 每次攻击后受到 `STRENGTH_SELF_DAMAGE(2)` 点伤害

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
8. **完美格挡保护**：`shieldPerfectBlockSaveChance` → D20 判定免耐久消耗（在 armor 已被打穿、即将扣耐久时触发）；`shieldPerfectBlockArmorSaveChance`（守护圣盾 50%）→ D20 判定本次格挡不扣护甲值（在 armor 扣减前触发；如果保住 armor，自然也不会扣耐久）
9. 盾牌破碎 → `disposeOwnedEquipmentCard` → 预备栏顶替

---

## 5. 装备系统 (武器与盾牌)

### 5.1 装备槽

- 左槽 (`equipmentSlot1`)、右槽 (`equipmentSlot2`)
- 每槽有预备栏 (`Reserve`)，预备栏大小 = `equipmentSlotCapacity`（默认各1）
- 装备新武器/盾时，如果主槽和预备栏都满，最旧的装备被**挤出** → `disposeOwnedEquipmentCard`

### 5.2 耐久度

- 武器：每次攻击 -1 耐久（狂战激活期间**所有攻击不消耗**耐久）
- 盾牌：每次格挡 -1 耐久
- 耐久为 0 → 武器/盾牌损毁 → `disposeOwnedEquipmentCard`
- 击杀怪物 + `restoreDurabilityOnKill`：恢复耐久到满
- `unbreakableUntilWaterfall`：当前瀑流周期内不消耗耐久

### 5.3 装备关键词

#### 入场 (`onEquipEffect`)

装备被装备到装备栏时触发一次。触发时机：拖拽装备到槽位 或 从手牌打出装备。

| 效果ID | 行为 |
|--------|------|

#### 遗言 (`onDestroyEffect` / `onDestroyHeal` / `onDestroyGold` / `onDestroyDraw` / `onDestroyPermanentDamage`)

| `onDestroyEffect` 效果ID | 行为 |
|--------|------|
| `graveyard-to-hand` | 随机从坟场取 1 张牌加入手牌 |
| `slot-temp-buff-3-3` | 该装备栏 +3 临时攻击 +3 临时护甲 |

装备被摧毁时触发。包括：耐久耗尽、被事件效果破坏、被怪物效果破坏等所有摧毁路径。

> **规则：遗言 + 复活 →** 当装备同时有遗言和复活时，耐久耗尽的处理顺序为：**遗言先触发 → 复活生效**（耐久回到 1）。装备不会真正被移除。

怪物装备的 `lastWords` 也遵循此规则。

### 5.4 永久装备 (`permEquipment`)

- 标记 `permEquipment: true` 的武器/盾牌
- 损毁/挤出时进**回收袋**（而非坟场）
- 回收时**耐久恢复至满**
- 判定函数：`isPermRecycleEquipment(card)` → `card.type in ['weapon','shield'] && card.permEquipment`

### 5.5 装备处置 (`disposeOwnedEquipmentCard`)

1. 如果是 `isPermRecycleEquipment` → `addPermanentMagicToRecycleBag`（进回收袋）
2. 否则 → `addToGraveyard`（进坟场）
3. **始终**触发 `applyDiscardSideEffects`

### 5.6 平衡护符对装备的影响

每波开始时通过 `slotTempAttack` / `slotTempArmor` 施加，瀑流后重置再重新施加。

| 槽位 | 临时攻击修正 | 临时护甲修正 |
|------|-------------|-------------|
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
| Balance Amulet | `balance` | 左栏临时攻击+3临时护甲-1，右栏临时护甲+3临时攻击-1 |
| Life Amulet | `life` | 超杀吸血+3 |
| Catapult Amulet | `catapult` | 每弃置1张牌，抽2张牌 |
| Flash Amulet | `flash` | 攻击力减半，攻击次数+1 |
| Strength Amulet | `strength` | 临时攻击+4，每次攻击自损2HP |
| Graveyard Amulet | `persuade-graveyard-stack` | 劝降成功时，在原怪物格堆叠 2 张墓地随机牌 |
| 雷击护符 | `stun-rate-boost` | 光环：所有击晕率 +20%（仍受击晕上限约束） |
| 弧能之符 | `flip-zap` | 每翻转一张牌，对激活行随机怪物造成 3 点法术伤害（`max(0, 3 + permanentSpellDamageBonus)`）；多张可叠加，每张独立结算 |

### 6.6 骑士职业护符

| 名称 | `amuletEffect` | 效果 |
|------|----------------|------|
| 双守护圣盾 | `dual-guard` | 完美格挡时永久+1护甲到该槽位 |
| 雷霆符印 | `discard-zap` | 弃牌时对随机怪物造成伤害 |

### 6.7 特殊护符（翻转获得）

| 名称 | `amuletEffect` | 效果 |
|------|----------------|------|
| 熔炉之心 | `flip-gold` | 每次卡牌翻转获得 4 金币 |

---

## 7. 永久牌与回收袋系统 (Permanent & Recycle Bag)

### 7.1 关键词定义

- **弃置**：将卡牌送入坟场（Graveyard）。适用于所有非 Perm 卡牌。触发弃牌副作用。
- **回收**：将卡牌送入回收袋（Recycle Bag）。适用于所有带 Perm 的卡牌。触发弃牌副作用。
- **弃回**：弃置 + 回收的统称。对一批卡牌执行"弃回"时，每张牌根据是否 Perm 自动路由——非 Perm 弃置到坟场，Perm 回收到回收袋。例如"弃回所有手牌"。
- **删除**：从游戏中完全移除，送入坟场。**不触发**任何弃牌副作用，无视 Perm 路由规则。用于商店删牌、事件删牌。代码路径：`addToGraveyard(card)`。
- **移到**：无视所有规则，强制将卡牌放到指定区域。**不触发**任何副作用，不受 Perm 路由限制。例如"将一张牌移到回收袋"，无论该牌是否 Perm，都直接放入回收袋。

**Perm 路由规则（弃置/回收/弃回遵循）：**
- 带 Perm 的卡牌，无论自动还是手动，都只能**回收**（进回收袋），不能弃置到坟场。
- 不带 Perm 的卡牌，无论自动还是手动，都只能**弃置**（进坟场），不能进回收袋。
- Perm 卡牌不可被手动拖到 Graveyard 区域。
- 当操作涉及多张可能混合 Perm 和非 Perm 的卡牌时，使用**弃回**一词。
- **删除**和**移到**不受此规则约束。

### 7.2 选择界面范围

当效果要求玩家"选择 N 张牌"时，根据关键词决定可选范围和筛选条件：

| 关键词 | 可选区域（无明确指定时） | 筛选 | 示例 |
|--------|--------------------------|------|------|
| 弃回 N 张牌 | 手牌 + 装备栏 + 护符栏 | 所有牌 | "弃回 2 张牌" |
| 弃回 N 张手牌 | 仅手牌 | 所有牌 | "弃回 2 张手牌" |
| 弃置 N 张牌 | 手牌 + 装备栏 + 护符栏 | 仅非 Perm | — |
| 回收 N 张牌 | 手牌 + 装备栏 + 护符栏 | 仅 Perm | — |
| 删除 N 张牌 | 手牌 + 背包 + 装备栏 + 护符栏 + 回收袋 | 所有牌 | "删除 1 张卡牌" |
| 移到 | 手牌 + 装备栏 + 护符栏 | 所有牌 | "将 1 张手牌移到回收袋" |

- 当关键词后明确写了"手牌"（如"弃回 N 张**手牌**"），选择范围缩窄至仅手牌。
- **背包**仅在"删除"操作中可选。
- **回收袋**仅在"删除"操作中可选。

### 7.3 什么是 Perm 卡牌

Perm 卡牌 = 使用后不进坟场，进入回收袋等待回收的牌。

以下**任一**条件满足即为 Perm 卡牌：
- 永久魔法 (`type === 'magic' && magicType === 'permanent'`)
- 永久事件 (`isPermanentEvent === true`)
- 永久装备 (`isPermRecycleEquipment` → `type in ['weapon','shield'] && permEquipment`)

**判定 `isPermanentMagicCard`：** `card.type === 'magic' && card.magicType === 'permanent'`

**护符说明：** 护符 (`type === 'amulet'`) 在手牌中可拖至回收袋，但自动弃置时进坟场（特殊处理，不算 Perm）。

### 7.4 手动处置规则

| 来源 | Perm 卡牌 | 非 Perm 卡牌 |
|------|-----------|-------------|
| 手牌 | 拖到背包区域 → 回收袋 | 拖到坟场区域 → 坟场 |
| 地城（永久事件） | 拖到背包区域 → 回收袋 | N/A |
| 装备槽（永久装备） | 拖到背包区域 → 回收袋 | 拖到坟场区域 → 坟场 |

### 7.5 回收袋流程

1. 牌进入回收袋时：`_recycleWaits = recycleDelay ?? 1`
2. 每次瀑流：`_recycleWaits` -1
3. `_recycleWaits ≤ 0` 且背包有空位 → 牌回到背包
4. 永久装备回收时耐久恢复至满

### 7.5.1 「置顶」(Top-on-Recycle-Restore) 关键词

带 `topOnRecycleRestore: true` 的卡，从回收袋洗回背包时会被自动放到**背包顶**（`backpackItems[0]`，第 1 格），让玩家立刻能在背包最显眼位置看到它；普通卡则 append 到背包末尾。

- 触发路径：所有 7+ 条 recycle→backpack 路径都会触发——瀑流自动 -1 / 幽魂净化（永恒护符）/ 回收余韵 / 回收灵焰 / 虚空置换 / 洗册归川 / 通用 RESTORE_RECYCLE_BAG。
- 容量语义：置顶卡仍然占背包容量配额。背包满时所有就绪卡都落不下来 = 全部留在回收袋下次再算（包括置顶卡）。
- **抽牌优先级（核心）**：当 `backpackItems[0]` 是置顶卡时，**所有从背包抽牌的效果都会优先抽到它**——不消耗 RNG，确定性抽出。覆盖所有抽背包入口：
  - 战狂诅咒（`DRAW_FROM_BACKPACK count: 1`）
  - 回收灵焰 / 汰旧迎新（`drawMultipleFromBackpack`）
  - 装备遗言抽（`onDestroyDraw`） / 武器超杀抽 / 瀑流回合开始抽
  - Ogre `enterDiscard` / flank `flankDraw` / 任何走 `DRAW_CARDS source: 'backpack'` 的路径
  - 多张置顶按 backpack 顺序「逐张剥」：抽 N 张时前 K 张是确定性的置顶卡（K = 当前置顶卡数量），剩下 N-K 张随机
- 视觉反馈：
  1. 第一阶段：BackpackZone 播放绿色 Recycle 环动画（玩家看到"卡从回收袋飞回背包"）。
  2. 第二阶段：banner / log 提示「置顶」+ 卡名（例：「专属感召」触发置顶，已置于背包顶）。
- 当前持有「置顶」关键词的卡：「专属感召」（开局直接发放的固定起手牌，Perm 1）。

### 7.6 `recycleDelay` 值（默认 1）

| 牌名 | `recycleDelay` |
|------|---------------|
| 精工修复 | 1 |
| 迷宫回溯 | 1 |
| 乾坤挪移 | 2 |
| 其他永久牌 | 1（默认） |

### 7.7 回收 vs 弃置 对照表

| 情况 | 关键词 | 目的地 |
|------|--------|--------|
| 永久魔法使用后 | 回收 | 回收袋 |
| 永久魔法被处置 | 回收 | 回收袋 |
| 永久装备损毁/挤出 | 回收 | 回收袋 |
| 永久事件被处置 | 回收 | 回收袋 |
| 护符手动拖到回收袋 | 回收 | 回收袋 |
| 护符被自动弃置（挤出等） | 弃置 | 坟场 |
| 即时魔法使用后 | 弃置 | 坟场 |
| 药水使用后（无翻转） | 弃置 | 坟场 |
| 非永久装备损毁 | 弃置 | 坟场 |

---

## 8. 弃回与删牌规则

### 8.1 `discardCardToGraveyard` 完整流程

```
1. 如果是玩家牌且有 knightEffect === 'grave-nova'：
   → triggerGraveNova()（对所有怪物造成伤害）
   → addPermanentMagicToRecycleBag（坟火新星本身进回收袋）

2. 否则如果 Perm 卡牌（isRecyclableFromHand(card) && type !== 'amulet'）：
   → addPermanentMagicToRecycleBag（回收至回收袋，无论 forceGraveyard）

3. 否则如果 forceRecycleBag：
   → addPermanentMagicToRecycleBag（进回收袋）

4. 否则：
   → addToGraveyard（弃置至坟场）

5. 始终执行 applyDiscardSideEffects(card, owner)
```

### 8.2 卡牌使用 Staging 机制

打出一张牌时，该牌进入虚拟的 **Staging 区**（不属于手牌、坟场、回收袋）。

**结算顺序：**

```
1. 牌从手牌移除 → 进入 Staging（手牌数 -1）
2. 牌的效果按顺序结算（弃牌、抽牌、造成伤害等）
   - 此阶段中被弃掉的牌，其弃置副作用（onDiscardDraw 等）被 **排入队列**，不立即触发
3. 牌的效果全部结算完毕
4. Staging 中的牌 → 坟场 或 回收袋
5. 依序结算队列中的弃置副作用（连锁效果）
```

**示例：** 手牌 5 张，上限 5。打出一张"弃回 1 抽 1"的牌：
- 该牌 → Staging（手牌变为 4）
- 弃回 1 张手牌（手牌变为 3），被弃回的牌进入坟场/回收袋
- 抽 1 张（手牌变为 4，未超上限）
- Staging 的牌 → 坟场（手牌仍为 4）
- 被弃回的牌恰好有 `onDiscardDraw: 2`：此时手牌 4，上限 5，**只能抽 1 张**

**关键规则：** 连锁效果必须等前一张牌完全结算完毕（进入坟场/回收袋后）才开始结算。

### 8.3 弃牌副作用 (`applyDiscardSideEffects`)

弃牌副作用分为两个阶段，**卡牌自身效果先结算，然后再结算"每次弃置"触发器**：

**Phase 1 — 卡牌自身的弃置效果（优先结算）：**

| 条件 | 效果 |
|------|------|
| 牌的 `magicEffect === 'honor-blood'` | 激活行所有怪物攻击力 -2 |
| 牌有 `onDiscardDamage` | 对随机怪物造成 `getSpellDamage(amount)` 伤害 |
| 牌有 `onDiscardDraw` | 从背包抽取指定数量的牌（受手牌上限限制） |

**Phase 2 — "每次弃置"触发器（后结算）：**

| 条件 | 效果 |
|------|------|
| 技能"弃牌获利" (`discard-profit`) | +2 金币 |
| 弹射护符 (`catapult`) | 从背包抽 2 张牌 |
| 雷霆符印 (`discard-zap`) | `triggerDiscardShock()` 对随机怪物造成伤害 |

> **规则：** 含"每"字样的触发器（弹射护符、雷霆符印、弃牌获利）一定在被弃牌自身效果之后结算。
> 例：弃掉一张 `onDiscardDraw: 2` 的牌 → 先抽 2 张（牌自身效果）→ 然后弹射护符再抽 2 张。

> **注意：** 当有牌在 Staging 区时，整个弃置副作用（Phase 1 + Phase 2）不会立即执行，而是排入队列，等 Staging 的牌结算完毕后依序执行。

### 8.4 五种卡牌操作对比

| 关键词 | 代码路径 | 触发副作用？ | 遵循 Perm 路由？ | 目的地 |
|--------|---------|:----------:|:-------------:|--------|
| **弃置** | `discardCardToGraveyard` | 是 | 是 | 坟场 |
| **回收** | `discardCardToGraveyard` / `addPermanentMagicToRecycleBag` | 是 | 是 | 回收袋 |
| **弃回** | `discardCardToGraveyard` | 是 | 是 | Perm→回收袋 / 非Perm→坟场 |
| **删除** | `addToGraveyard(card)` | **否** | **否** | 坟场 |
| **移到** | 直接操作目标区域状态 | **否** | **否** | 指定区域 |

> **删除** 无视所有规则（坟火新星、Perm 路由、弃牌获利等），直接将牌送入坟场。用于商店删牌、事件删牌。
>
> **移到** 无视所有规则，将牌强制放到指定区域（如"移到回收袋"、"移到手牌"）。不触发任何副作用，不受 Perm 路由限制。

### 8.5 手动拖到回收袋 vs 自动弃回

| 操作 | 护符行为 | Perm 卡牌行为 | 非 Perm 卡牌行为 |
|------|---------|-------------|---------------|
| 手动拖到回收袋 | 进回收袋 | 进回收袋（回收） | N/A |
| 自动弃回（瀑流/效果） | 进坟场（弃置） | 进回收袋（回收） | 进坟场（弃置） |

### 8.6 诅咒牌弃置

- 弃置诅咒牌（手动拖到回收袋）时受到 3 点伤害
- 使用诅咒牌时也受到 3 点伤害

### 8.7 坟火新星 (`grave-nova`)

- 触发时机：该牌被**弃置**时（不是被删除时）
- 效果：对当前行所有怪物造成 `getSpellDamage(baseDmg)` 伤害（Lv0: 3, Lv1: 6）
- 可升级：最高 1 级
- 牌本身进入回收袋（永久牌）
- 使用 `activeCardsLatestRef.current` 获取最新怪物列表（避免闭包过时）

---

## 9. 怪物系统

### 9.1 基础怪物

| 种族 | 基础特性 |
|------|---------|
| Dragon | `bleedEffect: 'attack+2'`（每失去1血层，攻击+2） |
| Skeleton | `hasRevive: true`（首次击杀后复生1层血） |
| Goblin | `onAttackEffect: 'steal-gold-5'`（攻击偷5金，精英偷8金） |
| Ogre | `enterEffect: 'auto-engage'`（进场自动开战） |
| Wraith | `lastWords: 'wraith-haunt-2'`（遗言：同行怪物攻击+2并打乱位置） |
| Swarm | `swarmSpawn: true`（虫群被动：场上有虫群怪时，每移除一张地城牌，在该位置生成一只小虫子） |

#### 9.1.1 小虫子（Buglet）

- 由虫群被动生成的衍生怪物（`isBuglet: true`, `monsterType: 'Buglet'`）
- 攻击力 2，生命 1，1 层血
- 击杀小虫子不会再生成新的小虫子（防止无限循环）
- 击杀小虫子的战利品固定为 1 个选项：获得 2-3 金币
- 死亡时 5% 概率翻转为「虫蜕之冠」护符（`amuletEffect: 'monster-kill-upgrade'`，每击杀 3 个怪物选择一张牌升级）。每局仅可触发一次，获得后不再翻转。

### 9.2 血层系统

- 怪物有多层血量（`fury`/`hpLayers` → `currentLayer`）
- 每层有独立HP（`hp`/`maxHp`）
- 扣光一层HP后掉一层，HP恢复至 `maxHp`
- 单次伤害最多打掉当前血层，溢出伤害不穿透到下一层
- `bleedEffect`：每失去一层，攻击力 +N

### 9.3 精英怪物

每个种族随机选1只成为精英，获得 `monsterSpecial` 标签：

| 种族 | 精英能力 | 说明 |
|------|---------|------|
| Dragon | `ember-fury` | 流血效果升级为+3；庇护：Hero回合未掉血层，为激活行另一个怪物恢复1血层 |
| Skeleton | `bone-regen` | 骸生：失去血层后40%概率恢复一层（D20 ≤ 8）|
| Wraith | `wraith-rebirth` | 重生：血层降至1时50%概率全满（D20 ≤ 10） |
| Ogre | `ogre-crit` | 暴击：攻击50%概率双倍伤害 + 连击：50%概率攻击两次 |
| Goblin | `goblin-elite` | 窃宝精英：怪物回合结束掷一次 D20，自身下方每有 1 张牌成功率 +25%（最高 100%），成功则偷走 1 件装备或护符 |
| Swarm | `swarm-elite` | 虫母：每次受到伤害时，将激活行一张非怪物牌替换为小虫子 |

精英怪还有特殊遗言：
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
| `discard-hand-N` | 随机弃回最多N张手牌 |
| `wraith-haunt-N` | 同行怪物攻击+N，同行卡牌位置随机打乱 |

### 9.5 复生系统 (`hasRevive`)

- 基础Skeleton有 `hasRevive: true`
- 首次击杀时：`reviveUsed: true`，`currentLayer: 1`，HP恢复满
- 第二次击杀时：正常死亡
- Lv.1+ `skeletonNoLayerCost`：复生后攻击不消耗血层
- Lv.2+ `skeletonLastWordsDiscard`：遗言效果，死亡时随机弃回玩家1张手牌
- Lv.3 `skeletonReRevive`：同行其他怪物被击败时，若已复生过，再次获得复生
- 最终之敌（Boss）开局即自带 `hasRevive: true`

### 9.6 怪物强化等级

每个怪物有强化等级（`upgradeLevel`），对应 `MONSTER_UPGRADES` 中的升级阶段：

- **Lv.0** = 基础属性（无强化）
- **Lv.1/2/3** = 第一/二/三阶段，获得攻击和血量加成及特殊能力

**自然强化**：怪物出现在地城行时，根据当前 waterfall 次数自动达到对应等级。例如 Dragon 在 waterfall ≥ 4 时为 Lv.1，≥ 8 时为 Lv.2，≥ 12 时为 Lv.3。

**手动升级**：怪物作为装备时，可通过升级系统（升级卷轴、秘法精炼、商店等）升级到下一等级，获得该阶段的完整加成（攻击、血量、特殊能力）。

| 种族 | Lv.1 | Lv.2 | Lv.3 |
|------|------|------|------|
| Dragon | WF≥4: 攻+3 血+1 + 龙鳞（上回合掉血层时不耗血层） | WF≥8: 攻+5 血+4 + 龙鳞+龙息 | WF≥12: 攻+8 血+7 + 龙鳞+龙息+破甲 |
| Skeleton | WF≥3: 攻+3 血+1 + 无尽 | WF≥7: 攻+6 血+2 + 无尽+撕牌 | WF≥11: 攻+9 血+3 + 无尽+撕牌+轮回 |
| Goblin | WF≥3: 攻+2 血+1 + 窃牌 | WF≥7: 攻+4 血+2 + 窃牌+疗养 | WF≥11: 攻+6 血+4 + 窃牌+疗养+贪敛 |
| Ogre | WF≥5: 攻+3 血+1 + 击晕 | WF≥9: 攻+5 血+3 + 击晕+连击 | WF≥13: 攻+8 血+5 + 震慑+击晕+连击 |
| Wraith | WF≥4: 攻+3 血+1 + 光环 | WF≥8: 攻+5 血+3 + 光环+传魂 | WF≥12: 攻+7 血+4 + 光环+传魂+诅咒 |
| Swarm | WF≥4: 攻+1 血+2 + 集结 | WF≥8: 攻+2 血+4 + 集结+腐蚀甲壳 | WF≥12: 攻+3 血+6 + 集结+腐蚀甲壳+虫盾 |
| Buglet | WF≥4: 攻+2 血+1 | WF≥8: 攻+4 血+2 | WF≥12: 攻+6 血+4 |

### 9.7 最终之敌（Boss）

**最终之敌**：牌堆洗牌后最后一只怪物，在 `INIT_GAME` 阶段直接被烘焙成 Boss 形态（`bakeFinalBoss` 助手函数），开局即携带：

- `isFinalMonster: true`：保留瀑流挤出回牌堆底的保护
- `bossPhase: true`：Boss 形态标记
- `bossEnrageGraveyardSummon: 4`：自带 **亡灵召唤**（激怒时从坟场召唤 2 怪物各占 1 格 + 2 非怪物堆叠在另一格）
- `hasRevive: true, reviveUsed: false`：自带 **复生**
- `(Boss)` 名字后缀

> **注意**：早期版本的"首次击败时变身为 Boss"流程已经移除。现在最终怪物从牌堆显示就是 Boss 形态——它**保留自己原本的种族/精英技能**（如 Skeleton 的 `skeletonNoLayerCost`、Ogre 的 `ogreStun` 等），不会获得 `bossRetaliationDamage`、攻击 +5、HP 全满等旧变身额外加成。

**特殊规则：**
- 被瀑流从预览区挤出时**不进坟场**，放回牌堆底（不打乱牌序，保留 `isFinalMonster` 检查）

### 9.8 击晕状态 (`isStunned`)

当怪物处于击晕状态时，**所有技能完全无效**：

**攻击阶段（已由攻击队列跳过实现）：**
- 怪物回合跳过攻击
- `onAttackEffect`（偷金）不触发
- `eliteDoubleAttack`（连击）不触发
- `ogreStun`（击晕玩家）不触发

**被动/反应技能（被攻击时）：**
- `bleedEffect`（流血攻击加成）不生效
- `dragonAttackNoLayerCost`（龙鳞）不生效
- `dragonDamageRetaliation`（龙息）不生效
- `dragonBleedDestroy`（破甲）不生效
- 精英特殊能力（骨再生 `bone-regen`、重生 `wraith-rebirth`、虫母 `swarm-elite`）不触发

**回合结束技能：**
- `wraithTurnAttack`（蓄积）不生效
- `eliteRegenHeroTurn`（未受伤恢复血层）不生效

**死亡/复生技能：**
- `hasRevive`（复生）不生效——击晕状态下击杀直接死亡
- `lastWords`（遗言）不触发
- `wraithDeathHeal`（祝福）不触发
- `wraithDeathHealSpread`（传魂）不触发

**场地技能：**
- `swarmSpawn`（虫群被动生成小虫子）不生效
- `swarmHordeRage`（虫群集结）不触发

> 击晕持续一个怪物回合，在怪物回合结束时自动恢复。

---

## 10. 魔法系统

> **建筑与魔法伤害：** 所有建筑（`type === 'building'`，如诅咒碑、增幅祭坛、命运之刃）都是魔法伤害的合法目标。魔法伤害选择目标时，同时检查 `type === 'monster'` 和 `type === 'building'`（通过 `isDamageableTarget` 辅助函数）。建筑自身不受其光环保护（如诅咒碑的 `stacked-magic-immune` 光环仅保护堆叠在其上方的怪物，不保护建筑自身）。

### 10.1 魔法类型

| `magicType` | 使用后去向 | 说明 |
|-------------|-----------|------|
| `instant` | 坟场 | 一次性使用 |
| `permanent` | 回收袋 | 使用后进入回收袋，等待回收后重复使用 |

### 10.2 主牌堆魔法

| 名称 | `magicType` | 效果 |
|------|-------------|------|
| 瀑流重置 | instant | 场上牌（含堆叠牌，幽灵建筑除外）放回牌堆底，立即触发瀑流 |
| 风暴箭雨 | instant | 对行中所有怪物造成 `getSpellDamage(3) × echo` 伤害；命中 ≥3 只怪物时翻转为「箭雨余韵」(permanent) |
| 箭雨余韵 | permanent | 对行中所有怪物造成 `getSpellDamage(1) × echo` 伤害，每命中 1 只怪物从回收袋随机抽 1 张牌入手牌（不含自身） |
| 回响行囊 | instant | 弃回 `2×echo` 张手牌 → 从坟场发现 `2×echo` 张 → 从背包抽 `2×echo` 张 |
| 潮涌铸甲 | instant | 2选1获得永恒护符：A)瀑流铸剑—每次攻击该装备栏临时攻击+2；B)格挡铸甲—每次格挡该装备栏临时护甲+2。可叠加 |
| 点金裁决 | instant | 伤害 = `getSpellDamage(gold) × echo`，回复等量HP |
| 涌泉满手 | instant | 恢复 8 点生命，手牌补充到上限（从背包抽牌，计算差值时不算自身） |
| 不灭守护 | instant | **被动一次性**：手牌中持有时，受到致死伤害自动触发，完全抵消该次伤害，弹出「知道了」单按钮通知；触发后从手牌进入坟场。无升级版本，不可手动打出 |
| 冥途拾遗 | instant | 从坟场随机取回至多 3 张牌加入背包（不能取回自己） |
| 怀柔令 | instant | 劝降费用永久降低 2 金币，下次劝降成功率 +10% |
| 秘法精炼 | instant | 升级手牌中至多 2 张可升级的魔法牌 |

### 10.3 骑士职业魔法

| 名称 | `magicType` | `knightEffect` | 效果 |
|------|-------------|----------------|------|
| 亡者之契 | instant | `monster-recruit` | 从坟场随机获得两张怪物牌，加入手牌 |
| 浴血贪念 | instant | `blood-greed` | 获得金币 = `max(0, maxHp - hp)`，添加贪婪诅咒到背包 |
| 铠甲贯刺 | permanent | `armor-strike` | 选择装备槽的护甲值 → 对怪物造成 `getSpellDamage(armor)` |
| 残血终焉 | permanent | `missing-hp-smite` | 伤害 = `getSpellDamage(maxHp - hp)` |
| 坟火新星 | permanent | `grave-nova` | 永久：被弃置时对所有怪物造成 `getSpellDamage(3/6)` 伤害（可升 1 级） |
| 孤注一掷 | instant | `berserk-gambit` | HP降至1，本回合武器+4，每个武器栏可多攻击 2 次（与狂战叠加） |
| 战意激发 | instant | `battle-spirit` | 选择一个装备栏：每英雄回合多攻击 +1（升级 +2），且每怪物回合格挡耐久上限 +1（升级 +2）；持续到下次瀑流 |
| 回收灵焰 | permanent | `recycle-flare` | 立即恢复回收袋中的牌，从背包抽最多 1 张（升 1：2 张；升 2：3 张） |
| 混沌骰运 | permanent | `chaos-dice` | D20掷骰，5种随机效果 |
| 天眼审判 | permanent | `fate-sight` | 翻看牌堆顶4张牌，若无怪物则下次劝降率+70%/+100%（Perm 1，可升 1 级） |
| 护甲凝雷 | permanent | `armor-stun-convert` | 选择一个护盾，每1点护甲值使击晕上限+1%/+1.5%（最终值四舍五入；可升 1 级） |
| 淬炼冲击 | permanent | `overkill-upgrade` | 对一个怪物造成 `getSpellDamage(3)` 伤害。超杀：升级一张牌（Perm 1） |
| 雷涌一击 | permanent | `stun-cap-strike` | 对一个怪物造成 `getSpellDamage(⌈stunCap/4⌉)` 法伤（升级后除数变 3），`min(60%, stunCap)` 几率击晕，然后抽 1 张牌。stun 触发受 `stun-recycle` / `stun-gold` / `stun-upgrade-cap` 等护符联动。echo 让伤害 / 抽牌 ×N，但 stun 掷骰只有一次（与 `stun-strike` / 雷震击同款行为）。 |

### 10.4 混沌骰运效果表

| 骰值 | 效果 |
|------|------|
| 1–4 | 所有已装备武器/盾/预备栏 → 手牌或回收袋；清空槽位 |
| 5–8 | 发现1张职业牌（3选1） |
| 9–12 | 临时商店 |
| 13–16 | 随机怪物受到 `getSpellDamage(3)` × 2次 |
| 17–20 | 弃置2张手牌 → 从背包抽2张 |

### 10.5 其他永久魔法（通过翻转/事件获得）

| 名称 | 来源 | 效果 |
|------|------|------|
| 治愈余韵 | 治疗药水翻转 | 回复 2×echo HP |
| 暗影之刺 | 暗影契约翻转 | `scalingDamage`：叠加伤害 |
| 战血之印 | 战血荣誉翻转 | `honor-blood`：弃置时将激活行所有怪物攻击力 -2 |
| 血金术 | 奇术商会翻转 | `guild-blood-gold`：-1 HP → +2 金 × echo |
| 法术回响 | 时空收缩翻转 | 下一张魔法效果翻倍 |
| 哥布林的戏法 | 怪物击杀 | 其他手牌全部洗入背包 |

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
| 装备修复剂 | `repair-choice` | 左右装备都恢复2点耐久 或 左右装备都耐久上限+1 |
| 高级修复剂 | `boost-both-slots` | 所有装备槽加成+1 |
| 背包觉醒药 | `draw-backpack-4` | 背包容量+1，手牌上限+1，从背包抽牌 |
| 洞察药剂 | `discover-class-3` | 从职业牌堆发现3张 |
| 魔法平衡药剂 | `discover-graveyard-magic` | 从坟场魔法中选择 → 翻转 |

### 11.3 骑士职业药水

| 名称 | `potionEffect` | 效果 |
|------|----------------|------|
| 奥术灌注 | `dice-arcane-infusion` | D20 1-7：左装备栏永久攻击+永久护甲翻倍；8-14：右装备栏永久攻击+永久护甲翻倍；15-20：永久法术伤害+超杀吸血翻倍 |
| 无尽背袋灵药 | `dice-backpack-expand` | 选择：护符+1 / 装备容量+1 / 背包+3 |

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
| `amuletCapacity+1` / `amuletCapacity-1` | 护符槽±1 |
| `halveSlotDamageBonus` | 所有装备栏永久攻击加成减半 |
| `halveSpellDamageBonus` | 法术伤害加成减半 |
| `halveSlotShieldBonus` | 所有装备栏永久护甲加成减半 |
| `spellLifesteal+N` / `spellLifesteal-N` | 超杀吸血±N |
| `equipSlot1Capacity+1` / `equipSlot2Capacity+1` | 装备预备容量+1 |
| `persuadeSameTargetCostHalve` | 连续劝降同一怪物，第二次费用减半 |
| `persuadeRaceBonus:races:N` | 指定种族劝降率+N% |
| `persuadeSuccessDurabilityBonus+N` | 劝降成功的怪物起始耐久+N |
| `upgradePersuadeAmulets` | 升级已装备的劝降护符 |
| `discardHandAll` | 弃回所有手牌 |
| `deleteCard:N` | 删除N张牌（进坟场，无视其他效果） |
| `randomDiscardHand:N` | 随机弃回N张手牌 |
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
| 疾风短剑 | 3 | 3/3 | `restoreDurabilityOnKill: true`（击杀恢复耐久） |
| 碎雷战锤 | 4 | 2/2 | `weaponBonus: 1`（槽位永久+1伤害） |

### 13.2 盾牌

| 名称 | 护甲 | 耐久 | 特殊 |
|------|------|------|------|
| 铁壁塔盾 | 5 | 1/1 | `permEquipment`，`fullBlock`（完全格挡） |
| 棘刺反盾 | 4 | 2/2 | `reflectHalfDamage`（反弹半数伤害） |
| 守护圣盾 | 3 | 2/2 | `shieldPerfectBlockArmorSaveChance: 50`（完美格挡 50% 概率本次不扣护甲值） |

### 13.3 护符

| 名称 | 效果 |
|------|------|
| 双守护圣盾 | 完美格挡时永久+1护甲到该槽位 |
| 雷霆符印 | 弃牌时对随机怪物造成伤害（`max(0, 1 + permanentSpellDamageBonus)`） |
| 弧能之符 | 每次卡牌翻转（`APPLY_CARD_FLIP`，含 stay/backpack/hand/graveyard 各路由）对激活行随机怪物造成法术伤害（`max(0, 3 + permanentSpellDamageBonus)`）；多张独立触发 |

### 13.4 药水

| 名称 | 效果 |
|------|------|
| 奥术灌注 | D20掷骰：左/右装备栏永久攻防 或 永久法术伤害+超杀吸血 翻倍 |
| 无尽背袋灵药 | 选择扩容效果 |

### 13.5 英雄魔法牌

| 名称 | 效果 |
|------|------|
| 圣光秘术 | 解锁/充满圣光仪表 |
| 狂战秘典 | 解锁/充满狂战仪表 |
| 复生秘典 | 解锁/充满复生祝福仪表 |

### 13.6 魔法牌

详见 [§10.3 骑士职业魔法](#103-骑士职业魔法)

---

## 14. 英雄魔法 (Hero Magic)

### 14.1 圣光 (Holy Light)

| 属性 | 值 |
|------|-----|
| 仪表上限 | 10 |
| 充能来源 | 每次受到伤害 +1 |
| 激活条件 | 仪表已满 |
| 效果 | 回满生命（全回复 HP） |
| 使用限制 | 无；仪表满即可发动，发动后清零，需重新充能 |

### 14.2 狂战士之怒 (Berserker Rage)

| 属性 | 值 |
|------|-----|
| 仪表上限 | 8 |
| 充能来源 | 每次武器攻击 +1（闪光护符双击算+2） |
| 激活条件 | 仪表已满 |
| 效果 | 每个武器槽每回合获得1次额外攻击，且所有攻击不消耗耐久；持续到下次瀑流 |

### 14.3 复生祝福 (Revive Blessing)

| 属性 | 值 |
|------|-----|
| 仪表上限 | 3 |
| 充能来源 | 每次对自己造成伤害 +1（仅自伤，不含怪物伤害） |
| 激活条件 | 仪表已满 |
| 效果 | 失去 3 点生命，选择一个装备赋予复生（首次毁坏时以 1 耐久复活） |
| 使用限制 | 无；仪表满即可发动，发动后清零，需重新充能 |

### 14.4 解锁与充能

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
| `graveyard-recall` | 主动 | 弃回2 → 坟场3选1 |
| `discard-profit` | 被动 | 每次弃牌+2金；初始商店等级1 |
| `waterfall-heal` | 被动 | 每次瀑流回复4HP（治疗护符翻倍为8） |
| `discard-empower` | 主动 | 随机弃回1张+选槽：下次攻击+2且吸血 |
| `heal-to-damage` | 被动 | 每有效治疗5点 → 双槽各+1永久伤害；自带治愈余韵 |
| `early-surge` | 被动 | 初始瀑流+2，抽3张职业牌 |
| `shield-wall` | 被动 | 雷霆符印入背包；只出盾牌；新手武器→新手盾 |
| `blood-draw` | 主动 | -3 HP，从背包抽2张；+1手牌上限 |
| `summon-minion` | 被动 | 召唤物进背包 |

### 15.2 额外技能

- 商店花费 `SHOP_SKILL_DISCOVER_COST(5)` 金发现
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
| `SHOP_SKILL_DISCOVER_COST` | 5 |
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
| 法术伤害 +1 | 永久法术伤害 +1（15%概率出现） |
| 超杀吸血 +1 | 永久超杀吸血 +1（15%概率出现） |
| 击晕上限 +5% | 永久击晕上限 +5%（15%概率出现） |

---

## 18. 翻转系统 (Card Flip)

### 18.1 `applyCardFlip` 流程

1. 触发翻转动画
2. 根据 `destination` 放置翻转后的牌：
   - `stay`：替换原位（场上），可附带 `_flipBackCard`
   - `backpack`：放入背包
   - `hand`：放入手牌
   - 默认/`graveyard`：进坟场
3. 如果有"熔炉之心"护符 (`hasFlipGold`)：获得 `FLIP_GOLD_REWARD(4)` 金币
4. 如果有"弧能之符"护符 (`flipZapCount > 0`)：每张独立向激活行随机怪物释放一次法术伤害（`max(0, 3 + permanentSpellDamageBonus)`），通过 `card:flipShock` 事件由 UI 管线分别动画化结算

### 18.2 翻转回退 (`_flipBackCard`)

某些牌翻转后可翻回（如秘藏宝库、命运骰盅），`_flipBackCard` 存储原始状态。

---

## 19. 法术回响 (Spell Echo)

### 19.1 触发条件

- `state.doubleNextMagic === true`（由「法术回响」卡或时空收缩事件设置）
- 使用的牌是 `type === 'magic'`（不含 `type === 'curse'`，亦不含英雄魔法槽）
- 使用的牌**不是** `magicEffect === 'double-next-magic'`（自我回响保护）

### 19.2 引擎入口

`card-schema/engine.ts` 在解析每张魔法牌时：

1. 计算 `isEchoTriggered` —— 满足上述三条则为 `true`
2. 如为 `true`：清除 `state.doubleNextMagic`，记录日志 + 推送 banner
3. 如玩家在回响激活时再打一张 `double-next-magic`：仅刷新 `doubleNextMagic`（不会叠加），记录日志说明
4. 计算 `echoMultiplier = isEchoTriggered ? 2 : 1`，并将 `echoMultiplier` / `isEchoTriggered` 透传给 `def.resolver(...)` 或填入 `ExecutionContext.magic`

### 19.3 卡牌端三种实现策略

每张魔法卡的 resolver 必须显式归类到 ABC 三种之一，并在 `magic-effects.ts` 顶部审计表中登记：

| 类别 | 适用 | 实现方式 |
|------|------|----------|
| **A — Numeric** | 输出可数值化（伤害、治疗、抽牌数、金币、buff 层数等） | 把数值 `× echoMultiplier`，banner 末尾追加「（回响×2）」 |
| **B — Modal** | 需要玩家选择目标（装备栏 / 怪物 / 卡牌） | 在 `pendingMagicAction` 写入 `echoRemaining: echoMultiplier`；hero.ts 对应分支用 `maybeRepromptEcho()` 在第一次结算后再次弹窗 |
| **C — Structural** | 没有数值旋钮（瀑流重置、背包/回收袋互换等） | 二次结算实际是 no-op，但 banner 注明「回响：二次结算无额外效果」 |

> **不能省略**：即使「无额外效果」，也必须显式 banner 通知玩家，否则玩家无法察觉回响是否生效。

### 19.4 模态卡的 echoRemaining 流程

```
resolver:                       hero.ts reducer:
  patch.pendingMagicAction = {    1. 用 echoMultiplier 计算并应用一次效果
    ...,                          2. const remaining = echoRemaining - 1
    echoRemaining: echoMultiplier 3. if remaining > 0:
  }                                    maybeRepromptEcho() 写入新的 pending
                                       （prompt 加上「（回响：第 k/N 次）」）
                                  4. else: applyFinalizeMagic()
```

`maybeRepromptEcho()`（`game-core/rules/hero.ts`）是统一的「再次弹窗」helper：
- 入参：`prevPending`（带 `echoRemaining`）、`nextPending`（调用方计算）、`banner`
- 行为：写 `patch.pendingMagicAction = nextPending`、写 banner、推日志、`applyPatch`
- 仅在 `echoRemaining > 1` 时返回新的 `ReduceResult`，否则返回 `null` 让调用方走最终结算

### 19.5 来源

- 「法术回响」牌（`magicEffect: 'double-next-magic'`）
- 时空收缩事件（`event-fortify` 等触发逻辑）

### 19.6 边界规则

- **诅咒**（`type === 'curse'`）永远不消耗也不触发回响（引擎守卫）
- **英雄魔法**（hero magic / 法力槽）不在回响范围内
- **double-next-magic 自身**：永远不会被回响触发；当回响已激活再打 `double-next-magic` 时，旧回响被「刷新」（仍仅生效一次），不会叠加为 ×4
- **modal 卡的二次弹窗**：若没有合法的第二目标（如对怪物造成伤害但场上仅剩一个怪物），自动结束并直接 finalize

---

## 20. 关键常量表

| 常量 | 值 | 所在文件 |
|------|-----|---------|
| `INITIAL_HP` | 20 | constants.ts |
| `HAND_LIMIT` | 6 | constants.ts |
| `BASE_BACKPACK_CAPACITY` | 15 | constants.ts |
| `MAX_AMULET_SLOTS` | 2 | GameBoard.tsx |
| `BALANCE_ATTACK_BONUS` | 3 | GameBoard.tsx |
| `BALANCE_SHIELD_BONUS` | 3 | GameBoard.tsx |
| `BALANCE_ATTACK_PENALTY` | 1 | GameBoard.tsx |
| `BALANCE_SHIELD_PENALTY` | 1 | GameBoard.tsx |
| `STRENGTH_SELF_DAMAGE` | 2 | GameBoard.tsx |
| `FLIP_GOLD_REWARD` | 4 | GameBoard.tsx |
| `DEFEAT_ANIMATION_DURATION` | 950ms | GameBoard.tsx |
| `COMBAT_ANIMATION_DURATION` | 1200ms | GameBoard.tsx |
| `COMBAT_ANIMATION_STAGGER` | 180ms | GameBoard.tsx |
| `SHOP_HEAL_COST` | 5 | GameBoard.tsx |
| `SHOP_HEAL_AMOUNT` | 5 | GameBoard.tsx |
| `SHOP_LEVEL_UP_COST` | 10 | GameBoard.tsx |
| `MAX_SHOP_LEVEL` | 3 | GameBoard.tsx |
| `SHOP_SKILL_DISCOVER_COST` | 5 | GameBoard.tsx |
| `INITIAL_GOLD` | 10 | constants.ts |
| `DECK_SIZE` | 64 | GameBoard.tsx |
| D20 50%阈值 | 1–10 vs 11–20 | 通用 |
| 坟火新星基础伤害 | 3 / 6（升级后） | GameBoard.tsx |
| 雷霆符印伤害 | `max(0, 1 + permanentSpellDamageBonus)` | GameBoard.tsx |
| 弧能之符伤害 | `max(0, 3 + permanentSpellDamageBonus)`（每张独立结算） | GameBoard.tsx |
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
