// Erreurs applicatives et format de réponse { error: { code, message, details } }.
import { ERROR_HTTP_STATUS } from "@solar/contracts";
import type { ErrorCode, ErrorDetail, ErrorResponse } from "@solar/contracts";

/** Erreur levée par les services ; le gestionnaire central la convertit en réponse HTTP. */
export class AppError extends Error {
  readonly code: ErrorCode;
  readonly details: ErrorDetail[] | null;

  constructor(code: ErrorCode, message: string, details: ErrorDetail[] | null = null) {
    super(message);
    this.name = "AppError";
    this.code = code;
    this.details = details;
  }

  get statusCode(): number {
    return ERROR_HTTP_STATUS[this.code];
  }
}

/** Messages par défaut, en français et affichables tels quels. */
export const DEFAULT_MESSAGES: Record<ErrorCode, string> = {
  UNAUTHENTICATED: "Authentification requise ou session expirée.",
  INVALID_CREDENTIALS: "E-mail ou mot de passe incorrect.",
  FORBIDDEN: "Vous n'avez pas les droits nécessaires pour cette action.",
  NOT_FOUND: "La ressource demandée est introuvable.",
  DEVICE_OFFLINE: "L'objet du site est hors ligne, la consigne ne peut pas être envoyée.",
  INVALID_REQUEST: "La requête est invalide.",
  TOO_MANY_ATTEMPTS: "Trop de tentatives, réessayez dans une minute.",
  INTERNAL_ERROR: "Une erreur inattendue est survenue.",
};

/** Construit le corps d'une réponse d'erreur. */
export function errorBody(
  code: ErrorCode,
  message: string = DEFAULT_MESSAGES[code],
  details: ErrorDetail[] | null = null,
): ErrorResponse {
  return { error: { code, message, details } };
}
