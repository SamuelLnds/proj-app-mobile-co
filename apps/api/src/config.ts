// Lecture et validation des variables d'environnement (section 9 de la cartographie).
// Une variable manquante ou invalide fait échouer le démarrage avec un message explicite.
import { z } from "zod";

const emptyToUndefined = (value: unknown) => (value === "" ? undefined : value);

const ConfigSchema = z
  .object({
    NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
    PORT: z.coerce.number().int().min(1).max(65535).default(3000),
    LOG_LEVEL: z
      .enum(["fatal", "error", "warn", "info", "debug", "trace", "silent"])
      .default("info"),
    DATABASE_URL: z.string().min(1),
    JWT_SECRET: z.string().min(32, "doit contenir au moins 32 caractères"),
    MQTT_URL: z.string().min(1),
    MQTT_USERNAME: z.string().min(1),
    MQTT_PASSWORD: z.string().min(1),
    // Serveur ntfy (D029). Facultatif : sans NTFY_URL, l'envoi des alertes est désactivé. Une
    // chaîne vide (ligne laissée vide du .env) vaut « absent ».
    NTFY_URL: z.preprocess(emptyToUndefined, z.url().optional()),
    NTFY_TOPIC: z.preprocess(
      emptyToUndefined,
      z
        .string()
        .regex(
          /^[A-Za-z0-9_-]{1,64}$/,
          "lettres, chiffres, tiret et tiret bas, 64 caractères au plus",
        )
        .optional(),
    ),
    // Jeton de publication (écriture seule), créé par `pnpm ntfy:setup`.
    NTFY_TOKEN: z.preprocess(emptyToUndefined, z.string().min(1).optional()),
  })
  .superRefine((env, context) => {
    if (!env.NTFY_URL) return;
    for (const name of ["NTFY_TOPIC", "NTFY_TOKEN"] as const) {
      if (!env[name]) {
        context.addIssue({
          code: "custom",
          path: [name],
          message: "obligatoire quand NTFY_URL est défini",
        });
      }
    }
  });

export type Config = z.infer<typeof ConfigSchema>;

/** Réglages d'envoi vers ntfy, ou `null` quand `NTFY_URL` est absent (envoi désactivé). */
export function ntfySettings(
  config: Pick<Config, "NTFY_URL" | "NTFY_TOPIC" | "NTFY_TOKEN">,
): { url: string; topic: string; token: string } | null {
  const { NTFY_URL: url, NTFY_TOPIC: topic, NTFY_TOKEN: token } = config;
  return url && topic && token ? { url, topic, token } : null;
}

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
