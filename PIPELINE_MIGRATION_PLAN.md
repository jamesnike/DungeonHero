# Pipeline Migration Plan: Hooks → Reducer + Action Queue

## 现状总结

| 维度 | 现状 |
|------|------|
| game-core 基础设施 | ✅ reducer, pipeline (processStep/drain), queue, event-bus, 107 action types |
| useEngineSetter | ✅ 已完全删除 |
| 所有状态变更走 dispatch | ✅ 但 ~505 处仍用 SET_STATE 桥接 |
| **规则逻辑在 reducer 中** | ❌ 大量逻辑仍在 hooks 中命令式执行 |
| **动画不决定规则** | ❌ 多处 setTimeout/await 后才执行规则判断 |
| **pipeline 驱动流程** | ❌ pipeline 存在但大量流程不走 pipeline |

## 核心问题

Hooks 中存在 4 种反模式：

### 反模式 A：重复实现（Reducer 已有实现，Hook 又实现一遍）
```
// rules/combat.ts 已经实现了 DEAL_DAMAGE_TO_MONSTER
// 但 useCombatActions.ts 的 dealDamageToMonster() 又写了一遍相同逻辑
```
**涉及**: dealDamageToMonster, handleMonsterDefeated, executeLastWords, applyShieldReflect,
          applyDragonBreathRetaliation, decrementMonsterFury, finalizeMagicCard, finalizePotionCard

### 反模式 B：动画门控规则（规则在 setTimeout/await 动画之后执行）
```
setTimeout(() => {
  // 怪物死亡后的金币、奖励、战斗结束判定都在这里
  updateField('gold', prev => prev + monster.gold);
  patchState({ combatState: ... });
}, animSpeed(DEFEAT_ANIMATION_DURATION));  // 规则等动画！
```
**涉及**: handleMonsterDefeated (setTimeout 后执行击败逻辑), golem reflect (动画后 applyDamage),
          shield reflect sequence (await Promise 后结算), honor sweep (1100ms 后触发升级),
          dice results (900ms 后 resolve), finalizePotionCard (await applyCardFlip 后弃牌)

### 反模式 C：大型命令式流程（几百上千行 async 函数包含所有规则分支）
```
async handleSkillCard(card) {
  // ~2000 行 switch-case，每个分支混合规则计算和 UI 交互
  if (card.magicEffect === 'fireball') {
    dealDamageToMonster(...);  // 规则
    await playAnimation();      // UI
    checkBattleEnd();           // 规则
    showBanner();               // UI
  }
}
```
**涉及**: handleSkillCard (~2000行), handlePotionConsumption (~700行),
          handleEventChoice (~2400行), handleHeroSkillUse (~250行)

### 反模式 D：useEffect 驱动游戏逻辑
```
useEffect(() => {
  if (drawPending) {
    setTimeout(() => {
      patchState({ drawPending: false });
      engine.dispatch({ type: 'DRAW_DUNGEON_ROW' });
    }, 500);
  }
}, [drawPending]);
```
**涉及**: GameBoard.tsx 中 ~12 个 useEffect

---

## 迁移策略

### 核心原则
1. **规则先算，动画后放** — reducer 同步计算所有状态变更，通过 sideEffects 发出事件，UI 通过 useGameEvent 订阅事件播放动画
2. **用户输入走 pipeline pause** — 需要用户交互（骰子、选择、模态）时，reducer 设置对应 phase，pipeline 暂停；UI dispatch 继续 action 后 pipeline 恢复
3. **每个 phase 可测试** — 每完成一步都能跑通测试和游戏

### 目标模式
```
// Hook (瘦):
const attackMonster = useCallback((monsterId: string) => {
  dispatch({ type: 'DEAL_DAMAGE_TO_MONSTER', monsterId, ... });
}, [dispatch]);

// Reducer (胖):
// DEAL_DAMAGE_TO_MONSTER → 计算伤害/免疫/反弹/击杀 → 入队后续 action → 发出事件

// UI (事件驱动动画):
useGameEvent('combat:monsterBleed', ({ monsterId }) => {
  triggerBleedAnimation(monsterId);
});
useGameEvent('combat:monsterDefeated', ({ monsterId }) => {
  playDeathAnimation(monsterId);
});
```

---

## 分阶段实施

### Phase 1: 消除动画门控规则 (Quick Wins)
**目标**: 在不改变架构的前提下，把 "先动画后规则" 改为 "先规则后动画"
**影响文件**: useCombatActions.ts, useHeroActions.ts, useEventSystem.ts, useCardOperations.ts

**1a.** `handleMonsterDefeated` — 把 setTimeout 内的规则逻辑移到 setTimeout 之前
- 金币结算、战利品入队、combatState 更新 → 立即执行
- 动画 → setTimeout 内只做视觉效果
- 测试: 验证击杀怪物时金币和奖励立即生效

**1b.** Golem reflect — applyDamage 先执行，动画后播
- 把 `setTimeout(..., animSpeed(GOLEM_LAYER_REFLECT_ANIM_MS))` 内的 applyDamage 移出来
- setTimeout 内只触发反弹动画效果

**1c.** Shield reflect sequence — 分离规则和动画
- 结算逻辑（伤害、治疗、击杀）同步执行
- await 只用于动画排队

**1d.** Honor sweep upgrade — 移除 1100ms 延迟
- sweepUpgradesPending 立即设置，UI 延迟只影响展示

**1e.** Dice result — 移除 900ms 延迟
- eventDiceResolver 立即 resolve，动画另行处理

**1f.** finalizePotionCard — 弃牌/回收决策不等 flip 动画
- 先决定弃牌去向，再播放 flip 动画

**预期**: ~20 处 "规则在动画后" 变为 "规则先于动画"，游戏功能不变

---

### Phase 2: 合并重复战斗逻辑 → Reducer
**目标**: hooks 中与 `rules/combat.ts` 重复的逻辑全部删除，hooks 只 dispatch
**影响文件**: useCombatActions.ts, rules/combat.ts

**2a.** 对齐 `dealDamageToMonster`
- 审计 hooks 版 vs reducer 版的差异（spell immunity, building delegate, swarm shield, max damage cap, dragon breath, golem reflect, overkill lifesteal, boss retaliation）
- 补齐 reducer 中缺失的边界情况
- Hook 改为: `dispatch({ type: 'DEAL_DAMAGE_TO_MONSTER', ... })`
- 动画通过 `useGameEvent('combat:monsterBleed', ...)` 驱动
- 删除 hook 中 ~130 行重复代码

**2b.** 对齐 `handleMonsterDefeated`
- 补齐 reducer MONSTER_DEFEATED 中的: 遗言触发链、小兵 buff、Wraith 治疗、Buglet 护甲层治疗、Goblin trick、Buglet amulet 5% 血量、击杀升级进度、战利品入队
- Hook 改为: `dispatch({ type: 'MONSTER_DEFEATED', monsterId })`
- 删除 hook 中 ~350 行重复代码

**2c.** 对齐 executeLastWords, decrementMonsterFury, applyShieldReflect, applyDragonBreathRetaliation
- 相同策略: 补齐 reducer，hooks 改为 dispatch，通过事件驱动动画

**2d.** healHero / applyDamage 瘦身
- 已经 dispatch HEAL/APPLY_DAMAGE
- 移除 setTimeout glow/bleed 动画 → 用 useGameEvent('combat:heroHealed') 代替

**2e.** flushRecycleBagToBackpack → 新 action 或合并到 FINISH_COMBAT

**预期**: useCombatActions.ts 从 ~1630 行减少到 ~600 行；reducer 战斗覆盖完整

---

### Phase 3: 卡牌经济迁入 Reducer
**目标**: 卡牌操作的纯逻辑进入 game-core
**影响文件**: useCardOperations.ts, rules/cards.ts

**3a.** 纯函数迁移
- addToGraveyard → 补齐 ADD_TO_GRAVEYARD reducer
- addPermanentMagicToRecycleBag → ADD_TO_RECYCLE_BAG
- takeRandomCardsFromBackpack → DRAW_FROM_BACKPACK
- executeDiscardSideEffects → 新 action APPLY_DISCARD_EFFECTS
- enforceBackpackCapacity → ENFORCE_BACKPACK_CAPACITY (已有)

**3b.** 装备操作迁移
- setEquipmentSlotBonus, swapEquipmentToTop, sacrificeEquipment → 新 equipment action 或合并到现有

**3c.** 回收锻造 (Recycle Forge)
- tickRecycleForge → 新 action TICK_RECYCLE_FORGE (每5次出牌触发)

**预期**: useCardOperations.ts 瘦身 ~50%

---

### Phase 4: 交互流程模式（Pause/Resume）
**目标**: 建立 "reducer 暂停 → UI 展示选择 → dispatch 继续" 的标准模式
**影响**: 骰子、魔法选择、装备选择、墓地发现 等所有交互点

**4a.** 标准化骰子流程
```
// Reducer:
// 在需要骰子时 → set phase: 'awaitingDice', emit 'ui:requestDice'
// 收到 RESOLVE_DICE { outcome } → 继续计算

// UI:
// useGameEvent('ui:requestDice', params => showDiceModal(params))
// 用户掷完骰子 → dispatch({ type: 'RESOLVE_DICE', outcome })
```

**4b.** 标准化选择流程 (equipment, magic choice, card action)
```
// Reducer:
// set phase: 'awaitingEquipmentPrompt', emit 'ui:requestEquipmentChoice'
// 收到 RESOLVE_EQUIPMENT_CHOICE { slotId } → 继续

// UI:
// useGameEvent('ui:requestEquipmentChoice', ...) → show modal
// dispatch RESOLVE_EQUIPMENT_CHOICE on select
```

**4c.** 标准化发现流程 (discover, graveyard selection)

**预期**: 所有交互点统一为 pause/dispatch/resume 模式

---

### Phase 5: 战斗完整流程走 Pipeline
**目标**: 从 PERFORM_HERO_ATTACK 到 CHECK_BATTLE_END 全部走 pipeline 的 enqueue → drain
**依赖**: Phase 2 (战斗逻辑已在 reducer), Phase 4 (交互模式已建立)

**5a.** PERFORM_HERO_ATTACK → enqueue [DEAL_DAMAGE_TO_MONSTER, CHECK_DEATH, CHECK_BATTLE_END]
**5b.** RESOLVE_BLOCK → enqueue [APPLY_DAMAGE (hero), CHECK_DEATH, ADVANCE_MONSTER_TURN or START_TURN]
**5c.** END_TURN → ADVANCE_MONSTER_TURN → ... → START_TURN 完整链

**预期**: 一个完整战斗回合从头到尾走 pipeline，中间只在需要玩家输入时暂停

---

### Phase 6: 卡牌出牌流程走 Pipeline
**目标**: handleSkillCard / handlePotionConsumption 的分支逻辑迁入 reducer
**影响文件**: useCardPlayHandlers.ts, rules/cards.ts
**依赖**: Phase 3, Phase 4

**6a.** 简单卡牌效果 (无交互): 直接在 RESOLVE_MAGIC / RESOLVE_POTION reducer 中处理
- 纯伤害卡、纯治疗卡、纯 buff 卡

**6b.** 需要交互的卡牌: 用 Phase 4 的 pause/resume 模式
- 需要目标选择 → awaitingMagicTarget
- 需要骰子 → awaitingDice  
- 需要从墓地选卡 → awaitingDiscoverChoice

**6c.** finalizeMagicCard / finalizePotionCard → 在 reducer 中完成（FINALIZE_MAGIC_CARD 已有框架）

**预期**: useCardPlayHandlers.ts 从 ~5500 行大幅瘦身

---

### Phase 7: 事件系统走 Pipeline  
**目标**: handleEventChoice 的 ~2400 行 DSL 迁入 reducer
**影响文件**: useEventSystem.ts, rules/events.ts
**依赖**: Phase 4, Phase 6

**7a.** APPLY_EVENT_EFFECT 已存在 — 逐步把 handleEventChoice 的分支迁入
**7b.** 按 effectToken 分批迁移（hp, gold, transform, shop, dice 等）
**7c.** completeCurrentEvent → COMPLETE_EVENT 全在 reducer

**预期**: useEventSystem.ts 从 ~3300 行大幅瘦身

---

### Phase 8: 英雄技能 + 商店 走 Pipeline
**影响文件**: useHeroActions.ts, useShopHandlers.ts

**8a.** 英雄技能 → USE_HERO_SKILL + skill-specific sub-actions
**8b.** 横扫计算 → reducer pure function
**8c.** 说服 → PERSUADE_MONSTER (已有)
**8d.** 商店发现/删除/技能选择 → 补齐 reducer

---

### Phase 9: GameBoard.tsx useEffect 清理
**目标**: 删除 12 个驱动游戏逻辑的 useEffect
**依赖**: Phase 5-8 完成后自然可删

- DEQUEUE_MONSTER_REWARD → 合并到 FINISH_COMBAT / APPLY_MONSTER_REWARD pipeline
- DRAW_DUNGEON_ROW (drawPending) → 合并到 pipeline 流程
- TRIGGER_WATERFALL → 合并到 dungeon row pipeline
- syncBuildingSlotsPure → 已在 reducer postProcess 中
- amulet _counterDisplay → 已在 reducer postProcess 中
- 荣誉横扫升级 → 合并到 sweep action
- stale engagedMonsterIds → 合并到 FINISH_COMBAT

---

## 工作量估算

| Phase | 预估复杂度 | 影响行数 | 依赖 |
|-------|-----------|---------|------|
| Phase 1 | ⭐⭐ 低 | ~200 行重排 | 无 |
| Phase 2 | ⭐⭐⭐⭐ 高 | ~800 行迁移 | Phase 1 |
| Phase 3 | ⭐⭐⭐ 中 | ~400 行迁移 | 无 |
| Phase 4 | ⭐⭐⭐ 中 | ~300 行新模式 | 无 |
| Phase 5 | ⭐⭐⭐ 中 | ~200 行连接 | Phase 2, 4 |
| Phase 6 | ⭐⭐⭐⭐⭐ 很高 | ~2000 行迁移 | Phase 3, 4 |
| Phase 7 | ⭐⭐⭐⭐⭐ 很高 | ~2000 行迁移 | Phase 4, 6 |
| Phase 8 | ⭐⭐⭐ 中 | ~500 行迁移 | Phase 4 |
| Phase 9 | ⭐⭐ 低 | ~100 行删除 | Phase 5-8 |

## 建议执行顺序

Phase 1 → Phase 4 → Phase 2 → Phase 3 → Phase 5 → Phase 8 → Phase 6 → Phase 7 → Phase 9

先建立模式 (1, 4)，再迁移核心战斗 (2, 3, 5)，最后处理最大的文件 (6, 7)。
