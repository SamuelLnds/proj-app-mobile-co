// Routes des historiques : HTTP uniquement, la logique est dans le service.
import { ROUTES } from "@solar/contracts";
import type { FastifyInstance } from "fastify";
import type { ZodTypeProvider } from "fastify-type-provider-zod";
import type { Guards } from "../auth/plugin";
import type { HistoryService } from "./service";

export function historyRoutes(app: FastifyInstance, service: HistoryService, guards: Guards) {
  const v1 = app.withTypeProvider<ZodTypeProvider>();

  v1.get(
    "/sites/:id/measurements",
    {
      preHandler: guards.viewer,
      schema: {
        params: ROUTES.getSiteMeasurements.params,
        querystring: ROUTES.getSiteMeasurements.query,
        response: { 200: ROUTES.getSiteMeasurements.response },
      },
    },
    (request) => service.siteSeries(request.params.id, request.query),
  );

  v1.get(
    "/panels/:id/measurements",
    {
      preHandler: guards.viewer,
      schema: {
        params: ROUTES.getPanelMeasurements.params,
        querystring: ROUTES.getPanelMeasurements.query,
        response: { 200: ROUTES.getPanelMeasurements.response },
      },
    },
    (request) => service.panelSeries(request.params.id, request.query),
  );
}
