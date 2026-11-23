import type { LoginRequest, User } from "@solar/contracts";
import { useQueryClient } from "@tanstack/react-query";
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";

import { dataSource } from "../data";
import { clearResponses } from "../storage";
import { clearSession, loadSession, saveSession } from "./session";

type AuthValue = {
  user: User | null;
  login: (body: LoginRequest) => Promise<void>;
  logout: () => void;
};

const AuthContext = createContext<AuthValue | null>(null);

/**
 * Session de l'utilisateur (séquence 4.1 de l'UML). Le jeton est conservé dans
 * expo-secure-store : l'utilisateur reste connecté après un redémarrage, jusqu'à l'expiration
 * du jeton. Une réponse 401 de l'API termine la session.
 */
export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [restored, setRestored] = useState(false);
  const client = useQueryClient();

  const logout = useCallback(() => {
    dataSource.setToken(null);
    client.clear();
    setUser(null);
    void clearSession();
    void clearResponses();
  }, [client]);

  useEffect(() => {
    let active = true;
    void loadSession().then((session) => {
      if (!active) return;
      if (session) {
        dataSource.setToken(session.token);
        setUser(session.user);
      }
      setRestored(true);
    });
    return () => {
      active = false;
    };
  }, []);

  useEffect(() => {
    dataSource.onUnauthorized(logout);
    return () => dataSource.onUnauthorized(null);
  }, [logout]);

  const login = useCallback(async (body: LoginRequest) => {
    const response = await dataSource.login(body);
    dataSource.setToken(response.token);
    await saveSession(response);
    setUser(response.user);
  }, []);

  const value = useMemo(() => ({ user, login, logout }), [user, login, logout]);
  // Rien n'est affiché tant que la session enregistrée n'est pas relue (évite un passage
  // par l'écran de connexion au démarrage).
  if (!restored) return null;
  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthValue {
  const value = useContext(AuthContext);
  if (!value) throw new Error("useAuth doit être utilisé dans un AuthProvider");
  return value;
}
