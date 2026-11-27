// Point d'entrée : valide la configuration, démarre le serveur puis le client MQTT.
import { loadConfig } from "./config";
import { createDb } from "./db/client";
import { createMqttClient, type ApiMqttClient } from "./mqtt/client";
import { createMessageHandler } from "./mqtt/handlers";
import { createAlertEngine, type AlertEngine, type AlertSink } from "./modules/alerts/engine";
import { createAlertsRepository } from "./modules/alerts/repository";
import { createAlertsService } from "./modules/alerts/service";
import { createAuthRepository } from "./modules/auth/repository";
import { createAuthService } from "./modules/auth/service";
import { createPushTokensRepository } from "./modules/notifications/repository";
import { createExpoSender } from "./modules/notifications/sender";
import { createPushService } from "./modules/notifications/service";
import { createDevicesRepository } from "./modules/devices/repository";
import { createDevicesService } from "./modules/devices/service";
import { createHistoryRepository } from "./modules/history/repository";
import { createHistoryService } from "./modules/history/service";
import { createMeasurementsRepository } from "./modules/measurements/repository";
import { createMeasurementsService } from "./modules/measurements/service";
import { createSetpointsRepository } from "./modules/setpoints/repository";
import { createSetpointsService } from "./modules/setpoints/service";
import { createControlStateStore } from "./modules/sites/control-states";
import { createPanelsRepository } from "./modules/panels/repository";
import { createPanelsService } from "./modules/panels/service";
import { createSitesRepository } from "./modules/sites/repository";
import { createSitesService } from "./modules/sites/service";
import { createFileAuthority } from "./modules/enrollment/authority";
import { createBrokerAccess } from "./modules/enrollment/broker";
import { createEnrollmentsRepository } from "./modules/enrollment/repository";
import { createEnrollmentService } from "./modules/enrollment/service";
import { createEventBus } from "./modules/events/service";
import type { EnrollmentService } from "./modules/enrollment/service";
import type { SetpointsService } from "./modules/setpoints/service";
import type { PanelsService } from "./modules/panels/service";
import { startScheduler } from "./scheduler";
import { buildServer } from "./server";

const config = loadConfig();
const database = createDb(config.DATABASE_URL);
const { pool } = database;
let mqttClient: ApiMqttClient | null = null;
const controlStates = createControlStateStore();
// Flux d'événements (bonus #60, D037) : chaque changement est signalé aux apps connectées.
const events = createEventBus();

// Le client MQTT et le moteur d'alertes (qui journalise par le logger du serveur) sont créés
// après le serveur : les modules qui en dépendent passent par des fonctions différées.
let alertEngine: AlertEngine | null = null;
const alertSink: AlertSink = {
  open: (alert) => alertEngine!.open(alert),
  resolve: (scope, types, endedAt) => alertEngine!.resolve(scope, types, endedAt),
};
const setpoints = createSetpointsService(
  createSetpointsRepository(database),
  (topic, message, options) =>
    mqttClient
      ? mqttClient.publish(topic, message, options)
      : Promise.reject(new Error("Client MQTT non initialisé")),
  alertSink,
);
const alertsRepository = createAlertsRepository(database);
const pushService = createPushService(
  createPushTokensRepository(database),
  createExpoSender(config.EXPO_ACCESS_TOKEN),
);

// Enrôlement des objets (D035) : le logger du serveur est utilisé au moment de journaliser.
const enrollment = createEnrollmentService(
  createEnrollmentsRepository(database),
  createFileAuthority(config.DEVICE_CA_CERT_PATH, config.DEVICE_CA_KEY_PATH),
  createBrokerAccess(config.BROKER_DEVICES_DIR, config.BROKER_RELOAD_COMMAND),
  { error: (details, message) => app.log.error(details, message) },
);

// Les routes signalent leurs changements : nouvelle consigne, décision d'enrôlement. Le signal
// part même après une erreur (décision enregistrée mais broker non rechargé, par exemple).
const setpointsWithEvents: SetpointsService = {
  ...setpoints,
  create: async (...args) => {
    const created = await setpoints.create(...args);
    events.publish("site");
    return created;
  },
};
const panelsService = createPanelsService(createPanelsRepository(database));
const panelsWithEvents: PanelsService = {
  ...panelsService,
  createPanel: async (...args) => {
    const created = await panelsService.createPanel(...args);
    events.publish("panels");
    return created;
  },
};
const signalEnrollments =
  <A extends unknown[], R>(call: (...args: A) => Promise<R>) =>
  async (...args: A): Promise<R> => {
    try {
      return await call(...args);
    } finally {
      events.publish("enrollments");
    }
  };
const enrollmentWithEvents: EnrollmentService = {
  ...enrollment,
  request: signalEnrollments(enrollment.request),
  accept: signalEnrollments(enrollment.accept),
  reject: signalEnrollments(enrollment.reject),
  revoke: signalEnrollments(enrollment.revoke),
};

const app = buildServer({
  config,
  checkDatabase: async () => {
    await pool.query("SELECT 1");
    return true;
  },
  checkBroker: () => mqttClient?.isConnected() ?? false,
  auth: {
    service: createAuthService(createAuthRepository(database)),
    jwtSecret: config.JWT_SECRET,
  },
  sites: createSitesService(createSitesRepository(database), controlStates),
  panels: panelsWithEvents,
  history: createHistoryService(createHistoryRepository(database)),
  setpoints: setpointsWithEvents,
  alerts: createAlertsService(alertsRepository),
  push: pushService,
  enrollment: enrollmentWithEvents,
  events: { bus: events },
});

const engine = createAlertEngine(
  alertsRepository,
  async (alert) => {
    const summary = await pushService.notifyAlert(alert);
    app.log.info(summary, "Notifications d'alerte envoyées");
  },
  app.log,
  // Une alerte change aussi le nombre d'alertes actives du site (et l'objet hors ligne, son statut).
  () => {
    events.publish("alerts");
    events.publish("site");
  },
);
alertEngine = engine;
const devices = createDevicesService(createDevicesRepository(database), app.log, engine);
const measurements = createMeasurementsService(
  createMeasurementsRepository(database),
  app.log,
  devices.recordActivity,
);
const stopScheduler = startScheduler(devices, setpoints, app.log, undefined, enrollment);
// La base fait foi : l'ACL des objets et la liste de révocation sont regénérées au démarrage.
enrollment
  .syncBroker()
  .then(() => app.log.info("ACL des objets et liste de révocation du broker à jour"))
  .catch((error: unknown) =>
    app.log.warn(
      { err: error },
      "Broker non rechargé au démarrage : enrôlement des objets indisponible",
    ),
  );

const handleMessage = createMessageHandler(
  {
    // Chaque mesure est enregistrée, puis évaluée par les règles d'alerte.
    siteMeasurement: async (siteCode, message, receivedAt) => {
      await measurements.recordSiteMeasurement(siteCode, message, receivedAt);
      events.publish("site", siteCode);
      await engine.evaluateSiteMeasurement(siteCode, message, receivedAt);
    },
    panelMeasurement: async (siteCode, panelCode, message, receivedAt) => {
      await measurements.recordPanelMeasurement(siteCode, panelCode, message, receivedAt);
      events.publish("panels", siteCode);
      await engine.evaluatePanelMeasurement(siteCode, panelCode, message, receivedAt);
    },
    controlState: async (siteCode, state, receivedAt) => {
      controlStates.set(siteCode, state);
      await devices.recordActivityForSiteCode(siteCode, receivedAt);
      await setpoints.recordState(siteCode, state, receivedAt);
      events.publish("site", siteCode);
    },
    deviceStatus: async (siteCode, message, receivedAt) => {
      await devices.recordStatus(siteCode, message, receivedAt);
      events.publish("site", siteCode);
    },
  },
  app.log,
);
mqttClient = createMqttClient(
  { url: config.MQTT_URL, username: config.MQTT_USERNAME, password: config.MQTT_PASSWORD },
  (topic, payload) => void handleMessage(topic, payload),
  app.log,
);

app.addHook("onClose", async () => {
  stopScheduler();
  await mqttClient?.close();
  await pool.end();
});

for (const signal of ["SIGINT", "SIGTERM"] as const) {
  process.on(signal, () => {
    void app.close().then(() => process.exit(0));
  });
}

try {
  await app.listen({ port: config.PORT, host: "0.0.0.0" });
} catch (error) {
  app.log.error(error);
  process.exit(1);
}
