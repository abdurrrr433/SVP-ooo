import React, { createContext, useContext, useEffect, useState, useCallback } from "react";
import {
  accessAuthApi,
  saveAccessToken,
  clearAccessToken,
  getAccessUser,
  saveAccessUser,
  clearAccessUser,
} from "@/lib/access-api";

export interface AccessUser {
  id: string;
  name: string;
  email: string;
  role: "ADMIN" | "AGENCY" | "USER";
  status: string;
  agency_id?: string;
}

interface AccessAuthContextType {
  user: AccessUser | null;
  loading: boolean;
  isAuthenticated: boolean;
  login: (email: string, password: string) => Promise<void>;
  logout: () => void;
}

const AccessAuthContext = createContext<AccessAuthContextType>({
  user: null,
  loading: true,
  isAuthenticated: false,
  login: async () => {},
  logout: () => {},
});

export function useAccessAuth() {
  return useContext(AccessAuthContext);
}

export function AccessAuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<AccessUser | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const stored = getAccessUser();
    if (stored) {
      setUser(stored);
      // Verify token is still valid
      accessAuthApi("/me")
        .then((res) => {
          setUser(res.user);
          saveAccessUser(res.user);
        })
        .catch(() => {
          clearAccessToken();
          clearAccessUser();
          setUser(null);
        })
        .finally(() => setLoading(false));
    } else {
      setLoading(false);
    }
  }, []);

  const login = useCallback(async (email: string, password: string) => {
    const res = await accessAuthApi("/login", { email, password });
    saveAccessToken(res.accessToken);
    saveAccessUser(res.user);
    setUser(res.user);
  }, []);

  const logout = useCallback(() => {
    clearAccessToken();
    clearAccessUser();
    setUser(null);
  }, []);

  return (
    <AccessAuthContext.Provider value={{ user, loading, isAuthenticated: !!user, login, logout }}>
      {children}
    </AccessAuthContext.Provider>
  );
}
