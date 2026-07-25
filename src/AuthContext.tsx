import { createContext, useContext, useEffect, useState, type ReactNode } from "react";

export interface RobloxUser {
  userId: string;
  username: string;
  displayName: string;
  avatarUrl: string | null;
}

interface AuthState {
  user: RobloxUser | null;
  loading: boolean;
  refresh: () => void;
}

const AuthContext = createContext<AuthState>({ user: null, loading: true, refresh: () => {} });

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<RobloxUser | null>(null);
  const [loading, setLoading] = useState(true);

  function refresh() {
    setLoading(true);
    fetch("/api/auth/me")
      .then((r) => r.json())
      .then((data) => setUser(data))
      .catch(() => setUser(null))
      .finally(() => setLoading(false));
  }

  useEffect(() => {
    refresh();
  }, []);

  return <AuthContext.Provider value={{ user, loading, refresh }}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  return useContext(AuthContext);
}
