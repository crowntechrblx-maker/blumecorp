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
  gateRequired: boolean;
  unlockGate: (password: string) => Promise<string | null>;
  refresh: () => void;
  messageNotification: MessageNotification | null;
  clearMessageNotification: () => void;
}

const AuthContext = createContext<AuthState>({
  user: null,
  loading: true,
  banned: false,
  gateRequired: false,
  unlockGate: async () => "Not ready.",
  refresh: () => {},
  messageNotification: null,
  clearMessageNotification: () => {},
});

const POLL_MS = 5000;

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<RobloxUser | null>(null);
  const [loading, setLoading] = useState(true);
  const [banned, setBanned] = useState(false);
  const [gateRequired, setGateRequired] = useState(false);
  const [messageNotification, setMessageNotification] = useState<MessageNotification | null>(null);
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const lastMessageIdRef = useRef<string | null | undefined>(undefined);

  function applyMeResponse(data: any) {
    if (data && data.gateRequired) {
      setGateRequired(true);
      setBanned(false);
      setUser(null);
      return;
    }
    setGateRequired(false);
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

  async function unlockGate(password: string): Promise<string | null> {
    const res = await fetch("/api/auth/me", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ password }),
    });
    if (!res.ok) {
      return (await res.text()) || "Incorrect password.";
    }
    refresh();
    return null;
  }

  return (
    <AuthContext.Provider
      value={{
        user,
        loading,
        banned,
        gateRequired,
        unlockGate,
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
