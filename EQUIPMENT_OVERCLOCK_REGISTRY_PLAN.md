# 装备超频 注册表化重构 — 详细 Plan

> Goal: 把「装备衍生效果在装备超频光环下额外触发 1+N 次」的逻辑，从 18+ 处手写
> `for (let i = 0; i < overclockExtra; i++)` 散落实现，统一收敛到一套**注册表 + Runner**
> 架构。新加装备字段时，只要把 handler 注册到对应表面，**自动**获得 1+N 倍触发，
> 永久消除「漏写循环」类 bug。
>
> Constraint: **完全不产生 regression**。任何一处可见行为变化都必须显式 ack 并写进 PR
> 描述里（含「哪个测试 case 抓到」+「为什么这是 intended improvement 而非 regression」）。

---

## 0. 当前现状速查

### 已经「通用化」的两个表面（不在本重构范围内）

| 表面 | 实现 | 通用机制 |
|---|---|---|
| `onEquipEffect` | `card-schema/on-equip.ts:executeOnEquip` | 注册表整体 wrap，handler 自动 1+N 次 |
| 装备 `lastWords` | `equipment-effects.ts:applyOneEquipmentLastWordsIteration` | 整个迭代 body 在 `1 + lastWordsExtraTriggerCount + overclockExtra` 循环里 |

**重构不动这两条**——它们已经是目标形态，且没有「漏写循环」风险。

### 18 处手写散落实现（重构对象）

按表面分组（`combat.ts`、`equipment-effects.ts` 行号）：

| # | 表面 | 文件:行 | 字段 / 触发 | 当前语义 | 备注 |
|---|---|---|---|---|---|
| 1 | shield-reflect | combat.ts:1873 | dragonBreath retaliation（盾反弹路径里） | replay | |
| 2 | shield-reflect | combat.ts:1894 | boss retaliation（盾反弹路径里） | replay | |
| 3 | attack | combat.ts:2552 | `healOnAttack` | replay | |
| 4 | attack | combat.ts:2572 | `drawOnAttack` | replay | |
| 5 | attack | combat.ts:2656 | `bossRetaliationDamage`（攻击 reducer 内） | replay | |
| 6 | attack | combat.ts:2817 | overkill `attackEffectiveLifesteal` | replay (× hitCount) | |
| 7 | attack | combat.ts:2825 | `overkillDraw` | replay | |
| 8 | attack | combat.ts:2886 | `overkillAmplifyMissile` | replay | |
| 9 | attack | combat.ts:3162 | `healOnKill` | replay | |
| 10 | attack | combat.ts:3189-3192 | `killGoldScaling` | counter+multiplier | 第 1 次推 counter，N 次只加金 |
| 11 | attack | combat.ts:3277 | 怪物侧 `dragonDamageRetaliation` | replay | |
| 12 | attack | combat.ts:3468 | `postAttackHandRecycle` | replay | |
| 13 | attack | combat.ts:3490 | `postAttackSpellDamage`（奥术之刃附魔） | replay (per-iter 重选目标) | |
| 14 | block | combat.ts:3772-3783 | dual-guard 完美格挡奖励（amulet） | multiply | `dualGuardCount * (1+N)` 直接乘 |
| 15 | block | combat.ts:3792-3799 | `shieldPerfectBlockMaxHpGain`（砺心之盾） | multiply | |
| 16 | block | combat.ts:3807-3811 | `perfectBlockSpawnMissiles`（弹幕护盾） | multiply | |
| 17 | block | combat.ts:3853-3863 | `blockGrantTempArmorToOther`（守望者链接） | multiply | |
| 18 | block | combat.ts:3882 | 盾侧 `dragonDamageRetaliation` | replay | |
| 19 | block | combat.ts:4273 | shield-reflect 伤害（连击 follow-up 路径） | replay | |
| 20 | block | combat.ts:4314 | shield-reflect 伤害（主反弹路径） | replay | |
| 21 | shield-reflect | combat.ts:1761 | reflect 伤害本身 | multiply | |
| 22 | durability-loss | equipment-effects.ts:1132-1138 | `mineDamageBoostPerDur`（地雷加成） | replay | |
| 23 | durability-loss | equipment-effects.ts:1153 | `bleedEffect` | multiply | `3 * (1+N)` |
| 24 | durability-loss | equipment-effects.ts:1213-1223 | `wraith-rebirth` | extra-rolls | 主 roll 失败时 N 层每层多摇 1 次 |
| 25 | durability-loss | equipment-effects.ts:1267-1291 | `golemLayerLossReflect` | multiply | `baseReflectDmg * (1+N)` |

**实际去重的 distinct sites**: 25 处（部分 shield-reflect 在两条路径里复用）。

### 当前**完全没被 overclock wrap** 的潜在漏洞（也要在重构里覆盖）

User 明确要求「monster 装备也要覆盖」。审计 combat.ts 后发现以下字段**当前完全没接入 overclock**——它们是潜在的 bug，应该顺手在 refactor 里补齐：

| # | 表面 | 文件:行 | 字段 / 触发 | 备注 |
|---|---|---|---|---|
| N1 | attack | combat.ts:2784 | `swarmCorrode`（怪物装备攻击后额外吃目标 1 层） | 怪物装备字段，未 overclock |
| N2 | attack | combat.ts:3024 | `onAttackEffect: 'steal-gold-X'`（哥布林窃金，含 `goblinStealScale` 自身成长） | 怪物装备字段 |
| N3 | attack | combat.ts:3068-3081 | `monsterSpecial: 'bone-regen'\|'skeleton-king'` 武器耐久救命骰 | 跟 wraith-rebirth 同属 extra-rolls |
| N4 | attack | combat.ts:3507 | `eliteDoubleAttack` 连击骰 | extra-rolls |
| N5 | block | combat.ts:3942 | `bone-regen`/`skeleton-king` 盾耐久救命骰 | extra-rolls |

> N6（`swarmBugletShield` 跳耐久 / `dragonBleedDestroy` 摧毁对面 / `swarm-elite` 替换对面 buglet）是「条件性 skip」/「目标摧毁后再触发即 no-op」语义，**不**纳入 overclock——重复触发没有玩家可见效果，浪费循环。

### 设计上**显式排除**（任何 PR 都不要碰）

> 引自 `equipment-overclock.ts` 注释：装备超频不复制以下行为，重构后 contract 保持一致。

- 武器挥击伤害本身、格挡判定本身（armor 计算 / durability tick）
- 手牌卡 `onDiscardDamage` / `onEnterHand`
- 护符效果
- 怪物 `enterEffect` / 建筑 / row-level 效果

---

## 1. 目标架构

### 1.1 注册表布局

```
client/src/game-core/card-schema/
└── equipment-derived/
    ├── registry.ts        # 4 个 Map<id, handler>，1 个通用 runner
    ├── attack.ts          # registerOnAttackAll([{ id, handler }...])
    ├── block.ts           # registerOnBlockAll(...)
    ├── shield-reflect.ts  # registerOnShieldReflectAll(...)
    └── durability-loss.ts # registerOnDurabilityLossAll(...)
```

`card-schema/index.ts` 在末尾 import 这 4 个 module 触发自动注册（mirror 现有
`./definitions/equipment` 的 pattern）。

### 1.2 Handler 签名（统一 replay-only 语义）

```ts
// registry.ts
export interface EquipmentDerivedCtx<S extends EquipmentDerivedSurface> {
  state: GameState;
  slotItem: GameCardData;
  slotId: EquipmentSlotId;

  // 共享可变累加器（runner 注入；handler 在这上面写）
  patch: Partial<GameState>;
  sideEffects: SideEffect[];
  enqueuedActions: GameAction[];

  // RNG：handler 必须 read-then-write `ctx.rng`
  rng: RngState;

  // 表面专属字段（discriminated union）
  surface: S;
  surfaceCtx: SurfaceCtxMap[S];

  // 「这是不是首次触发」标记 —— handler 用它判断
  // 「log 只 emit 一次」「counter 只推一次」「dice 只摇一次」
  isFirstIteration: boolean;
}

export type SurfaceCtxMap = {
  attack: AttackCtx;
  block: BlockCtx;
  'shield-reflect': ShieldReflectCtx;
  'durability-loss': DurabilityLossCtx;
};

export interface HandlerResult {
  /** Did this handler do meaningful work? Runner uses this to decide
   *  whether to schedule N more iterations. */
  fired: boolean;
}

export type EquipmentDerivedHandler<S extends EquipmentDerivedSurface> = (
  ctx: EquipmentDerivedCtx<S>,
) => HandlerResult;
```

### 1.3 Runner（核心）

```ts
// registry.ts
export function runEquipmentDerivedHandlers<S extends EquipmentDerivedSurface>(
  surface: S,
  baseCtx: Omit<EquipmentDerivedCtx<S>, 'isFirstIteration'>,
): { fired: boolean; rng: RngState } {
  const handlers = registries[surface];
  let anyFired = false;
  let rng = baseCtx.rng;
  const overclockExtra = equipOverclockExtraTriggers(baseCtx.state);

  for (const [id, handler] of handlers) {
    if (!handlerAppliesTo(handler, baseCtx.slotItem)) continue;

    // First (mandatory) call
    const ctxFirst = { ...baseCtx, rng, isFirstIteration: true };
    const r1 = handler(ctxFirst);
    rng = ctxFirst.rng;
    if (!r1.fired) continue;

    anyFired = true;

    // Overclock replay
    for (let i = 0; i < overclockExtra; i++) {
      const ctxN = { ...baseCtx, rng, isFirstIteration: false };
      handler(ctxN);
      rng = ctxN.rng;
    }
  }

  if (anyFired && overclockExtra > 0) {
    baseCtx.sideEffects.push({
      event: 'combat:equipOverclockTriggered',
      payload: { surface: surfaceLabelFor(surface), count: overclockExtra },
    });
  }

  return { fired: anyFired, rng };
}
```

### 1.4 Replay-safety contract（handler 必须遵守）

每个 handler 会被 runner 调用 `1 + N` 次（N = overclock 层数）。**每次调用必须
是数学等价的**——重复 N 次的累计效果 == 老代码里手写循环 N 次的效果。

| 操作 | 写法 | 为什么 |
|---|---|---|
| **改 patch 字段** | `patch.gold = (patch.gold ?? state.gold ?? 0) + amount` | 每次迭代都加一次，N+1 次自然累加 |
| **enqueue action** | `ctx.enqueuedActions.push({ type: 'HEAL', amount: 5 })` | 每次都 push 一条，N+1 条 HEAL action |
| **emit 副作用 log** | `if (ctx.isFirstIteration) ctx.sideEffects.push({ event: 'log:entry', ... })` | log 只在第 1 次 emit，避免日志刷屏 |
| **emit 战斗 banner** | 同上，`if (isFirstIteration)` | 同上 |
| **dice / RNG 消费** | `const [v, next] = nextInt(ctx.rng, ...); ctx.rng = next;` | RNG 通过 ctx 透传 |
| **更新 counter / kill counter** | `if (ctx.isFirstIteration) { patch[slotId] = { ...item, killGoldCounter: ... } }` | counter 是「触发了几次」记录，按真实游戏意图只算 1 次 |
| **extra-rolls 救命语义**（wraith-rebirth） | 在 handler 内独立处理（见 1.5） | 这种语义不能简单 replay——见下 |

### 1.5 extra-rolls 语义如何「替换」成 replay-safe？

旧 `wraith-rebirth` 是「主 roll 失败时多摇 N 次」。等价 replay-safe 写法：

```ts
// handler 内
if (!ctx.isFirstIteration) {
  // 已经在前一次迭代里摇过救命骰了？读 ctx 上的小状态位
  if ((ctx.surfaceCtx as DurabilityLossCtx).rebirthAlreadySucceeded) {
    return { fired: false };
  }
}

const [success, nextRng] = nextBool(ctx.rng);
ctx.rng = nextRng;
if (success) {
  // 标记「成功」放到 ctx 里，让后续迭代早返
  (ctx.surfaceCtx as DurabilityLossCtx).rebirthAlreadySucceeded = true;
  // ... 应用重生效果（仅在第一次触发成功的迭代里写 patch）
}
return { fired: true };
```

**即**：handler body 里允许有「跨迭代共享的小状态」放在 `ctx.surfaceCtx` 上，
runner 不动它，handler 自己读写。这是 replay-only 的边界 escape hatch——必须显式
通过 surfaceCtx 字段标注，不允许走 closure / module-level state。

### 1.6 multiply 语义如何「替换」成 replay-safe？

旧 `bleedEffect: bonus * (1+N)` 单次写。Replay 等价：每次迭代加 `bonus`，patch 里
read-then-write 累加。结果完全一致。

```ts
// handler 内
const bleedBonus = 3;
const item = (ctx.patch[ctx.slotId] ?? ctx.state[ctx.slotId]) as GameCardData;
ctx.patch[ctx.slotId] = {
  ...item,
  attack: (item.attack ?? item.value) + bleedBonus,
  // ...
} as EquipmentItem;
if (ctx.isFirstIteration) {
  ctx.sideEffects.push({ event: 'log:entry', payload: {
    type: 'equip',
    message: `${item.name} 流血：攻击力 +${bleedBonus * (1 + equipOverclockExtraTriggers(ctx.state))}！`
  }});
}
return { fired: true };
```

注意 log 文案展示**最终累计**值（让玩家看到 ×3），但内部走 N+1 次累加。这跟当前
`bleedEffect` 行为一致。

### 1.7 counter+multiplier 语义如何「替换」？

旧 `killGoldScaling`：第 1 次推 counter（金币 = current counter）+ N 次只加 counter
等量金币（不推 counter）。Replay 等价：

```ts
// handler 内
const goldAmount = item.killGoldCounter ?? 2;
ctx.patch.gold = (ctx.patch.gold ?? ctx.state.gold ?? 0) + goldAmount;

if (ctx.isFirstIteration) {
  // 推 counter + log
  ctx.patch[ctx.slotId] = { ...item, killGoldCounter: goldAmount + 1 } as EquipmentItem;
  ctx.sideEffects.push({ event: 'log:entry', payload: { ... `获得 ${goldAmount} 金币` ... }});
}
return { fired: true };
```

每次迭代都加 `goldAmount` 金币（×(1+N) 总额）；counter 只在第 1 次推。等价于旧实现。

---

## 2. 表面专属 Ctx 设计

### 2.1 `attack` 表面

时机：`reducePerformHeroAttack` 内、伤害结算完毕后、durability 处理前。

```ts
export interface AttackCtx {
  targetMonster: GameCardData;
  workingMonster: GameCardData;     // 可能被前面 swarm-corrode 改了 layer
  monsterDefeated: boolean;
  finalDamage: number;
  baseDamage: number;
  isCrit: boolean;
  overkillHitCount: number;          // computed once before handlers run
  weaponDestroyed: boolean;          // 通常 false 在这个时机；durability 阶段晚于此
  isMonsterEquip: boolean;
  isBuildingTarget: boolean;
  attackEffectiveLifesteal: number;
  amuletEffects: ActiveAmuletEffects;
  // —— scratch state for cross-iteration handlers if needed ——
}
```

### 2.2 `block` 表面

时机：`reduceResolveBlock` 内、armor/durability 计算完毕后、reflect dispatch 前。

```ts
export interface BlockCtx {
  monster: GameCardData;
  pendingBlock: PendingBlockState;
  blockSlotId: EquipmentSlotId;
  isPerfectBlock: boolean;
  isFullBlockShield: boolean;
  isMonsterEquipShield: boolean;
  storedCap: number;
  amuletEffects: ActiveAmuletEffects;
  // —— for reflect handlers ——
  reflectDmg: number;        // 0 if no reflect
  reflectSourceName: string;
}
```

### 2.3 `shield-reflect` 表面

时机：`reduceApplyShieldReflect` 内、damage 应用前。

```ts
export interface ShieldReflectCtx {
  monster: GameCardData;
  damageBase: number;            // raw reflect damage before overclock multiply
  sourceName: string;
  layersBefore: number;
}
```

### 2.4 `durability-loss` 表面

时机：`computeDurabilityLossEffects` 内、`updatedItem` 已设置 newDurability 后。

```ts
export interface DurabilityLossCtx {
  prevDur: number;
  newDur: number;
  durLost: number;
  isMonsterEquip: boolean;
  otherSlotId: EquipmentSlotId;
  otherItem: GameCardData | null;
  // —— mutable: handlers may rewrite this ——
  updatedItem: GameCardData;     // bleed / wraith-rebirth / armor refresh 都写它
  // —— output (for caller; runner doesn't touch) ——
  golemReflectDamage?: { targetId: string; damage: number; slotId: EquipmentSlotId };
  // —— scratch state ——
  rebirthAlreadySucceeded?: boolean;
}
```

注意 `updatedItem` 是个 ctx 上的可变字段——handler 可以读写它，runner 在所有 handler
跑完后从 ctx 上读出最终的 updatedItem 返回给 caller。**不**走 `patch[slotId]`，
因为 caller 端 (`computeDurabilityLossEffects`) 后面还要做 armor strip + 整体 commit。

---

## 3. 迁移阶段（按 PR 切分）

每个 PR 独立可审、独立可 merge、独立可 revert。所有 PR 都遵守 `no-mixed-feature-and-cleanup-commits`
规则——只做一件事。

### PR-1：注册表基础设施（零行为变化）

**Touches**:
- 新文件：`card-schema/equipment-derived/registry.ts`（types + 4 个空 Map + runner）
- 新文件：`card-schema/equipment-derived/{attack,block,shield-reflect,durability-loss}.ts`（空骨架，只 import registry）
- 新文件：`card-schema/equipment-derived/index.ts`（barrel）
- 修改：`card-schema/index.ts` 加一行 `import './equipment-derived'`
- 新测试：`__tests__/equipment-derived-registry.test.ts`
  - registry 导出符号检查
  - 空注册表下 runner 调用 = noop（不 push side effect、不修 patch）
  - 注册一个 dummy handler，验证 1+N 次调用、`isFirstIteration` 正确、RNG 正确透传、ctx 累加器正确

**验收**：
- `npx tsc --noEmit` clean
- `npx vitest run` 全绿（包括所有现有 `equip-overclock-aura.test.ts`）
- 战斗、攻击、格挡所有手玩路径**逐字保持原样**——这个 PR 没改任何 reducer

### PR-2：durability-loss 表面迁移（4 个老 + 0 个新加，最简单）

> **从这条最简单的表面开始，验证整套设计**。

**Touches**:
- `equipment-derived/durability-loss.ts` 注册 4 个 handler：
  - `mine-damage-boost`（id=`mine-damage-boost`）
  - `bleed-effect`
  - `wraith-rebirth`
  - `golem-layer-loss-reflect`
- 修改 `equipment-effects.ts:computeDurabilityLossEffects`：删掉 4 段 `if (slotItem.X)` 块 + 所有
  `for (let i = 0; i < overclockExtra; i++)` 循环；改成调一次 `runEquipmentDerivedHandlers('durability-loss', ctx)`。
- 保留：mine-damage-boost 之外的耐久 tick / armor strip / `updatedItem` rebuild 路径不动。

**测试加固**：
- 沿用所有现有 `equip-overclock-aura.test.ts` cases 不动
- 加 per-handler 单元测试（直接 dispatch + 断言），覆盖：
  - `mine-damage-boost` ×0/×1/×3 relics
  - `bleed-effect` ×0/×1/×3 relics（断言 `attack` 字段累加值）
  - `wraith-rebirth` ×0/×1/×3 relics（断言救命概率提升、`wraithRebirthUsed` 一次性消耗）
  - `golem-layer-loss-reflect` ×0/×1/×3 relics

**验收**：
- 所有现有测试 + 新测试全绿
- `combat:equipOverclockTriggered` side effect payload 完全等价（surface, count）
- 手玩 checklist：
  - 装备引雷阵锋 → 攻击触发耐久 -1 → 检查 globalMineDamageBonus 累加（开/不开 overclock 对比）
  - 装备 bleed 武器（dragon 类）→ 攻击 → 攻击力 +3 / +6 / +12（×0/×1/×3 relics）
  - 装备 wraith → 受伤至 1 耐久 → 救命率 50% / 75% / 87.5%
  - 装备 golem → 受到伤害 → 反震伤害 ×1 / ×2 / ×4

### PR-3：shield-reflect 表面迁移（2 个 handler，最小验证 cross-reducer）

**Touches**:
- `equipment-derived/shield-reflect.ts`：
  - `reflect-damage-multiplier`（处理 reflect 伤害本身的 ×(1+N)）
  - `dragon-breath-retaliation`
  - `boss-retaliation`
- 修改 `combat.ts:reduceApplyShieldReflect` 删手写循环 + 调 runner

**测试加固**：
- 现有 `equip-overclock-aura.test.ts` 是否覆盖 shield-reflect surface？审计后补 case
- 手玩 checklist：装备一把 reflect 盾 + 一只 dragon-retaliation monster → 触发反弹 → 检查多次反弹

### PR-4a：attack 表面迁移（基础类，~6 个 handler）

**Touches**: `combat.ts:reducePerformHeroAttack` 的「攻击衍生效果」段落（line 2545–2890 区间）拆解：
- `heal-on-attack`
- `draw-on-attack`
- `boss-retaliation-on-hit`
- `overkill-lifesteal`
- `overkill-draw`
- `overkill-amplify-missile`

每个 handler 用 `AttackCtx.overkillHitCount > 0` 等条件 gate。

**关键风险**：这是个 1000+ 行的 reducer，handlers 之间有顺序依赖（overkill 必须在伤害结算后、
defeat 判定后；killGold 必须在 monster defeated 后）。**Runner 内部按注册顺序跑**，
注册顺序必须严格 mirror 旧代码的 if-block 顺序。

**测试**：
- 现有 `equip-overclock-aura.test.ts` 已经覆盖 healOnAttack、killGoldScaling 等的 ×0/×1/×2/×3 矩阵；保持绿
- 加 per-handler 单元测试

### PR-4b：attack 表面迁移（剩余类，~5 老 handler + 5 新加 monster-equip handler）

**Touches**: `combat.ts:reducePerformHeroAttack` 剩余段落（line 3140–3535 区间）：
- 老的：`heal-on-kill`、`kill-gold-scaling`、`monster-dragon-retaliation`、`post-attack-hand-recycle`、`post-attack-spell-damage`
- **新加（之前没 wrap 的 monster 装备字段）**：
  - `swarm-corrode-on-attack`
  - `goblin-steal-gold-on-attack` (含 `goblinStealScale` 自身成长)
  - `bone-regen-weapon-durability-save`（替代 line 3068-3081 的 inline dice）
  - `elite-double-attack-roll`（替代 line 3507 的 inline dice）

新加的 monster-equip handler 需要新写 `equip-overclock-aura.test.ts` 测试 case：
- `swarmCorrode` ×0 → 1 层 / ×1 → 2 层 / ×2 → 3 层
- 哥布林 `steal-gold-3` ×0 → +3 金 / ×1 → +6 金 / `goblinStealScale` ×0 → +3 stat / ×1 → +6 stat
- `bone-regen` 武器 ×0 → 40% / ×1 → 64% / ×2 → ~78%（救命率累计）
- `eliteDoubleAttack` ×0 → 50% / ×1 → 75% / ×2 → 87.5%

**关键风险**：「extra rolls」语义的 dice handler 需要正确写 `rebirthAlreadySucceeded` 类的
ctx scratch 状态。

### PR-5：block 表面迁移（6 老 + 1 新 monster-equip）

**Touches**: `combat.ts:reduceResolveBlock` 的衍生效果段落：
- `dual-guard-perfect-block`（amulet）
- `shield-perfect-block-max-hp-gain`
- `perfect-block-spawn-missiles`
- `block-grant-temp-armor-to-other`
- `dragon-damage-retaliation-shield`
- `shield-reflect-dmg-main`
- `shield-reflect-dmg-followup`（连击路径）
- **新加**：`bone-regen-shield-durability-save`（替代 line 3942 的 inline dice）

### PR-6：收尾 & 防御

**Touches**:
- 删除 `combat.ts` / `equipment-effects.ts` 里残留的 `equipOverclockExtraTriggers` import（除了 `equipment-derived/registry.ts` 里）
- 加 cursor rule：`.cursor/rules/equipment-derived-via-registry.mdc`
  - 内容：「任何攻击/格挡/反弹/耐久损失派生效果必须通过 `equipment-derived/<surface>.ts` 注册，
    禁止在 reducer 里写 `if (slotItem.X) { for (let i = 0; i < equipOverclockExtraTriggers(state); i++) }`」
- 可选：加 ESLint custom rule（或者 simple `Grep` test 在 vitest 里）防止
  `equipOverclockExtraTriggers` 在 `equipment-derived/` 之外被 import

---

## 4. 回归测试策略

### 4.1 现有测试 baseline（**绝对不能破**）

- `client/src/game-core/__tests__/equip-overclock-aura.test.ts` 现有所有 cases
- 所有装备 `__tests__/*` 下的现存 tests（含 `equipment-break-routes-to-graveyard.test.ts`、
  `wraith-amulet-perm.test.ts`、`monster-graveyard-layer-reset.test.ts`、各种盾测试）

每个 PR merge 前：`npx vitest run` 必须 0 红。

### 4.2 每个 PR 必加的新测试

对每个新注册的 handler：
1. **基线触发**（无 overclock）：触发条件成立时，`fired === true`，patch 改对了
2. **不触发条件**：条件不成立（如装备不带这个字段）时，`fired === false`
3. **overclock ×N 矩阵**：N=1, 2, 3 都正确 1+N 倍效果
4. **overclock 关闭**（recycle bag ≤ 10）：N 不影响行为
5. **`combat:equipOverclockTriggered` side effect**：surface label 正确、count 正确
6. **RNG determinism**：seeded RNG 跑两次得到同样结果

### 4.3 跨 PR 的「集成」测试（PR-2 之后每个 PR 必跑）

建一个 `__tests__/equip-overclock-end-to-end.test.ts`，构造完整的「英雄装备 +
怪物在场 + relics 状态」fixture，dispatch 完整动作链（PERFORM_HERO_ATTACK / RESOLVE_BLOCK），
断言**老代码 vs 新代码的 ReduceResult 完全等价**：
- 同样的 patch（`gold` / `hp` / `equipmentSlot1` / `permanentMagicRecycleBag` 等）
- 同样的 sideEffects 数组（按顺序断言）
- 同样的 enqueuedActions

为了能做这种「等价对比」，PR-2 ~ PR-5 在迁移**当前 PR 涉及的 handler** 时，
保留**其它 handler** 走老路径，让对比测试能稳定运行。直到 PR-6 全部清理。

### 4.4 手玩 checklist（每个 PR 跟随）

每个 PR 描述里附一份手玩验证清单。Reviewer 自己跑一遍游戏：
- 拿 装备超频药 喝 ×N 次
- 装备覆盖该 PR 涉及的字段的装备
- 触发一系列动作，截图 banner / log 跟之前对比

---

## 5. 风险登记 & 缓解

### Risk A：Handler 顺序依赖

**问题**：当前 reducer 里 if-block 顺序对结果有影响。例：
- swarm-corrode（吃 1 层）必须在 monster-defeated 判定**之前**或**之后**？答案是之后——
  老代码先判 defeated，再吃 corrode，再如果 corrode 把最后一层吃光则二次 defeated。
- killGoldScaling 必须在 monster-defeated **之后**才能拿金。
- post-attack-spell-damage 是「再打一次随机目标」，必须在 monster-defeated 之后
  （死目标会被排除，pool 重新取）。

**缓解**：
- Runner 按 handler 注册顺序跑（`Map` insertion order in JS = 注册顺序）。
- 每个 surface 的 handler 注册文件里**写死注册顺序**，配合注释「//
  ORDER MATTERS: this handler reads `monsterDefeated` set by the previous handler」
- PR-4 的 attack 表面迁移做 phase-by-phase：先把所有「pre-defeat」handler 抽走、
  跑测试；再抽 post-defeat handler。

### Risk B：Mutable working state（workingMonster, weaponDestroyed 等）

**问题**：`workingMonster` 在 reducer 里是 mutable，被多个 if-block 改写。Handler 化后
怎么共享？

**缓解**：
- `AttackCtx.workingMonster` 是 mutable 字段。Handlers 直接 `ctx.surfaceCtx.workingMonster = ...`
  写新版本。
- Runner 不动 ctx.surfaceCtx 字段。
- Reducer 在 runner 之前 init `workingMonster`、runner 之后从 ctx 读出最终的写回 patch。

### Risk C：Side effect log 重复 emit

**问题**：log 应该 emit 1 次，但很多老 handler 是「effect + log 都在 if 里」，handler 化后
要拆开。

**缓解**：
- 用 `ctx.isFirstIteration` 包 log push，contract 在 1.4 文档化。
- PR-2 ~ PR-5 的 per-handler 测试都断言 `sideEffects.filter(e => e.event === 'log:entry').length`
  跟老代码一致（只 emit 1 次 log，但 effect-side-effect 如 `equipment:lastWordsHeal` 可以 emit N+1 次）。

### Risk D：RNG drift

**问题**：handler 消费 RNG 不一致 → 同 seed 跑出不同结果，破坏 deterministic replay。

**缓解**：
- Runner 严格按 ctx.rng 接力：每个 handler 调用前 fresh ctx.rng 来自上一个 handler 的写出。
- 加 RNG determinism 测试（4.2.6）覆盖每个 dice-using handler。

### Risk E：新加的 monster-equip handler「行为变化」

**问题**：PR-4b 给 `swarmCorrode` / `goblinStealGold` / `boneRegenSave` / `eliteDoubleAttack`
新加 overclock 接入——这是新行为，老 user 可能感知到「装备超频突然变强了」。

**缓解**：
- 这些字段当前**没有任何**装备使用（审计 `knightDeck.ts` / `deck.ts` 后确认），或者使用很少
  → 新 monster 装备的玩家从未体验过当前的「不增益」行为，所以不存在「玩家熟悉的旧行为」可以破坏。
- 但还是要在 PR-4b 描述里**显式声明**：「这是 intended improvement，不是 regression。
  之前的实现是漏写循环，本 PR 顺手补齐。」
- 跟 user 确认是否要在 changelog / patch notes 里跟玩家说。

### Risk F：Overclock side effect (`combat:equipOverclockTriggered`) duplication

**问题**：当前每个表面 emit **一条** overclock triggered side effect。Runner 怎么保证 emit
次数等价？

**缓解**：
- Runner 在所有 handler 跑完后**统一**emit 一条 surface 级 side effect（见 1.3）。
- 这跟现有行为完全一致：「这个 reducer 内任何一个 overclock 触发一次，就 push 一条」。

### Risk G：`shieldExtraBlocksPerDurability` / 进化 / fullBlock 等**与 overclock 无关**的旁路逻辑

**问题**：reduceResolveBlock 内除了 overclock 相关的 if-block，还有大量「进化甲壁」/
「铁壁塔盾 fullBlock 一次性」/「extra blocks per durability」等复杂逻辑。Handler 化时
**绝不**碰这些——它们不属于 overclock 表面。

**缓解**：
- PR-5 严格只迁移已有 `for (let i = 0; i < overclockExtraBlock; i++)` 循环对应的 if-block。
- 其它 if-block 留在 reducer 里不动。
- Diff review 时强制找「我有没有动到不该动的代码」。

---

## 6. 「行为完全不变」的 invariants check（每个 PR 自检表）

每个 PR 描述里都贴这张表，Reviewer 看着勾：

- [ ] Touch 列表只包含本 PR 阶段对应的文件
- [ ] 老的 `for (let i = 0; i < overclockExtra; i++)` / `* (1 + overclockExtra)`
  循环全部删除（除了被 escape-hatch 的少数特殊 dice 路径）
- [ ] `equipOverclockExtraTriggers` import 只剩在 `equipment-derived/registry.ts`
  和**本 PR 不动的**其它 reducer 文件里
- [ ] 现有所有测试 + 新加测试 全绿
- [ ] 等价对比测试（4.3）的 fixture 覆盖本 PR 涉及的所有 handler
- [ ] 手玩 checklist 通过（截图对比 / log 对比）
- [ ] PR 描述里写明：「迁移了 X 个 handler，新加了 Y 个 handler 给之前漏的字段」
- [ ] 未碰任何 onEquip / lastWords / 非 overclock 相关代码

---

## 7. 时间估算

| PR | 范围 | 估算 |
|---|---|---|
| PR-1 | 基础设施 | 0.5–1 天 |
| PR-2 | durability-loss (4 handler) | 0.5–1 天 |
| PR-3 | shield-reflect (2 handler) | 0.5 天 |
| PR-4a | attack 基础类 (6 handler) | 1–2 天 |
| PR-4b | attack 剩余 + 新增 (10 handler) | 2–3 天 |
| PR-5 | block (8 handler) | 1.5–2 天 |
| PR-6 | 收尾 + rule | 0.5 天 |

**总计**：6.5–10 天专注工作时间（含写测试 + 手玩验证 + 修 bug）。

---

## 8. 接下来的工作流

1. **你 review 这份 plan**——确认架构、handler 列表、PR 切分、风险缓解都 OK
2. 如果有调整：在这份文档里直接改 / 我来改
3. 确认后：开 PR-1（基础设施）
4. 每个 PR 之间停下来给你 review，确认无 regression 才进下一个 PR
5. 整套完成后，删除这份 plan 文档（迁移完成的标志）

