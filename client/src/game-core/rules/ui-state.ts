/**
 * UI State Reducers — handles pending-action state machines and modal toggles.
 *
 * These actions replace useEngineSetter calls for fields that represent
 * pending user interactions (modals, prompts, targeting contexts).
 */

import type { GameState } from '../types';
import type { GameAction } from '../actions';
import type { ReduceResult } from '../reducer';
import { applyPatch } from '../reducer';
import { filterAvailableClassPool } from '../uniqueClass';

export function reduceUIStateActions(
  state: GameState,
  action: GameAction,
): ReduceResult | null {
  switch (action.type) {
    // --- Pending-action state machines ---

    case 'SET_PENDING_MAGIC':
      return applyPatch(state, { pendingMagicAction: action.payload });

    case 'SET_PENDING_POTION':
      return applyPatch(state, { pendingPotionAction: action.payload });

    case 'SET_PENDING_HERO_SKILL':
      return applyPatch(state, { pendingHeroSkillAction: action.payload });

    case 'SET_PENDING_HERO_MAGIC':
      return applyPatch(state, { pendingHeroMagicAction: action.payload });

    case 'DISMISS_DEATH_WARD_NOTICE': {
      // 玩家点了「知道了」：清空通知，把 phase 推回 playerInput 让 pipeline 继续。
      // reduceApplyDamage 在自动触发时已经把卡片移到了坟场，这里只做 modal 收尾。
      if (!state.deathWardNotice && state.phase !== 'awaitingDeathWardNotice') {
        return null;
      }
      const patch: Partial<GameState> = { deathWardNotice: null };
      if (state.phase === 'awaitingDeathWardNotice') {
        patch.phase = 'playerInput';
      }
      return applyPatch(state, patch);
    }

    case 'SET_CARD_ACTION_CONTEXT':
      return applyPatch(state, { cardActionContext: action.payload });

    case 'SET_GRAVEYARD_DISCOVER_STATE': {
      const patch: Partial<GameState> = {
        graveyardDiscoverState: action.payload,
        // Always reset the minimized flag — both on open (fresh modal must
        // not start folded) and on close (defensive cleanup).
        graveyardDiscoverMinimized: false,
      };
      if (action.delivery !== undefined) {
        patch.graveyardDiscoverDelivery = action.delivery;
      }
      return applyPatch(state, patch);
    }

    case 'SET_PERM_GRANT_MODAL':
      return applyPatch(state, { permGrantModal: action.payload });

    case 'SET_EQUIPMENT_PROMPT':
      return applyPatch(state, { equipmentPrompt: action.payload });

    case 'SET_MIRROR_COPY_MODAL':
      return applyPatch(state, { mirrorCopyModal: action.payload });

    case 'SET_MONSTER_FUSION_MODAL':
      return applyPatch(state, { monsterFusionModal: action.payload });

    case 'SET_AMPLIFY_MODAL':
      return applyPatch(state, { amplifyModal: action.payload });

    case 'SET_EVENT_AMPLIFY_HAND_PICKER':
      return applyPatch(state, { eventAmplifyHandPicker: action.payload });

    case 'SET_EVENT_DICE_MODAL':
      return applyPatch(state, { eventDiceModal: action.payload });

    case 'SET_MAGIC_CHOICE_MODAL':
      return applyPatch(state, { magicChoiceModal: action.payload });

    case 'SET_PERSUADE_STATE':
      return applyPatch(state, { persuadeState: action.payload });

    case 'SET_EVENT_TRANSFORM_STATE':
      return applyPatch(state, { eventTransformState: action.payload });

    case 'SET_HAND_MAGIC_UPGRADE_MODAL':
      return applyPatch(state, { handMagicUpgradeModal: action.payload });

    case 'SET_GHOST_BLADE_EXILE_CARDS': {
      const enqueuedActions: GameAction[] = [];
      // When the ghost-blade exile modal closes (payload=null), drain any
      // pending follow-ups. `reduceDequeueMonsterReward` is now the unified
      // drain site — it advances `monsterRewardQueue` if non-empty, OR drains
      // one entry from `pendingClassDiscoverQueue` (deferred 战痕之符 /
      // 咒纹刻印 / 眩学之符 discovers that were blocked by an active reward
      // or another discover modal). Enqueue it whenever there's work to do.
      if (
        action.payload === null &&
        !state.activeMonsterReward &&
        (state.monsterRewardQueue.length > 0 || state.pendingClassDiscoverQueue.length > 0)
      ) {
        enqueuedActions.push({ type: 'DEQUEUE_MONSTER_REWARD' });
      }
      return applyPatch(state, { ghostBladeExileCards: action.payload }, [], enqueuedActions.length > 0 ? enqueuedActions : undefined);
    }

    case 'SET_PREVIEW_CARDS':
      return applyPatch(state, { previewCards: action.payload });

    case 'SET_SWAP_UPGRADE_PROGRESS':
      return applyPatch(state, { swapUpgradeProgress: action.payload });

    // --- UI modal toggles ---

    case 'SET_EVENT_MODAL_OPEN':
      return applyPatch(state, { eventModalOpen: action.open });

    case 'SET_EVENT_MODAL_MINIMIZED':
      return applyPatch(state, { eventModalMinimized: action.minimized });

    case 'SET_DELETE_MODAL_OPEN':
      return applyPatch(state, { deleteModalOpen: action.open });

    case 'SET_UPGRADE_MODAL_OPEN': {
      const patch: Partial<GameState> = { upgradeModalOpen: action.open };
      if (action.maxCount !== undefined) {
        patch.upgradeModalMaxCount = action.maxCount;
      }
      return applyPatch(state, patch);
    }

    case 'SET_DISCOVER_MODAL': {
      const patch: Partial<GameState> = {
        discoverModalOpen: action.open,
        // Always reset minimized — opening a fresh modal must not inherit
        // a leftover folded state, closing should clean up too.
        discoverModalMinimized: false,
      };
      if (action.options !== undefined) {
        patch.discoverOptions = action.options;
      }
      if (action.sourceLabel !== undefined) {
        patch.discoverSourceLabel = action.sourceLabel;
      }
      // Closing the modal also resets discoverDelivery so a follow-up
      // BEGIN_DISCOVER (e.g. drained from the queue below) starts from the
      // 'backpack' default unless it explicitly opts back into 'hand-first'.
      // Same reset applies to the 「右翼回响」 / "discover + 置顶" inject flag.
      if (!action.open) {
        patch.discoverDelivery = 'backpack';
        patch.discoverPostInjectTopOnRecycleRestore = false;
      }
      // When closing the modal, drain one pending class-discover from the queue
      // so multi-discover effects (e.g. 弃装重铸 / 法术回响 echoed discovers)
      // pop modals one at a time. The queue entry's optional `delivery` and
      // `magicOnly` fields control how the next BEGIN_DISCOVER is shaped (see
      // `pendingClassDiscoverQueue` JSDoc in `types.ts`).
      const enqueuedActions: GameAction[] = [];
      if (!action.open && state.pendingClassDiscoverQueue.length > 0) {
        const [nextEntry, ...rest] = state.pendingClassDiscoverQueue;
        patch.pendingClassDiscoverQueue = rest;
        // Filter out already-acquired unique class cards before the next
        // queued discover sees the pool — same lock as `reduceBeginDiscover`
        // call sites and the queue-drain in `reduceResolveDiscoverSelection`.
        const filtered = filterAvailableClassPool(state.classDeck, state, patch);
        const nextPool = nextEntry.magicOnly
          ? filtered.filter(c => c.type === 'magic' || c.type === 'hero-magic')
          : filtered;
        enqueuedActions.push({
          type: 'BEGIN_DISCOVER',
          source: nextEntry.source,
          pool: nextPool,
          sourceLabel: nextEntry.sourceLabel ?? undefined,
          delivery: nextEntry.delivery,
          postInjectTopOnRecycleRestore: nextEntry.postInjectTopOnRecycleRestore,
        });
      }
      return applyPatch(state, patch, [], enqueuedActions.length > 0 ? enqueuedActions : undefined);
    }

    case 'SET_SHOP_MODAL_OPEN':
      return applyPatch(state, { shopModalOpen: action.open });

    case 'SET_SHOP_MODAL_MINIMIZED':
      return applyPatch(state, { shopModalMinimized: action.minimized });

    case 'SET_DISCOVER_MODAL_MINIMIZED':
      return applyPatch(state, { discoverModalMinimized: action.minimized });

    case 'SET_GRAVEYARD_DISCOVER_MINIMIZED':
      return applyPatch(state, { graveyardDiscoverMinimized: action.minimized });

    case 'SET_MONSTER_REWARD_MINIMIZED':
      return applyPatch(state, { monsterRewardMinimized: action.minimized });

    case 'END_MONSTER_DEFEAT_ANIMATION': {
      const ids = state.monsterDefeatAnimationIds;
      if (!ids.includes(action.monsterId)) return applyPatch(state, {});
      return applyPatch(state, {
        monsterDefeatAnimationIds: ids.filter(id => id !== action.monsterId),
      });
    }

    case 'MINIMIZE_ALL_MODALS': {
      // Only mark currently-open modals as minimized. Touching closed ones
      // is harmless but pointless and would noise up state diffs.
      const patch: Partial<GameState> = {};
      if (state.eventModalOpen && !state.eventModalMinimized) patch.eventModalMinimized = true;
      if (state.shopModalOpen && !state.shopModalMinimized) patch.shopModalMinimized = true;
      if (state.discoverModalOpen && !state.discoverModalMinimized) patch.discoverModalMinimized = true;
      if (state.graveyardDiscoverState && !state.graveyardDiscoverMinimized) patch.graveyardDiscoverMinimized = true;
      if (state.activeMonsterReward && !state.monsterRewardMinimized) patch.monsterRewardMinimized = true;
      if (Object.keys(patch).length === 0) return applyPatch(state, {});
      return applyPatch(state, patch);
    }

    case 'SET_HERO_SKILL_BANNER':
      return applyPatch(state, { heroSkillBanner: action.message });

    case 'SET_GAME_OVER':
      return applyPatch(state, { gameOver: true, victory: action.victory });

    // --- UI / Phase / Meta flags ---

    case 'SET_PHASE':
      return applyPatch(state, { phase: action.phase });

    case 'SET_UNDO_COUNT':
      return applyPatch(state, { undoCount: action.count });

    case 'SET_HYDRATED':
      return applyPatch(state, { isHydrated: true });

    case 'SET_DRAW_PENDING':
      return applyPatch(state, { drawPending: action.value });

    case 'SET_SHOW_SKILL_SELECTION':
      return applyPatch(state, { showSkillSelection: action.show });

    case 'SET_SHOW_CARD_DRAFT':
      return applyPatch(state, { showCardDraft: action.show });

    case 'SET_CARD_DRAFT_POOL':
      return applyPatch(state, { cardDraftPool: action.pool });

    case 'SET_TOTAL_WINS':
      return applyPatch(state, { totalWins: action.count });

    case 'SET_SELECTED_MONSTER_REWARDS':
      return applyPatch(state, { selectedMonsterRewards: action.options });

    case 'SET_RESOLVING_DUNGEON_CARD':
      return applyPatch(state, { resolvingDungeonCardId: action.cardId });

    case 'RESET_RECYCLE_FORGE_COUNT':
      return applyPatch(state, { recycleForgePlayCount: 0 });

    case 'SELECT_HERO_SKILL':
      return applyPatch(state, { selectedHeroSkill: action.skillId });

    default:
      return null;
  }
}
