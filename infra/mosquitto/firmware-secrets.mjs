// Génère firmware/site-device/include/secrets.h (ignoré par Git) pour l'ESP32 de Wokwi.
// Sources : les noms d'hôte TLS de infra/.env et le certificat de l'autorité du projet dans
// infra/mosquitto/generated/ca.crt (public, produit par « pnpm mqtt:setup »).
// L'objet n'a plus de mot de passe : l'écoute 8883 exige un certificat client (D027, #80), que
// le firmware obtiendra par enrôlement (#83). D'ici là, le fichier généré ne se connecte pas.
//
// Usage : pnpm firmware:secrets --host bore.pub --port 41234
//   --host  hôte du tunnel (doit figurer dans MQTT_TLS_HOSTS, sinon le certificat sera refusé) ; défaut : bore.pub
//   --port  port TLS distant attribué par bore ; défaut : 8883
//   --env, --ca, --out  chemins alternatifs (tests)

import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { parseArgs } from "node:util";

const here = dirname(fileURLToPath(import.meta.url));
const root = resolve(here, "..", "..");

// pnpm peut transmettre un « -- » : on l'ignore pour que les options soient bien lues
const argv = process.argv
  .slice(2)
  .filter((arg, i, all) => !(arg === "--" && all.indexOf("--") === i));

const { values: args } = parseArgs({
  args: argv,
  options: {
    host: { type: "string", default: "bore.pub" },
    port: { type: "string", default: "8883" },
    env: { type: "string", default: join(root, "infra", ".env") },
    ca: { type: "string", default: join(here, "generated", "ca.crt") },
    out: {
      type: "string",
      default: join(root, "firmware", "site-device", "include", "secrets.h"),
    },
  },
});

function fail(message) {
  console.error(message);
  process.exit(1);
}

// Lecture minimale d'un fichier clé=valeur, sans jamais afficher les valeurs
function readEnv(file) {
  if (!existsSync(file)) fail(`Fichier ${file} introuvable : voir infra/README.md.`);
  const env = {};
  for (const line of readFileSync(file, "utf8").split(/\r?\n/)) {
    const match = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/);
    if (match) env[match[1]] = match[2].replace(/^["']|["']$/g, "");
  }
  return env;
}

const port = Number(args.port);
if (!Number.isInteger(port) || port < 1 || port > 65535) fail(`Port invalide : ${args.port}.`);
if (!/^[A-Za-z0-9.-]+$/.test(args.host)) fail(`Hôte invalide : ${args.host}.`);

const env = readEnv(args.env);

const tlsHosts = (env.MQTT_TLS_HOSTS || "localhost").split(",").map((h) => h.trim());
if (!tlsHosts.includes(args.host)) {
  fail(
    `L'hôte « ${args.host} » n'est pas dans MQTT_TLS_HOSTS : l'ESP32 refuserait le certificat. ` +
      "Ajoutez-le dans infra/.env puis relancez « pnpm mqtt:setup ».",
  );
}

if (!existsSync(args.ca)) fail(`Certificat ${args.ca} introuvable : lancez « pnpm mqtt:setup ».`);
const ca = readFileSync(args.ca, "utf8").trim();
if (!ca.startsWith("-----BEGIN CERTIFICATE-----") || ca.includes(')EOF"')) {
  fail("Le fichier ca.crt n'est pas un certificat PEM valide.");
}

// Échappement d'une chaîne C
const cString = (value) => `"${value.replace(/\\/g, "\\\\").replace(/"/g, '\\"')}"`;

const content = `// Généré par « pnpm firmware:secrets » : NE PAS VERSIONNER (ignoré par Git).
#pragma once

#define WIFI_SSID "Wokwi-GUEST"
#define WIFI_PASSWORD ""

#define MQTT_HOST ${cString(args.host)}
#define MQTT_PORT ${port}

// Aucun mot de passe : le broker exige un certificat client sur 8883 (D027).
#define MQTT_USERNAME "device-site01"
#define MQTT_PASSWORD ""

static const char MQTT_CA_CERT[] = R"EOF(
${ca}
)EOF";
`;

mkdirSync(dirname(args.out), { recursive: true });
writeFileSync(args.out, content);
console.log(`secrets.h généré (broker ${args.host}:${port}). Recompilez avec « pio run ».`);
