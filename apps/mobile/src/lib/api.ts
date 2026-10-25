import { createApi, type User } from '@mjkcart/api';
import * as SecureStore from 'expo-secure-store';

import { API_URL } from './config';

export interface Session {
  access: string;
  refresh: string;
  user: User;
}

const KEY = 'mjk.session';
/** Renew this many seconds before the access token runs out. */
const EARLY = 60;

let current: Session | null = null;
let onEnded: () => void = () => {};
let renewing: Promise<boolean> | null = null;

/** The session kept in the phone's secure storage (Keychain / Keystore), read once at start. */
export async function loadSession() {
  try {
    const raw = await SecureStore.getItemAsync(KEY);
    current = raw ? (JSON.parse(raw) as Session) : null;
  } catch {
    current = null;
  }
  return current;
}

export async function saveSession(session: Session | null) {
  current = session;
  try {
    if (session) await SecureStore.setItemAsync(KEY, JSON.stringify(session));
    else await SecureStore.deleteItemAsync(KEY);
  } catch {
    /* kept in memory for this run only */
  }
}

/** Called when the session can't be renewed, so the app can go back to the login screen. */
export function whenSessionEnds(handler: () => void) {
  onEnded = handler;
}

export const api = createApi({ baseUrl: API_URL, getToken: () => current?.access });

api.use({
  async onRequest({ request }) {
    if (current && expiresSoon(current.access) && !request.url.includes('/auth/')) {
      if (await renew()) request.headers.set('Authorization', `Bearer ${current.access}`);
      else request.headers.delete('Authorization');
    }
    return request;
  },
  // Returns nothing: the response passes through unchanged. (Returning it again fails openapi-fetch's
  // `instanceof Response` check on React Native, whose Response class is a polyfill.)
  onResponse({ request, response }) {
    if (response.status === 401 && request.headers.has('Authorization')) void endSession();
  },
});

function renew() {
  renewing ??= fetchAccess().finally(() => (renewing = null));
  return renewing;
}

async function fetchAccess() {
  if (!current) return false;
  try {
    const res = await fetch(`${API_URL}/api/v1/auth/refresh/`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ refresh: current.refresh }),
    });
    if (res.ok) {
      const { access } = (await res.json()) as { access: string };
      await saveSession({ ...current, access });
      return true;
    }
  } catch {
    return false; // offline: keep the session, the screen shows its own error
  }
  await endSession();
  return false;
}

async function endSession() {
  if (!current) return;
  await saveSession(null);
  onEnded();
}

/** True when the JWT's expiry is under a minute away, or it can't be read. */
export function expiresSoon(token: string) {
  try {
    const part = token.split('.')[1].replace(/-/g, '+').replace(/_/g, '/');
    const payload = JSON.parse(atob(part)) as { exp?: number };
    return !payload.exp || payload.exp - EARLY < Date.now() / 1000;
  } catch {
    return true;
  }
}
