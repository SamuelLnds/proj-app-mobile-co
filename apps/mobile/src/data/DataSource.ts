import type {
  AcceptEnrollmentRequest,
  AlertPage,
  CreatePanelRequest,
  AlertsQuery,
  CreateSetpointRequest,
  Enrollment,
  EnrollmentPage,
  EnrollmentsQuery,
  ErrorCode,
  LoginRequest,
  LoginResponse,
  MeasurementQuery,
  PageQuery,
  PanelDetail,
  PanelList,
  PanelMeasurementPoint,
  RegisterPushTokenRequest,
  SetpointPage,
  SetpointRecord,
  SiteDetail,
  SiteList,
  SiteMeasurementSeries,
  UpdatePanelRequest,
} from "@solar/contracts";

import type { EventStreamHandlers } from "./api/event-stream";

/**
 * Contrat entre l'app et ses données (D025). Une méthode par route de l'API REST
 * (section 7.2 de la cartographie) utilisée par l'app, avec les types de @solar/contracts.
 *
 * Deux implémentations : `mock` (données d'exemple, dossier mock/) et `api` (appels HTTP,
 * issue #25). Les écrans et les hooks ne connaissent que cette interface.
 */
export interface DataSource {
  /** Nom de la source, affiché en mode démonstration. */
  readonly kind: "mock" | "api";

  /** Jeton JWT à joindre aux requêtes (`null` après déconnexion). */
  setToken(token: string | null): void;

  /** Fonction appelée quand la source refuse le jeton (session expirée). */
  onUnauthorized(listener: (() => void) | null): void;

  /** `POST /v1/auth/login` */
  login(body: LoginRequest): Promise<LoginResponse>;

  /** `POST /v1/push-tokens` */
  registerPushToken(body: RegisterPushTokenRequest): Promise<void>;
  /** `DELETE /v1/push-tokens/{token}` */
  deletePushToken(token: string): Promise<void>;

  /** `GET /v1/sites` */
  listSites(): Promise<SiteList>;
  /** `GET /v1/sites/{id}` */
  getSite(siteId: string): Promise<SiteDetail>;
  /** `GET /v1/sites/{id}/measurements` */
  getSiteMeasurements(siteId: string, query: MeasurementQuery): Promise<SiteMeasurementSeries>;

  /** `GET /v1/sites/{id}/panels` */
  listPanels(siteId: string): Promise<PanelList>;
  /** `GET /v1/panels/{id}` */
  getPanel(panelId: string): Promise<PanelDetail>;
  /** `GET /v1/panels/{id}/measurements` */
  getPanelMeasurements(panelId: string, query: MeasurementQuery): Promise<PanelMeasurementPoint[]>;
  /** `PATCH /v1/panels/{id}` */
  updatePanel(panelId: string, body: UpdatePanelRequest): Promise<PanelDetail>;
  /** `POST /v1/sites/{id}/panels` (exploitant, bonus #63) */
  createPanel(siteId: string, body: CreatePanelRequest): Promise<PanelDetail>;
  /** `DELETE /v1/panels/{id}` */
  deletePanel(panelId: string): Promise<void>;

  /** `POST /v1/sites/{id}/setpoints` */
  createSetpoint(siteId: string, body: CreateSetpointRequest): Promise<SetpointRecord>;
  /** `GET /v1/sites/{id}/setpoints` */
  listSetpoints(siteId: string, query?: PageQuery): Promise<SetpointPage>;

  /** `GET /v1/alerts` */
  listAlerts(query?: AlertsQuery): Promise<AlertPage>;

  /** `GET /v1/enrollments` (exploitant) */
  listEnrollments(query?: Partial<EnrollmentsQuery>): Promise<EnrollmentPage>;
  /** `POST /v1/enrollments/{id}/accept` (exploitant) */
  acceptEnrollment(enrollmentId: string, body: AcceptEnrollmentRequest): Promise<Enrollment>;
  /** `POST /v1/enrollments/{id}/reject` (exploitant) */
  rejectEnrollment(enrollmentId: string): Promise<Enrollment>;
  /** `POST /v1/enrollments/{id}/revoke` (exploitant) */
  revokeEnrollment(enrollmentId: string): Promise<Enrollment>;

  /**
   * `GET /v1/events` (bonus #60) : ouvre le flux d'événements et renvoie la fonction qui le
   * ferme, ou `null` si la source n'en a pas (données d'exemple, pas de session).
   */
  openEventStream(handlers: EventStreamHandlers): (() => void) | null;
}

/** Erreur renvoyée par une source, au format des erreurs de l'API (section 7.1). */
export class DataSourceError extends Error {
  constructor(
    /** Code de l'API, ou `NETWORK_ERROR` quand le serveur est injoignable. */
    readonly code: ErrorCode | "NETWORK_ERROR",
    message: string,
  ) {
    super(message);
    this.name = "DataSourceError";
  }
}
