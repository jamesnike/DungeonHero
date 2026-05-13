/**
 * Equipment-derived effect registry barrel.
 *
 * Per-surface handler files (attack.ts / block.ts / shield-reflect.ts /
 * durability-loss.ts) will be added in PR-2 ~ PR-5; each registers its
 * handlers via `registerEquipmentDerivedHandlers(surface, [...])` at module
 * top-level so importing this barrel triggers registration.
 *
 * Until those PRs land this barrel only re-exports the registry/runner API.
 */

export * from './registry';
