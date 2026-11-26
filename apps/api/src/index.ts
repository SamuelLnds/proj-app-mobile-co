// Point d'entrée : valide la configuration, démarre le serveur puis le client MQTT.
import { loadConfig } from "./config";
import { createDb } from "./db/client";
import { createMqttClient, type ApiMqttClient } from "./mqtt/client";
import { createMessageHandler } from "./mqtt/handlers";
import { createAlertEngine, type AlertEngine, type AlertSink } from "./modules/alerts/engine";
import { createAlertsRepository } from "./modules/alerts/repository";
import { createAlertsService } from "./modules/alerts/service";
import { createAuthRepository } from "./modules/auth/repository";
import { createPushTokensRepository } from "./modules/notifications/repository";
import { createExpoSender } from "./modules/notifications/sender";
import { createPushService } from "./modules/notifications/service";
import { createAuthService } from "./modules/auth/service";
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
import { startScheduler } from "./scheduler";
import { buildServer } from "./server";

const config = loadConfig();
const database = createDb(config.DATABASE_URL);
const { pool } = database;
let mqttClient: ApiMqttClient | null = null;
const controlStates = createControlStateStore();

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
  panels: createPanelsService(createPanelsRepository(database)),
  history: createHistoryService(createHistoryRepository(database)),
  setpoints,
  alerts: createAlertsService(alertsRepository),
  push: pushService,
});

const engine = createAlertEngine(
  alertsRepository,
  async (alert) => {
    const summary = await pushService.notifyAlert(alert);
    app.log.info(summary, "Notifications d'alerte envoyées");
  },
  app.log,
);
alertEngine = engine;
const devices = createDevicesService(createDevicesRepository(database), app.log, engine);
const measurements = createMeasurementsService(
  createMeasurementsRepository(database),
  app.log,
  devices.recordActivity,
);
const stopScheduler = startScheduler(devices, setpoints, app.log);

const handleMessage = createMessageHandler(
  {
    // Chaque mesure est enregistrée, puis évaluée par les règles d'alerte.
    siteMeasurement: async (siteCode, message, receivedAt) => {
      await measurements.recordSiteMeasurement(siteCode, message, receivedAt);
      await engine.evaluateSiteMeasurement(siteCode, message, receivedAt);
    },
    panelMeasurement: async (siteCode, panelCode, message, receivedAt) => {
      await measurements.recordPanelMeasurement(siteCode, panelCode, message, receivedAt);
      await engine.evaluatePanelMeasurement(siteCode, panelCode, message, receivedAt);
    },
    controlState: async (siteCode, state, receivedAt) => {
      controlStates.set(siteCode, state);
      await devices.recordActivityForSiteCode(siteCode, receivedAt);
      await setpoints.recordState(siteCode, state, receivedAt);
    },
    deviceStatus: devices.recordStatus,
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
