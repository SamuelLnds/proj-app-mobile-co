// Prépare le serveur ntfy (D029) : deux utilisateurs, leurs jetons d'accès et leurs droits.
//   - solar-api   : jeton de publication, ÉCRITURE seule sur le sujet des alertes (pour l'API) ;
//   - solar-phone : jeton de lecture, LECTURE seule sur le sujet (pour l'app ntfy du téléphone).
// Les jetons sont écrits dans infra/ntfy/generated/ (ignoré par Git) et affichés une seule fois,
// à leur création. Les utilisateurs ont un mot de passe aléatoire que personne ne connaît : seuls
// les jetons servent à se connecter.
// Le serveur est démarré au besoin (la base d'authentification est créée à son premier démarrage).
//
// Usage : pnpm ntfy:setup             (crée ce qui manque ; sans effet si tout existe déjà)
//         pnpm ntfy:setup -- --rotate (supprime les deux utilisateurs et crée de nouveaux jetons)
// Sujet : NTFY_TOPIC dans infra/.env ou dans l'environnement, solar-site01-alerts par défaut.

import { execFileSync } from "node:child_process";
import { randomBytes } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const infraDir = resolve(here, "..");
const outDir = join(here, "generated");
const composeFile = join(infraDir, "docker-compose.yml");
const rotate = process.argv.includes("--rotate");

// Lecture minimale de infra/.env (clé=valeur), facultatif : aucun secret n'y est nécessaire
function readEnv(file) {
  const env = {};
  if (!existsSync(file)) return env;
  for (const line of readFileSync(file, "utf8").split(/\r?\n/)) {
    const match = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/);
    if (match) env[match[1]] = match[2].replace(/^["']|["']$/g, "");
  }
  return env;
}

const env = { ...readEnv(join(infraDir, ".env")), ...process.env };
const topic = env.NTFY_TOPIC || "solar-site01-alerts";
if (!/^[A-Za-z0-9_-]{1,64}$/.test(topic)) {
  console.error(
    "NTFY_TOPIC invalide : lettres, chiffres, tiret et tiret bas, 64 caractères au plus.",
  );
  process.exit(1);
}
const port = env.NTFY_PORT || "8090";
const baseUrl = env.NTFY_BASE_URL || `http://localhost:${port}`;

const roles = [
  { user: "solar-api", access: "write-only", file: "publish-token" },
  { user: "solar-phone", access: "read-only", file: "read-token" },
];

const compose = (args, options = {}) => {
  try {
    return execFileSync("docker", ["compose", "-f", composeFile, ...args], {
      encoding: "utf8",
      stdio: ["ignore", "pipe", "pipe"],
      ...options,
    });
  } catch (error) {
    // Docker éteint, absent ou fichier infra/.env manquant : on affiche sa réponse, sans les arguments
    console.error(`Échec de « docker compose ${args[0]} » :\n${error.stderr ?? error.message}`);
    process.exit(1);
  }
};
const ntfy = (args, extraEnv = {}) => {
  const envArgs = Object.keys(extraEnv).flatMap((key) => ["-e", key]);
  return compose(["exec", "-T", ...envArgs, "ntfy", "ntfy", ...args], {
    env: { ...process.env, ...extraEnv },
  });
};

// 1. Serveur démarré et prêt (la base d'authentification est créée au premier démarrage)
compose(["up", "-d", "--wait", "ntfy"]);

const users = ntfy(["user", "list"]);
const exists = (user) => new RegExp(`^user ${user}\\b`, "m").test(users);

mkdirSync(outDir, { recursive: true });
const created = {};

for (const { user, access, file } of roles) {
  const tokenFile = join(outDir, file);
  const present = exists(user);
  if (present && existsSync(tokenFile) && !rotate) {
    ntfy(["access", user, topic, access]); // droits réappliqués (sujet éventuellement changé)
    continue;
  }
  if (present) ntfy(["user", "del", user]);
  // Mot de passe aléatoire, transmis par l'environnement et jamais conservé
  ntfy(["user", "add", "--role=user", user], { NTFY_PASSWORD: randomBytes(24).toString("hex") });
  ntfy(["access", user, topic, access]);
  const output = ntfy(["token", "add", "--label", `solar ${access}`, user]);
  const token = output.match(/\btk_[a-z0-9]+\b/)?.[0];
  if (!token) {
    console.error(`Jeton introuvable dans la réponse de ntfy pour « ${user} ».`);
    process.exit(1);
  }
  writeFileSync(tokenFile, `${token}\n`, { mode: 0o600 });
  created[file] = token;
}

// 2. Compte rendu : les valeurs ne sont affichées qu'à la création du jeton
console.log(`Sujet des alertes : ${topic}`);
console.log(
  "Droits : solar-api en écriture seule, solar-phone en lecture seule, aucun accès anonyme.",
);
if (Object.keys(created).length === 0) {
  console.log("Déjà configuré : les jetons existants ne sont pas affichés de nouveau.");
  console.log(
    "Ils sont dans infra/ntfy/generated/ ; « pnpm ntfy:setup -- --rotate » en crée de nouveaux.",
  );
} else {
  console.log("\nÀ recopier maintenant (affiché une seule fois) :");
  if (created["publish-token"]) {
    console.log("\n  apps/api/.env");
    console.log(`    NTFY_URL=http://127.0.0.1:${port}`);
    console.log(`    NTFY_TOPIC=${topic}`);
    console.log(`    NTFY_TOKEN=${created["publish-token"]}`);
  }
  if (created["read-token"]) {
    console.log("\n  App ntfy du téléphone (abonnement, voir infra/README.md)");
    console.log(`    Serveur : ${baseUrl}`);
    console.log(`    Sujet   : ${topic}`);
    console.log(`    Jeton de lecture : ${created["read-token"]}`);
  }
}
