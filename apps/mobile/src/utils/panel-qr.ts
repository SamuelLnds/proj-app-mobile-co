import { PANEL_CODE_PATTERN } from "@solar/contracts";

/** Préfixe du QR code collé sur un panneau (cartographie, section 7.2, bonus #63). */
export const PANEL_QR_PREFIX = "solar:panel:";

/**
 * Code du panneau lu dans un QR code : `solar:panel:P21` ou `P21` seul (espaces et casse tolérés).
 * Renvoie `null` si le texte n'est pas un code de panneau.
 */
export function parsePanelQr(text: string): string | null {
  const raw = text.trim();
  const code = (
    raw.toLowerCase().startsWith(PANEL_QR_PREFIX) ? raw.slice(PANEL_QR_PREFIX.length) : raw
  )
    .trim()
    .toUpperCase();
  return PANEL_CODE_PATTERN.test(code) ? code : null;
}
