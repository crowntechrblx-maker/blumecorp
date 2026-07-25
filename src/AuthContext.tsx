import { createContext, useContext, useEffect, useRef, useState, type ReactNode } from "react";

export interface RobloxUser {
  userId: string;
  username: string;
  displayName: string;
  avatarUrl: string | null;
  isAdmin: boolean;
  adminMode: boolean;
}

interface AuthState {
  user: RobloxUser | null;
  loading: boolean;
  banned: boolean;
  refresh: () => void;
  toggleAdminMode: () => Promise<void>;
}

const AuthContext = createContext<AuthState>({
  user: null,
  loading: true,
  banned: false,
  refresh: () => {},
  toggleAdminMode: async () => {},
});

const POLL_MS = 15000;

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<RobloxUser | null>(null);
  const [loading, setLoading] = useState(true);
  const [banned, setBanned] = useState(false);
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);

  function applyMeResponse(data: any) {
    if (data && data.banned) {
      setUser(null);
      setBanned(true);
      return;
    }
    setBanned(false);
    setUser(data);
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
    // Polled so a ban (or an admin-mode change from another tab) takes
    // effect for someone already using the site, not just on next login.
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

  async function toggleAdminMode() {
    const res = await fetch("/api/admin", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "toggleAdminMode" }),
    });
    if (res.ok) refresh();
  }

  return (
    <AuthContext.Provider value={{ user, loading, banned, refresh, toggleAdminMode }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  return useContext(AuthContext);
}
