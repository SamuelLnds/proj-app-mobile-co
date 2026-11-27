import { focusManager } from "@tanstack/react-query";
import { AppState, type AppStateStatus } from "react-native";

/** L'app n'est « au premier plan » que dans l'état `active` (pas `inactive` ni `background`). */
export function isForeground(status: AppStateStatus): boolean {
  return status === "active";
}

/**
 * Relie le `focusManager` de TanStack Query à l'état de l'app (#111), comme `onlineManager`
 * l'est à l'état du réseau. En arrière-plan, les interrogations périodiques (`refetchInterval`)
 * et les nouvelles tentatives s'arrêtent ; au retour au premier plan, les requêtes des écrans
 * affichés sont rafraîchies aussitôt (`refetchOnWindowFocus`). Les notifications push ne
 * dépendent pas de l'app et continuent d'arriver.
 */
export function bindFocusToAppState(): void {
  focusManager.setEventListener((setFocused) => {
    const subscription = AppState.addEventListener("change", (status) =>
      setFocused(isForeground(status)),
    );
    return () => subscription.remove();
  });
}
