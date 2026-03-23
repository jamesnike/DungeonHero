const BACKPACK_LOG_ENDPOINT = '/api/backpack-logs';

const isBrowser = typeof window !== 'undefined';

type BackpackLogPayload = {
  tag: string;
  payload?: unknown;
  url?: string;
  userAgent?: string;
  timestamp: number;
};

const postHeaders = {
  'Content-Type': 'application/json',
} as const;

function buildPayload(tag: string, payload?: unknown): BackpackLogPayload {
  return {
    tag,
    payload,
    url: isBrowser ? window.location.href : undefined,
    userAgent: isBrowser ? window.navigator.userAgent : undefined,
    timestamp: Date.now(),
  };
}

export function sendBackpackDebugLog(tag: string, payload?: unknown) {
  if (!isBrowser) {
    return;
  }

  const body = JSON.stringify(buildPayload(tag, payload));

  try {
    if (typeof navigator !== 'undefined' && typeof navigator.sendBeacon === 'function') {
      const blob = new Blob([body], { type: 'application/json' });
      navigator.sendBeacon(BACKPACK_LOG_ENDPOINT, blob);
      return;
    }
  } catch (error) {
    // Fallback to fetch below
    console.error('[BackpackLog] sendBeacon failed', error);
  }

  fetch(BACKPACK_LOG_ENDPOINT, {
    method: 'POST',
    headers: postHeaders,
    body,
    keepalive: true,
  }).catch(error => {
    if (process.env.NODE_ENV === 'development') {
      console.error('[BackpackLog] fetch failed', error);
    }
  });
}
