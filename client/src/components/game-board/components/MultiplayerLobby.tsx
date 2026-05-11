/**
 * MultiplayerLobby — Phase 5 entry point for the 2-player Supabase flow.
 *
 * Shows two paths:
 *   - "Create room" — generate a shared deck locally, POST to
 *     `/api/mp/create-room`, display the 6-char code, wait (Realtime
 *     subscribed to `rooms`) for player B to join.
 *   - "Join room" — input a 6-char code, POST to `/api/mp/join-room`,
 *     receive the deck, and proceed.
 *
 * On success, calls `onReady({ sharedDeck, role, roomId, peerId })`. The
 * caller (GameBoard) then dispatches `INIT_MULTIPLAYER_GAME` with the
 * supplied deck.
 *
 * NOTE on player A's "wait for B": we subscribe to Postgres changes on
 * the `rooms` table (filter `id=eq.<roomId>`) and watch for `status =
 * 'playing'` + `player_b != null`. As soon as that update arrives, we
 * trigger `onReady` with the same deck we already uploaded.
 */

import { useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Loader2, Users, Plus } from 'lucide-react';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import type { GameCardData } from '@/components/GameCard';
import {
  createRoom,
  joinRoom,
  MultiplayerApiError,
} from '@/lib/multiplayerApi';
import { ensureAnonymousSession, getSupabaseClient } from '@/lib/supabaseClient';
import { buildSharedDeck } from '@/lib/multiplayerSharedDeck';

interface MultiplayerLobbyProps {
  open: boolean;
  onCancel: () => void;
  onReady: (params: {
    sharedDeck: GameCardData[];
    role: 'A' | 'B';
    roomId: string;
    peerId: string;
  }) => void;
}

type LobbyView = 'menu' | 'create' | 'join' | 'waiting';

interface CreateState {
  roomId: string;
  code: string;
  sharedDeck: GameCardData[];
  myUserId: string;
}

// Persist the player's chosen display name across sessions on the same device.
// Cleared by the user manually (clearing browser data) — we don't expose a
// "forget me" button yet because the name is low-stakes and they can just
// overwrite it next time they open the lobby.
const DISPLAY_NAME_STORAGE_KEY = 'dh-mp-display-name';
const MAX_DISPLAY_NAME_LENGTH = 32;

function loadStoredDisplayName(): string {
  if (typeof window === 'undefined') return '';
  try {
    const raw = window.localStorage.getItem(DISPLAY_NAME_STORAGE_KEY);
    if (raw == null) return '';
    return raw.slice(0, MAX_DISPLAY_NAME_LENGTH);
  } catch {
    return '';
  }
}

function saveStoredDisplayName(name: string): void {
  if (typeof window === 'undefined') return;
  const trimmed = name.trim().slice(0, MAX_DISPLAY_NAME_LENGTH);
  if (trimmed.length === 0) return;
  try {
    window.localStorage.setItem(DISPLAY_NAME_STORAGE_KEY, trimmed);
  } catch {
    // localStorage may be disabled (private mode / quota). Failing silently
    // means the user just has to retype their name next session — non-fatal.
  }
}

export function MultiplayerLobby({ open, onCancel, onReady }: MultiplayerLobbyProps) {
  const { t } = useTranslation();
  const [view, setView] = useState<LobbyView>('menu');
  // Lazy init from localStorage so reopening the lobby (or refreshing the
  // page) auto-fills the user's last confirmed name. We only persist after a
  // successful create/join, not on every keystroke, so half-typed names don't
  // get remembered.
  const [displayName, setDisplayName] = useState<string>(() =>
    loadStoredDisplayName(),
  );
  const [joinCode, setJoinCode] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [createState, setCreateState] = useState<CreateState | null>(null);

  // Track whether the dialog is still mounted so async callbacks don't
  // setState on unmounted component.
  const mountedRef = useRef(true);
  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
    };
  }, []);

  // Reset state whenever the dialog closes so re-opening starts fresh.
  useEffect(() => {
    if (!open) {
      setView('menu');
      setError(null);
      setBusy(false);
      setCreateState(null);
      setJoinCode('');
    }
  }, [open]);

  const formatError = (err: unknown): string => {
    if (err instanceof MultiplayerApiError) {
      switch (err.code) {
        case 'service_unavailable':
          return t('modal.multiplayerLobby.errorServiceUnavailable');
        case 'auth_failed':
          return t('modal.multiplayerLobby.errorAuthFailed');
        case 'room_not_found':
          return t('modal.multiplayerLobby.errorRoomNotFound');
        case 'room_full':
        case 'self_join':
          return t('modal.multiplayerLobby.errorRoomFull');
        case 'invalid_code':
          return t('modal.multiplayerLobby.errorInvalidCode');
        default:
          return t('modal.multiplayerLobby.errorUnknown', {
            detail: `${err.status} ${err.code}`,
          });
      }
    }
    return t('modal.multiplayerLobby.errorUnknown', {
      detail: err instanceof Error ? err.message : String(err),
    });
  };

  const trimmedDisplayName = displayName.trim();
  const hasDisplayName = trimmedDisplayName.length > 0;

  const handleCreateRoom = async () => {
    setError(null);
    if (!hasDisplayName) return;
    setBusy(true);
    try {
      const { deck, seed } = buildSharedDeck();
      const res = await createRoom({
        sharedDeck: deck,
        sharedDeckSeed: seed,
        displayName: trimmedDisplayName,
      });
      if (!mountedRef.current) return;
      // Only persist after the server accepted the request — guarantees the
      // user actually committed to this name (vs. just typed it and bailed).
      saveStoredDisplayName(trimmedDisplayName);
      setCreateState({
        roomId: res.roomId,
        code: res.code,
        sharedDeck: deck,
        myUserId: res.playerAUserId,
      });
      setView('waiting');
    } catch (err) {
      if (!mountedRef.current) return;
      setError(formatError(err));
    } finally {
      if (mountedRef.current) setBusy(false);
    }
  };

  const handleJoinRoom = async () => {
    setError(null);
    if (!hasDisplayName) return;
    const code = joinCode.trim().toUpperCase();
    if (!/^[A-Z0-9]{6}$/.test(code)) {
      setError(t('modal.multiplayerLobby.errorInvalidCode'));
      return;
    }
    setBusy(true);
    try {
      const res = await joinRoom({
        code,
        displayName: trimmedDisplayName,
      });
      if (!mountedRef.current) return;
      saveStoredDisplayName(trimmedDisplayName);
      // Fire onReady with the deck the server returned. The peer (player A)
      // will receive a Realtime update on `rooms` and proceed
      // simultaneously.
      onReady({
        sharedDeck: res.sharedDeck,
        role: 'B',
        roomId: res.roomId,
        peerId: res.playerAUserId,
      });
    } catch (err) {
      if (!mountedRef.current) return;
      setError(formatError(err));
    } finally {
      if (mountedRef.current) setBusy(false);
    }
  };

  // Player A: subscribe to `rooms` changes after creating the room. When
  // status flips to 'playing' (i.e. B joined), call `onReady` with the
  // shared deck we already have client-side.
  useEffect(() => {
    if (view !== 'waiting' || !createState) return;
    const supa = getSupabaseClient();
    if (!supa) return;

    let cancelled = false;

    void (async () => {
      const sess = await ensureAnonymousSession();
      if (cancelled || !sess) return;

      const channel = supa
        .channel(`mp:lobby:${createState.roomId}`)
        .on(
          'postgres_changes',
          {
            event: 'UPDATE',
            schema: 'public',
            table: 'rooms',
            filter: `id=eq.${createState.roomId}`,
          },
          payload => {
            const row = payload.new as
              | { status?: string; player_b?: string | null }
              | undefined;
            if (!row) return;
            if (row.status === 'playing' && row.player_b) {
              onReady({
                sharedDeck: createState.sharedDeck,
                role: 'A',
                roomId: createState.roomId,
                peerId: row.player_b,
              });
            }
          },
        )
        .subscribe();

      return () => {
        supa.removeChannel(channel);
      };
    })();

    return () => {
      cancelled = true;
    };
  }, [view, createState, onReady]);

  return (
    <Dialog
      open={open}
      onOpenChange={v => {
        if (!v) onCancel();
      }}
    >
      <DialogContent
        className="sm:max-w-md"
        onInteractOutside={e => e.preventDefault()}
        onEscapeKeyDown={e => e.preventDefault()}
      >
        <DialogHeader>
          <DialogTitle className="text-center text-xl">
            {t('modal.multiplayerLobby.title')}
          </DialogTitle>
          <DialogDescription className="text-center">
            {t('modal.multiplayerLobby.subtitle')}
          </DialogDescription>
        </DialogHeader>

        {/* MENU view: pick create or join */}
        {view === 'menu' && (
          <div className="flex flex-col gap-3 pt-2">
            <div className="flex flex-col gap-2">
              <Label htmlFor="mp-display-name" className="text-sm">
                {t('modal.multiplayerLobby.displayNameLabel')}
              </Label>
              <Input
                id="mp-display-name"
                value={displayName}
                onChange={e => setDisplayName(e.target.value)}
                placeholder={t('modal.multiplayerLobby.displayNamePlaceholder')}
                maxLength={MAX_DISPLAY_NAME_LENGTH}
                autoComplete="off"
              />
              <p className="text-xs text-muted-foreground">
                {t('modal.multiplayerLobby.displayNameHint')}
              </p>
            </div>
            <Button
              variant="default"
              size="lg"
              className="gap-2"
              disabled={!hasDisplayName}
              onClick={() => setView('create')}
            >
              <Plus className="h-4 w-4" />
              {t('modal.multiplayerLobby.createButton')}
            </Button>
            <Button
              variant="outline"
              size="lg"
              className="gap-2"
              disabled={!hasDisplayName}
              onClick={() => setView('join')}
            >
              <Users className="h-4 w-4" />
              {t('modal.multiplayerLobby.joinButton')}
            </Button>
            <Button variant="ghost" size="sm" onClick={onCancel}>
              {t('modal.multiplayerLobby.cancel')}
            </Button>
          </div>
        )}

        {/* CREATE confirmation view */}
        {view === 'create' && (
          <div className="flex flex-col gap-3 pt-2">
            {hasDisplayName && (
              <p className="text-xs text-muted-foreground">
                {t('modal.multiplayerLobby.displayNameAs', {
                  name: trimmedDisplayName,
                })}
              </p>
            )}
            <p className="text-sm text-muted-foreground">
              {t('modal.gameModeSelect.multiplayerModeDesc')}
            </p>
            <Button
              variant="default"
              size="lg"
              className="gap-2"
              disabled={busy || !hasDisplayName}
              onClick={handleCreateRoom}
            >
              {busy ? (
                <>
                  <Loader2 className="h-4 w-4 animate-spin" />
                  {t('modal.multiplayerLobby.creating')}
                </>
              ) : (
                <>
                  <Plus className="h-4 w-4" />
                  {t('modal.multiplayerLobby.createButton')}
                </>
              )}
            </Button>
            {error && (
              <p className="text-sm text-destructive" role="alert">
                {error}
              </p>
            )}
            <Button variant="ghost" size="sm" onClick={() => setView('menu')}>
              {t('modal.multiplayerLobby.back')}
            </Button>
          </div>
        )}

        {/* JOIN view */}
        {view === 'join' && (
          <div className="flex flex-col gap-3 pt-2">
            {hasDisplayName && (
              <p className="text-xs text-muted-foreground">
                {t('modal.multiplayerLobby.displayNameAs', {
                  name: trimmedDisplayName,
                })}
              </p>
            )}
            <div className="flex flex-col gap-2">
              <Label htmlFor="mp-code" className="text-sm">
                {t('modal.multiplayerLobby.codeLabel')}
              </Label>
              <Input
                id="mp-code"
                value={joinCode}
                onChange={e =>
                  setJoinCode(e.target.value.toUpperCase().slice(0, 6))
                }
                placeholder={t('modal.multiplayerLobby.codePlaceholder')}
                maxLength={6}
                className="text-center font-mono text-lg tracking-widest uppercase"
              />
            </div>
            <Button
              variant="default"
              size="lg"
              disabled={busy || joinCode.length !== 6 || !hasDisplayName}
              className="gap-2"
              onClick={handleJoinRoom}
            >
              {busy ? (
                <>
                  <Loader2 className="h-4 w-4 animate-spin" />
                  {t('modal.multiplayerLobby.joining')}
                </>
              ) : (
                <>
                  <Users className="h-4 w-4" />
                  {t('modal.multiplayerLobby.joinButton')}
                </>
              )}
            </Button>
            {error && (
              <p className="text-sm text-destructive" role="alert">
                {error}
              </p>
            )}
            <Button variant="ghost" size="sm" onClick={() => setView('menu')}>
              {t('modal.multiplayerLobby.back')}
            </Button>
          </div>
        )}

        {/* WAITING view (player A) */}
        {view === 'waiting' && createState && (
          <div className="flex flex-col items-center gap-4 pt-2">
            <div className="rounded-lg border-2 border-amber-500/40 bg-amber-500/5 px-6 py-4 text-center">
              <p className="text-xs uppercase tracking-wider text-muted-foreground">
                {t('modal.multiplayerLobby.codeLabel')}
              </p>
              <p className="mt-1 font-mono text-3xl font-bold tracking-widest text-amber-500">
                {createState.code}
              </p>
            </div>
            <p className="text-center text-sm text-muted-foreground">
              {t('modal.multiplayerLobby.waitingForPeerHint')}
            </p>
            <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
            <Button variant="ghost" size="sm" onClick={onCancel}>
              {t('modal.multiplayerLobby.cancel')}
            </Button>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
