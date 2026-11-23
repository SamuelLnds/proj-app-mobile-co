import { LoginResponseSchema, type LoginResponse } from "@solar/contracts";
import * as SecureStore from "expo-secure-store";

/** Clé de la session dans expo-secure-store (jeton, expiration, utilisateur). */
const SESSION_KEY = "session";

/** Enregistre la session : le jeton n'est jamais écrit ailleurs que dans expo-secure-store. */
export async function saveSession(session: LoginResponse): Promise<void> {
  await SecureStore.setItemAsync(SESSION_KEY, JSON.stringify(session));
}

/** Session enregistrée encore valide, ou `null` (absente, illisible ou expirée). */
export async function loadSession(now = new Date()): Promise<LoginResponse | null> {
  try {
    const raw = await SecureStore.getItemAsync(SESSION_KEY);
    if (!raw) return null;
    const parsed = LoginResponseSchema.safeParse(JSON.parse(raw));
    if (parsed.success && new Date(parsed.data.expiresAt) > now) return parsed.data;
    await clearSession();
    return null;
  } catch {
    return null;
  }
}

export async function clearSession(): Promise<void> {
  try {
    await SecureStore.deleteItemAsync(SESSION_KEY);
  } catch {
    // Rien à supprimer.
  }
}
