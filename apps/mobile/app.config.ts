import { existsSync } from "node:fs";

import type { ExpoConfig } from "expo/config";

// URL de base de l'API REST, lue au moment du build (variable visible dans l'app).
const apiUrl = process.env.EXPO_PUBLIC_API_URL ?? "http://localhost:3000/v1";

// Configuration Firebase (FCM) du push Expo, propre au projet Firebase du binôme (D030) : variable
// d'environnement EAS de type fichier `GOOGLE_SERVICES_JSON` (le build y trouve le chemin du
// fichier), sinon `google-services.json` local s'il existe. Sans fichier, le build reste possible
// mais l'app n'obtient pas de jeton push (voir README.md).
const googleServicesFile =
  process.env.GOOGLE_SERVICES_JSON ??
  (existsSync("./google-services.json") ? "./google-services.json" : undefined);

const config: ExpoConfig = {
  name: "Solar",
  slug: "solar",
  version: "0.0.0",
  orientation: "portrait",
  icon: "./assets/images/icon.png",
  // Schéma des liens ouvrant l'app
  scheme: "solar",
  userInterfaceStyle: "automatic",
  android: {
    package: "fr.solar.mobile",
    ...(googleServicesFile ? { googleServicesFile } : {}),
    adaptiveIcon: {
      backgroundColor: "#E6F4FE",
      foregroundImage: "./assets/images/android-icon-foreground.png",
      backgroundImage: "./assets/images/android-icon-background.png",
      monochromeImage: "./assets/images/android-icon-monochrome.png",
    },
    predictiveBackGestureEnabled: false,
  },
  plugins: [
    "expo-router",
    "expo-secure-store",
    "expo-notifications",
    "expo-sqlite",
    [
      "expo-location",
      {
        locationWhenInUsePermission:
          "Solar utilise votre position pour placer un panneau sur la carte du parc.",
      },
    ],
    [
      "expo-splash-screen",
      {
        backgroundColor: "#208AEF",
        image: "./assets/images/splash-icon.png",
        imageWidth: 76,
      },
    ],
  ],
  extra: {
    apiUrl,
    // Projet EAS du binôme (expo.dev), utilisé par eas build et eas update
    eas: { projectId: "fb8b2b42-bc7f-476d-a96c-528db6e36d6a" },
  },
};

export default config;
