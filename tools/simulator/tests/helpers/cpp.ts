// Compilation des programmes de poste du firmware (firmware/site-device/test) par les tests.
import { spawnSync } from "node:child_process";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";

export const firmwareDir = resolve(__dirname, "../../../../firmware/site-device");

export type Compiler = { command: string; baseArgs: string[] };

/** Premier compilateur C++ disponible (variable CXX, sinon c++, g++, clang++), ou null. */
export function findCompiler(): Compiler | null {
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

export type CompiledProgram = {
  /** Exécute le programme avec ses arguments et son entrée standard ; renvoie les lignes de sortie. */
  run: (args?: string[], input?: string) => string[];
  /** Supprime le dossier de travail. */
  dispose: () => void;
};

/** Compile un programme de `firmware/site-device/test` (chemin relatif à ce dossier) avec `include/`. */
export function compileProgram(compiler: Compiler, source: string): CompiledProgram {
  const workDir = mkdtempSync(join(tmpdir(), "firmware-test-"));
  const binary = join(workDir, process.platform === "win32" ? "program.exe" : "program");
  const build = spawnSync(
    compiler.command,
    [
      ...compiler.baseArgs,
      "-std=c++17",
      "-Wall",
      "-Wextra",
      `-I${join(firmwareDir, "include")}`,
      join(firmwareDir, source),
      "-o",
      binary,
    ],
    { encoding: "utf8" },
  );
  if (build.status !== 0) {
    rmSync(workDir, { recursive: true, force: true });
    throw new Error(`Compilation impossible :\n${build.stderr}`);
  }
  return {
    run(args = [], input) {
      const run = spawnSync(binary, args, {
        encoding: "utf8",
        input,
        maxBuffer: 256 * 1024 * 1024,
      });
      if (run.status !== 0) throw new Error(`Échec du programme de test :\n${run.stderr}`);
      return run.stdout.split(/\r?\n/).filter((line) => line.length > 0);
    },
    dispose() {
      rmSync(workDir, { recursive: true, force: true });
    },
  };
}
