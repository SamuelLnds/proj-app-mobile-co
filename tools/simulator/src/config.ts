// Lecture et validation des variables d'environnement du simulateur (section 9 de la cartographie).
// Une variable manquante ou invalide fait échouer le démarrage avec un message explicite.
import { PANEL_CODE_PATTERN, SITE_CODE_PATTERN } from "@solar/contracts";
import { z } from "zod";

/** Découpe une liste séparée par des virgules (ex. `P07,P12`) ; une valeur absente donne une liste vide. */
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
  FAULTY_PANELS: panelListSchema,
  EXTRA_PANELS: panelListSchema,
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
