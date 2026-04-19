---
name: Migrate useCombatActions.ts
overview: Reduce useEngineSetter count by pruning unused setters, converting pure helpers to SET_STATE dispatch, and creating targeted actions for self-contained pure operations. The heavily intertwined DEPS-HEAVY functions (handleMonsterDefeated, dealDamageToMonster, applyShieldReflectDamage) intentionally remain in React.
todos:
  - id: step1-prune-unused-setters
    content: "Step 1: Prune ~17 unused useEngineSetter declarations that are never called"
    status: pending
  - id: step2-pure-berserk-attack-helpers
    content: "Step 2: Convert clearBerserkTurnBuff, addBerserkTurnBuff, grantExtraAttackCharges, consumeExtraAttackCharge to SET_STATE dispatch"
    status: pending
  - id: step3-wraith-purification-flush
    content: "Step 3: Create WRAITH_PURIFICATION_FLUSH action for the pure wrathPurificationFlush function"
    status: pending
  - id: step4-boss-retaliation-cleanup
    content: "Step 4: Convert applyBossRetaliationDamage to dispatch APPLY_DAMAGE instead of manual setter chain"
    status: pending
  - id: step5-hero-stunned-effect
    content: "Step 5: Remove useEffect for heroStunned reset, convert to dispatch SET_STATE"
    status: pending
  - id: step6-tests-docs
    content: "Step 6: Add tests for new actions, update MIGRATION_SUMMARY.md and REMAINING_MIGRATION_WORK.md"
    status: pending
isProject: false
---

# useCombatActions.ts Migration Plan

## Current State

- **46** `useEngineSetter` calls, **9** typed `dispatch` calls
- **~17** unused setter declarations (declared but never called beyond declaration)
- Heavily intertwined functions: `handleMonsterDefeated` (350 lines), `dealDamageToMonster` (145 lines), `applyShieldReflectDamage` (140 lines) — all DEPS-HEAVY, stay in React
- 9 dispatches already working: `HEAL`, `APPLY_DAMAGE`, `FINISH_COMBAT`, `BEGIN_COMBAT`, `PERFORM_HERO_ATTACK`, `END_TURN`, `RESOLVE_BLOCK`, `ADVANCE_MONSTER_TURN`, `PERFORM_SHIELD_BASH`

## Step 1: Prune ~17 unused `useEngineSetter` declarations

These setters are declared but never referenced beyond their declaration line:

- `setGold`, `setPersuadeAmuletBonus`, `setPersuadeDiscount`
- `setActiveCardStacks`, `setEquipmentSlotBonuses`
- `setTempShield`, `setNextWeaponBonus`, `setSlotAttackBursts`, `setSlotTempArmor`, `setSlotTempAttack`
- `setNextAttackLifestealSlot`, `setUnbreakableNext`
- `setTotalDamageTaken`, `setTurnDamageTaken`, `setTotalHealed`
- `setDiscardedCards`, `setStunCap`

**Action:** Remove each declaration line. Run grep to confirm zero usage beyond declaration.

## Step 2: Convert pure berserk/attack helpers to `SET_STATE` dispatch

**`clearBerserkTurnBuff`** (line 345): `setBerserkTurnBuff(createEmptyEquipmentBuffState())`
→ `dispatch({ type: 'SET_STATE', patch: { berserkTurnBuff: createEmptyEquipmentBuffState() } })`

**`addBerserkTurnBuff`** (line 349): Reads prev, computes new values.
→ Read from engine.getState(), compute, dispatch SET_STATE patch.

**`grantExtraAttackCharges`** (line 359): `setExtraAttackCharges(prev => prev + amount)`
→ Read from engine.getState(), dispatch SET_STATE patch.

**`consumeExtraAttackCharge`** (line 366): `setExtraAttackCharges(prev => Math.max(0, prev - 1))`
→ Same pattern.

**Setters removed:** `setBerserkTurnBuff`, `setExtraAttackCharges` (if no other usages)

## Step 3: Create `WRAITH_PURIFICATION_FLUSH` action

**`wrathPurificationFlush`** (lines 1469–1504): Pure state mutation over `permanentMagicRecycleBag` and `backpackItems`. No async, no complex deps (only reads `eternalRelicsRef` for guard and `addGameLog` for logging).

**New action:** `WRAITH_PURIFICATION_FLUSH` with no payload (reads all from state).
**Pure function:** `wrathPurificationFlushPure(state)` in `game-core/combat.ts` — splits recycle bag into ready/waiting, moves ready cards to backpack respecting capacity.
**Reducer handler:** In `rules/combat.ts`, apply patch, emit log side effects.
**Hook change:** `dispatch({ type: 'WRAITH_PURIFICATION_FLUSH' })` guarded by eternalRelicsRef check.

**Setters removed:** `setPermanentMagicRecycleBag`, `setBackpackItems` (check if used elsewhere first)

## Step 4: Convert `applyBossRetaliationDamage` to dispatch `APPLY_DAMAGE`

**Current** (lines 1136–1149): Manually sets hp, gameOver, victory via nested setter callbacks, then calls `addHeroMagicGauge`.

**Change:** Replace manual hp/gameOver/victory with `dispatch({ type: 'APPLY_DAMAGE', amount: retDmg, source: \`${monsterName} 反噬\` })`, then call `depsRef.current.addHeroMagicGauge('holy-light', 1)`.

This leverages the existing `APPLY_DAMAGE` reducer which already handles hp deduction, tempShield absorption, gameOver, and death ward. The addGameLog call can use a side effect or remain post-dispatch.

**Setters removed:** The `setHp`, `setGameOver`, `setVictory` calls in this function (but these setters are used elsewhere — just removes these particular call sites)

## Step 5: Remove `useEffect` for `heroStunned` reset

**Current** (lines 275–279): `useEffect` that sets `heroStunned = false` when `combatState.engagedMonsterIds.length === 0`.

**Change:** Replace with a dispatch or inline check. Since `FINISH_COMBAT` already resets combat state, this could be handled there. Or convert to `dispatch({ type: 'SET_STATE', patch: { heroStunned: false } })` in the same check.

## Step 6: Tests and documentation

- Add unit test for `WRAITH_PURIFICATION_FLUSH` action
- Update `MIGRATION_SUMMARY.md` with new action count and updated setter counts
- Update `REMAINING_MIGRATION_WORK.md` to reflect progress
- Run full test suite

## Key Files

- `client/src/hooks/useCombatActions.ts` — the hook being migrated
- `client/src/game-core/combat.ts` — existing pure combat functions
- `client/src/game-core/rules/combat.ts` — existing combat reducer
- `client/src/game-core/actions.ts` — action type definitions

## Risk Notes

- `handleMonsterDefeated`, `dealDamageToMonster`, `applyShieldReflectDamage` are deeply intertwined with deps — NOT migrating these
- `setPermanentMagicRecycleBag` and `setBackpackItems` are used in `handleDeathWardConfirm` and `wrathPurificationFlush` — only remove if both paths are converted
- `updateMonsterCard` is used ~20 times throughout — keep as setter-based utility for now since callers are DEPS-HEAVY
- Some setters like `setHp`, `setGameOver`, `setVictory` are used in multiple places — only remove declaration if ALL usages are converted
