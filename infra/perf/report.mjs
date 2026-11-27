// Recalcule les indicateurs de performance (#110) pour une période donnée :
// - indicateurs de la base (infra/perf/indicators.sql), exécutés par psql dans le conteneur `db` ;
// - temps de réponse des routes de l'API, lus dans un journal JSON de Fastify (facultatif).
// Aucune dépendance ni aucune écriture : lecture seule. Aucune valeur secrète n'est affichée.
//
// Usage : pnpm perf:report -- --from 2026-11-27T10:00:00Z --to 2026-11-27T11:00:00Z --log api.log
//   --from, --to  période (ISO 8601) ; défaut : les dernières 24 h
//   --log         journal de l'API au format JSON (API lancée avec NODE_ENV=production), facultatif

import { execFileSync } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { parseArgs } from "node:util";

const here = dirname(fileURLToPath(import.meta.url));
const infraDir = resolve(here, "..");

const argv = process.argv
  .slice(2)
  .filter((arg, i, all) => !(arg === "--" && all.indexOf("--") === i));
const { values: args } = parseArgs({
  args: argv,
  options: {
    from: { type: "string" },
    to: { type: "string" },
    log: { type: "string" },
  },
});

function fail(message) {
  console.error(message);
  process.exit(1);
}

const to = args.to ? new Date(args.to) : new Date();
const from = args.from ? new Date(args.from) : new Date(to.getTime() - 24 * 3600 * 1000);
if (Number.isNaN(from.getTime()) || Number.isNaN(to.getTime()) || from >= to) {
  fail("Période invalide : --from et --to attendent des dates ISO 8601, --from avant --to.");
}

// Utilisateur et base de infra/.env (le mot de passe n'est pas lu : psql se connecte en local).
function readEnv(file) {
  const env = {};
  if (!existsSync(file)) return env;
  for (const line of readFileSync(file, "utf8").split(/\r?\n/)) {
    const match = line.match(/^\s*(POSTGRES_USER|POSTGRES_DB)\s*=\s*(.*)\s*$/);
    if (match) env[match[1]] = match[2].replace(/^["']|["']$/g, "");
  }
  return env;
}
const env = readEnv(join(infraDir, ".env"));
const user = env.POSTGRES_USER || "solar";
const database = env.POSTGRES_DB || "solar";

console.log(`Indicateurs du ${from.toISOString()} au ${to.toISOString()}\n`);

const sql = readFileSync(join(here, "indicators.sql"), "utf8");
try {
  const output = execFileSync(
    "docker",
    [
      "compose",
      "-f",
      join(infraDir, "docker-compose.yml"),
      "exec",
      "-T",
      "db",
      "psql",
      "-U",
      user,
      "-d",
      database,
      "-X",
      "-q",
      "-v",
      `from=${from.toISOString()}`,
      "-v",
      `to=${to.toISOString()}`,
      "-f",
      "-",
    ],
    { input: sql, encoding: "utf8" },
  );
  console.log(output);
} catch {
  fail("Lecture de la base impossible : la base doit tourner (pnpm db:up).");
}

if (!args.log) {
  console.log("Temps de réponse de l'API : aucun journal fourni (--log).");
  process.exit(0);
}
if (!existsSync(args.log)) fail(`Journal ${args.log} introuvable.`);

// Route normalisée : sans paramètres de requête, identifiants remplacés par leur nom.
export function routeOf(method, url) {
  const path = url
    .split("?")[0]
    .replace(/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/gi, "{id}")
    .replace(/\/[0-9a-f]{64}(?=\/|$)/g, "/{fingerprint}")
    .replace(/\/ExponentPushToken\[[^\]]*\]/g, "/{token}");
  return `${method} ${path}`;
}

const percentile = (sorted, p) =>
  sorted.length === 0 ? 0 : sorted[Math.min(sorted.length - 1, Math.ceil(p * sorted.length) - 1)];

// Fastify écrit une ligne « incoming request » (méthode, URL) puis « request completed »
// (responseTime) pour chaque requête, reliées par reqId.
const requests = new Map();
const times = new Map();
for (const line of readFileSync(args.log, "utf8").split(/\r?\n/)) {
  if (!line.startsWith("{")) continue;
  let entry;
  try {
    entry = JSON.parse(line);
  } catch {
    continue;
  }
  const at = new Date(entry.time);
  if (at < from || at >= to) continue;
  if (entry.req?.url && entry.reqId)
    requests.set(entry.reqId, routeOf(entry.req.method, entry.req.url));
  if (typeof entry.responseTime === "number" && requests.has(entry.reqId)) {
    const route = requests.get(entry.reqId);
    if (!times.has(route)) times.set(route, []);
    times.get(route).push(entry.responseTime);
    requests.delete(entry.reqId);
  }
}

console.log("== Temps de réponse de l'API (ms, journal Fastify) ==");
const rows = [...times.entries()]
  .map(([route, values]) => {
    const sorted = [...values].sort((a, b) => a - b);
    return {
      route,
      requetes: sorted.length,
      mediane_ms: Number(percentile(sorted, 0.5).toFixed(1)),
      p95_ms: Number(percentile(sorted, 0.95).toFixed(1)),
    };
  })
  .sort((a, b) => b.requetes - a.requetes);
if (rows.length === 0) console.log("Aucune requête sur la période.");
else console.table(rows);
