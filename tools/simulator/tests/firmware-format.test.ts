// Cohérence entre le firmware de l'objet (firmware/site-device) et les contrats du projet :
// - les messages produits par la logique du firmware (compilée sur le poste) respectent les schémas Zod ;
// - include/config.h reprend à l'identique les constantes partagées.
// Le simulateur joue l'objet du site : c'est lui qui porte la comparaison avec le firmware.
import { spawnSync } from "node:child_process";
import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import * as contracts from "@solar/contracts";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

const firmwareDir = resolve(__dirname, "../../../firmware/site-device");

/** Premier compilateur C++ disponible (variable CXX, sinon c++, g++, clang++), ou null. */
function findCompiler(): { command: string; baseArgs: string[] } | null {
  const candidates = [process.env.CXX, "c++", "g++", "clang++"].filter((value): value is string =>
    Boolean(value),
  );
  for (const candidate of candidates) {
    const [command, ...baseArgs] = candidate.split(/\s+/) as [string, ...string[]];
    if (spawnSync(command, [...baseArgs, "--version"], { stdio: "ignore" }).status === 0) {
      return { command, baseArgs };
    }
  }
  return null;
}

describe("config.h du firmware", () => {
  const source = readFileSync(join(firmwareDir, "include/config.h"), "utf8");
  const values = new Map<string, number>();
  for (const match of source.matchAll(/constexpr\s+(?:int|float)\s+(\w+)\s*=\s*([\d.]+)f?;/g)) {
    values.set(match[1]!, Number(match[2]));
  }
  const shared = [
    "MESSAGE_VERSION",
    "SITE_MEASUREMENT_PERIOD_S",
    "BATTERY_TIME_FACTOR",
    "BATTERY_FULL_PCT",
    "BATTERY_FULL_RESOLVED_PCT",
    "BATTERY_LOW_PCT",
    "BATTERY_LOW_RESOLVED_PCT",
    "AUTOMATIC_CHARGE_TARGET_PCT",
    "DEMO_SITE_PEAK_POWER_W",
    "DEMO_SITE_BATTERY_CAPACITY_WH",
    "DEMO_SITE_MAX_CHARGE_POWER_W",
    "DEMO_SITE_PRODUCTION_FACTOR",
  ] as const;

  it.each(shared)("%s est identique à celle de @solar/contracts", (name) => {
    const expected = (contracts as Record<string, unknown>)[name];
    expect(typeof expected).toBe("number");
    expect(values.get(name)).toBe(expected);
  });

  it("l'identifiant de l'objet et le code du site suivent la cartographie", () => {
    expect(source).toContain('SITE_CODE = "SITE01"');
    expect(source).toContain('MQTT_DEVICE_ID = "device-site01"');
  });
});

describe("messages produits par le firmware", () => {
  const compiler = findCompiler();
  let workDir = "";
  let lines: string[] = [];

  beforeAll(() => {
    if (!compiler) return;
    workDir = mkdtempSync(join(tmpdir(), "firmware-format-"));
    const { command, baseArgs } = compiler;
    const binary = join(workDir, process.platform === "win32" ? "dump.exe" : "dump");
    const build = spawnSync(
      command,
      [
        ...baseArgs,
        "-std=c++17",
        "-Wall",
        "-Wextra",
        `-I${join(firmwareDir, "include")}`,
        join(firmwareDir, "test/format/dump_messages.cpp"),
        "-o",
        binary,
      ],
      { encoding: "utf8" },
    );
    if (build.status !== 0) throw new Error(`Compilation impossible :\n${build.stderr}`);
    const run = spawnSync(binary, [], { encoding: "utf8" });
    if (run.status !== 0) throw new Error(`Échec du programme de test :\n${run.stderr}`);
    lines = run.stdout.split(/\r?\n/).filter((line) => line.length > 0);
  });

  afterAll(() => {
    if (workDir) rmSync(workDir, { recursive: true, force: true });
  });

  // Sans compilateur C++ (poste Windows nu), les tests de messages sont ignorés ; la CI en a un.
  const itWithCompiler = compiler ? it : it.skip;

  function parse(line: string) {
    const [kind, ldr, pot, fault, epoch, ...rest] = line.split(" ") as [
      string,
      string,
      string,
      string,
      string,
      ...string[],
    ];
    return {
      kind,
      ldr: Number(ldr),
      pot: Number(pot),
      fault: fault === "1",
      epoch: Number(epoch),
      json: rest.join(" "),
    };
  }

  itWithCompiler("chaque mesure respecte SiteMeasurementSchema", () => {
    const measurements = lines.map(parse).filter((entry) => entry.kind === "measurement");
    expect(measurements.length).toBeGreaterThanOrEqual(10);
    for (const entry of measurements) {
      const result = contracts.SiteMeasurementSchema.safeParse(JSON.parse(entry.json));
      expect(result.success, entry.json).toBe(true);
      // Pas de champ en plus ni en moins
      expect(Object.keys(JSON.parse(entry.json)).sort()).toEqual(
        Object.keys(contracts.SiteMeasurementSchema.shape).sort(),
      );
    }
  });

  itWithCompiler("l'horodatage est la date UTC de l'heure donnée", () => {
    for (const entry of lines.map(parse).filter((e) => e.kind === "measurement")) {
      const message = JSON.parse(entry.json) as { timestamp: string };
      expect(message.timestamp).toBe(
        new Date(entry.epoch * 1000).toISOString().replace(".000", ""),
      );
    }
  });

  itWithCompiler("la production suit le potentiomètre, divisée par 5 en cas de panne", () => {
    for (const entry of lines.map(parse).filter((e) => e.kind === "measurement")) {
      const message = JSON.parse(entry.json) as { production: number; simulatedFault: boolean };
      const expected =
        ((entry.pot / 4095) * contracts.DEMO_SITE_PEAK_POWER_W) / (entry.fault ? 5 : 1);
      expect(message.simulatedFault).toBe(entry.fault);
      expect(Math.abs(message.production - expected)).toBeLessThanOrEqual(0.05);
    }
  });

  itWithCompiler("l'ensoleillement baisse quand la tension de la photorésistance monte", () => {
    const irradiances = lines
      .map(parse)
      .filter((e) => e.kind === "measurement")
      .sort((a, b) => a.ldr - b.ldr)
      .map((e) => (JSON.parse(e.json) as { irradiance: number }).irradiance);
    for (let i = 1; i < irradiances.length; i++) {
      expect(irradiances[i]!).toBeLessThanOrEqual(irradiances[i - 1]!);
    }
  });

  itWithCompiler("le statut online porte la version, le Last Will est le message fixe", () => {
    const entries = lines.map(parse);
    const online = JSON.parse(entries.find((e) => e.kind === "status-online")!.json);
    const offline = JSON.parse(entries.find((e) => e.kind === "status-offline")!.json);
    expect(contracts.DeviceStatusSchema.parse(online)).toMatchObject({
      status: "online",
      firmwareVersion: expect.any(String),
    });
    expect(offline).toEqual(contracts.DEVICE_LAST_WILL);
    expect(contracts.DeviceStatusSchema.safeParse(offline).success).toBe(true);
  });

  itWithCompiler("une valeur hors bornes n'est pas publiée", () => {
    const rejected = lines.map(parse).find((e) => e.kind === "rejected-out-of-bounds");
    expect(rejected?.json).toBe("rejected");
  });
});
