/**
 * Verify every card art image referenced by the game is preloaded by
 * `LoadingScreen` at game start.
 *
 * # Why this exists
 *
 * `LoadingScreen` warms the bitmap cache before first render so that opening
 * modals like Discover / Backpack / Card Draft / Graveyard never triggers a
 * cold image fetch + decode (which the player perceives as "卡顿"). Preload
 * coverage is now driven by `client/src/lib/cardImageUrls.ts` which uses
 * Vite's `import.meta.glob` to enumerate every top-level
 * `attached_assets/generated_images/*.png`.
 *
 * The glob will only catch images that actually exist at the top of that
 * directory. This script checks the inverse: any source file that does
 * `import xxx from '@assets/generated_images/<file>.png'` must point to a
 * file that lives at the top level (not inside a `_backup_*` snapshot, not a
 * stale typo, not a missing PNG). If it doesn't, the glob misses it and we
 * regress to the historical bug where ~70% of class deck art was cold.
 *
 * # What it checks
 *
 *   1. Every `from '@assets/generated_images/X'` import string in `client/src`
 *      points at a file that exists at `attached_assets/generated_images/X`.
 *   2. The matching file is at the top level (NOT inside `_backup_originals`,
 *      `_backup_originals_full`, or `_backup_full_pre_optimize`).
 *
 * # What it does NOT check
 *
 *   - Whether every PNG in the folder is *referenced* by some card. Orphans
 *     are harmless (they just bloat the preload list slightly). The glob
 *     intentionally over-includes to be self-maintaining.
 *
 * # Usage
 *
 *     node scripts/check-image-preload-coverage.mjs
 *
 * Exit code is non-zero on any violation, suitable for CI.
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const ROOT = path.resolve(__dirname, '..');

const SRC_ROOTS = [
  path.join(ROOT, 'client', 'src'),
];

const ASSET_DIR = path.join(ROOT, 'attached_assets', 'generated_images');
const BACKUP_DIRS = new Set([
  '_backup_originals',
  '_backup_originals_full',
  '_backup_full_pre_optimize',
]);

const IMPORT_RE = /from\s+['"]@assets\/generated_images\/([^'"]+\.png)['"]/g;

function listSourceFiles(dir, out) {
  for (const ent of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, ent.name);
    if (ent.isDirectory()) {
      if (ent.name === 'node_modules' || ent.name.startsWith('.')) continue;
      listSourceFiles(full, out);
      continue;
    }
    if (!ent.isFile()) continue;
    if (/\.(ts|tsx|js|jsx|mjs|cjs)$/.test(ent.name)) {
      out.push(full);
    }
  }
}

function listTopLevelImages() {
  const out = new Set();
  for (const ent of fs.readdirSync(ASSET_DIR, { withFileTypes: true })) {
    if (ent.isFile() && ent.name.endsWith('.png')) {
      out.add(ent.name);
    }
  }
  return out;
}

function main() {
  if (!fs.existsSync(ASSET_DIR)) {
    console.error(`Asset directory not found: ${ASSET_DIR}`);
    process.exit(2);
  }

  const topLevelImages = listTopLevelImages();
  const sourceFiles = [];
  for (const root of SRC_ROOTS) {
    if (fs.existsSync(root)) listSourceFiles(root, sourceFiles);
  }

  /** filename -> array of importing source file paths (relative) */
  const referenced = new Map();
  for (const file of sourceFiles) {
    const txt = fs.readFileSync(file, 'utf8');
    let m;
    IMPORT_RE.lastIndex = 0;
    while ((m = IMPORT_RE.exec(txt)) !== null) {
      const ref = m[1];
      const list = referenced.get(ref) ?? [];
      list.push(path.relative(ROOT, file));
      referenced.set(ref, list);
    }
  }

  const missing = [];   // referenced but not present at top level
  const inBackup = [];  // referenced and present, but inside a backup subdir
  for (const [ref, importers] of referenced) {
    // `ref` may be a bare filename (`foo.png`) or include a subpath.
    const segs = ref.split('/').filter(Boolean);
    if (segs.length === 1) {
      if (!topLevelImages.has(segs[0])) {
        missing.push({ ref, importers });
      }
    } else {
      // Importing through a subdirectory — check if it points into a backup
      // dir, which means glob will not pick it up.
      if (BACKUP_DIRS.has(segs[0])) {
        inBackup.push({ ref, importers });
      } else if (!fs.existsSync(path.join(ASSET_DIR, ref))) {
        missing.push({ ref, importers });
      }
    }
  }

  const referencedNames = new Set(
    [...referenced.keys()].filter((r) => !r.includes('/')),
  );
  const orphans = [...topLevelImages].filter((n) => !referencedNames.has(n));

  let failed = false;

  console.log(`Scanned ${sourceFiles.length} source files.`);
  console.log(`Top-level PNGs in ${path.relative(ROOT, ASSET_DIR)}: ${topLevelImages.size}`);
  console.log(`Distinct referenced PNGs: ${referenced.size}`);
  console.log('');

  if (missing.length > 0) {
    failed = true;
    console.log(`✗ ${missing.length} card image import(s) point at a file NOT preloadable by the glob:`);
    for (const { ref, importers } of missing) {
      console.log(`  - ${ref}`);
      for (const imp of importers) console.log(`      from ${imp}`);
    }
    console.log('');
  }

  if (inBackup.length > 0) {
    failed = true;
    console.log(`✗ ${inBackup.length} card image import(s) point into a _backup_* snapshot (will NOT be preloaded):`);
    for (const { ref, importers } of inBackup) {
      console.log(`  - ${ref}`);
      for (const imp of importers) console.log(`      from ${imp}`);
    }
    console.log(`  → move the file out of the backup directory, or update the import.`);
    console.log('');
  }

  if (orphans.length > 0) {
    // Orphans are NOT a failure — the glob over-includes intentionally so any
    // future card art is auto-warmed. We just print the count for hygiene.
    console.log(`(info) ${orphans.length} top-level PNG(s) are preloaded but never imported by any source file.`);
    console.log(`       These are harmless but you may want to delete unused art.`);
  }

  if (failed) {
    console.error('');
    console.error('FAIL: image preload coverage is incomplete.');
    console.error('See `client/src/lib/cardImageUrls.ts` and');
    console.error('     `.cursor/rules/new-card-images-must-be-optimized.mdc` for context.');
    process.exit(1);
  }

  console.log('OK: every referenced card image is preloadable by the LoadingScreen glob.');
}

main();
