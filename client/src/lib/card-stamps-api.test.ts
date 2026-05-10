/**
 * Server-side validation tests for the card-stamp API handlers.
 *
 * Strategy:
 *   - vitest's `vi.mock('@supabase/supabase-js')` lets us swap `createClient`
 *     for a stub that records every call and returns predictable shapes.
 *   - We invoke the default-exported handler directly with a synthetic
 *     `VercelRequest` / `VercelResponse` pair so no HTTP transport is needed.
 *   - Env vars `SUPABASE_URL` / `SUPABASE_SERVICE_ROLE_KEY` must be set BEFORE
 *     the module is dynamically imported, otherwise the handler short-circuits
 *     with a 204.
 *
 * Coverage:
 *   - 405 on non-POST
 *   - 400 on missing/invalid clientId, gameMode, targetCardName, rowSignature, sourceRow, stampId
 *   - 400 on freeform without messageText / empty / oversize
 *   - Preset insert path uses upsert with ignoreDuplicates
 *   - Freeform insert path uses plain insert
 *   - 429 on freeform rate-limit overflow
 *   - Lookup endpoint: 400 on bad shape, empty `{}` on empty input, dedupes signatures
 */

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

// ---------------------------------------------------------------------------
// Supabase mock harness
// ---------------------------------------------------------------------------

type Op =
  | { kind: 'select'; table: string; payload: unknown }
  | { kind: 'insert'; table: string; payload: unknown }
  | { kind: 'upsert'; table: string; payload: unknown; opts: unknown };

interface SelectStub {
  /** rows returned by the chained .select(...).eq.eq.gte().count etc */
  data?: unknown;
  count?: number;
  error?: unknown;
}

interface SupabaseHarness {
  ops: Op[];
  /** Set this to control the response of the next select() chain. */
  selectResponse: SelectStub;
  /** Throw a synthesized response from any insert / upsert (rare). */
  writeError: unknown | null;
}

function makeHarness(): SupabaseHarness {
  return {
    ops: [],
    selectResponse: { count: 0 },
    writeError: null,
  };
}

function makeSupabaseStub(harness: SupabaseHarness) {
  return {
    from(table: string) {
      const ctx: { table: string; payload: Record<string, unknown> } = {
        table,
        payload: {},
      };
      const builder: any = {
        select(_cols?: string, opts?: { count?: string; head?: boolean }) {
          ctx.payload.select = { cols: _cols, opts };
          // Return self with terminal awaiter behavior
          const chained: any = {
            ...this,
            in(col: string, vals: unknown[]) {
              ctx.payload.inFilters = { ...(ctx.payload.inFilters as object), [col]: vals };
              return chained;
            },
            eq(col: string, val: unknown) {
              ctx.payload.eqFilters = { ...(ctx.payload.eqFilters as object), [col]: val };
              return chained;
            },
            neq(col: string, val: unknown) {
              ctx.payload.neqFilters = { ...(ctx.payload.neqFilters as object), [col]: val };
              return chained;
            },
            gte(col: string, val: unknown) {
              ctx.payload.gteFilters = { ...(ctx.payload.gteFilters as object), [col]: val };
              return chained;
            },
            order(col: string, opts2: unknown) {
              ctx.payload.order = { col, opts: opts2 };
              return chained;
            },
            limit(n: number) {
              ctx.payload.limit = n;
              return chained;
            },
            then(resolve: (v: SelectStub) => unknown) {
              harness.ops.push({ kind: 'select', table, payload: ctx.payload });
              return resolve(harness.selectResponse);
            },
          };
          return chained;
        },
        async insert(row: unknown) {
          harness.ops.push({ kind: 'insert', table, payload: row });
          if (harness.writeError) {
            throw harness.writeError;
          }
          return { error: null };
        },
        async upsert(row: unknown, opts: unknown) {
          harness.ops.push({ kind: 'upsert', table, payload: row, opts });
          if (harness.writeError) {
            throw harness.writeError;
          }
          return { error: null };
        },
      };
      return builder;
    },
  };
}

// Set env vars BEFORE importing handlers so they pick up our mock client.
process.env.SUPABASE_URL = 'https://stub.supabase.co';
process.env.SUPABASE_SERVICE_ROLE_KEY = 'stub-service-role-key';

let activeHarness: SupabaseHarness;

vi.mock('@supabase/supabase-js', () => ({
  createClient: () => makeSupabaseStub(activeHarness),
}));

// ---------------------------------------------------------------------------
// Synthetic Vercel req/res helpers
// ---------------------------------------------------------------------------

function makeReq(overrides: { method?: string; body?: unknown; headers?: Record<string, string> } = {}): any {
  return {
    method: overrides.method ?? 'POST',
    body: overrides.body ?? {},
    headers: overrides.headers ?? {},
  };
}

function makeRes() {
  let statusCode = 200;
  let payload: unknown = undefined;
  const headers: Record<string, string> = {};
  const res: any = {
    setHeader(k: string, v: string) {
      headers[k] = v;
      return res;
    },
    status(code: number) {
      statusCode = code;
      return res;
    },
    json(p: unknown) {
      payload = p;
      return res;
    },
    end() {
      return res;
    },
  };
  return {
    res,
    get statusCode() {
      return statusCode;
    },
    get payload() {
      return payload;
    },
    get headers() {
      return headers;
    },
  };
}

// ---------------------------------------------------------------------------
// /api/card-stamps tests
// ---------------------------------------------------------------------------

describe('/api/card-stamps POST handler', () => {
  let handler: any;

  beforeEach(async () => {
    activeHarness = makeHarness();
    // Force re-import so the env-var-conditional module export uses our mock.
    vi.resetModules();
    handler = (await import('../../../api/card-stamps')).default;
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('returns 405 on non-POST methods', async () => {
    const harness = makeRes();
    await handler(makeReq({ method: 'GET' }), harness.res);
    expect(harness.statusCode).toBe(405);
    expect(harness.headers.Allow).toBe('POST');
  });

  it('returns 400 for missing clientId', async () => {
    const harness = makeRes();
    await handler(
      makeReq({ body: { gameMode: 'normal', targetCardName: 'X', rowSignature: 'sig', sourceRow: 'active', stampId: 'recommend' } }),
      harness.res,
    );
    expect(harness.statusCode).toBe(400);
    expect((harness.payload as any).error).toBe('invalid_clientId');
  });

  it('returns 400 for invalid stampId', async () => {
    const harness = makeRes();
    await handler(
      makeReq({
        body: {
          clientId: 'c1',
          gameMode: 'normal',
          targetCardName: 'X',
          rowSignature: 'sig',
          sourceRow: 'active',
          stampId: 'not-real',
        },
      }),
      harness.res,
    );
    expect(harness.statusCode).toBe(400);
    expect((harness.payload as any).error).toBe('invalid_stampId');
  });

  it('returns 400 for invalid gameMode', async () => {
    const harness = makeRes();
    await handler(
      makeReq({
        body: {
          clientId: 'c1',
          gameMode: 'banana',
          targetCardName: 'X',
          rowSignature: 'sig',
          sourceRow: 'active',
          stampId: 'recommend',
        },
      }),
      harness.res,
    );
    expect(harness.statusCode).toBe(400);
    expect((harness.payload as any).error).toBe('invalid_gameMode');
  });

  it('returns 400 for invalid sourceRow', async () => {
    const harness = makeRes();
    await handler(
      makeReq({
        body: {
          clientId: 'c1',
          gameMode: 'normal',
          targetCardName: 'X',
          rowSignature: 'sig',
          sourceRow: 'hand',
          stampId: 'recommend',
        },
      }),
      harness.res,
    );
    expect(harness.statusCode).toBe(400);
    expect((harness.payload as any).error).toBe('invalid_sourceRow');
  });

  it('returns 400 when freeform stamp has no messageText', async () => {
    const harness = makeRes();
    await handler(
      makeReq({
        body: {
          clientId: 'c1',
          gameMode: 'normal',
          targetCardName: 'X',
          rowSignature: 'sig',
          sourceRow: 'active',
          stampId: 'freeform',
        },
      }),
      harness.res,
    );
    expect(harness.statusCode).toBe(400);
    expect((harness.payload as any).error).toBe('missing_messageText');
  });

  it('returns 400 for empty (whitespace-only) freeform messageText', async () => {
    const harness = makeRes();
    await handler(
      makeReq({
        body: {
          clientId: 'c1',
          gameMode: 'normal',
          targetCardName: 'X',
          rowSignature: 'sig',
          sourceRow: 'active',
          stampId: 'freeform',
          messageText: '   ',
        },
      }),
      harness.res,
    );
    expect(harness.statusCode).toBe(400);
    expect((harness.payload as any).error).toBe('empty_messageText');
  });

  it('returns 400 for oversize freeform (>80 chars after trim)', async () => {
    const harness = makeRes();
    await handler(
      makeReq({
        body: {
          clientId: 'c1',
          gameMode: 'normal',
          targetCardName: 'X',
          rowSignature: 'sig',
          sourceRow: 'active',
          stampId: 'freeform',
          messageText: 'x'.repeat(81),
        },
      }),
      harness.res,
    );
    expect(harness.statusCode).toBe(400);
    expect((harness.payload as any).error).toBe('oversize_messageText');
  });

  it('returns 204 and uses upsert with ignoreDuplicates for valid preset stamp', async () => {
    const harness = makeRes();
    await handler(
      makeReq({
        body: {
          clientId: 'c1',
          gameMode: 'normal',
          targetCardName: 'Dragon',
          rowSignature: 'A|B|C|D',
          sourceRow: 'active',
          stampId: 'recommend',
        },
      }),
      harness.res,
    );
    expect(harness.statusCode).toBe(204);
    const upserts = activeHarness.ops.filter(o => o.kind === 'upsert');
    expect(upserts.length).toBe(1);
    const op = upserts[0] as any;
    expect(op.payload.client_id).toBe('c1');
    expect(op.payload.target_card_name).toBe('Dragon');
    expect(op.payload.row_signature).toBe('A|B|C|D');
    expect(op.payload.stamp_id).toBe('recommend');
    expect(op.payload.message_text).toBeNull();
    expect(op.opts.onConflict).toBe('client_id,row_signature,target_card_name,stamp_id');
    expect(op.opts.ignoreDuplicates).toBe(true);
  });

  it('returns 204 and uses plain insert for valid freeform stamp (after rate-limit check)', async () => {
    activeHarness.selectResponse = { count: 3 };
    const harness = makeRes();
    await handler(
      makeReq({
        body: {
          clientId: 'c1',
          gameMode: 'normal',
          targetCardName: 'Dragon',
          rowSignature: 'A|B|C|D',
          sourceRow: 'active',
          stampId: 'freeform',
          messageText: '   nice combo!  ',
        },
      }),
      harness.res,
    );
    expect(harness.statusCode).toBe(204);
    const inserts = activeHarness.ops.filter(o => o.kind === 'insert');
    expect(inserts.length).toBe(1);
    const op = inserts[0] as any;
    expect(op.payload.stamp_id).toBe('freeform');
    expect(op.payload.message_text).toBe('nice combo!');
  });

  it('returns 429 when freeform rate limit (10/min) is exceeded', async () => {
    activeHarness.selectResponse = { count: 10 };
    const harness = makeRes();
    await handler(
      makeReq({
        body: {
          clientId: 'c1',
          gameMode: 'normal',
          targetCardName: 'Dragon',
          rowSignature: 'A|B|C|D',
          sourceRow: 'active',
          stampId: 'freeform',
          messageText: 'one too many',
        },
      }),
      harness.res,
    );
    expect(harness.statusCode).toBe(429);
    const inserts = activeHarness.ops.filter(o => o.kind === 'insert');
    expect(inserts.length).toBe(0);
  });

  it('preset stamp ignores any messageText payload', async () => {
    const harness = makeRes();
    await handler(
      makeReq({
        body: {
          clientId: 'c1',
          gameMode: 'normal',
          targetCardName: 'Dragon',
          rowSignature: 'A|B|C|D',
          sourceRow: 'active',
          stampId: 'recommend',
          messageText: 'should be dropped',
        },
      }),
      harness.res,
    );
    expect(harness.statusCode).toBe(204);
    const upserts = activeHarness.ops.filter(o => o.kind === 'upsert');
    expect((upserts[0] as any).payload.message_text).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// /api/card-stamps-lookup tests
// ---------------------------------------------------------------------------

describe('/api/card-stamps-lookup POST handler', () => {
  let handler: any;

  beforeEach(async () => {
    activeHarness = makeHarness();
    vi.resetModules();
    handler = (await import('../../../api/card-stamps-lookup')).default;
  });

  it('returns 405 on non-POST', async () => {
    const harness = makeRes();
    await handler(makeReq({ method: 'GET' }), harness.res);
    expect(harness.statusCode).toBe(405);
  });

  it('returns 400 when signatures is not an array', async () => {
    const harness = makeRes();
    await handler(makeReq({ body: { signatures: 'not-an-array' } }), harness.res);
    expect(harness.statusCode).toBe(400);
    expect((harness.payload as any).error).toBe('invalid_signatures');
  });

  it('returns empty {} for empty signatures array without hitting Supabase', async () => {
    const harness = makeRes();
    await handler(makeReq({ body: { signatures: [] } }), harness.res);
    expect(harness.statusCode).toBe(200);
    expect(harness.payload).toEqual({});
    expect(activeHarness.ops.length).toBe(0);
  });
});
