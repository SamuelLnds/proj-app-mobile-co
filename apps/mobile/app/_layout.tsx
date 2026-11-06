import { useFonts } from "expo-font";
import { Stack } from "expo-router";
import * as SplashScreen from "expo-splash-screen";
import { StatusBar } from "expo-status-bar";
import { useEffect } from "react";

import { QueryProvider } from "../src/api";
import { AuthProvider } from "../src/auth/AuthProvider";
import { appFonts, ThemeProvider, useTheme } from "../src/theme";

// L'écran de lancement reste affiché jusqu'au chargement des polices.
void SplashScreen.preventAutoHideAsync();

function ThemedStack() {
  const { scheme, colors } = useTheme();
  return (
    <>
      <StatusBar style={scheme === "dark" ? "light" : "dark"} />
      <Stack
        screenOptions={{
          headerShown: false,
          contentStyle: { backgroundColor: colors.surface },
        }}
      >
        <Stack.Screen name="(tabs)" />
        <Stack.Screen name="login" />
        <Stack.Screen name="panel/[id]" />
      </Stack>
    </>
  );
}

// Racine de l'app : polices, requêtes, session, thème, puis navigation.
export default function RootLayout() {
  const [fontsLoaded, fontError] = useFonts(appFonts);

  useEffect(() => {
    if (fontsLoaded || fontError) void SplashScreen.hideAsync();
  }, [fontsLoaded, fontError]);

  if (!fontsLoaded && !fontError) return null;

  return (
    <QueryProvider>
      <AuthProvider>
        <ThemeProvider>
          <ThemedStack />
        </ThemeProvider>
      </AuthProvider>
    </QueryProvider>
  );
}
