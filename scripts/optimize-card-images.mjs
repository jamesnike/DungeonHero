/**
 * One-shot script: resize + recompress card images IN PLACE.
 *
 * Why: 261 PNGs at avg 1376x768 / ~220KB each (~56 MB total) makes modal
 * opens (graveyard / discover / class deck pool) freeze the main thread
 * while Chrome decodes 30+ giant images. Cards display at ~140-210px so
 * 99% of the original pixels are wasted.
 *
 * Strategy:
 *   - Keep .png extension + same filename (zero import changes needed)
 *   - Resize so longest side <= MAX_DIM (default 600 -> ~3x of 200px display
 *     for retina; small enough to slash bytes, large enough to look crisp)
 *   - palette: true -> sharp uses pngquant-equivalent palette quantization
 *     for huge size cuts on AI-generated illustrations
 *   - Skip if file is already smaller than the would-be result (idempotent)
 *
 * Usage:
 *   node scripts/optimize-card-images.mjs            # batch, in place
 *   node scripts/optimize-card-images.mjs --dry one-file.png   # try one file, write to /tmp
 *
 * Backup: a _backup_full_pre_optimize/ snapshot is expected to already exist
 * in the same directory before this script runs (the README at the bottom of
 * this file documents the recovery flow if anything goes wrong).
 */

import sharp from 'sharp';
import { promises as fs } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const IMG_DIR = path.resolve(__dirname, '..', 'attached_assets', 'generated_images');

const MAX_DIM = 600;
const PNG_QUALITY = 85;
const SKIP_DIRS = new Set(['_backup_originals', '_backup_originals_full', '_backup_full_pre_optimize']);

function fmtBytes(n) {
  if (n > 1024 * 1024) return (n / 1024 / 1024).toFixed(2) + ' MB';
  if (n > 1024) return (n / 1024).toFixed(1) + ' KB';
  return n + ' B';
}

async function optimizeOne(inputPath, outputPath) {
  const inputStat = await fs.stat(inputPath);
  const inputSize = inputStat.size;

  const meta = await sharp(inputPath).metadata();
  const longest = Math.max(meta.width ?? 0, meta.height ?? 0);
  const needsResize = longest > MAX_DIM;

  let pipeline = sharp(inputPath, { failOn: 'none' });
  if (needsResize) {
    pipeline = pipeline.resize({
      width: meta.width >= meta.height ? MAX_DIM : undefined,
      height: meta.height > meta.width ? MAX_DIM : undefined,
      fit: 'inside',
      withoutEnlargement: true,
    });
  }
  const buf = await pipeline
    .png({ quality: PNG_QUALITY, palette: true, compressionLevel: 9, effort: 9 })
    .toBuffer();

  if (buf.length >= inputSize) {
    return {
      skipped: true,
      reason: `optimized (${fmtBytes(buf.length)}) is not smaller than original (${fmtBytes(inputSize)})`,
      inputSize,
      outputSize: buf.length,
      width: meta.width,
      height: meta.height,
    };
  }

  await fs.writeFile(outputPath, buf);
  return {
    skipped: false,
    inputSize,
    outputSize: buf.length,
    saved: inputSize - buf.length,
    width: meta.width,
    height: meta.height,
    resized: needsResize,
  };
}

async function main() {
  const args = process.argv.slice(2);
  const dryIdx = args.indexOf('--dry');
  if (dryIdx !== -1) {
    const target = args[dryIdx + 1];
    if (!target) {
      console.error('--dry requires a filename');
      process.exit(1);
    }
    const inputPath = path.join(IMG_DIR, target);
    const outputPath = `/tmp/optimized-${target}`;
    console.log(`DRY RUN: ${inputPath} -> ${outputPath}`);
    const result = await optimizeOne(inputPath, outputPath);
    console.log(JSON.stringify(result, null, 2));
    return;
  }

  const entries = await fs.readdir(IMG_DIR, { withFileTypes: true });
  const files = entries
    .filter(e => e.isFile() && e.name.toLowerCase().endsWith('.png'))
    .map(e => e.name)
    .sort();

  console.log(`Optimizing ${files.length} PNGs in ${IMG_DIR}`);
  console.log(`Settings: maxDim=${MAX_DIM}px, png{quality:${PNG_QUALITY}, palette:true, compressionLevel:9}`);
  console.log('');

  let totalIn = 0;
  let totalOut = 0;
  let skipped = 0;
  let processed = 0;
  let errored = 0;

  const startedAt = Date.now();
  for (let i = 0; i < files.length; i++) {
    const name = files[i];
    const fullPath = path.join(IMG_DIR, name);
    try {
      const result = await optimizeOne(fullPath, fullPath);
      totalIn += result.inputSize;
      totalOut += result.outputSize;
      if (result.skipped) {
        skipped += 1;
        if (process.env.VERBOSE) console.log(`SKIP  ${name}: ${result.reason}`);
      } else {
        processed += 1;
        const pct = ((1 - result.outputSize / result.inputSize) * 100).toFixed(1);
        const dim = result.resized ? ` resized from ${result.width}x${result.height}` : '';
        console.log(
          `[${i + 1}/${files.length}] ${name}: ${fmtBytes(result.inputSize)} -> ${fmtBytes(result.outputSize)} (-${pct}%)${dim}`,
        );
      }
    } catch (e) {
      errored += 1;
      console.error(`ERROR ${name}: ${e.message}`);
    }
  }
  const elapsed = ((Date.now() - startedAt) / 1000).toFixed(1);

  console.log('');
  console.log('=== Summary ===');
  console.log(`Processed: ${processed}, Skipped (already smaller): ${skipped}, Errored: ${errored}`);
  console.log(`Total: ${fmtBytes(totalIn)} -> ${fmtBytes(totalOut)} (saved ${fmtBytes(totalIn - totalOut)}, -${((1 - totalOut / totalIn) * 100).toFixed(1)}%)`);
  console.log(`Elapsed: ${elapsed}s`);
}

main().catch(e => {
  console.error(e);
  process.exit(1);
});
