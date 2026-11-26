// Transitions du statut d'un objet (diagramme d'états 5.2 de l'UML), en fonction pure.
import type { DeviceStatusValue } from "@solar/contracts";

/**
 * Événements qui font évoluer le statut :
 * - `message` : mesure ou état appliqué reçu de l'objet ;
 * - `online` / `offline` : message du topic `status` (`offline` = Last Will du broker) ;
 * - `silence` : aucun message depuis `DEVICE_SILENCE_TIMEOUT_S` (planificateur).
 */
export type DeviceEvent = "message" | "online" | "offline" | "silence";

export function nextDeviceStatus(
  current: DeviceStatusValue,
  event: DeviceEvent,
): DeviceStatusValue {
  switch (event) {
    case "message":
    case "online":
      return "online";
    case "offline":
      return "offline";
    case "silence":
      // Seul un objet en ligne peut devenir silencieux.
      return current === "online" ? "offline" : current;
  }
}
