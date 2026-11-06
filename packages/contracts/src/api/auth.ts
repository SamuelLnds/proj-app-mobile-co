// Schémas de l'authentification, du profil, des jetons de notification et de la santé de l'API.
import { z } from "zod";
import { MobilePlatformSchema, UserRoleSchema } from "../enums";
import { Iso8601UtcSchema } from "../primitives";

/** `User` : utilisateur connecté. */
export const UserSchema = z.object({
  id: z.uuid(),
  email: z.string(),
  name: z.string(),
  role: UserRoleSchema,
});
export type User = z.infer<typeof UserSchema>;

/** `POST /v1/auth/login` : corps de la requête. */
export const LoginRequestSchema = z.object({
  email: z.email(),
  password: z.string().min(1),
});
export type LoginRequest = z.infer<typeof LoginRequestSchema>;

/** `POST /v1/auth/login` : réponse 200. */
export const LoginResponseSchema = z.object({
  token: z.string(),
  expiresAt: Iso8601UtcSchema,
  user: UserSchema,
});
export type LoginResponse = z.infer<typeof LoginResponseSchema>;

/** `POST /v1/push-tokens` : corps de la requête (réponse 204). */
export const RegisterPushTokenRequestSchema = z.object({
  token: z.string().min(1),
  platform: MobilePlatformSchema,
});
export type RegisterPushTokenRequest = z.infer<typeof RegisterPushTokenRequestSchema>;

/** `DELETE /v1/push-tokens/{token}` : paramètres de chemin (réponse 204). */
export const PushTokenParamsSchema = z.object({
  token: z.string().min(1),
});
export type PushTokenParams = z.infer<typeof PushTokenParamsSchema>;

/** `GET /v1/health` : réponse 200. */
export const HealthResponseSchema = z.object({
  status: z.enum(["ok", "degraded"]),
  database: z.enum(["up", "down"]),
  broker: z.enum(["up", "down"]),
});
export type HealthResponse = z.infer<typeof HealthResponseSchema>;
