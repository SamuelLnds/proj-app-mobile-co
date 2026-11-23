import type {
  AlertPage,
  AlertsQuery,
  CreateSetpointRequest,
  ErrorCode,
  LoginRequest,
  LoginResponse,
  MeasurementQuery,
  PageQuery,
  PanelDetail,
  PanelList,
  PanelMeasurementPoint,
  SetpointPage,
  SetpointRecord,
  SiteDetail,
  SiteList,
  SiteMeasurementSeries,
  UpdatePanelRequest,
} from "@solar/contracts";

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

  /** `POST /v1/auth/login` */
  login(body: LoginRequest): Promise<LoginResponse>;

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

  /** `POST /v1/sites/{id}/setpoints` */
  createSetpoint(siteId: string, body: CreateSetpointRequest): Promise<SetpointRecord>;
  /** `GET /v1/sites/{id}/setpoints` */
  listSetpoints(siteId: string, query?: PageQuery): Promise<SetpointPage>;

  /** `GET /v1/alerts` */
  listAlerts(query?: AlertsQuery): Promise<AlertPage>;
}

/** Erreur renvoyée par une source, au format des erreurs de l'API (section 7.1). */
export class DataSourceError extends Error {
  constructor(
    readonly code: ErrorCode,
    message: string,
  ) {
    super(message);
    this.name = "DataSourceError";
  }
}
