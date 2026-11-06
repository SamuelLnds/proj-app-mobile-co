import type { ExpoConfig } from "expo/config";

// URL de base de l'API REST, lue au moment du build (variable visible dans l'app).
const apiUrl = process.env.EXPO_PUBLIC_API_URL ?? "http://localhost:3000/v1";

const config: ExpoConfig = {
  name: "Solar",
  slug: "solar",
  version: "0.0.0",
  orientation: "portrait",
  icon: "./assets/images/icon.png",
  scheme: "solar",
  userInterfaceStyle: "automatic",
  android: {
    package: "fr.solar.mobile",
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
    [
      "expo-splash-screen",
      {
        backgroundColor: "#208AEF",
        image: "./assets/images/splash-icon.png",
        imageWidth: 76,
      },
    ],
  ],
  extra: { apiUrl },
};

export default config;
