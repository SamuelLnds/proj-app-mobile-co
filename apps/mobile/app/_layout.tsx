import { Stack } from "expo-router";

// Racine de l'app : les fournisseurs (requêtes, thème, authentification) viendront ici.
export default function RootLayout() {
  return (
    <Stack>
      <Stack.Screen name="(tabs)" options={{ headerShown: false }} />
      <Stack.Screen name="login" options={{ title: "Connexion" }} />
      <Stack.Screen name="panel/[id]" options={{ title: "Panneau" }} />
    </Stack>
  );
}
