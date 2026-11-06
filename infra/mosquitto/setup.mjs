// Prépare le broker Mosquitto : fichier de mots de passe et certificats TLS.
// Lit les mots de passe dans infra/.env et écrit dans infra/mosquitto/generated/ (ignoré par Git).
// Les commandes mosquitto_passwd et openssl tournent dans des conteneurs : rien à installer.
// Usage : pnpm mqtt:setup        (relancer pour changer un mot de passe ou un nom d'hôte TLS)

import { execFileSync } from "node:child_process";
import { existsSync, mkdirSync, readFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const infraDir = resolve(here, "..");
const outDir = join(here, "generated");

// Lecture minimale de infra/.env (clé=valeur), sans jamais afficher les valeurs
function readEnv(file) {
  if (!existsSync(file)) {
    console.error(
      `Fichier ${file} introuvable : copiez infra/.env.example en infra/.env puis remplissez-le.`,
    );
    process.exit(1);
  }
  const env = {};
  for (const line of readFileSync(file, "utf8").split(/\r?\n/)) {
    const match = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/);
    if (match) env[match[1]] = match[2].replace(/^["']|["']$/g, "");
  }
  return env;
}

const env = readEnv(join(infraDir, ".env"));
const users = {
  api: env.MQTT_API_PASSWORD,
  simulator: env.MQTT_SIMULATOR_PASSWORD,
  "device-site01": env.MQTT_DEVICE_PASSWORD,
};
for (const [user, password] of Object.entries(users)) {
  if (!password || password === "change-me") {
    console.error(`Mot de passe manquant pour « ${user} » dans infra/.env.`);
    process.exit(1);
  }
}
// Noms d'hôte acceptés par le certificat TLS (localhost et, plus tard, l'hôte du tunnel)
const tlsHosts = (env.MQTT_TLS_HOSTS || "localhost")
  .split(",")
  .map((h) => h.trim())
  .filter(Boolean);

mkdirSync(outDir, { recursive: true });
const mount = `${outDir}:/work`;
const docker = (args, input) =>
  execFileSync("docker", args, { stdio: ["pipe", "ignore", "inherit"], input });

// 1. Fichier de mots de passe (haché par mosquitto_passwd)
const lines =
  Object.entries(users)
    .map(([u, p]) => `${u}:${p}`)
    .join("\n") + "\n";
docker(
  [
    "run",
    "--rm",
    "-i",
    "-v",
    mount,
    "eclipse-mosquitto:2",
    "sh",
    "-c",
    "cat > /work/passwd && mosquitto_passwd -U /work/passwd",
  ],
  lines,
);
console.log("Fichier de mots de passe généré (3 clients).");

// 2. Autorité de certification du projet (créée une seule fois) et certificat du serveur
const san = [...tlsHosts.map((h, i) => `DNS.${i + 1} = ${h}`), "IP.1 = 127.0.0.1"].join("\n");
const script = `
set -e
apk add --no-cache openssl >/dev/null
cd /work
if [ ! -f ca.key ]; then
  openssl req -x509 -new -nodes -newkey rsa:2048 -keyout ca.key -out ca.crt -days 825 -subj "/CN=Parc Solaire CA" 2>/dev/null
fi
cat > server.ext <<EOF
basicConstraints = CA:FALSE
keyUsage = digitalSignature, keyEncipherment
extendedKeyUsage = serverAuth
subjectAltName = @alt
[alt]
${san}
EOF
openssl req -new -nodes -newkey rsa:2048 -keyout server.key -out server.csr -subj "/CN=${tlsHosts[0]}" 2>/dev/null
openssl x509 -req -in server.csr -CA ca.crt -CAkey ca.key -CAcreateserial -out server.crt -days 825 -extfile server.ext 2>/dev/null
rm -f server.csr server.ext
`;
docker(["run", "--rm", "-i", "-v", mount, "alpine:3", "sh"], script);
console.log(`Certificats TLS générés pour : ${tlsHosts.join(", ")}.`);
console.log(
  "Redémarrez le broker : docker compose -f infra/docker-compose.yml up -d --force-recreate mqtt",
);
