import type { AlertSeverity, ControlMode, RejectionReason, SetpointStatus } from "@solar/contracts";
import { useEffect, useState } from "react";

import type { Tone } from "../components";
import { formatPercent } from "./format";

// Libellés français affichés à l'utilisateur (charte, section « Contenu et ton »).

export const MODE_LABEL: Record<ControlMode, string> = {
  manual: "Manuel",
  automatic: "Automatique",
  discharge: "Restitution",
};

export function modeDescription(
  mode: ControlMode,
  batteryShare: number | null | undefined,
): string {
  if (mode === "manual" && batteryShare !== null && batteryShare !== undefined) {
    return `Manuel · ${formatPercent(batteryShare)} vers la batterie`;
  }
  if (mode === "automatic") return "Automatique · batterie jusqu'à 80 %";
  if (mode === "discharge") return "Restitution · batterie vers le réseau";
  return MODE_LABEL[mode];
}

export const REJECTION_LABEL: Record<RejectionReason, string> = {
  battery_full: "la batterie est pleine",
  battery_low: "la batterie est faible",
  charge_limit: "puissance de charge maximale atteinte",
  invalid_setpoint: "la consigne est invalide",
};

export const SETPOINT_STATUS: Record<SetpointStatus, { label: string; tone: Tone }> = {
  sent: { label: "En attente", tone: "neutral" },
  applied: { label: "Appliquée", tone: "normal" },
  partial: { label: "Appliquée en partie", tone: "warning" },
  rejected: { label: "Refusée", tone: "critical" },
  no_response: { label: "Sans réponse", tone: "critical" },
};

export const SEVERITY: Record<AlertSeverity, { label: string; tone: Tone }> = {
  info: { label: "Information", tone: "neutral" },
  warning: { label: "Avertissement", tone: "warning" },
  critical: { label: "Critique", tone: "critical" },
};

/** Heure courante, mise à jour régulièrement (ancienneté des données). */
export function useNow(intervalMs = 1000): Date {
  const [now, setNow] = useState(() => new Date());
  useEffect(() => {
    const id = setInterval(() => setNow(new Date()), intervalMs);
    return () => clearInterval(id);
  }, [intervalMs]);
  return now;
}
