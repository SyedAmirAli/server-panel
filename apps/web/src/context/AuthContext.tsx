import { createContext, useContext, useEffect, useState, type ReactNode } from "react";
import type { AdminLoginResponse } from "@appszone/shared";
import { api, getToken, setToken, clearToken, setUnauthorizedHandler } from "@/lib/api";

interface AuthState {
  isAuthenticated: boolean;
  isLoading: boolean;
  login: (password: string) => Promise<void>;
  logout: () => void;
}

const AuthContext = createContext<AuthState | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [isAuthenticated, setIsAuthenticated] = useState<boolean>(() => !!getToken());
  const [isLoading] = useState(false);

  useEffect(() => {
    setUnauthorizedHandler(() => setIsAuthenticated(false));
  }, []);

  async function login(password: string) {
    const res = await api<AdminLoginResponse>("/admin/login", {
      method: "POST",
      body: { password },
      auth: false,
    });
    setToken(res.token);
    setIsAuthenticated(true);
  }

  function logout() {
    clearToken();
    setIsAuthenticated(false);
  }

  return (
    <AuthContext.Provider value={{ isAuthenticated, isLoading, login, logout }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth(): AuthState {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used within AuthProvider");
  return ctx;
}
