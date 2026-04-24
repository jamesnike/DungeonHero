/**
 * Single source of truth for "all card art that should be preloaded at game start".
 *
 * Uses Vite's `import.meta.glob` to eagerly enumerate every top-level `*.png`
 * in `attached_assets/generated_images/`. The `*.png` (no `**`) intentionally
 * excludes the `_backup_*` subdirectories — those are pre-optimization snapshots
 * for rollback, not production assets (see
 * `.cursor/rules/new-card-images-must-be-optimized.mdc`).
 *
 * Why this file exists:
 *
 * `LoadingScreen` previously listed every preloaded image by hand. Each new card
 * required adding a fresh `import` + a fresh entry in `ALL_IMAGES`. People
 * forgot — by the time we audited, ~70% of `knightDeck.ts` images and ~37% of
 * `deck.ts` images were NOT preloaded. Discover / draft / class-pool modals
 * cold-loaded those on first appearance, causing the visible "卡" lag the
 * player reported.
 *
 * Glob-everything is bulletproof: any PNG dropped into the folder gets warmed
 * automatically. Cost = parse time of ~266 URL strings at startup (negligible)
 * + a longer `LoadingScreen` (preload runs in parallel; bottleneck is the
 * slowest image, not the count).
 */
const cardImageModules = import.meta.glob<string>(
  '../../../attached_assets/generated_images/*.png',
  { eager: true, import: 'default', query: '?url' },
);

/**
 * URL strings of every card art file (post-Vite-fingerprinting in production).
 * Order is not stable; consumers should treat as a `Set`-like collection.
 */
export const ALL_CARD_IMAGE_URLS: readonly string[] = Object.values(cardImageModules);
