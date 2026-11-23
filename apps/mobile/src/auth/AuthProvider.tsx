import type { LoginRequest, User } from "@solar/contracts";
import { useQueryClient } from "@tanstack/react-query";
import { createContext, useCallback, useContext, useMemo, useState, type ReactNode } from "react";

import { dataSource } from "../data";

type AuthValue = {
  user: User | null;
  login: (body: LoginRequest) => Promise<void>;
  logout: () => void;
};

const AuthContext = createContext<AuthValue | null>(null);

/**
 * Session de l'utilisateur. Le jeton reste en mémoire pendant l'intégration de l'interface ;
 * l'issue #28 le conservera dans expo-secure-store.
 */
export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const client = useQueryClient();

  const login = useCallback(async (body: LoginRequest) => {
    const response = await dataSource.login(body);
    dataSource.setToken(response.token);
    setUser(response.user);
  }, []);

  const logout = useCallback(() => {
    dataSource.setToken(null);
    client.clear();
    setUser(null);
  }, [client]);

  const value = useMemo(() => ({ user, login, logout }), [user, login, logout]);
  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthValue {
  const value = useContext(AuthContext);
  if (!value) throw new Error("useAuth doit être utilisé dans un AuthProvider");
  return value;
}
