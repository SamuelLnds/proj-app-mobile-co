import NetInfo from "@react-native-community/netinfo";
import { onlineManager, QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { useState, type ReactNode } from "react";

// TanStack Query suit la connexion du téléphone : au retour du réseau, les écrans affichés
// sont rafraîchis sans action de l'utilisateur (#37).
onlineManager.setEventListener((setOnline) =>
  NetInfo.addEventListener((state) => setOnline(state.isConnected !== false)),
);

/** Client TanStack Query de l'app : les données restent affichées pendant le rafraîchissement. */
export function QueryProvider({ children }: { children: ReactNode }) {
  const [client] = useState(
    () =>
      new QueryClient({
        defaultOptions: {
          queries: {
            retry: 1,
            staleTime: 2000,
            refetchOnWindowFocus: false,
            refetchOnReconnect: true,
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
