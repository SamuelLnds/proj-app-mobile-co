// JWT et contrôle d'accès : vérification du jeton et du rôle requis par une route.
import fastifyJwt from "@fastify/jwt";
import type { RouteRole } from "@solar/contracts";
import type { FastifyInstance, FastifyRequest, preHandlerAsyncHookHandler } from "fastify";
import { AppError, DEFAULT_MESSAGES } from "../../errors";
import type { TokenPayload } from "./service";

/** Durée de vie du JWT (section 7.1 de la cartographie). */
export const TOKEN_TTL_S = 8 * 60 * 60;

declare module "@fastify/jwt" {
  interface FastifyJWT {
    payload: TokenPayload;
    user: TokenPayload;
  }
}

export function registerJwt(app: FastifyInstance, secret: string) {
  return app.register(fastifyJwt, {
    secret,
    sign: { algorithm: "HS256", expiresIn: TOKEN_TTL_S },
    verify: { algorithms: ["HS256"] },
  });
}

/** Contrôles d'accès à placer en `preHandler` ; vides quand l'authentification est absente (tests). */
export interface Guards {
  viewer: preHandlerAsyncHookHandler[];
  operator: preHandlerAsyncHookHandler[];
}

/**
 * Vérifie le jeton puis le rôle. Le rôle `operator` hérite des droits du rôle `viewer`.
 * Erreurs : 401 `UNAUTHENTICATED` (jeton absent, invalide ou expiré), 403 `FORBIDDEN`.
 */
export function requireRole(role: Exclude<RouteRole, "none">): preHandlerAsyncHookHandler {
  return async (request: FastifyRequest) => {
    try {
      await request.jwtVerify();
    } catch {
      throw new AppError("UNAUTHENTICATED", DEFAULT_MESSAGES.UNAUTHENTICATED);
    }
    if (role === "operator" && request.user.role !== "operator") {
      throw new AppError("FORBIDDEN", DEFAULT_MESSAGES.FORBIDDEN);
    }
  };
}
