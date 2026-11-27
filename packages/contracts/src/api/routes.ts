// Table des routes de l'API (section 7.2 de la cartographie technique) : pour chaque route,
// le rôle requis et les schémas d'entrée (chemin, requête, corps) et de sortie.
// Une réponse sans corps (204) a un `response` à `null`.
import type { z } from "zod";
import {
  LoginRequestSchema,
  LoginResponseSchema,
  PushTokenParamsSchema,
  RegisterPushTokenRequestSchema,
  HealthResponseSchema,
  UserSchema,
} from "./auth";
import { AlertPageSchema, AlertsQuerySchema } from "./alerts";
import {
  AcceptEnrollmentRequestSchema,
  EnrollmentPageSchema,
  EnrollmentRequestSchema,
  EnrollmentSchema,
  EnrollmentsQuerySchema,
  EnrollmentStatusResponseSchema,
  FingerprintParamsSchema,
} from "./enrollments";
import { StreamEventSchema } from "./events";
import { IdParamsSchema, MeasurementQuerySchema, PageQuerySchema } from "./common";
import {
  CreatePanelRequestSchema,
  PanelDetailSchema,
  PanelListSchema,
  PanelMeasurementSeriesSchema,
  UpdatePanelRequestSchema,
} from "./panels";
import { CreateSetpointRequestSchema, SetpointPageSchema, SetpointRecordSchema } from "./setpoints";
import { SiteDetailSchema, SiteListSchema, SiteMeasurementSeriesSchema } from "./sites";

/** Rôle minimal requis pour appeler une route. */
export type RouteRole = "none" | "viewer" | "operator";

export interface RouteContract {
  method: "GET" | "POST" | "PATCH" | "DELETE";
  /** Chemin avec les paramètres entre accolades, préfixe `/v1` compris. */
  path: string;
  role: RouteRole;
  params?: z.ZodType;
  query?: z.ZodType;
  body?: z.ZodType;
  /** Code HTTP de succès. */
  status: 200 | 201 | 202 | 204;
  /** Schéma du corps de la réponse, `null` pour un 204. */
  response: z.ZodType | null;
}

export const ROUTES = {
  health: {
    method: "GET",
    path: "/v1/health",
    role: "none",
    status: 200,
    response: HealthResponseSchema,
  },
  login: {
    method: "POST",
    path: "/v1/auth/login",
    role: "none",
    body: LoginRequestSchema,
    status: 200,
    response: LoginResponseSchema,
  },
  me: {
    method: "GET",
    path: "/v1/auth/me",
    role: "viewer",
    status: 200,
    response: UserSchema,
  },
  registerPushToken: {
    method: "POST",
    path: "/v1/push-tokens",
    role: "viewer",
    body: RegisterPushTokenRequestSchema,
    status: 204,
    response: null,
  },
  deletePushToken: {
    method: "DELETE",
    path: "/v1/push-tokens/{token}",
    role: "viewer",
    params: PushTokenParamsSchema,
    status: 204,
    response: null,
  },
  listSites: {
    method: "GET",
    path: "/v1/sites",
    role: "viewer",
    status: 200,
    response: SiteListSchema,
  },
  getSite: {
    method: "GET",
    path: "/v1/sites/{id}",
    role: "viewer",
    params: IdParamsSchema,
    status: 200,
    response: SiteDetailSchema,
  },
  getSiteMeasurements: {
    method: "GET",
    path: "/v1/sites/{id}/measurements",
    role: "viewer",
    params: IdParamsSchema,
    query: MeasurementQuerySchema,
    status: 200,
    response: SiteMeasurementSeriesSchema,
  },
  listSitePanels: {
    method: "GET",
    path: "/v1/sites/{id}/panels",
    role: "viewer",
    params: IdParamsSchema,
    status: 200,
    response: PanelListSchema,
  },
  getPanel: {
    method: "GET",
    path: "/v1/panels/{id}",
    role: "viewer",
    params: IdParamsSchema,
    status: 200,
    response: PanelDetailSchema,
  },
  createPanel: {
    method: "POST",
    path: "/v1/sites/{id}/panels",
    role: "operator",
    params: IdParamsSchema,
    body: CreatePanelRequestSchema,
    status: 201,
    response: PanelDetailSchema,
  },
  updatePanel: {
    method: "PATCH",
    path: "/v1/panels/{id}",
    role: "operator",
    params: IdParamsSchema,
    body: UpdatePanelRequestSchema,
    status: 200,
    response: PanelDetailSchema,
  },
  deletePanel: {
    method: "DELETE",
    path: "/v1/panels/{id}",
    role: "operator",
    params: IdParamsSchema,
    status: 204,
    response: null,
  },
  getPanelMeasurements: {
    method: "GET",
    path: "/v1/panels/{id}/measurements",
    role: "viewer",
    params: IdParamsSchema,
    query: MeasurementQuerySchema,
    status: 200,
    response: PanelMeasurementSeriesSchema,
  },
  createSetpoint: {
    method: "POST",
    path: "/v1/sites/{id}/setpoints",
    role: "operator",
    params: IdParamsSchema,
    body: CreateSetpointRequestSchema,
    status: 202,
    response: SetpointRecordSchema,
  },
  listSetpoints: {
    method: "GET",
    path: "/v1/sites/{id}/setpoints",
    role: "viewer",
    params: IdParamsSchema,
    query: PageQuerySchema,
    status: 200,
    response: SetpointPageSchema,
  },
  listAlerts: {
    method: "GET",
    path: "/v1/alerts",
    role: "viewer",
    query: AlertsQuerySchema,
    status: 200,
    response: AlertPageSchema,
  },
  events: {
    method: "GET",
    path: "/v1/events",
    role: "viewer",
    status: 200,
    // Flux text/event-stream : schéma des données de chaque événement `change`.
    response: StreamEventSchema,
  },
  requestEnrollment: {
    method: "POST",
    path: "/v1/enrollments",
    role: "none",
    body: EnrollmentRequestSchema,
    status: 202,
    response: EnrollmentStatusResponseSchema,
  },
  getEnrollmentStatus: {
    method: "GET",
    path: "/v1/enrollments/{fingerprint}",
    role: "none",
    params: FingerprintParamsSchema,
    status: 200,
    response: EnrollmentStatusResponseSchema,
  },
  listEnrollments: {
    method: "GET",
    path: "/v1/enrollments",
    role: "operator",
    query: EnrollmentsQuerySchema,
    status: 200,
    response: EnrollmentPageSchema,
  },
  acceptEnrollment: {
    method: "POST",
    path: "/v1/enrollments/{id}/accept",
    role: "operator",
    params: IdParamsSchema,
    body: AcceptEnrollmentRequestSchema,
    status: 200,
    response: EnrollmentSchema,
  },
  rejectEnrollment: {
    method: "POST",
    path: "/v1/enrollments/{id}/reject",
    role: "operator",
    params: IdParamsSchema,
    status: 200,
    response: EnrollmentSchema,
  },
  revokeEnrollment: {
    method: "POST",
    path: "/v1/enrollments/{id}/revoke",
    role: "operator",
    params: IdParamsSchema,
    status: 200,
    response: EnrollmentSchema,
  },
} as const satisfies Record<string, RouteContract>;

export type RouteName = keyof typeof ROUTES;
