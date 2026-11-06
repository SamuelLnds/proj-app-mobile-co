// Données de démonstration (section 8 du modèle de données) : site, objet, 20 panneaux et
// 2 utilisateurs. Relançable sans erreur ni doublon : une ligne existante n'est jamais modifiée.
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import argon2 from "argon2";
import { eq } from "drizzle-orm";
import { z } from "zod";
import type { UserRole } from "@solar/contracts";
import { createDb } from "./client";
import type { Database } from "./client";
import { parseDemoSiteFile } from "./seed-schema";
import type { DemoSiteFile } from "./seed-schema";
import { devices, panels, sites, users } from "./schema";

const SEED_FILE = fileURLToPath(new URL("../../../../infra/seed/demo-site.json", import.meta.url));

const SeedEnvSchema = z.object({
  DATABASE_URL: z.string().min(1),
  SEED_OPERATOR_PASSWORD: z.string().min(8, "doit contenir au moins 8 caractères"),
  SEED_VIEWER_PASSWORD: z.string().min(8, "doit contenir au moins 8 caractères"),
});

interface SeedUser {
  email: string;
  name: string;
  role: UserRole;
  password: string;
}

/** Insère les données ; chaque insertion ignore les lignes déjà présentes. */
export async function seedDemo(db: Database["db"], data: DemoSiteFile, seedUsers: SeedUser[]) {
  // Le hachage (lent par conception) est fait avant la transaction.
  const hashedUsers = await Promise.all(
    seedUsers.map(async ({ password, ...user }) => ({
      ...user,
      passwordHash: await argon2.hash(password, { type: argon2.argon2id }),
    })),
  );

  await db.transaction(async (tx) => {
    await tx.insert(sites).values(data.site).onConflictDoNothing({ target: sites.code });

    const [site] = await tx
      .select({ id: sites.id })
      .from(sites)
      .where(eq(sites.code, data.site.code));
    if (!site) throw new Error(`Site ${data.site.code} introuvable après insertion`);

    await tx
      .insert(devices)
      .values({ siteId: site.id, mqttClientId: data.device.mqttClientId })
      .onConflictDoNothing({ target: devices.mqttClientId });

    await tx
      .insert(panels)
      .values(data.panels.map((panel) => ({ ...panel, siteId: site.id })))
      .onConflictDoNothing({ target: [panels.siteId, panels.code] });

    await tx.insert(users).values(hashedUsers).onConflictDoNothing({ target: users.email });
  });
}

async function main() {
  const parsed = SeedEnvSchema.safeParse(process.env);
  if (!parsed.success) {
    const problems = parsed.error.issues
      .map((issue) => `  - ${issue.path.join(".")} : ${issue.message}`)
      .join("\n");
    throw new Error(`Variables d'environnement à corriger :\n${problems}`);
  }
  const env = parsed.data;

  const data = parseDemoSiteFile(JSON.parse(readFileSync(SEED_FILE, "utf8")));
  const { db, pool } = createDb(env.DATABASE_URL);
  try {
    await seedDemo(db, data, [
      {
        email: "operator@demo.local",
        name: "Exploitant démo",
        role: "operator",
        password: env.SEED_OPERATOR_PASSWORD,
      },
      {
        email: "viewer@demo.local",
        name: "Lecteur démo",
        role: "viewer",
        password: env.SEED_VIEWER_PASSWORD,
      },
    ]);
    console.log(`Seed terminé : ${data.panels.length} panneaux, 2 utilisateurs.`);
  } finally {
    await pool.end();
  }
}

// Exécuté seulement en ligne de commande (pas quand le module est importé par un test).
if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  await main();
}
