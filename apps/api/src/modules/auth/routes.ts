// Routes d'authentification : HTTP uniquement, la logique est dans le service.
import { ROUTES, type LoginResponse } from "@solar/contracts";
import type { FastifyInstance } from "fastify";
import type { ZodTypeProvider } from "fastify-type-provider-zod";
import { requireRole, TOKEN_TTL_S } from "./plugin";
import type { AuthService } from "./service";

/** Tentatives de connexion permises par minute et par adresse IP (section 7.1). */
export const LOGIN_ATTEMPTS_PER_MINUTE = 5;

export function authRoutes(app: FastifyInstance, service: AuthService) {
  const v1 = app.withTypeProvider<ZodTypeProvider>();

  v1.post(
    "/auth/login",
    {
      config: { rateLimit: { max: LOGIN_ATTEMPTS_PER_MINUTE, timeWindow: "1 minute" } },
      schema: { body: ROUTES.login.body, response: { 200: ROUTES.login.response } },
    },
    async (request, reply): Promise<LoginResponse> => {
      const user = await service.verifyCredentials(request.body);
      const token = await reply.jwtSign({ sub: user.id, role: user.role });
      const expiresAt = new Date(Date.now() + TOKEN_TTL_S * 1000).toISOString();
      return { token, expiresAt, user };
    },
  );

  v1.get(
    "/auth/me",
    { preHandler: requireRole("viewer"), schema: { response: { 200: ROUTES.me.response } } },
    (request) => service.getUser(request.user.sub),
  );
}
