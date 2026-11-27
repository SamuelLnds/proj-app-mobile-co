import {
  ErrorResponseSchema,
  ROUTES,
  type AcceptEnrollmentRequest,
  type AlertPage,
  type AlertsQuery,
  type CreatePanelRequest,
  type CreateSetpointRequest,
  type Enrollment,
  type EnrollmentPage,
  type EnrollmentsQuery,
  type LoginRequest,
  type LoginResponse,
  type MeasurementQuery,
  type PageQuery,
  type PanelDetail,
  type PanelList,
  type PanelMeasurementPoint,
  type RegisterPushTokenRequest,
  type SetpointPage,
  type SetpointRecord,
  type SiteDetail,
  type SiteList,
  type SiteMeasurementSeries,
  type UpdatePanelRequest,
} from "@solar/contracts";
import { DataSourceError, type DataSource } from "../DataSource";
import { openEventStream, type EventStreamHandlers } from "./event-stream";

type Method = "GET" | "POST" | "PATCH" | "DELETE";
type Query = Record<string, string | number | undefined>;
/** Schéma de réponse : tout schéma Zod de @solar/contracts convient. */
type ResponseSchema<T> = {
  safeParse: (value: unknown) => { success: true; data: T } | { success: false };
};

/** Remplace les paramètres `{nom}` d'un chemin de la table ROUTES. */
function fillPath(path: string, params: Record<string, string>): string {
  return path.replace(/\{(\w+)\}/g, (_, name: string) => encodeURIComponent(params[name] ?? ""));
}

/**
 * Source `api` (issue #25) : appels HTTP à l'API REST, avec le JWT dans l'en-tête
 * `Authorization`. Chaque réponse est validée par son schéma de @solar/contracts, et chaque
 * erreur est convertie en `DataSourceError` avec le code et le message de l'API.
 */
export class ApiDataSource implements DataSource {
  readonly kind = "api" as const;
  private token: string | null = null;
  private unauthorizedListener: (() => void) | null = null;

  constructor(
    /** URL de base, préfixe `/v1` compris (EXPO_PUBLIC_API_URL). */
    private readonly baseUrl: string,
    private readonly fetchFn: typeof fetch = (...args) => fetch(...args),
  ) {}

  setToken(token: string | null): void {
    this.token = token;
  }

  onUnauthorized(listener: (() => void) | null): void {
    this.unauthorizedListener = listener;
  }

  private async request<T>(
    method: Method,
    route: { path: string; response: ResponseSchema<T> | null },
    options: { params?: Record<string, string>; query?: Query; body?: unknown } = {},
  ): Promise<T> {
    // Les chemins de la table ROUTES commencent par /v1, déjà présent dans l'URL de base.
    const path = fillPath(route.path, options.params ?? {}).replace(/^\/v1/, "");
    const search = new URLSearchParams();
    for (const [key, value] of Object.entries(options.query ?? {})) {
      if (value !== undefined) search.set(key, String(value));
    }
    const url = `${this.baseUrl.replace(/\/$/, "")}${path}${search.size ? `?${search}` : ""}`;

    let response: Response;
    try {
      response = await this.fetchFn(url, {
        method,
        headers: {
          Accept: "application/json",
          ...(options.body !== undefined && { "Content-Type": "application/json" }),
          ...(this.token && { Authorization: `Bearer ${this.token}` }),
        },
        body: options.body !== undefined ? JSON.stringify(options.body) : undefined,
      });
    } catch {
      throw new DataSourceError("NETWORK_ERROR", "Serveur injoignable. Vérifiez votre connexion.");
    }

    if (!response.ok) {
      const parsed = ErrorResponseSchema.safeParse(await response.json().catch(() => null));
      const error = parsed.success
        ? new DataSourceError(parsed.data.error.code, parsed.data.error.message)
        : new DataSourceError("INTERNAL_ERROR", "Une erreur inattendue est survenue.");
      // Jeton expiré ou refusé : la session est terminée (hors tentative de connexion).
      if (error.code === "UNAUTHENTICATED") this.unauthorizedListener?.();
      throw error;
    }

    if (!route.response) return undefined as T;
    const result = route.response.safeParse(await response.json());
    if (!result.success) {
      throw new DataSourceError("INTERNAL_ERROR", "Réponse du serveur inattendue.");
    }
    return result.data;
  }

  login(body: LoginRequest): Promise<LoginResponse> {
    return this.request("POST", ROUTES.login, { body });
  }

  registerPushToken(body: RegisterPushTokenRequest): Promise<void> {
    return this.request("POST", ROUTES.registerPushToken, { body });
  }

  deletePushToken(token: string): Promise<void> {
    return this.request("DELETE", ROUTES.deletePushToken, { params: { token } });
  }

  listSites(): Promise<SiteList> {
    return this.request("GET", ROUTES.listSites);
  }

  getSite(siteId: string): Promise<SiteDetail> {
    return this.request("GET", ROUTES.getSite, { params: { id: siteId } });
  }

  getSiteMeasurements(siteId: string, query: MeasurementQuery): Promise<SiteMeasurementSeries> {
    return this.request("GET", ROUTES.getSiteMeasurements, { params: { id: siteId }, query });
  }

  listPanels(siteId: string): Promise<PanelList> {
    return this.request("GET", ROUTES.listSitePanels, { params: { id: siteId } });
  }

  getPanel(panelId: string): Promise<PanelDetail> {
    return this.request("GET", ROUTES.getPanel, { params: { id: panelId } });
  }

  getPanelMeasurements(panelId: string, query: MeasurementQuery): Promise<PanelMeasurementPoint[]> {
    return this.request("GET", ROUTES.getPanelMeasurements, { params: { id: panelId }, query });
  }

  updatePanel(panelId: string, body: UpdatePanelRequest): Promise<PanelDetail> {
    return this.request("PATCH", ROUTES.updatePanel, { params: { id: panelId }, body });
  }

  createPanel(siteId: string, body: CreatePanelRequest): Promise<PanelDetail> {
    return this.request("POST", ROUTES.createPanel, { params: { id: siteId }, body });
  }

  deletePanel(panelId: string): Promise<void> {
    return this.request("DELETE", ROUTES.deletePanel, { params: { id: panelId } });
  }

  createSetpoint(siteId: string, body: CreateSetpointRequest): Promise<SetpointRecord> {
    return this.request("POST", ROUTES.createSetpoint, { params: { id: siteId }, body });
  }

  listSetpoints(siteId: string, query?: PageQuery): Promise<SetpointPage> {
    return this.request("GET", ROUTES.listSetpoints, { params: { id: siteId }, query });
  }

  listAlerts(query?: AlertsQuery): Promise<AlertPage> {
    return this.request("GET", ROUTES.listAlerts, { query });
  }

  listEnrollments(query?: Partial<EnrollmentsQuery>): Promise<EnrollmentPage> {
    return this.request("GET", ROUTES.listEnrollments, { query });
  }

  acceptEnrollment(enrollmentId: string, body: AcceptEnrollmentRequest): Promise<Enrollment> {
    return this.request("POST", ROUTES.acceptEnrollment, { params: { id: enrollmentId }, body });
  }

  rejectEnrollment(enrollmentId: string): Promise<Enrollment> {
    return this.request("POST", ROUTES.rejectEnrollment, { params: { id: enrollmentId } });
  }

  revokeEnrollment(enrollmentId: string): Promise<Enrollment> {
    return this.request("POST", ROUTES.revokeEnrollment, { params: { id: enrollmentId } });
  }

  openEventStream(handlers: EventStreamHandlers): (() => void) | null {
    if (!this.token) return null;
    const url = `${this.baseUrl.replace(/\/$/, "")}${ROUTES.events.path.replace(/^\/v1/, "")}`;
    return openEventStream(url, this.token, {
      ...handlers,
      onClose: (reason) => {
        // Jeton refusé : même traitement qu'une requête REST (fin de session).
        if (reason.includes("401")) this.unauthorizedListener?.();
        handlers.onClose(reason);
      },
    });
  }
}
