// Format des erreurs et codes (section 7.1 de la cartographie technique).
// Le `code` est en anglais et stable (utilisé par l'app), le `message` est en français.
import { z } from "zod";

/** Codes d'erreur de l'API. */
export const ErrorCodeSchema = z.enum([
  "UNAUTHENTICATED",
  "INVALID_CREDENTIALS",
  "FORBIDDEN",
  "NOT_FOUND",
  "DEVICE_OFFLINE",
  "INVALID_REQUEST",
  "TOO_MANY_ATTEMPTS",
  "INTERNAL_ERROR",
]);
export type ErrorCode = z.infer<typeof ErrorCodeSchema>;

/** Code HTTP associé à chaque code d'erreur. */
export const ERROR_HTTP_STATUS = {
  UNAUTHENTICATED: 401,
  INVALID_CREDENTIALS: 401,
  FORBIDDEN: 403,
  NOT_FOUND: 404,
  DEVICE_OFFLINE: 409,
  INVALID_REQUEST: 422,
  TOO_MANY_ATTEMPTS: 429,
  INTERNAL_ERROR: 500,
} as const satisfies Record<ErrorCode, number>;

/** Champ en erreur, listé dans `details` pour `INVALID_REQUEST`. */
export const ErrorDetailSchema = z.object({
  field: z.string(),
  message: z.string(),
});
export type ErrorDetail = z.infer<typeof ErrorDetailSchema>;

/** Corps d'une réponse d'erreur : `{ error: { code, message, details } }`. */
export const ErrorResponseSchema = z.object({
  error: z.object({
    code: ErrorCodeSchema,
    /** Message en français, affichable tel quel. */
    message: z.string(),
    /** Champs en erreur (`INVALID_REQUEST`), sinon `null`. */
    details: z.array(ErrorDetailSchema).nullable(),
  }),
});
export type ErrorResponse = z.infer<typeof ErrorResponseSchema>;
