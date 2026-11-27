import type * as ExpoLocation from "expo-location";

import { dataSource } from "../data";

/** Position du téléphone, et précision annoncée (m). */
export type Position = { latitude: number; longitude: number; accuracy: number };

/** La localisation est refusée : l'écran propose alors de saisir la position à la main (#63). */
export class LocationRefusedError extends Error {
  constructor() {
    super(
      "La localisation est refusée. Autorisez-la dans Réglages › Applications › Solar › Autorisations, puis réessayez.",
    );
    this.name = "LocationRefusedError";
  }
}

/**
 * Position du téléphone pour placer ou ajouter un panneau (#62, #63, D020). Avec les données
 * d'exemple, elle est simulée près du site ; avec l'API, c'est la vraie position GPS
 * (expo-location, chargé à la demande).
 */
export async function locatePhone(site: {
  latitude: number;
  longitude: number;
}): Promise<Position> {
  if (dataSource.kind === "mock") {
    return { latitude: site.latitude - 0.00006, longitude: site.longitude + 0.0004, accuracy: 4 };
  }
  let Location: typeof ExpoLocation;
  try {
    // Chargé à la demande : une version de l'app sans ce module ne plante pas au démarrage.
    Location = await import("expo-location");
  } catch {
    throw new Error("La localisation n'est pas disponible dans cette version de l'app.");
  }
  const { status } = await Location.requestForegroundPermissionsAsync();
  if (status !== "granted") throw new LocationRefusedError();
  const { coords } = await Location.getCurrentPositionAsync({
    accuracy: Location.Accuracy.Highest,
  });
  return {
    latitude: coords.latitude,
    longitude: coords.longitude,
    accuracy: Math.round(coords.accuracy ?? 0),
  };
}
