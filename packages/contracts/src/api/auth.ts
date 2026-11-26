// Schémas de l'authentification, du profil et de la santé de l'API.
import { z } from "zod";
import { UserRoleSchema } from "../enums";
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

/** `GET /v1/health` : réponse 200. */
export const HealthResponseSchema = z.object({
  status: z.enum(["ok", "degraded"]),
  database: z.enum(["up", "down"]),
  broker: z.enum(["up", "down"]),
});
export type HealthResponse = z.infer<typeof HealthResponseSchema>;
