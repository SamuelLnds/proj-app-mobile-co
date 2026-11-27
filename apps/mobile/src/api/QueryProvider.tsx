import NetInfo from "@react-native-community/netinfo";
import {
  focusManager,
  onlineManager,
  QueryClient,
  QueryClientProvider,
} from "@tanstack/react-query";
import { useState, type ReactNode } from "react";

import { bindFocusToAppState } from "./app-focus";

// TanStack Query suit la connexion du téléphone : au retour du réseau, les écrans affichés
// sont rafraîchis sans action de l'utilisateur (#37).
onlineManager.setEventListener((setOnline) =>
  NetInfo.addEventListener((state) => setOnline(state.isConnected !== false)),
);

// TanStack Query suit aussi l'état de l'app : aucune interrogation en arrière-plan (#111).
bindFocusToAppState();

/** Client TanStack Query de l'app : les données restent affichées pendant le rafraîchissement. */
export function QueryProvider({ children }: { children: ReactNode }) {
  const [client] = useState(
    () =>
      new QueryClient({
        defaultOptions: {
          queries: {
            retry: 1,
            staleTime: 2000,
            // Retour au premier plan : les écrans affichés sont rafraîchis aussitôt, même si
            // leurs données ont moins de `staleTime` (#111).
            refetchOnWindowFocus: "always",
            // Un retour du réseau pendant que l'app est en arrière-plan ne relance rien :
            // le rafraîchissement aura lieu au retour au premier plan.
            refetchOnReconnect: () => focusManager.isFocused(),
            // Les requêtes partent même hors ligne : sans réseau, elles renvoient la copie
            // locale de SQLite au lieu de rester en attente.
            networkMode: "always",
          },
          mutations: { retry: 0 },
        },
      }),
  );
  return <QueryClientProvider client={client}>{children}</QueryClientProvider>;
}
