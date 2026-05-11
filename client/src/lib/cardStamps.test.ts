/**
 * Tests for the pure utilities in `lib/cardStamps.ts`:
 *   - canonicalRowSignature: signature stability + multiset / null semantics
 *   - postStamp: client-side freeform validation (length, empty trim)
 *   - lookupStamps: failure modes return `{}` (never throw)
 *
 * The React hook (`useCardStamps`) is exercised only indirectly through
 * canonicalRowSignature here — this repo's vitest config doesn't ship a
 * jsdom + @testing-library setup, so component-level hook tests would
 * require additional infra. The hook's correctness mostly reduces to the
 * signature function plus the snapshot persistence (covered by inspection
 * + manual QA).
 */

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  canonicalRowSignature,
  lookupStamps,
  MAX_FREEFORM_LEN,
  postStamp,
  STAMP_DEFINITIONS,
} from './cardStamps';
import type { GameCardData } from '@/components/GameCard';

function card(name: string): GameCardData {
  return { id: `id-${name}`, name } as unknown as GameCardData;
}

describe('canonicalRowSignature', () => {
  it('joins all four card names sorted ascending', () => {
    const sig = canonicalRowSignature([card('Goblin'), card('Dragon'), card('Skeleton'), card('Wolf')]);
    expect(sig).toBe('Dragon|Goblin|Skeleton|Wolf');
  });

  it('preserves duplicates as a multiset', () => {
    const sig = canonicalRowSignature([card('Dragon'), card('Dragon'), card('Goblin'), card('Goblin')]);
    expect(sig).toBe('Dragon|Dragon|Goblin|Goblin');
  });

  it('represents one null slot as an empty token in sorted position', () => {
    // '' sorts BEFORE non-empty ASCII names, so the empty token comes first.
    const sig = canonicalRowSignature([card('Goblin'), null, card('Dragon'), card('Skeleton')]);
    expect(sig).toBe('|Dragon|Goblin|Skeleton');
  });

  it('handles two null slots', () => {
    const sig = canonicalRowSignature([card('Goblin'), null, card('Dragon'), null]);
    expect(sig).toBe('||Dragon|Goblin');
  });

  it('handles all four null slots → three pipes', () => {
    const sig = canonicalRowSignature([null, null, null, null]);
    expect(sig).toBe('|||');
  });

  it('is order-independent (rotated rows produce the same signature)', () => {
    const a = canonicalRowSignature([card('A'), card('B'), card('C'), card('D')]);
    const b = canonicalRowSignature([card('D'), card('C'), card('B'), card('A')]);
    expect(a).toBe(b);
  });

  it('treats two rows with the same multiset but different ids as equal', () => {
    const a = canonicalRowSignature([card('A'), card('B'), card('C'), null]);
    const b: Array<GameCardData | null> = [
      { id: 'different-id-1', name: 'C' } as unknown as GameCardData,
      { id: 'different-id-2', name: 'A' } as unknown as GameCardData,
      null,
      { id: 'different-id-3', name: 'B' } as unknown as GameCardData,
    ];
    expect(a).toBe(canonicalRowSignature(b));
  });
});

describe('STAMP_DEFINITIONS', () => {
  it('has exactly 6 preset entries with unique ids', () => {
    expect(STAMP_DEFINITIONS.length).toBe(6);
    const ids = STAMP_DEFINITIONS.map(s => s.id);
    expect(new Set(ids).size).toBe(6);
    expect(ids).toEqual(['recommend', 'deadly', 'safe', 'strong', 'died', 'howto']);
  });

  it('every preset has a non-empty emoji + i18n key + zh label', () => {
    for (const s of STAMP_DEFINITIONS) {
      expect(s.emoji.length).toBeGreaterThan(0);
      expect(s.i18nKey).toMatch(/^cardStamps\.presets\./);
      expect(s.labelZh.length).toBeGreaterThan(0);
    }
  });
});

describe('postStamp (client-side validation)', () => {
  let fetchMock: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    fetchMock = vi.fn().mockResolvedValue({ ok: true, status: 204, json: async () => ({}) });
    vi.stubGlobal('fetch', fetchMock);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it('fires for a valid preset stamp', () => {
    postStamp({
      gameMode: 'single',
      targetCardName: 'Dragon',
      rowSignature: 'A|B|C|D',
      sourceRow: 'active',
      stampId: 'recommend',
    });
    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe('/api/card-stamps');
    expect(init.method).toBe('POST');
    const body = JSON.parse(init.body);
    expect(body.stampId).toBe('recommend');
    expect(body.targetCardName).toBe('Dragon');
    expect(body.rowSignature).toBe('A|B|C|D');
    // Internal modes 'single' / 'multiplayer' both map to legacy wire 'quick'
    // (server DB CHECK constraint still uses the legacy enum).
    expect(body.gameMode).toBe('quick');
    expect(body.messageText).toBeUndefined();
  });

  it('multiplayer mode also maps to wire "quick"', () => {
    postStamp({
      gameMode: 'multiplayer',
      targetCardName: 'Dragon',
      rowSignature: 'A|B|C|D',
      sourceRow: 'active',
      stampId: 'recommend',
    });
    const body = JSON.parse(fetchMock.mock.calls[0][1].body);
    expect(body.gameMode).toBe('quick');
  });

  it('fires for a valid freeform stamp and trims whitespace before send', () => {
    postStamp({
      gameMode: 'single',
      targetCardName: 'Dragon',
      rowSignature: 'A|B|C|D',
      sourceRow: 'preview',
      stampId: 'freeform',
      messageText: '   hello world   ',
    });
    expect(fetchMock).toHaveBeenCalledTimes(1);
    const body = JSON.parse(fetchMock.mock.calls[0][1].body);
    expect(body.stampId).toBe('freeform');
    expect(body.messageText).toBe('hello world');
  });

  it('drops empty / whitespace-only freeform without firing fetch', () => {
    postStamp({
      gameMode: 'single',
      targetCardName: 'Dragon',
      rowSignature: 'A|B|C|D',
      sourceRow: 'active',
      stampId: 'freeform',
      messageText: '   ',
    });
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('drops over-length freeform without firing fetch (length > MAX_FREEFORM_LEN after trim)', () => {
    const oversize = 'x'.repeat(MAX_FREEFORM_LEN + 1);
    postStamp({
      gameMode: 'single',
      targetCardName: 'Dragon',
      rowSignature: 'A|B|C|D',
      sourceRow: 'active',
      stampId: 'freeform',
      messageText: oversize,
    });
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('drops freeform when messageText is undefined', () => {
    postStamp({
      gameMode: 'single',
      targetCardName: 'Dragon',
      rowSignature: 'A|B|C|D',
      sourceRow: 'active',
      stampId: 'freeform',
    });
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('swallows fetch rejection without throwing into the caller', () => {
    fetchMock.mockRejectedValueOnce(new Error('boom'));
    expect(() =>
      postStamp({
        gameMode: 'single',
        targetCardName: 'Dragon',
        rowSignature: 'A|B|C|D',
        sourceRow: 'active',
        stampId: 'recommend',
      }),
    ).not.toThrow();
  });
});

describe('lookupStamps', () => {
  let fetchMock: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it('returns empty object for empty input without firing a request', async () => {
    const result = await lookupStamps([]);
    expect(result).toEqual({});
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('dedupes signatures before sending', async () => {
    fetchMock.mockResolvedValue({ ok: true, status: 200, json: async () => ({}) });
    await lookupStamps(['A', 'B', 'A', 'B', 'A']);
    expect(fetchMock).toHaveBeenCalledTimes(1);
    const body = JSON.parse(fetchMock.mock.calls[0][1].body);
    expect(body.signatures.sort()).toEqual(['A', 'B']);
  });

  it('returns parsed result on success', async () => {
    const expected = {
      'A|B|C|D': {
        Dragon: {
          stampCounts: { recommend: 3, deadly: 1 },
          freeform: [{ id: 'x', message: 'hi', createdAt: '2026-05-09T00:00:00Z' }],
        },
      },
    };
    fetchMock.mockResolvedValue({ ok: true, status: 200, json: async () => expected });
    const result = await lookupStamps(['A|B|C|D']);
    expect(result).toEqual(expected);
  });

  it('returns empty object on non-2xx response', async () => {
    fetchMock.mockResolvedValue({ ok: false, status: 500, json: async () => ({}) });
    const result = await lookupStamps(['A|B|C|D']);
    expect(result).toEqual({});
  });

  it('returns empty object on fetch rejection', async () => {
    fetchMock.mockRejectedValue(new Error('network down'));
    const result = await lookupStamps(['A|B|C|D']);
    expect(result).toEqual({});
  });

  it('returns empty object when server returns non-object JSON', async () => {
    fetchMock.mockResolvedValue({ ok: true, status: 200, json: async () => 'not-an-object' });
    const result = await lookupStamps(['A|B|C|D']);
    expect(result).toEqual({});
  });
});
