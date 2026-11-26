import type { LoginRequest, User } from "@solar/contracts";
import { useQueryClient } from "@tanstack/react-query";
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";

import { dataSource } from "../data";
import { registerForPush } from "../notifications/push";
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

  // Jeton push Expo enregistré par ce téléphone pour l'utilisateur connecté.
  const pushToken = useRef<string | null>(null);

  // La déconnexion efface aussi la mémoire locale, dont les alertes déjà notifiées : à la
  // prochaine connexion, les alertes actives seront seulement mémorisées, sans rafale.
  const endSession = useCallback(
    (revokePushToken: boolean) => {
      // La suppression du jeton push part avec l'ancien JWT, avant son effacement : après la
      // déconnexion, le téléphone ne reçoit plus de notification. Une session expirée (401) ne
      // peut plus la demander à l'API.
      const token = pushToken.current;
      pushToken.current = null;
      if (revokePushToken && token) void dataSource.deletePushToken(token).catch(() => undefined);
      dataSource.setToken(null);
      client.clear();
      setUser(null);
      void clearSession();
      void clearResponses();
    },
    [client],
  );
  const logout = useCallback(() => endSession(true), [endSession]);

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
    dataSource.onUnauthorized(() => endSession(false));
    return () => dataSource.onUnauthorized(null);
  }, [endSession]);

  // Notifications : après la connexion (ou la restauration de la session), autorisation, jeton
  // push Expo puis `POST /push-tokens` (séquence 4.1 de l'UML). Sans module natif, sans
  // autorisation, sans configuration Firebase ou sans réseau, l'app fonctionne sans notification :
  // les alertes restent visibles dans l'app.
  const userId = user?.id;
  useEffect(() => {
    if (!userId || dataSource.kind !== "api") return;
    let active = true;
    void registerForPush()
      .then(async (registration) => {
        if (!registration || !active) return;
        await dataSource.registerPushToken(registration);
        if (active) pushToken.current = registration.token;
      })
      .catch((error: unknown) => {
        console.warn(
          "[push] Enregistrement du jeton refusé :",
          error instanceof Error ? error.message : "erreur inconnue",
        );
      });
    return () => {
      active = false;
    };
  }, [userId]);

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
