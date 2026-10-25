import type { User } from '@mjkcart/api';
import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';

import { loadSession, saveSession, whenSessionEnds, type Session } from './api';

interface SessionState {
  /** False until the saved session has been read from secure storage. */
  ready: boolean;
  user: User | null;
  signIn(session: Session): Promise<void>;
  signOut(): Promise<void>;
  setUser(user: User): Promise<void>;
}

const Ctx = createContext<SessionState | null>(null);

export function SessionProvider({ children }: { children: ReactNode }) {
  const [ready, setReady] = useState(false);
  const [session, setSession] = useState<Session | null>(null);

  useEffect(() => {
    void loadSession().then((s) => {
      setSession(s);
      setReady(true);
    });
    whenSessionEnds(() => setSession(null));
  }, []);

  const signIn = useCallback(async (s: Session) => {
    await saveSession(s);
    setSession(s);
  }, []);
  const signOut = useCallback(async () => {
    await saveSession(null);
    setSession(null);
  }, []);
  const setUser = useCallback(async (user: User) => {
    setSession((s) => {
      if (!s) return s;
      const next = { ...s, user };
      void saveSession(next);
      return next;
    });
  }, []);

  const value = useMemo(
    () => ({ ready, user: session?.user ?? null, signIn, signOut, setUser }),
    [ready, session, signIn, signOut, setUser],
  );
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useSession() {
  const ctx = useContext(Ctx);
  if (!ctx) throw new Error('useSession needs SessionProvider');
  return ctx;
}

export function isStaff(user: User | null) {
  return user?.role === 'admin' || user?.role === 'staff';
}
