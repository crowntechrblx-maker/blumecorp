import { createContext, useContext, useEffect, useRef, useState, type ReactNode } from "react";

export interface RobloxUser {
  userId: string;
  username: string;
  displayName: string;
  avatarUrl: string | null;
  isAdmin: boolean;
}

export interface MessageNotification {
  id: string;
  fromUsername: string;
}

interface AuthState {
  user: RobloxUser | null;
  loading: boolean;
  banned: boolean;
  refresh: () => void;
  messageNotification: MessageNotification | null;
  clearMessageNotification: () => void;
}

const AuthContext = createContext<AuthState>({
  user: null,
  loading: true,
  banned: false,
  refresh: () => {},
  messageNotification: null,
  clearMessageNotification: () => {},
});

// Also drives how quickly a new-message toast/ding can appear, since that
// check is piggybacked on this same poll rather than a dedicated endpoint.
const POLL_MS = 5000;

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<RobloxUser | null>(null);
  const [loading, setLoading] = useState(true);
  const [banned, setBanned] = useState(false);
  const [messageNotification, setMessageNotification] = useState<MessageNotification | null>(null);
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);
  // undefined = haven't established a baseline yet (don't notify on first load)
  const lastMessageIdRef = useRef<string | null | undefined>(undefined);

  function applyMeResponse(data: any) {
    if (data && data.banned) {
      setUser(null);
      setBanned(true);
      return;
    }
    setBanned(false);
    setUser(data);

    const latest = data?.latestIncomingMessage as { id: string; fromUsername: string } | null | undefined;
    if (latest === undefined) return;
    const latestId = latest ? latest.id : null;
    if (lastMessageIdRef.current === undefined) {
      // First load after mount/login — just record the baseline, no toast.
      lastMessageIdRef.current = latestId;
      return;
    }
    if (latestId && latestId !== lastMessageIdRef.current) {
      setMessageNotification({ id: latest!.id, fromUsername: latest!.fromUsername });
    }
    lastMessageIdRef.current = latestId;
  }

  function refresh() {
    setLoading(true);
    fetch("/api/auth/me")
      .then((r) => r.json())
      .then(applyMeResponse)
      .catch(() => setUser(null))
      .finally(() => setLoading(false));
  }

  useEffect(() => {
    refresh();
    // Polled so a ban takes effect for someone already using the site, not
    // just on next login — and so a new incoming message can trigger a
    // toast promptly.
    pollRef.current = setInterval(() => {
      fetch("/api/auth/me")
        .then((r) => r.json())
        .then(applyMeResponse)
        .catch(() => {});
    }, POLL_MS);
    return () => {
      if (pollRef.current) clearInterval(pollRef.current);
    };
  }, []);

  function clearMessageNotification() {
    setMessageNotification(null);
  }

  return (
    <AuthContext.Provider
      value={{
        user,
        loading,
        banned,
        refresh,
        messageNotification,
        clearMessageNotification,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  return useContext(AuthContext);
}
