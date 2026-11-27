import { defineConfig } from "vitest/config";

/** Seuil de couverture des services exigé par #52 (lignes, instructions, fonctions et branches). */
const SERVICE_THRESHOLD = { statements: 80, lines: 80, functions: 80, branches: 80 };

export default defineConfig({
  test: {
    include: ["src/**/*.test.ts"],
    // Hachage argon2 et génération de clés : plus lents sous la mesure de couverture, surtout quand les
    // autres paquets testent en parallèle (`pnpm test`) ; 5 s par défaut ne suffisent pas toujours.
    testTimeout: 20_000,
    hookTimeout: 20_000,
    // La couverture est mesurée à chaque `pnpm test` (donc en CI) : le test échoue si un service
    // exigé descend sous le seuil.
    coverage: {
      provider: "v8",
      include: ["src/modules/**/service.ts", "src/modules/alerts/engine.ts"],
      reporter: ["text-summary"],
      thresholds: {
        "src/modules/setpoints/service.ts": SERVICE_THRESHOLD,
        "src/modules/alerts/{service,engine}.ts": SERVICE_THRESHOLD,
        "src/modules/measurements/service.ts": SERVICE_THRESHOLD,
        "src/modules/auth/service.ts": SERVICE_THRESHOLD,
      },
    },
  },
});
