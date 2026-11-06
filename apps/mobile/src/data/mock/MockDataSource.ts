import {
  BATTERY_FULL_PCT,
  CreateSetpointRequestSchema,
  DEFAULT_PAGE_LIMIT,
  LOW_PRODUCTION_RATIO,
  type Alert,
  type AlertPage,
  type AlertsQuery,
  type ControlMode,
  type ControlState,
  type CreateSetpointRequest,
  type LoginRequest,
  type LoginResponse,
  type MeasurementQuery,
  type PageQuery,
  type PanelDetail,
  type PanelList,
  type PanelMeasurementPoint,
  type PanelStatus,
  type PanelSummary,
  type SetpointPage,
  type SetpointRecord,
  type SiteDetail,
  type SiteList,
  type SiteMeasurementSeries,
  type UpdatePanelRequest,
  type User,
} from "@solar/contracts";

import { DataSourceError, type DataSource } from "../DataSource";
import { applyControl, nextBatteryLevel } from "./control";
import {
  FAULTY_PANEL_CODES,
  MOCK_PASSWORD,
  PANELS,
  SILENT_PANEL_CODE,
  SITE,
  USERS,
  mockId,
  type MockPanel,
} from "./fixtures";
import type { MockScenario } from "./scenarios";

const MIN = 60_000;
const HOUR = 60 * MIN;
const INTERVAL_MS = { "1m": MIN, "5m": 5 * MIN, "15m": 15 * MIN, "1h": HOUR } as const;
/** Délai de réponse simulé de l'objet à une consigne. */
const DEVICE_RESPONSE_MS = 1500;
/** Latence réseau simulée. */
const LATENCY_MS = 150;

const iso = (ms: number) => new Date(ms).toISOString();
const wait = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

type State = {
  scenario: MockScenario;
  /** Instant de référence : le « midi solaire » est placé une heure avant. */
  startedAt: number;
  /** Instant de la dernière mise à jour de la batterie. */
  lastTick: number;
  /** Données figées (téléphone hors ligne) : on ne fait plus avancer le temps. */
  frozenAt: number | null;
  batteryLevel: number;
  mode: ControlMode;
  requestedShare: number | null;
  setpoints: SetpointRecord[];
  pending: { setpointId: string; dueAt: number } | null;
  panels: MockPanel[];
  user: User | null;
};

/**
 * Source de données d'exemple : un parc qui « vit » (ensoleillement, batterie qui se charge),
 * des consignes appliquées selon l'algorithme de l'objet, des scénarios de démonstration.
 * Elle renvoie exactement les objets de l'API (types de @solar/contracts).
 */
export class MockDataSource implements DataSource {
  readonly kind = "mock" as const;
  private state!: State;

  constructor(
    scenario: MockScenario = "normal",
    private readonly now: () => number = Date.now,
    private readonly latencyMs = LATENCY_MS,
  ) {
    this.reset(scenario);
  }

  /** Recharge les données d'exemple pour un scénario (sélecteur de l'écran de connexion). */
  reset(scenario: MockScenario): void {
    const t = this.now();
    const user = this.state?.user ?? null;
    this.state = {
      scenario,
      startedAt: t,
      lastTick: t,
      frozenAt: scenario === "phone_offline" ? t - 12 * MIN : null,
      batteryLevel: scenario === "battery_full" ? 96 : 63,
      mode: "manual",
      requestedShare: 70,
      setpoints: initialSetpoints(t),
      pending: null,
      panels: PANELS.map((p) => ({ ...p })),
      user,
    };
  }

  get scenario(): MockScenario {
    return this.state.scenario;
  }

  setToken(token: string | null): void {
    this.state.user = USERS.find((u) => token === `mock-${u.role}`) ?? null;
  }

  async login(body: LoginRequest): Promise<LoginResponse> {
    await wait(this.latencyMs * 2);
    const user = USERS.find((u) => u.email === body.email.trim().toLowerCase());
    if (!user || body.password !== MOCK_PASSWORD) {
      throw new DataSourceError("INVALID_CREDENTIALS", "E-mail ou mot de passe incorrect.");
    }
    this.state.user = user;
    return { token: `mock-${user.role}`, expiresAt: iso(this.now() + 8 * HOUR), user };
  }

  async listSites(): Promise<SiteList> {
    const site = await this.getSite(SITE.id);
    const {
      id,
      code,
      name,
      latitude,
      longitude,
      deviceStatus,
      latestMeasurement,
      activeAlertCount,
    } = site;
    return [
      { id, code, name, latitude, longitude, deviceStatus, latestMeasurement, activeAlertCount },
    ];
  }

  async getSite(siteId: string): Promise<SiteDetail> {
    await this.request();
    if (siteId !== SITE.id) throw notFound();
    const t = this.time();
    const offline = this.state.scenario === "device_offline";
    const irradiance = this.irradiance(t);
    const production = this.siteProduction(t);
    const control = this.control(t);
    const last = this.state.setpoints[0] ?? null;
    return {
      id: SITE.id,
      code: SITE.code,
      name: SITE.name,
      latitude: SITE.latitude,
      longitude: SITE.longitude,
      deviceStatus: offline ? "offline" : "online",
      latestMeasurement: {
        timestamp: iso(offline ? t - 3 * MIN : t - (t % 5000)),
        irradiance: Math.round(irradiance),
        production: round1(production),
        expectedProduction: round1(irradiance * SITE.productionFactor),
        temperature: round1(this.temperature(t)),
        batteryLevel: round1(this.state.batteryLevel),
        batteryPower: round1(control.batteryPower),
        gridPower: round1(control.gridPower),
        mode: this.state.mode,
        simulatedFault: false,
      },
      activeAlertCount: this.alerts(t).filter((a) => a.status === "active").length,
      peakPowerW: SITE.peakPowerW,
      batteryCapacityWh: SITE.batteryCapacityWh,
      maxChargePowerW: SITE.maxChargePowerW,
      currentSetpoint: last,
      controlState: this.controlState(t),
      deviceLastSeenAt: iso(offline ? t - 3 * MIN : t - 2000),
    };
  }

  async getSiteMeasurements(
    siteId: string,
    query: MeasurementQuery,
  ): Promise<SiteMeasurementSeries> {
    await this.request();
    if (siteId !== SITE.id) throw notFound();
    return this.timeline(query).map((time) => {
      const irradiance = this.irradiance(time);
      const production = irradiance * SITE.productionFactor * 0.96;
      const progress = (time - this.state.startedAt + 24 * HOUR) / (24 * HOUR);
      const batteryLevel = Math.max(20, Math.min(this.state.batteryLevel, 30 + progress * 35));
      const batteryPower = production * 0.7;
      return {
        time: iso(time),
        irradiance: Math.round(irradiance),
        production: round1(production),
        temperature: round1(this.temperature(time)),
        batteryLevel: round1(batteryLevel),
        batteryPower: round1(batteryPower),
        gridPower: round1(production - batteryPower),
      };
    });
  }

  async listPanels(siteId: string): Promise<PanelList> {
    await this.request();
    if (siteId !== SITE.id) throw notFound();
    const t = this.time();
    return this.state.panels.map((p) => this.panelSummary(p, t));
  }

  async getPanel(panelId: string): Promise<PanelDetail> {
    await this.request();
    return this.panelDetail(this.findPanel(panelId), this.time());
  }

  async getPanelMeasurements(
    panelId: string,
    query: MeasurementQuery,
  ): Promise<PanelMeasurementPoint[]> {
    await this.request();
    const panel = this.findPanel(panelId);
    return this.timeline(query).map((time) => ({
      time: iso(time),
      production: round1(this.panelProduction(panel, time)),
      temperature: round1(this.temperature(time) + 3),
    }));
  }

  async updatePanel(panelId: string, body: UpdatePanelRequest): Promise<PanelDetail> {
    await this.request();
    this.requireOperator();
    const panel = this.findPanel(panelId);
    Object.assign(panel, {
      ...(body.name !== undefined && { name: body.name }),
      ...(body.ratedPowerW !== undefined && { ratedPowerW: body.ratedPowerW }),
      ...(body.latitude !== undefined && { latitude: body.latitude, longitude: body.longitude }),
    });
    return this.panelDetail(panel, this.time());
  }

  async createSetpoint(siteId: string, body: CreateSetpointRequest): Promise<SetpointRecord> {
    await this.request();
    if (siteId !== SITE.id) throw notFound();
    const user = this.requireOperator();
    const parsed = CreateSetpointRequestSchema.safeParse(body);
    if (!parsed.success) throw new DataSourceError("INVALID_REQUEST", "La consigne est invalide.");
    if (this.state.scenario === "device_offline") {
      throw new DataSourceError(
        "DEVICE_OFFLINE",
        "L'objet du site est hors ligne, la consigne ne peut pas être envoyée.",
      );
    }
    const t = this.time();
    const record: SetpointRecord = {
      id: mockId(4, this.state.setpoints.length + 1),
      mode: parsed.data.mode,
      requestedBatteryShare:
        parsed.data.mode === "manual" ? (parsed.data.batteryShare ?? null) : null,
      status: "sent",
      appliedBatteryShare: null,
      rejectionReason: null,
      author: { id: user.id, name: user.name },
      createdAt: iso(t),
      respondedAt: null,
    };
    this.state.setpoints.unshift(record);
    this.state.pending = { setpointId: record.id, dueAt: t + DEVICE_RESPONSE_MS };
    return record;
  }

  async listSetpoints(siteId: string, query?: PageQuery): Promise<SetpointPage> {
    await this.request();
    if (siteId !== SITE.id) throw notFound();
    return paginate(this.state.setpoints, (s) => s.createdAt, query);
  }

  async listAlerts(query?: AlertsQuery): Promise<AlertPage> {
    await this.request();
    const alerts = this.alerts(this.time()).filter(
      (a) =>
        (!query?.status || a.status === query.status) &&
        (!query?.siteId || a.site.id === query.siteId),
    );
    return paginate(alerts, (a) => a.startedAt, query);
  }

  // --- Simulation -------------------------------------------------------------------------

  /** Avance la simulation (batterie, réponse de l'objet) jusqu'à maintenant, puis simule la latence. */
  private async request(): Promise<void> {
    await wait(this.latencyMs);
    this.advance();
  }

  private time(): number {
    return this.state.frozenAt ?? this.now();
  }

  private advance(): void {
    const t = this.time();
    const pending = this.state.pending;
    if (pending && t >= pending.dueAt) this.respond(pending.setpointId, pending.dueAt);
    if (this.state.scenario === "device_offline") {
      this.state.lastTick = t;
      return;
    }
    const seconds = Math.max(0, (t - this.state.lastTick) / 1000);
    if (seconds > 0) {
      const { batteryPower } = this.control(t);
      this.state.batteryLevel = nextBatteryLevel(
        this.state.batteryLevel,
        batteryPower,
        seconds,
        SITE.batteryCapacityWh,
      );
      this.state.lastTick = t;
    }
  }

  /** Réponse de l'objet à une consigne : première réponse uniquement (diagramme d'états 5.1). */
  private respond(setpointId: string, at: number): void {
    this.state.pending = null;
    const record = this.state.setpoints.find((s) => s.id === setpointId);
    if (!record) return;
    const output = applyControl({
      mode: record.mode,
      requestedShare: record.requestedBatteryShare,
      production: this.siteProduction(at),
      level: this.state.batteryLevel,
      maxChargePowerW: SITE.maxChargePowerW,
    });
    record.status = output.status;
    record.appliedBatteryShare = output.appliedShare;
    record.rejectionReason = output.reason;
    record.respondedAt = iso(at);
    if (output.reason !== "invalid_setpoint") {
      this.state.mode = record.mode;
      this.state.requestedShare = record.requestedBatteryShare;
    }
  }

  private control(t: number) {
    return applyControl({
      mode: this.state.mode,
      requestedShare: this.state.requestedShare,
      production: this.siteProduction(t),
      level: this.state.batteryLevel,
      maxChargePowerW: SITE.maxChargePowerW,
    });
  }

  private controlState(t: number): ControlState {
    const output = this.control(t);
    const last = this.state.setpoints.find((s) => s.status !== "sent") ?? null;
    return {
      v: 1,
      setpointId: last?.id ?? null,
      mode: this.state.mode,
      status: output.status,
      appliedBatteryShare: output.appliedShare,
      reason: output.reason,
      timestamp: iso(t),
    };
  }

  /** Ensoleillement (W/m²) : une journée en cloche dont le maximum est une heure avant le lancement. */
  private irradiance(t: number): number {
    const noon = this.state.startedAt - HOUR;
    const bell = Math.max(0, Math.cos((Math.PI * (t - noon)) / (14 * HOUR)));
    const noise = 25 * Math.sin(t / 37_000) + 15 * Math.sin(t / 11_000);
    return Math.max(0, 920 * bell + (bell > 0 ? noise : 0));
  }

  private siteProduction(t: number): number {
    return Math.min(SITE.peakPowerW, this.irradiance(t) * SITE.productionFactor * 0.96);
  }

  private temperature(t: number): number {
    return 14 + this.irradiance(t) / 32;
  }

  private faulty(panel: MockPanel): boolean {
    return this.state.scenario !== "no_alerts" && FAULTY_PANEL_CODES.includes(panel.code);
  }

  private panelProduction(panel: MockPanel, t: number): number {
    const expected = (this.irradiance(t) * panel.ratedPowerW) / 1000;
    const jitter = 1 + 0.04 * Math.sin(t / 13_000 + Number(panel.code.slice(1)));
    const faultStart = this.state.startedAt - 2 * HOUR;
    return expected * jitter * (this.faulty(panel) && t >= faultStart ? 0.25 : 1);
  }

  private panelStatus(panel: MockPanel): PanelStatus {
    if (this.faulty(panel)) return "alert";
    if (this.state.scenario !== "no_alerts" && panel.code === SILENT_PANEL_CODE) return "no_data";
    return "normal";
  }

  private panelSummary(panel: MockPanel, t: number): PanelSummary {
    const status = this.panelStatus(panel);
    const silent = status === "no_data";
    return {
      id: panel.id,
      code: panel.code,
      name: panel.name,
      latitude: panel.latitude,
      longitude: panel.longitude,
      placed: panel.latitude !== null,
      source: panel.source,
      status,
      latestProduction: silent ? null : round1(this.panelProduction(panel, t)),
      latestTemperature: silent ? null : round1(this.temperature(t) + 3),
    };
  }

  private panelDetail(panel: MockPanel, t: number): PanelDetail {
    return {
      ...this.panelSummary(panel, t),
      ratedPowerW: panel.ratedPowerW,
      expectedProduction: round1((this.irradiance(t) * panel.ratedPowerW) / 1000),
      activeAlerts: this.alerts(t).filter((a) => a.status === "active" && a.panel?.id === panel.id),
    };
  }

  /** Alertes calculées à partir de l'état de la simulation (règles de la section 6 de l'UML). */
  private alerts(t: number): Alert[] {
    const site = { id: SITE.id, name: SITE.name };
    const alerts: Alert[] = [];
    const start = this.state.startedAt;
    for (const panel of this.state.panels.filter((p) => this.faulty(p))) {
      const expected = (this.irradiance(t) * panel.ratedPowerW) / 1000;
      const real = this.panelProduction(panel, t);
      if (real < expected * LOW_PRODUCTION_RATIO) {
        alerts.push({
          id: mockId(5, Number(panel.code.slice(1))),
          type: "low_production",
          severity: "warning",
          message: `Production basse sur ${panel.name} : ${Math.round(real)} W au lieu de ${Math.round(expected)} W attendus`,
          status: "active",
          site,
          panel: { id: panel.id, name: panel.name },
          startedAt: iso(start - 2 * HOUR + MIN),
          endedAt: null,
        });
      }
    }
    if (this.state.scenario === "device_offline") {
      alerts.push({
        id: mockId(5, 100),
        type: "device_offline",
        severity: "critical",
        message: `L'objet du site ${SITE.code} est hors ligne`,
        status: "active",
        site,
        panel: null,
        startedAt: iso(t - 3 * MIN),
        endedAt: null,
      });
    }
    if (this.state.batteryLevel >= BATTERY_FULL_PCT) {
      alerts.push({
        id: mockId(5, 101),
        type: "battery_full",
        severity: "info",
        message: `Batterie pleine sur ${SITE.name} : la charge est suspendue`,
        status: "active",
        site,
        panel: null,
        startedAt: iso(start),
        endedAt: null,
      });
    }
    const last = this.state.setpoints[0];
    if (last?.status === "rejected") {
      alerts.push({
        id: mockId(5, 102),
        type: "setpoint_rejected",
        severity: "warning",
        message: `Consigne refusée sur ${SITE.name} : ${REJECTION_TEXT[last.rejectionReason ?? "invalid_setpoint"]}`,
        status: "active",
        site,
        panel: null,
        startedAt: last.respondedAt ?? last.createdAt,
        endedAt: null,
      });
    }
    if (this.state.scenario !== "no_alerts") {
      alerts.push(
        {
          id: mockId(5, 200),
          type: "overheating",
          severity: "critical",
          message: "Surchauffe sur Rangée A, panneau 3 : 78 °C",
          status: "resolved",
          site,
          panel: { id: PANELS[2]!.id, name: PANELS[2]!.name },
          startedAt: iso(start - 26 * HOUR),
          endedAt: iso(start - 25 * HOUR),
        },
        {
          id: mockId(5, 201),
          type: "battery_low",
          severity: "warning",
          message: `Batterie faible sur ${SITE.name} : 19 %`,
          status: "resolved",
          site,
          panel: null,
          startedAt: iso(start - 21 * HOUR),
          endedAt: iso(start - 19 * HOUR),
        },
      );
    }
    return alerts.sort((a, b) => b.startedAt.localeCompare(a.startedAt));
  }

  private timeline(query: MeasurementQuery): number[] {
    const step = INTERVAL_MS[query.interval];
    const from = new Date(query.from).getTime();
    const to = Math.min(new Date(query.to).getTime(), this.time());
    const points: number[] = [];
    for (let time = from - (from % step); time <= to; time += step) points.push(time);
    return points;
  }

  private findPanel(panelId: string): MockPanel {
    const panel = this.state.panels.find((p) => p.id === panelId);
    if (!panel) throw notFound();
    return panel;
  }

  private requireOperator(): User {
    const user = this.state.user;
    if (!user) throw new DataSourceError("UNAUTHENTICATED", "Session expirée, reconnectez-vous.");
    if (user.role !== "operator") {
      throw new DataSourceError("FORBIDDEN", "Le pilotage est réservé aux exploitants.");
    }
    return user;
  }
}

const REJECTION_TEXT = {
  battery_full: "la batterie est pleine",
  battery_low: "la batterie est faible",
  charge_limit: "puissance de charge maximale atteinte",
  invalid_setpoint: "consigne invalide",
} as const;

const round1 = (n: number) => Math.round(n * 10) / 10;

const notFound = () => new DataSourceError("NOT_FOUND", "Élément introuvable.");

function paginate<T>(items: T[], date: (item: T) => string, query?: PageQuery) {
  const limit = query?.limit ?? DEFAULT_PAGE_LIMIT;
  const filtered = query?.before ? items.filter((i) => date(i) < query.before!) : items;
  const page = filtered.slice(0, limit);
  return { items: page, next: filtered.length > limit ? date(page[page.length - 1]!) : null };
}

function initialSetpoints(t: number): SetpointRecord[] {
  const operator = USERS[0]!;
  const author = { id: operator.id, name: operator.name };
  return [
    {
      id: mockId(4, 103),
      mode: "manual",
      requestedBatteryShare: 70,
      status: "applied",
      appliedBatteryShare: 70,
      rejectionReason: null,
      author,
      createdAt: iso(t - 40 * MIN),
      respondedAt: iso(t - 40 * MIN + 1200),
    },
    {
      id: mockId(4, 102),
      mode: "automatic",
      requestedBatteryShare: null,
      status: "applied",
      appliedBatteryShare: 100,
      rejectionReason: null,
      author,
      createdAt: iso(t - 4 * HOUR),
      respondedAt: iso(t - 4 * HOUR + 1500),
    },
    {
      id: mockId(4, 101),
      mode: "discharge",
      requestedBatteryShare: null,
      status: "rejected",
      appliedBatteryShare: null,
      rejectionReason: "battery_low",
      author,
      createdAt: iso(t - 20 * HOUR),
      respondedAt: iso(t - 20 * HOUR + 1100),
    },
  ];
}
