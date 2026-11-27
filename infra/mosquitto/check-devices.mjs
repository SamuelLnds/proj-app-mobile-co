// Vérifie sur le broker démarré le TLS mutuel de l'écoute 8883 (issue #80, D027) :
// refus sans certificat, avec un certificat expiré ou d'une autre autorité ; droits limités d'un
// certificat valide ; effet du retrait de l'ACL sur une connexion ouverte ; refus après révocation.
// Les certificats de test sont signés par une copie de l'autorité des objets : sa base réelle
// (index, révocations) n'est pas modifiée. L'ACL et la liste de révocation des objets sont
// restaurées à la fin, puis le broker est rechargé.
// Usage : pnpm mqtt:check-devices        (après pnpm mqtt:setup et pnpm mqtt:up)

import { execFileSync } from "node:child_process";
import { cpSync, existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const infraDir = resolve(here, "..");
const compose = join(infraDir, "docker-compose.yml");
const caDir = join(here, "device-ca");
const devicesDir = join(here, "devices");
const workDir = join(here, ".check");

function fail(message) {
  console.error(message);
  process.exit(1);
}

// Lecture minimale de infra/.env (clé=valeur), sans jamais afficher les valeurs
function readEnv(file) {
  if (!existsSync(file)) fail(`Fichier ${file} introuvable : voir infra/README.md.`);
  const env = {};
  for (const line of readFileSync(file, "utf8").split(/\r?\n/)) {
    const match = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/);
    if (match) env[match[1]] = match[2].replace(/^["']|["']$/g, "");
  }
  return env;
}

for (const file of [
  join(caDir, "devices-ca.key"),
  join(devicesDir, "acl"),
  join(devicesDir, "crl.pem"),
]) {
  if (!existsSync(file)) fail(`${file} introuvable : lancez « pnpm mqtt:setup ».`);
}
const apiPassword = readEnv(join(infraDir, ".env")).MQTT_API_PASSWORD;
if (!apiPassword) fail("MQTT_API_PASSWORD manquant dans infra/.env.");

const run = (args, input) =>
  execFileSync("docker", args, { input, encoding: "utf8", stdio: ["pipe", "pipe", "pipe"] });
/** Script shell exécuté dans le conteneur du broker (l'entrée standard évite d'exposer le mot de passe). */
const inBroker = (script) => run(["compose", "-f", compose, "exec", "-T", "mqtt", "sh"], script);
const reload = () => inBroker("sh /src/config/reload.sh");

const DEVICE_ACL = `user device-site01
topic write solar/SITE01/measurements
topic write solar/SITE01/status
topic write solar/SITE01/state
topic read solar/SITE01/setpoint
`;

// Sauvegarde des fichiers réels, restaurés quoi qu'il arrive
const savedAcl = readFileSync(join(devicesDir, "acl"));
const savedCrl = readFileSync(join(devicesDir, "crl.pem"));
const results = [];
const check = (label, ok) => {
  results.push({ label, ok });
  console.log(`${ok ? "OK    " : "ÉCHEC "} ${label}`);
};

rmSync(workDir, { recursive: true, force: true });
mkdirSync(join(workDir, "out"), { recursive: true });
cpSync(caDir, join(workDir, "ca"), { recursive: true });
cpSync(join(here, "generated", "ca.crt"), join(workDir, "out", "server-ca.crt"));

try {
  // 1. Certificats de test : valide, expiré, et signé par une autre autorité
  const openssl = (script) =>
    run(
      [
        "run",
        "--rm",
        "-i",
        "-v",
        `${join(workDir, "ca")}:/work`,
        "-v",
        `${join(workDir, "out")}:/out`,
        "alpine:3",
        "sh",
      ],
      `set -e\napk add --no-cache openssl >/dev/null\ncd /work\n${script}`,
    );
  openssl(`
key() { openssl ecparam -name prime256v1 -genkey -noout -out /out/$1.key; openssl req -new -key /out/$1.key -subj "/CN=$2" -out /out/$1.csr; }
key valid device-site01
openssl ca -batch -config openssl.cnf -in /out/valid.csr -out /out/valid.crt -days 1 -notext 2>/dev/null
key expired device-site01
openssl ca -batch -config openssl.cnf -in /out/expired.csr -out /out/expired.crt -startdate 20240101000000Z -enddate 20240102000000Z -notext 2>/dev/null
openssl ecparam -name prime256v1 -genkey -noout -out /out/other-ca.key
openssl req -x509 -new -key /out/other-ca.key -out /out/other-ca.crt -days 1 -subj "/CN=Autre autorite"
key other device-site01
openssl x509 -req -in /out/other.csr -CA /out/other-ca.crt -CAkey /out/other-ca.key -CAcreateserial -out /out/other.crt -days 1 2>/dev/null
chmod 644 /out/*
`);
  run(["compose", "-f", compose, "exec", "-T", "mqtt", "rm", "-rf", "/tmp/check"]);
  run(["compose", "-f", compose, "cp", join(workDir, "out"), "mqtt:/tmp/check"]);

  const tls = (name) =>
    `-h localhost -p 8883 --cafile /tmp/check/server-ca.crt` +
    (name ? ` --cert /tmp/check/${name}.crt --key /tmp/check/${name}.key` : "");
  /** Publie une fois ; renvoie vrai si la connexion a été acceptée. */
  const connects = (name) =>
    inBroker(
      `mosquitto_pub ${tls(name)} -i check-${name ?? "none"} -t solar/SITE01/status -m check-connect -q 1 >/dev/null 2>&1 && echo yes || echo no`,
    ).trim() === "yes";
  /** Lance l'abonné de l'API pendant `script`, et renvoie les messages de test reçus. */
  const received = (script, seconds) =>
    inBroker(`
mosquitto_sub -h localhost -p 1883 -u api -P '${apiPassword.replace(/'/g, "'\\''")}' -t 'solar/SITE01/#' -v -W ${seconds} > /tmp/check/received.txt 2>/dev/null &
SUB=$!
sleep 1
${script}
wait $SUB || true
grep ' check-' /tmp/check/received.txt || true
`);

  // 2. Droits de l'objet présents
  writeFileSync(join(devicesDir, "acl"), DEVICE_ACL);
  reload();

  check("Connexion sans certificat client refusée", !connects(undefined));
  check("Connexion avec un certificat expiré refusée", !connects("expired"));
  check("Connexion avec un certificat d'une autre autorité refusée", !connects("other"));

  const rights = received(
    `mosquitto_pub ${tls("valid")} -i check-valid -t solar/SITE01/status -m check-allowed -q 1
mosquitto_pub ${tls("valid")} -i check-valid -t solar/SITE01/setpoint -m check-forbidden -q 1
mosquitto_pub ${tls("valid")} -i check-valid -t solar/SITE02/status -m check-other-site -q 1`,
    4,
  );
  check(
    "Certificat valide device-site01 : connexion et publication sur son topic",
    rights.includes("check-allowed"),
  );
  check(
    "Certificat valide : aucune publication hors de ses droits (setpoint, autre site)",
    !rights.includes("check-forbidden") && !rights.includes("check-other-site"),
  );

  // 3. Retrait de l'ACL pendant qu'une connexion de l'objet reste ouverte
  const openConnection = received(
    `rm -f /tmp/check/pipe; mkfifo /tmp/check/pipe
mosquitto_pub ${tls("valid")} -i check-open -t solar/SITE01/status -l -q 1 < /tmp/check/pipe &
PUB=$!
exec 3>/tmp/check/pipe
echo check-before >&3
sleep 1
printf '# ACL vide (vérification)\\n' > /tmp/check/empty.acl
cp /tmp/check/empty.acl /etc/mosquitto-solar/devices.acl
chmod 0600 /etc/mosquitto-solar/devices.acl
chown mosquitto:mosquitto /etc/mosquitto-solar/devices.acl
kill -HUP 1
sleep 1
echo check-after >&3
sleep 1
exec 3>&-
wait $PUB || true`,
    6,
  );
  check(
    "Connexion déjà ouverte : publication acceptée avant le retrait de l'ACL, refusée après",
    openConnection.includes("check-before") && !openConnection.includes("check-after"),
  );

  // 4. Révocation : ACL rétablie, certificat ajouté à la liste de révocation
  writeFileSync(join(devicesDir, "acl"), DEVICE_ACL);
  openssl(`openssl ca -config openssl.cnf -revoke /out/valid.crt 2>/dev/null
openssl ca -config openssl.cnf -gencrl -out /out/crl.pem 2>/dev/null`);
  cpSync(join(workDir, "out", "crl.pem"), join(devicesDir, "crl.pem"));
  reload();
  check("Certificat révoqué : reconnexion refusée", !connects("valid"));
} finally {
  writeFileSync(join(devicesDir, "acl"), savedAcl);
  writeFileSync(join(devicesDir, "crl.pem"), savedCrl);
  try {
    reload();
    run(["compose", "-f", compose, "exec", "-T", "mqtt", "rm", "-rf", "/tmp/check"]);
  } catch {
    console.error("Rechargement du broker impossible : lancez « pnpm mqtt:reload ».");
  }
  rmSync(workDir, { recursive: true, force: true });
}

const failed = results.filter((r) => !r.ok).length;
console.log(
  failed === 0 ? "\nToutes les vérifications passent." : `\n${failed} vérification(s) en échec.`,
);
process.exit(failed === 0 ? 0 : 1);
