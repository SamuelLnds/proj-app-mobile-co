// Fait relire au broker l'ACL des objets et la liste de révocation (D027), sans le redémarrer.
// À lancer après chaque modification de infra/mosquitto/devices/ (l'API le fera elle-même, #81).
// Usage : pnpm mqtt:reload

import { execFileSync } from "node:child_process";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const compose = join(resolve(here, ".."), "docker-compose.yml");

execFileSync(
  "docker",
  ["compose", "-f", compose, "exec", "-T", "mqtt", "sh", "/src/config/reload.sh"],
  {
    stdio: "inherit",
  },
);
console.log("Broker rechargé : ACL des objets et liste de révocation relues.");
