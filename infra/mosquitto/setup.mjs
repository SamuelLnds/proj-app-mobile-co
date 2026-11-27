// Prépare le broker Mosquitto : fichier de mots de passe, certificats TLS et autorité des objets.
// Lit les mots de passe dans infra/.env et écrit, tous ignorés par Git :
// - infra/mosquitto/generated/ : mots de passe hachés, autorité du serveur, certificat du serveur,
//   certificat (public) de l'autorité des objets ; monté dans le broker ;
// - infra/mosquitto/device-ca/ : clé de l'autorité des objets et sa base OpenSSL ; jamais monté
//   dans le broker, réservé à l'API qui signe les certificats des objets (D027) ;
// - infra/mosquitto/devices/ : ACL des objets et liste de révocation, écrites ensuite par l'API.
// Les commandes mosquitto_passwd et openssl tournent dans des conteneurs : rien à installer.
// Usage : pnpm mqtt:setup        (relancer pour changer un mot de passe ou un nom d'hôte TLS)

import { execFileSync } from "node:child_process";
import { copyFileSync, existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const infraDir = resolve(here, "..");
const outDir = join(here, "generated");
const caDir = join(here, "device-ca");
const devicesDir = join(here, "devices");

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
// Clients de l'écoute locale 1883. Les objets n'ont pas de mot de passe : ils se connectent sur
// 8883 avec leur certificat (D027).
const users = {
  api: env.MQTT_API_PASSWORD,
  simulator: env.MQTT_SIMULATOR_PASSWORD,
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
console.log(`Fichier de mots de passe généré (${Object.keys(users).length} clients).`);

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

// 3. Autorité des objets (créée une seule fois), distincte de celle du serveur, avec sa base
// OpenSSL (index, numéros de série, liste de révocation). Sa clé ne quitte pas device-ca/.
mkdirSync(caDir, { recursive: true });
writeFileSync(join(caDir, "openssl.cnf"), readFileSync(join(here, "config", "device-ca.cnf")));
const caScript = `
set -e
apk add --no-cache openssl >/dev/null
cd /work
mkdir -p newcerts
[ -f index.txt ] || : > index.txt
[ -f serial ] || openssl rand -hex 16 > serial
[ -f crlnumber ] || echo 1000 > crlnumber
if [ ! -f devices-ca.key ]; then
  openssl ecparam -name prime256v1 -genkey -noout -out devices-ca.key
  openssl req -x509 -new -key devices-ca.key -out devices-ca.crt -days 825 -subj "/CN=Parc Solaire Devices CA"     -addext "basicConstraints=critical,CA:TRUE" -addext "keyUsage=critical,keyCertSign,cRLSign"
fi
chmod 600 devices-ca.key
[ -f crl.pem ] || openssl ca -config openssl.cnf -gencrl -out crl.pem 2>/dev/null
`;
docker(["run", "--rm", "-i", "-v", `${caDir}:/work`, "alpine:3", "sh"], caScript);
copyFileSync(join(caDir, "devices-ca.crt"), join(outDir, "devices-ca.crt"));

// 4. Fichiers écrits ensuite par l'API : liste de révocation et ACL des objets, vide au départ
// (refus par défaut). Ils ne sont pas écrasés s'ils existent déjà.
mkdirSync(devicesDir, { recursive: true });
if (!existsSync(join(devicesDir, "crl.pem"))) {
  copyFileSync(join(caDir, "crl.pem"), join(devicesDir, "crl.pem"));
}
if (!existsSync(join(devicesDir, "acl"))) {
  writeFileSync(
    join(devicesDir, "acl"),
    "# Droits des objets sur l'écoute 8883, écrits par l'API à l'acceptation d'un objet (D027).\n" +
      "# Sans entrée, un objet n'a aucun droit.\n",
  );
}
console.log(
  "Autorité des objets prête (clé dans infra/mosquitto/device-ca/, jamais dans le broker).",
);
console.log(
  "Redémarrez le broker : docker compose -f infra/docker-compose.yml up -d --force-recreate mqtt",
);
