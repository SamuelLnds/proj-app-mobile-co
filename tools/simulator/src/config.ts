// Lecture et validation des variables d'environnement du simulateur (section 9 de la cartographie).
// Une variable manquante ou invalide fait échouer le démarrage avec un message explicite.
import { PANEL_CODE_PATTERN, SITE_CODE_PATTERN } from "@solar/contracts";
import { z } from "zod";

/** Découpe une liste séparée par des virgules (ex. `P07,P12`) ; une valeur absente donne une liste vide. */
const emptyToUndefined = (value: unknown) => (value === "" ? undefined : value);

const panelListSchema = z
  .string()
  .optional()
  .transform((value) =>
    (value ?? "")
      .split(",")
      .map((code) => code.trim())
      .filter((code) => code.length > 0),
  )
  .pipe(
    z
      .array(
        z
          .string()
          .regex(
            PANEL_CODE_PATTERN,
            "code de panneau attendu : P suivi de 2 ou 3 chiffres (ex. P07)",
          ),
      )
      .transform((codes) => [...new Set(codes)]),
  );

const ConfigSchema = z.object({
  MQTT_URL: z
    .string({ error: "obligatoire" })
    .pipe(z.url({ protocol: /^mqtts?$/, message: "doit commencer par mqtt:// ou mqtts://" })),
  MQTT_USERNAME: z.string({ error: "obligatoire" }).min(1, "obligatoire"),
  MQTT_PASSWORD: z.string({ error: "obligatoire" }).min(1, "obligatoire"),
  SITE_CODE: z
    .string({ error: "obligatoire" })
    .regex(SITE_CODE_PATTERN, "code de site attendu : 3 à 16 majuscules ou chiffres (ex. SITE01)"),
  /** Le simulateur joue l'objet du site (D024) ; seules les valeurs `true` et `false` sont acceptées. */
  SIMULATE_DEVICE: z
    .enum(["true", "false"], { error: "attendu : true ou false" })
    .default("false")
    .transform((value) => value === "true"),
  FAULTY_PANELS: panelListSchema,
  EXTRA_PANELS: panelListSchema,
  // Mode objet du site : enrôlement auprès de l'API puis TLS mutuel sur 8883 (D027, #84).
  // Valeurs par défaut pour le développement, le simulateur étant lancé depuis tools/simulator.
  /** Nom de l'objet, identique à son identifiant MQTT (défaut : `device-` suivi du code du site). */
  DEVICE_NAME: z.preprocess(
    emptyToUndefined,
    z
      .string()
      .regex(/^[a-z0-9-]{3,64}$/, "nom d'objet attendu (ex. device-site01)")
      .optional(),
  ),
  API_URL: z.preprocess(
    emptyToUndefined,
    z
      .url({ protocol: /^https?$/, message: "doit commencer par http:// ou https://" })
      .default("http://127.0.0.1:3000/v1"),
  ),
  DEVICE_MQTT_URL: z.preprocess(
    emptyToUndefined,
    z
      .url({ protocol: /^mqtts$/, message: "doit commencer par mqtts://" })
      .default("mqtts://localhost:8883"),
  ),
  /** Certificat de l'autorité du serveur (public), pour vérifier le broker. */
  BROKER_CA_PATH: z.preprocess(
    emptyToUndefined,
    z.string().min(1).default("../../infra/mosquitto/generated/ca.crt"),
  ),
});

type ParsedConfig = z.infer<typeof ConfigSchema>;
export type Config = Omit<ParsedConfig, "DEVICE_NAME"> & { DEVICE_NAME: string };

/** Valide les variables d'environnement ; lève une erreur listant chaque variable en défaut. */
export function loadConfig(env: NodeJS.ProcessEnv = process.env): Config {
  const result = ConfigSchema.safeParse(env);
  if (!result.success) {
    const problems = result.error.issues
      .map((issue) => `  - ${issue.path.join(".")} : ${issue.message}`)
      .join("\n");
    throw new Error(`Configuration invalide, variables d'environnement à corriger :\n${problems}`);
  }
  return {
    ...result.data,
    DEVICE_NAME: result.data.DEVICE_NAME ?? `device-${result.data.SITE_CODE.toLowerCase()}`,
  };
}
