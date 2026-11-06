// Point d'entrée : valide la configuration puis démarre le serveur.
import { loadConfig } from "./config";
import { createDb } from "./db/client";
import { buildServer } from "./server";

const config = loadConfig();
const { pool } = createDb(config.DATABASE_URL);

const app = buildServer({
  config,
  checkDatabase: async () => {
    await pool.query("SELECT 1");
    return true;
  },
});

app.addHook("onClose", async () => {
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
