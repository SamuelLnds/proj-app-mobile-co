// Point d'entrée : valide la configuration, démarre le serveur puis le client MQTT.
import { loadConfig } from "./config";
import { createDb } from "./db/client";
import { createMqttClient, type ApiMqttClient } from "./mqtt/client";
import { createMessageHandler } from "./mqtt/handlers";
import { createAuthRepository } from "./modules/auth/repository";
import { createAuthService } from "./modules/auth/service";
import { createDevicesRepository } from "./modules/devices/repository";
import { createDevicesService } from "./modules/devices/service";
import { createMeasurementsRepository } from "./modules/measurements/repository";
import { createMeasurementsService } from "./modules/measurements/service";
import { createControlStateStore } from "./modules/sites/control-states";
import { createSitesRepository } from "./modules/sites/repository";
import { createSitesService } from "./modules/sites/service";
import { startScheduler } from "./scheduler";
import { buildServer } from "./server";

const config = loadConfig();
const database = createDb(config.DATABASE_URL);
const { pool } = database;
let mqttClient: ApiMqttClient | null = null;
const controlStates = createControlStateStore();

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
});

const devices = createDevicesService(createDevicesRepository(database), app.log);
const measurements = createMeasurementsService(
  createMeasurementsRepository(database),
  app.log,
  devices.recordActivity,
);
const stopScheduler = startScheduler(devices, app.log);

const handleMessage = createMessageHandler(
  {
    siteMeasurement: measurements.recordSiteMeasurement,
    controlState: async (siteCode, state, receivedAt) => {
      controlStates.set(siteCode, state);
      await devices.recordActivityForSiteCode(siteCode, receivedAt);
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
