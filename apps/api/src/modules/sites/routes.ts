// Routes de consultation des sites : HTTP uniquement, la logique est dans le service.
import { ROUTES } from "@solar/contracts";
import type { FastifyInstance, preHandlerAsyncHookHandler } from "fastify";
import type { ZodTypeProvider } from "fastify-type-provider-zod";
import type { SitesService } from "./service";

export interface SitesRoutesOptions {
  service: SitesService;
  /**
   * Vérification du JWT et du rôle `viewer` : point d'accroche de l'authentification (#27).
   * Absente tant que l'authentification n'est pas réalisée.
   */
  authenticate?: preHandlerAsyncHookHandler;
}

export function sitesRoutes(app: FastifyInstance, { service, authenticate }: SitesRoutesOptions) {
  const v1 = app.withTypeProvider<ZodTypeProvider>();
  const preHandler = authenticate ? [authenticate] : [];

  v1.get("/sites", { preHandler, schema: { response: { 200: ROUTES.listSites.response } } }, () =>
    service.listSites(),
  );

  v1.get(
    "/sites/:id",
    {
      preHandler,
      schema: {
        params: ROUTES.getSite.params,
        response: { 200: ROUTES.getSite.response },
      },
    },
    (request) => service.getSite(request.params.id),
  );
}
