// Schéma Zod du fichier infra/seed/demo-site.json, validé avant toute insertion.
// Les bornes reprennent les contraintes CHECK de la base (section 4 du modèle de données).
import { z } from "zod";

const latitude = z.number().min(-90).max(90);
const longitude = z.number().min(-180).max(180);
const name = z.string().min(1).max(100);

export const DemoSiteFileSchema = z.object({
  site: z.object({
    code: z.string().regex(/^[A-Z0-9]{3,16}$/),
    name,
    latitude,
    longitude,
    peakPowerW: z.number().int().positive(),
    batteryCapacityWh: z.number().int().positive(),
    maxChargePowerW: z.number().int().positive(),
    productionFactor: z.number().positive(),
  }),
  device: z.object({
    mqttClientId: z.string().min(1),
  }),
  panels: z
    .array(
      z.object({
        code: z.string().regex(/^P[0-9]{2,3}$/),
        name,
        latitude,
        longitude,
        ratedPowerW: z.number().int().positive(),
        // Les panneaux du seed portent toujours cette origine.
        source: z.literal("seed"),
      }),
    )
    .min(1)
    .refine((panels) => new Set(panels.map((p) => p.code)).size === panels.length, {
      message: "Les codes de panneau doivent être uniques",
    }),
});

export type DemoSiteFile = z.infer<typeof DemoSiteFileSchema>;

/** Valide le contenu du fichier ; l'erreur liste chaque champ fautif avec son chemin. */
export function parseDemoSiteFile(content: unknown): DemoSiteFile {
  const result = DemoSiteFileSchema.safeParse(content);
  if (!result.success) {
    const problems = result.error.issues
      .map((issue) => `  - ${issue.path.join(".") || "(racine)"} : ${issue.message}`)
      .join("\n");
    throw new Error(`demo-site.json invalide :\n${problems}`);
  }
  return result.data;
}
