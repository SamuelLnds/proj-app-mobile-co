// Fichiers du broker écrits par l'API (D027, D035) : ACL des objets et liste de révocation,
// regénérées à partir de la base, puis rechargement du broker.
import { execFile } from "node:child_process";
import { rename, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { promisify } from "node:util";
import { setpointTopic, siteMeasurementsTopic, stateTopic, statusTopic } from "@solar/contracts";

const run = promisify(execFile);
/** Délai maximal du rechargement (la commande passe par Docker en développement). */
const RELOAD_TIMEOUT_MS = 20_000;

/** Objet dont le certificat est actif : il reçoit les droits de son site. */
export interface ActiveDevice {
  deviceName: string;
  siteCode: string;
}

export interface BrokerAccess {
  /** Écrit l'ACL des objets et la liste de révocation, puis fait recharger le broker. */
  apply: (devices: ActiveDevice[], crlPem: string) => Promise<void>;
}

/**
 * Droits d'un objet (section 6.3 de la cartographie) : publier ses mesures, son statut et son
 * état appliqué, lire ses consignes. Sans entrée, un objet n'a aucun droit.
 */
export function deviceAcl(devices: ActiveDevice[]): string {
  const header =
    "# Droits des objets sur l'écoute 8883, écrits par l'API (D027) : ne pas modifier à la main.\n" +
    "# Sans entrée, un objet n'a aucun droit.\n";
  const entries = [...devices]
    .sort((a, b) => a.deviceName.localeCompare(b.deviceName))
    .map(({ deviceName, siteCode }) =>
      [
        `user ${deviceName}`,
        `topic write ${siteMeasurementsTopic(siteCode)}`,
        `topic write ${statusTopic(siteCode)}`,
        `topic write ${stateTopic(siteCode)}`,
        `topic read ${setpointTopic(siteCode)}`,
      ].join("\n"),
    );
  return [header, ...entries].join("\n") + (entries.length > 0 ? "\n" : "");
}

/** Écriture atomique : le broker ne lit jamais un fichier à moitié écrit. */
async function writeAtomically(path: string, content: string) {
  const temporary = `${path}.tmp`;
  await writeFile(temporary, content);
  await rename(temporary, path);
}

/**
 * Accès réel : fichiers dans `BROKER_DEVICES_DIR`, rechargement par `BROKER_RELOAD_COMMAND`
 * (arguments séparés par des espaces, sans guillemets).
 */
export function createBrokerAccess(devicesDir: string, reloadCommand: string): BrokerAccess {
  const [command, ...args] = reloadCommand.split(/\s+/).filter(Boolean);
  return {
    async apply(devices, crlPem) {
      await writeAtomically(join(devicesDir, "acl"), deviceAcl(devices));
      await writeAtomically(join(devicesDir, "crl.pem"), crlPem);
      if (!command) throw new Error("BROKER_RELOAD_COMMAND est vide");
      await run(command, args, { timeout: RELOAD_TIMEOUT_MS });
    },
  };
}
