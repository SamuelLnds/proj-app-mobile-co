// Routes de l'enrôlement des objets : HTTP uniquement, la logique est dans le service.
import { ROUTES } from "@solar/contracts";
import type { FastifyInstance } from "fastify";
import type { ZodTypeProvider } from "fastify-type-provider-zod";
import type { Guards } from "../auth/plugin";
import type { EnrollmentService } from "./service";

/** Demandes d'enrôlement permises par minute et par adresse IP (routes publiques). */
export const ENROLLMENT_REQUESTS_PER_MINUTE = 10;
/** Suivis permis par minute et par adresse IP : l'objet interroge toutes les 3 s. */
export const ENROLLMENT_POLLS_PER_MINUTE = 30;

export function enrollmentRoutes(app: FastifyInstance, service: EnrollmentService, guards: Guards) {
  const v1 = app.withTypeProvider<ZodTypeProvider>();

  // Routes de l'objet : publiques (il n'a pas de compte), limitées en débit.
  v1.post(
    "/enrollments",
    {
      config: { rateLimit: { max: ENROLLMENT_REQUESTS_PER_MINUTE, timeWindow: "1 minute" } },
      schema: {
        body: ROUTES.requestEnrollment.body,
        response: { 202: ROUTES.requestEnrollment.response },
      },
    },
    async (request, reply) => reply.status(202).send(await service.request(request.body)),
  );

  v1.get(
    "/enrollments/:fingerprint",
    {
      config: { rateLimit: { max: ENROLLMENT_POLLS_PER_MINUTE, timeWindow: "1 minute" } },
      schema: {
        params: ROUTES.getEnrollmentStatus.params,
        response: { 200: ROUTES.getEnrollmentStatus.response },
      },
    },
    (request) => service.status(request.params.fingerprint),
  );

  // Routes de l'app : réservées au rôle `operator`.
  v1.get(
    "/enrollments",
    {
      preHandler: guards.operator,
      schema: {
        querystring: ROUTES.listEnrollments.query,
        response: { 200: ROUTES.listEnrollments.response },
      },
    },
    (request) => service.list(request.query),
  );

  v1.post(
    "/enrollments/:id/accept",
    {
      preHandler: guards.operator,
      schema: {
        params: ROUTES.acceptEnrollment.params,
        body: ROUTES.acceptEnrollment.body,
        response: { 200: ROUTES.acceptEnrollment.response },
      },
    },
    (request) => service.accept(request.params.id, request.user.sub, request.body),
  );

  v1.post(
    "/enrollments/:id/reject",
    {
      preHandler: guards.operator,
      schema: {
        params: ROUTES.rejectEnrollment.params,
        response: { 200: ROUTES.rejectEnrollment.response },
      },
    },
    (request) => service.reject(request.params.id, request.user.sub),
  );

  v1.post(
    "/enrollments/:id/revoke",
    {
      preHandler: guards.operator,
      schema: {
        params: ROUTES.revokeEnrollment.params,
        response: { 200: ROUTES.revokeEnrollment.response },
      },
    },
    (request) => service.revoke(request.params.id),
  );
}
