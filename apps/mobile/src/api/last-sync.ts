import { useSyncExternalStore } from "react";

/**
 * Date des données affichées (#37) : celle de la dernière réponse reçue du serveur, ou, sans
 * réseau, celle de la copie locale relue. Affichée dans le bandeau « Hors ligne ».
 */
let lastSync: string | null = null;
const listeners = new Set<() => void>();

export function setLastSync(iso: string): void {
  if (lastSync && iso <= lastSync) return;
  lastSync = iso;
  for (const listener of listeners) listener();
}

/** Remise à zéro (déconnexion, tests). */
export function resetLastSync(): void {
  lastSync = null;
  for (const listener of listeners) listener();
}

export function useLastSync(): string | null {
  return useSyncExternalStore(
    (listener) => {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    () => lastSync,
  );
}
