/**
 * Equipment-derived effect registry barrel.
 *
 * Per-surface handler files register their handlers at module top-level via
 * `registerEquipmentDerivedHandlers(surface, [...])`, so importing this
 * barrel triggers all registrations. Migration status:
 *
 *   - PR-2 ✓ durability-loss.ts (mine / bleed / wraith / golem)
 *   - PR-3 ✓ shield-reflect.ts (dragon-breath / boss-retaliation)
 *   - PR-4a ✓ attack-basic.ts (heal/draw/boss/dragon/heal-on-kill/kill-gold/post-attack-hand-recycle)
 *   - PR-4b ✓ attack-overkill.ts (overkill-lifesteal / overkill-draw / overkill-amplify-missile / post-attack-spell-damage)
 *   - PR-5 ✓ block.ts (dual-guard / perfect-block-max-hp / perfect-block-spawn-missiles / block-grant-temp-armor / dragon-breath-shield / shield-reflect-on-block)
 *
 * IMPORTANT: callers (e.g. `rules/equipment-effects.ts`) that just need the
 * runner / types should import from `./registry` directly to avoid loading
 * handler modules that themselves import from `rules/*` (would create a
 * cycle). The barrel is for top-level wiring (`card-schema/index.ts`).
 */

export * from './registry';

// Side-effect imports — register handlers as the barrel is loaded.
import './durability-loss';
import './shield-reflect';
import './attack-basic';
import './attack-overkill';
import './block';
