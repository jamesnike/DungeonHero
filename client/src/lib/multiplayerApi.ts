/**
 * Thin client-side wrappers around the `/api/mp/*` Vercel endpoints.
 *
 * Each function:
 *   1. Resolves a current bearer JWT (lazy anonymous sign-in via
 *      `ensureAnonymousSession()` if none exists).
 *   2. POSTs JSON to the endpoint.
 *   3. Throws `MultiplayerApiError` on non-2xx so callers can branch on
 *      status code (and a machine-readable `code`).
 *
 * Single-player / unconfigured builds: every call rejects with
 * `MultiplayerApiError(503, 'service_unavailable')` — UI should hide the
 * lobby button when `getSupabaseClient()` returns null.
 */

import type { GameCardData } from '@/components/GameCard';
import { ensureAnonymousSession, getSupabaseClient } from './supabaseClient';

export class MultiplayerApiError extends Error {
  readonly status: number;
  readonly code: string;

  constructor(status: number, code: string, message?: string) {
    super(message ?? `${status} ${code}`);
    this.name = 'MultiplayerApiError';
    this.status = status;
    this.code = code;
  }
}

async function postJson<T>(
  path: string,
  body: Record<string, unknown>,
  jwt: string,
): Promise<T> {
  const res = await fetch(path, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${jwt}`,
    },
    body: JSON.stringify(body),
  });

  if (!res.ok) {
    let code = 'unknown';
    try {
      const json = (await res.json()) as { error?: string };
      if (json?.error) code = json.error;
    } catch {
      // Response wasn't JSON — keep the default code.
    }
    throw new MultiplayerApiError(res.status, code);
  }

  // 204 No Content → no body to parse.
  if (res.status === 204) return undefined as unknown as T;
  return (await res.json()) as T;
}

async function authedPost<T>(path: string, body: Record<string, unknown>): Promise<T> {
  if (!getSupabaseClient()) {
    throw new MultiplayerApiError(503, 'service_unavailable');
  }
  const session = await ensureAnonymousSession();
  if (!session) {
    throw new MultiplayerApiError(401, 'auth_failed');
  }
  return postJson<T>(path, body, session.jwt);
}

// ---------------------------------------------------------------------------
// API surface
// ---------------------------------------------------------------------------

export interface CreateRoomResponse {
  roomId: string;
  code: string;
  status: 'waiting';
  playerARole: 'A';
  playerAUserId: string;
}

export function createRoom(params: {
  sharedDeck: GameCardData[];
  sharedDeckSeed: number;
  displayName?: string;
}): Promise<CreateRoomResponse> {
  return authedPost<CreateRoomResponse>('/api/mp/create-room', params);
}

export interface JoinRoomResponse {
  roomId: string;
  code: string;
  status: 'playing';
  playerBRole: 'B';
  playerAUserId: string;
  playerBUserId: string;
  sharedDeck: GameCardData[];
  sharedDeckSeed: number;
}

export function joinRoom(params: {
  code: string;
  displayName?: string;
}): Promise<JoinRoomResponse> {
  return authedPost<JoinRoomResponse>('/api/mp/join-room', params);
}

export interface TransferResponse {
  transferId: string;
  seq: number;
}

export function postTransfer(params: {
  roomId: string;
  fromRole: 'A' | 'B';
  cards: GameCardData[];
  sharedConsumed: number;
}): Promise<TransferResponse> {
  return authedPost<TransferResponse>('/api/mp/transfer', params);
}

export interface AckTransferResponse {
  transferId: string;
  applied: true;
}

export function ackTransfer(params: { transferId: string }): Promise<AckTransferResponse> {
  return authedPost<AckTransferResponse>('/api/mp/ack-transfer', params);
}

export interface ResumeRoomResponse {
  roomId: string;
  myRole: 'A' | 'B';
  transfers: Array<{
    id: string;
    seq: number;
    fromPlayer: 'A' | 'B';
    toPlayer: 'A' | 'B';
    cards: GameCardData[];
    sharedConsumed: number;
  }>;
  sharedDeckConsumed: number;
}

export function resumeRoom(params: {
  roomId: string;
  lastAppliedSeq: number;
}): Promise<ResumeRoomResponse> {
  return authedPost<ResumeRoomResponse>('/api/mp/resume', params);
}
