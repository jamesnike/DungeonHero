-- =============================================================================
-- Multiplayer phase-4 schema: rooms / transfers / player_profiles
-- =============================================================================
--
-- Plan reference: `.cursor/plans/2-player_multiplayer_mode_*.plan.md` §4.1.
--
-- Data model:
--
--   rooms            — one row per active multiplayer game (lifetime: hours)
--   transfers        — append-only log of every "card pushed to peer" event,
--                      seq-ordered per room
--   player_profiles  — display name etc. keyed by `auth.users.id`
--                      (Supabase Anonymous Auth assigns anonymous uuids
--                      automatically — no signup required)
--
-- RLS posture:
--
--   Every table has RLS enabled. Players can only read rooms they're a
--   participant in (player_a or player_b), and only read transfers from
--   those rooms. Writes go through service-role server endpoints
--   (`api/mp/*.ts`) — clients NEVER write directly to these tables. This
--   matches the existing pattern in `api/game-start.ts` /
--   `api/card-stamps.ts` where the API endpoint owns server-side logic
--   and the client only reads via the realtime channel.
--
-- Apply via:
--
--   $ supabase db push    # if using local CLI workflow, OR
--   pasted into the Supabase SQL editor in the dashboard
--
-- Idempotent: each `create table` uses `if not exists`, every `create
-- policy` uses `or replace` (where supported) or `drop ... if exists` first.
-- =============================================================================

-- -----------------------------------------------------------------------------
-- player_profiles
-- -----------------------------------------------------------------------------

create table if not exists public.player_profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  display_name text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

comment on table public.player_profiles is
  'Per-user multiplayer profile, keyed by Supabase auth.users.id. Anonymous '
  'auth populates auth.users automatically; the client posts to '
  '/api/mp/upsert-profile to fill in display_name on first room join.';

alter table public.player_profiles enable row level security;

drop policy if exists "player_profiles_select_self" on public.player_profiles;
create policy "player_profiles_select_self"
  on public.player_profiles
  for select
  using (auth.uid() = id);

-- Other players' profiles must be readable when you're in a room with them
-- (so the lobby can show "waiting for <DisplayName>"). Without this, the
-- lobby would only show peer uuid stubs.
drop policy if exists "player_profiles_select_room_peer" on public.player_profiles;
create policy "player_profiles_select_room_peer"
  on public.player_profiles
  for select
  using (
    id in (
      select player_a from public.rooms where auth.uid() = player_b
      union
      select player_b from public.rooms where auth.uid() = player_a
    )
  );

-- -----------------------------------------------------------------------------
-- rooms
-- -----------------------------------------------------------------------------

create table if not exists public.rooms (
  id uuid primary key default gen_random_uuid(),

  -- 6-char join code. Generated client-side or by `/api/mp/create-room`.
  -- Kept short so it can be SMS'd / verbally shared. Unique constraint
  -- means create-room must retry on rare collisions.
  code text not null unique,

  -- 'waiting'  — created, awaiting second player
  -- 'playing'  — both players joined; transfers may flow
  -- 'ended'    — game over (either side reached final monster / abandoned)
  --              `ended` rooms are kept around for ~24h so resume / replay
  --              works after a tab close, then garbage collected.
  status text not null check (status in ('waiting', 'playing', 'ended')),

  player_a uuid not null references auth.users(id) on delete cascade,
  player_b uuid references auth.users(id) on delete set null,

  -- Deck synchronization. The server constructs the deck once on
  -- create-room (using the existing client `createDeck` ported to
  -- `api/mp/_deck.ts`) and stores both:
  --   shared_deck_seed  — for any client-side determinism we want later
  --                       (e.g. animations seeded by the server)
  --   shared_deck_full  — the actual GameCardData[] in serialized form.
  --                       Snapshotted at create-time so the same room
  --                       can be replayed on resume even after schema
  --                       version bumps.
  -- shared_deck_consumed — total cards consumed from the SHARED suffix
  --                       across both players combined. Updated on every
  --                       transfer ack. Phase-6 resume reads this to
  --                       reconstruct each player's view.
  shared_deck_seed bigint not null,
  shared_deck_full jsonb not null,
  shared_deck_consumed integer not null default 0,

  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  ended_at timestamptz
);

comment on table public.rooms is
  'One row per active 2-player game. Lifetime: created → waiting → playing '
  '→ ended. Cleanup of ended rooms is a separate scheduled job.';

create index if not exists rooms_code_idx on public.rooms (code);
create index if not exists rooms_player_a_idx on public.rooms (player_a) where status != 'ended';
create index if not exists rooms_player_b_idx on public.rooms (player_b) where status != 'ended';

alter table public.rooms enable row level security;

-- Read your own rooms only. The client uses this to populate the lobby
-- "join history" and to load the room state on resume.
drop policy if exists "rooms_select_own" on public.rooms;
create policy "rooms_select_own"
  on public.rooms
  for select
  using (auth.uid() in (player_a, player_b));

-- All writes go through service-role API endpoints (no client direct
-- write). We deliberately do NOT add a permissive insert/update policy
-- here.

-- -----------------------------------------------------------------------------
-- transfers
-- -----------------------------------------------------------------------------

create table if not exists public.transfers (
  id uuid primary key default gen_random_uuid(),
  room_id uuid not null references public.rooms(id) on delete cascade,

  -- Per-room monotonic sequence. The server allocates this in a single
  -- transaction with the row insert, so seqs are dense (1, 2, 3, ...)
  -- and there are no gaps. Receiver client uses
  -- `lastAppliedSeq` to dedupe / resume.
  seq integer not null,

  from_player text not null check (from_player in ('A', 'B')),
  to_player text not null check (to_player in ('A', 'B')),

  -- Cards pushed onto peer's deck top, JSON-serialized GameCardData[].
  -- Empty array `[]` is valid (it just means the sender consumed shared
  -- cards but had nothing to push, e.g. a returnToDeck-only waterfall).
  cards jsonb not null default '[]'::jsonb,

  -- How many cards the sender consumed from the shared suffix this turn.
  -- DEPRECATED — kept for backward compat with rows from the count-based
  -- protocol. Current protocol uses `preview_dealt` (id-based) instead.
  shared_consumed integer not null default 0 check (shared_consumed >= 0),

  -- Cards the sender dealt from its remainingDeck top to its own preview
  -- row during this waterfall. The receiver removes these cards from its
  -- own remainingDeck by id (only the ones it actually has are removed;
  -- cards that were previously transferred from the receiver are silently
  -- skipped). Carries enough info to keep the shared suffix in sync without
  -- relying on the count-based `shared_consumed` field.
  preview_dealt jsonb not null default '[]'::jsonb,

  -- Set to `true` after the receiving client successfully dispatched
  -- both RECEIVE_TRANSFER + SHARED_SHRINK. Used by `/api/mp/resume` to
  -- know which transfers still need to be replayed on a tab reload.
  applied boolean not null default false,
  applied_at timestamptz,

  created_at timestamptz not null default now(),

  -- Prevent duplicate seqs per-room (server allocator must succeed
  -- atomically; this constraint catches programming bugs).
  unique (room_id, seq)
);

comment on table public.transfers is
  'Append-only log of every "card pushed to peer" event. Receiver acks via '
  '/api/mp/ack-transfer to flip `applied` true. Realtime subscription on '
  'this table is the primary push channel for the multiplayer client.';

create index if not exists transfers_room_seq_idx on public.transfers (room_id, seq);
create index if not exists transfers_unapplied_idx
  on public.transfers (room_id, to_player)
  where applied = false;

alter table public.transfers enable row level security;

-- Read transfers only from rooms you participate in. Realtime subscription
-- inherits this policy, so each player only receives their own room's
-- broadcasts.
drop policy if exists "transfers_select_own_room" on public.transfers;
create policy "transfers_select_own_room"
  on public.transfers
  for select
  using (
    room_id in (
      select id from public.rooms where auth.uid() in (player_a, player_b)
    )
  );

-- -----------------------------------------------------------------------------
-- Realtime publication: enable INSERT / UPDATE on transfers
-- -----------------------------------------------------------------------------
--
-- The Supabase Realtime extension emits postgres_changes on INSERT/UPDATE
-- automatically once a table is added to the supabase_realtime publication.
-- Without this, `supabase.channel(...).on('postgres_changes', ...)` won't
-- receive any payloads.

alter publication supabase_realtime add table public.transfers;

-- Optional: also publish room status changes so the lobby can update when
-- player_b joins or status flips to 'ended'.
alter publication supabase_realtime add table public.rooms;

-- =============================================================================
-- End of multiplayer phase-4 schema
-- =============================================================================
