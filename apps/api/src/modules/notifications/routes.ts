// Routes des jetons push : HTTP uniquement, la logique est dans le service.
import { ROUTES } from "@solar/contracts";
import type { FastifyInstance } from "fastify";
import type { ZodTypeProvider } from "fastify-type-provider-zod";
import type { Guards } from "../auth/plugin";
import type { PushService } from "./service";

export function pushRoutes(app: FastifyInstance, service: PushService, guards: Guards) {
  const v1 = app.withTypeProvider<ZodTypeProvider>();

  v1.post(
    "/push-tokens",
    { preHandler: guards.viewer, schema: { body: ROUTES.registerPushToken.body } },
    async (request, reply) => {
      await service.register(request.user.sub, request.body);
      return reply.status(204).send();
    },
  );

  v1.delete(
    "/push-tokens/:token",
    { preHandler: guards.viewer, schema: { params: ROUTES.deletePushToken.params } },
    async (request, reply) => {
      await service.remove(request.user.sub, request.params.token);
      return reply.status(204).send();
    },
  );
}
