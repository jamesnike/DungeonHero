/**
 * Card Schema — barrel export.
 *
 * Importing this module registers all card definitions and custom handlers.
 */

export type { CardEffect, CardDefinition, ExecutionContext, MagicContext, MagicResolver, PermanentStat } from './types';
export { registerCard, registerCards, getCardDefinition, getCardDefinitionById, hasCardDefinition, resolveEffectId, getRegistrySize, getAllRegisteredIds } from './registry';
export { executeCardEffects, executeMagicCardEffects } from './engine';
export { getExecutor } from './executors';
export { getCustomHandler, registerCustomHandler } from './custom-handlers';
export { executeOnEquip, getOnEquipRegistrySize } from './on-equip';
export type { OnEquipHandler } from './on-equip';
export { executeOnUpgrade, registerOnUpgrade, registerOnUpgradeAll, resolveUpgradeEffectId, getOnUpgradeRegistrySize } from './on-upgrade';
export type { OnUpgradeHandler } from './on-upgrade';
export { executeOnEnterHand, registerOnEnterHand, registerOnEnterHandAll, getOnEnterHandRegistrySize } from './on-enter-hand';
export type { OnEnterHandHandler } from './on-enter-hand';
export { computeCardText, applyDerivedCardText, registerCardText, registerCardTextAll, resolveCardTextId, getCardTextRegistrySize } from './card-text';
export type { CardText, CardTextFormatter } from './card-text';

// Equipment-derived effect registry (PR-1: infrastructure only; per-surface
// handlers are added in PR-2 ~ PR-5).
export {
  runEquipmentDerivedHandlers,
  registerEquipmentDerivedHandler,
  registerEquipmentDerivedHandlers,
  getEquipmentDerivedRegistrySize,
  getRegisteredEquipmentDerivedHandlerIds,
  __clearEquipmentDerivedHandlers,
} from './equipment-derived';
export type {
  EquipmentDerivedSurface,
  EquipmentDerivedHandler,
  EquipmentDerivedCtx,
  HandlerResult,
  RunResult,
  AttackCtx,
  BlockCtx,
  ShieldReflectCtx,
  DurabilityLossCtx,
  SurfaceCtxMap,
} from './equipment-derived';

// Import definitions to trigger auto-registration
import './definitions/potions';
import './definitions/magic';
import './definitions/equipment';
import './definitions/upgrades';
import './definitions/on-enter-hand';
import './definitions/card-text';
import './custom-handlers';
