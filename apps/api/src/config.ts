// Lecture et validation des variables d'environnement (section 9 de la cartographie).
// Une variable manquante ou invalide fait échouer le démarrage avec un message explicite.
import { z } from "zod";

const emptyToUndefined = (value: unknown) => (value === "" ? undefined : value);

const ConfigSchema = z.object({
  NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
  PORT: z.coerce.number().int().min(1).max(65535).default(3000),
  LOG_LEVEL: z.enum(["fatal", "error", "warn", "info", "debug", "trace", "silent"]).default("info"),
  DATABASE_URL: z.string().min(1),
  JWT_SECRET: z.string().min(32, "doit contenir au moins 32 caractères"),
  MQTT_URL: z.string().min(1),
  MQTT_USERNAME: z.string().min(1),
  MQTT_PASSWORD: z.string().min(1),
  // Facultatif : jeton d'accès au compte Expo, qui renforce la sécurité de l'envoi des
  // notifications push. Une chaîne vide (ligne laissée vide du .env) vaut « absent ».
  EXPO_ACCESS_TOKEN: z.preprocess(emptyToUndefined, z.string().min(1).optional()),
  // Enrôlement des objets (D035). Valeurs par défaut pour le développement, l'API étant lancée
  // depuis apps/api. La clé de l'autorité n'est lue qu'au moment de signer.
  DEVICE_CA_CERT_PATH: z.preprocess(
    emptyToUndefined,
    z.string().min(1).default("../../infra/mosquitto/device-ca/devices-ca.crt"),
  ),
  DEVICE_CA_KEY_PATH: z.preprocess(
    emptyToUndefined,
    z.string().min(1).default("../../infra/mosquitto/device-ca/devices-ca.key"),
  ),
  BROKER_DEVICES_DIR: z.preprocess(
    emptyToUndefined,
    z.string().min(1).default("../../infra/mosquitto/devices"),
  ),
  BROKER_RELOAD_COMMAND: z.preprocess(
    emptyToUndefined,
    z
      .string()
      .min(1)
      .default(
        "docker compose -f ../../infra/docker-compose.yml exec -T mqtt sh /src/config/reload.sh",
      ),
  ),
});

export type Config = z.infer<typeof ConfigSchema>;

/** Valide les variables d'environnement ; lève une erreur listant chaque variable en défaut. */
export function loadConfig(env: NodeJS.ProcessEnv = process.env): Config {
  const result = ConfigSchema.safeParse(env);
  if (!result.success) {
    const problems = result.error.issues
      .map((issue) => `  - ${issue.path.join(".")} : ${issue.message}`)
      .join("\n");
    throw new Error(`Configuration invalide, variables d'environnement à corriger :\n${problems}`);
  }
  return result.data;
}
