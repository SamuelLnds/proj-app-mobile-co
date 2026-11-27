// Équivalence entre le pilotage du firmware (firmware/site-device, compilé sur le poste) et l'implémentation
// de référence du simulateur Node (src/device/control.ts) :
// - applyControl : une grille d'entrées (modes, parts, niveaux, productions, puissances maximales) ;
// - nextBatteryLevel et durée de charge de 20 % à 95 % ;
// - chaque ligne du tableau « statut renvoyé » (section 7 de docs/conception/02-uml.md), avec un ControlState
//   validé par le schéma de @solar/contracts ;
// - lecture des consignes : mêmes verdicts que SetpointSchema.
// Sans compilateur C++ (poste Windows nu), ces tests sont ignorés ; la CI en dispose.
import {
  ControlStateSchema,
  DEMO_SITE_BATTERY_CAPACITY_WH,
  SetpointSchema,
  type ControlMode,
  type ControlResult,
  type RejectionReason,
} from "@solar/contracts";
import { z } from "zod";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { applyControl, nextBatteryLevel } from "../src/device/control";
import { compileProgram, findCompiler, type CompiledProgram } from "./helpers/cpp";

const compiler = findCompiler();
const itWithCompiler = compiler ? it : it.skip;

/** Écart relatif toléré entre deux flottants : les deux côtés calculent en double avec les mêmes opérations. */
function close(actual: number, expected: number): boolean {
  return Math.abs(actual - expected) <= 1e-9 * Math.max(1, Math.abs(expected));
}

describe("applyControl du firmware et du simulateur", () => {
  let program: CompiledProgram | null = null;
  let grid: string[] = [];

  beforeAll(() => {
    if (!compiler) return;
    program = compileProgram(compiler, "test/control/dump_control.cpp");
    grid = program.run(["grid"]);
  });
  afterAll(() => program?.dispose());

  itWithCompiler(
    "donne les mêmes flux, part, statut et raison sur toute la grille d'entrées",
    () => {
      expect(grid.length).toBeGreaterThan(20000);
      const mismatches: string[] = [];
      for (const line of grid) {
        const [
          mode,
          share,
          production,
          level,
          pmax,
          batteryPower,
          gridPower,
          applied,
          status,
          reason,
        ] = line.split(" ") as [
          ControlMode,
          string,
          string,
          string,
          string,
          string,
          string,
          string,
          string,
          string,
        ];
        const expected = applyControl({
          mode,
          requestedShare: Number(share) === -1 ? null : Number(share),
          production: Number(production),
          level: Number(level),
          maxChargePowerW: Number(pmax),
        });
        const same =
          close(Number(batteryPower), expected.batteryPower) &&
          close(Number(gridPower), expected.gridPower) &&
          Number(applied) === (expected.appliedShare ?? -1) &&
          (status as ControlResult) === expected.status &&
          (reason === "none" ? null : (reason as RejectionReason)) === expected.reason;
        if (!same) mismatches.push(`${line}  !=  ${JSON.stringify(expected)}`);
      }
      expect(mismatches.slice(0, 5)).toEqual([]);
    },
  );

  itWithCompiler("couvre chaque ligne du tableau « statut renvoyé » de la grille", () => {
    const seen = new Set(
      grid.map((line) => {
        const parts = line.split(" ");
        return `${parts[0]}|${parts[8]}|${parts[9]}|${parts[7] === "-1" ? "null" : "share"}`;
      }),
    );
    for (const row of [
      "manual|rejected|invalid_setpoint|null",
      "manual|applied|none|share",
      "automatic|applied|none|share",
      "manual|partial|charge_limit|share",
      "manual|rejected|battery_full|share",
      "discharge|rejected|battery_low|null",
      "discharge|applied|none|null",
    ]) {
      expect(seen, row).toContain(row);
    }
  });
});

describe("nextBatteryLevel du firmware et du simulateur", () => {
  let program: CompiledProgram | null = null;
  let lines: string[] = [];

  beforeAll(() => {
    if (!compiler) return;
    program = compileProgram(compiler, "test/control/dump_control.cpp");
    lines = program.run(["battery"]);
  });
  afterAll(() => program?.dispose());

  itWithCompiler("donne le même niveau, borné à 0-100, pour toute la grille", () => {
    expect(lines.length).toBeGreaterThan(100);
    for (const line of lines) {
      const [level, power, seconds, capacity, next] = line.split(" ").map(Number) as [
        number,
        number,
        number,
        number,
        number,
      ];
      expect(capacity).toBe(DEMO_SITE_BATTERY_CAPACITY_WH);
      expect(close(next, nextBatteryLevel(level, power, seconds, capacity)), line).toBe(true);
      expect(next).toBeGreaterThanOrEqual(0);
      expect(next).toBeLessThanOrEqual(100);
    }
  });
});

/** Valeurs d'un programme de scénarios : « row », « state » (JSON ControlState) et « note ». */
function parseScenarios(lines: string[]) {
  const states = new Map<string, unknown>();
  const notes = new Map<string, number[]>();
  for (const line of lines) {
    const [kind, label, ...rest] = line.split(" ") as [string, string, ...string[]];
    if (kind === "note") notes.set(label, rest.map(Number));
    else states.set(`${kind}:${label}`, JSON.parse(rest.join(" ")));
  }
  return { states, notes };
}

describe("pilotage du firmware : tableau « statut renvoyé » et dynamique", () => {
  let program: CompiledProgram | null = null;
  let states = new Map<string, unknown>();
  let notes = new Map<string, number[]>();

  beforeAll(() => {
    if (!compiler) return;
    program = compileProgram(compiler, "test/control/dump_control.cpp");
    ({ states, notes } = parseScenarios(program.run(["scenarios"])));
  });
  afterAll(() => program?.dispose());

  const SETPOINT_ID = "0b8f3c1e-5d1a-4a53-9a0e-2f4b7c9d1e22";

  // Une entrée par ligne du tableau de la section 7.
  const rows: [string, object][] = [
    [
      "invalid-setpoint",
      { status: "rejected", appliedBatteryShare: null, reason: "invalid_setpoint" },
    ],
    [
      "applied-manual",
      { mode: "manual", status: "applied", appliedBatteryShare: 50, reason: null },
    ],
    [
      "applied-automatic",
      { mode: "automatic", status: "applied", appliedBatteryShare: 100, reason: null },
    ],
    [
      "partial-charge-limit",
      { mode: "manual", status: "partial", appliedBatteryShare: 75, reason: "charge_limit" },
    ],
    [
      "rejected-battery-full",
      { mode: "manual", status: "rejected", appliedBatteryShare: 0, reason: "battery_full" },
    ],
    [
      "rejected-battery-low",
      { mode: "discharge", status: "rejected", appliedBatteryShare: null, reason: "battery_low" },
    ],
    [
      "applied-discharge",
      { mode: "discharge", status: "applied", appliedBatteryShare: null, reason: null },
    ],
    // Production nulle (nuit) : la part demandée est considérée comme appliquée.
    [
      "applied-night",
      { mode: "manual", status: "applied", appliedBatteryShare: 100, reason: null },
    ],
  ];

  for (const [label, expected] of rows) {
    itWithCompiler(`ligne « ${label} » : ControlState conforme au schéma`, () => {
      const state = states.get(`row:${label}`);
      const parsed = ControlStateSchema.safeParse(state);
      expect(parsed.success, JSON.stringify(state)).toBe(true);
      expect(state).toMatchObject({ v: 1, setpointId: SETPOINT_ID, ...expected });
    });
  }

  itWithCompiler("au démarrage : état initial sans consigne, publié une seule fois", () => {
    const boot = ControlStateSchema.parse(states.get("state:boot"));
    expect(boot).toMatchObject({ setpointId: null, mode: "automatic", status: "applied" });
    expect(notes.get("boot-pending")).toEqual([1]);
    expect(notes.get("boot-after-publish")).toEqual([0]);
  });

  itWithCompiler(
    "20 % -> 95 % avec 3 000 W : 2 à 3 minutes réelles, puis refus battery_full",
    () => {
      const [ticks] = notes.get("charge-ticks")!;
      expect(ticks).toBeGreaterThanOrEqual(120);
      expect(ticks).toBeLessThanOrEqual(180);
      // Même durée que la boucle de référence du simulateur
      let level = 20;
      let seconds = 0;
      while (level < 95) {
        level = nextBatteryLevel(level, 3000, 1, DEMO_SITE_BATTERY_CAPACITY_WH);
        seconds += 1;
      }
      expect(ticks).toBe(seconds);
      expect(ControlStateSchema.parse(states.get("state:charge-end"))).toMatchObject({
        status: "rejected",
        reason: "battery_full",
        appliedBatteryShare: 0,
      });
    },
  );

  itWithCompiler(
    "en automatique, l'arrêt de la charge à 80 % publie un nouvel état (part 100 -> 0)",
    () => {
      expect(ControlStateSchema.parse(states.get("state:automatic-target"))).toMatchObject({
        mode: "automatic",
        status: "applied",
        appliedBatteryShare: 0,
      });
      expect(notes.get("automatic-ticks")![0]).toBeGreaterThan(0);
    },
  );

  itWithCompiler("rien n'est publié tant que part, statut et raison ne changent pas", () => {
    expect(notes.get("steady-pending")).toEqual([0]);
  });

  itWithCompiler("la consigne retained renvoyée à la reconnexion ne republie rien", () => {
    // première réception : nouvelle ; renvoi : identique, rien en attente ; autre identifiant : nouvelle
    expect(notes.get("redelivery")).toEqual([1, 0, 0]);
    expect(notes.get("redelivery-new-id")).toEqual([1]);
  });

  itWithCompiler(
    "une consigne invalide est refusée une fois ; la consigne en vigueur continue",
    () => {
      expect(ControlStateSchema.parse(states.get("state:rejection"))).toMatchObject({
        setpointId: "7c1d2e3f-4a5b-4c6d-8e7f-9a0b1c2d3e4f",
        status: "rejected",
        appliedBatteryShare: null,
        reason: "invalid_setpoint",
      });
      expect(notes.get("rejection-twice")).toEqual([1, 0]);
      expect(notes.get("rejection-in-force-share")).toEqual([70]);
      // L'état de la consigne en vigueur est republié ensuite, pour que le retained reflète l'objet.
      expect(notes.get("rejection-republish")).toEqual([1]);
      expect(ControlStateSchema.parse(states.get("state:after-rejection"))).toMatchObject({
        setpointId: SETPOINT_ID,
        status: "applied",
        appliedBatteryShare: 70,
      });
    },
  );
});

describe("lecture des consignes par le firmware et par SetpointSchema", () => {
  const id = "0b8f3c1e-5d1a-4a53-9a0e-2f4b7c9d1e22";
  const issuedAt = "2026-11-20T10:16:00Z";
  const valid = (overrides: Record<string, unknown> = {}) =>
    JSON.stringify({ v: 1, id, mode: "manual", batteryShare: 70, issuedAt, ...overrides });

  /** Verdict attendu, déduit du schéma Zod : valid, invalid (identifiant lisible) ou unreadable. */
  function reference(line: string): string {
    let json: unknown;
    try {
      json = JSON.parse(line);
    } catch {
      return "unreadable";
    }
    const parsed = SetpointSchema.safeParse(json);
    if (parsed.success) {
      return `valid ${parsed.data.id} ${parsed.data.mode} ${parsed.data.batteryShare ?? -1}`;
    }
    const readableId =
      typeof json === "object" && json !== null && !Array.isArray(json)
        ? (json as Record<string, unknown>).id
        : undefined;
    if (typeof readableId === "string" && z.uuid().safeParse(readableId).success) {
      return `invalid ${readableId}`;
    }
    return "unreadable";
  }

  const handWritten: string[] = [
    // valides
    ...[0, 10, 20, 30, 40, 50, 60, 70, 80, 90, 100].map((batteryShare) => valid({ batteryShare })),
    valid({ mode: "automatic", batteryShare: null }),
    valid({ mode: "discharge", batteryShare: null }),
    valid({ batteryShare: 70.0 }),
    valid({ issuedAt: "2026-11-20T10:16:00.123Z" }),
    valid({ issuedAt: "2024-02-29T23:59:59Z" }),
    valid({ id: id.toUpperCase() }),
    valid({ extra: { nested: [1, 2, { a: "}" }], text: 'a"b\\c' } }),
    `  {"v":1 , "id":"${id}","mode":"manual",\t"batteryShare":70,"issuedAt":"${issuedAt}"}  `,
    `{"v":1,"id":"${id}","mode":"manual","batteryShare":7e1,"issuedAt":"${issuedAt}"}`,
    `{"v":1,"id":"${id}","mode":"man\\u0075al","batteryShare":70,"issuedAt":"${issuedAt}"}`,
    `{"v":1,"id":"${id}","mode":"manual","batteryShare":10,"batteryShare":70,"issuedAt":"${issuedAt}"}`,
    // invalides mais lisibles (l'objet répond rejected / invalid_setpoint)
    valid({ batteryShare: 15 }),
    valid({ batteryShare: 110 }),
    valid({ batteryShare: -10 }),
    valid({ batteryShare: 12.5 }),
    valid({ batteryShare: "70" }),
    valid({ batteryShare: null }),
    valid({ batteryShare: true }),
    valid({ mode: "automatic", batteryShare: 50 }),
    valid({ mode: "discharge", batteryShare: 0 }),
    valid({ mode: "boost" }),
    valid({ mode: 3 }),
    valid({ mode: null }),
    valid({ v: 2 }),
    valid({ v: "1" }),
    valid({ v: 1.5 }),
    valid({ issuedAt: "hier" }),
    valid({ issuedAt: "2026-02-30T10:16:00Z" }),
    valid({ issuedAt: "2026-11-20T10:16:00+01:00" }),
    valid({ issuedAt: "2026-11-20T25:16:00Z" }),
    valid({ issuedAt: 1763633705 }),
    JSON.stringify({ v: 1, id, mode: "manual", issuedAt }),
    JSON.stringify({ id, mode: "manual", batteryShare: 70, issuedAt }),
    JSON.stringify({ v: 1, id, batteryShare: 70, issuedAt }),
    JSON.stringify({ v: 1, id, mode: "manual", batteryShare: 70 }),
    // illisibles (ignorés et journalisés)
    valid({ id: "pas-un-uuid" }),
    valid({ id: "0b8f3c1e-5d1a-0a53-9a0e-2f4b7c9d1e22" }),
    valid({ id: 42 }),
    valid({ id: null }),
    JSON.stringify({ v: 1, mode: "manual", batteryShare: 70, issuedAt }),
    "",
    "   ",
    "{",
    "}",
    "{}",
    "[]",
    "null",
    "42",
    '"texte"',
    "{'v':1}",
    valid().slice(0, -1),
    valid().slice(0, 40),
    `${valid()} x`,
    `${valid()}{}`,
    valid().replace('"id"', "id"),
    valid().replace(",", ",,"),
    valid().replace(":70", ":070"),
    valid().replace(":70", ":+70"),
    valid().replace(":70", ":7 0"),
    valid().replace('"manual"', '"man\\ual"'),
  ];

  /** Mutations déterministes de consignes valides : suppression, remplacement et insertion de caractères. */
  function mutations(count: number): string[] {
    let seed = 12345;
    const next = (bound: number) => {
      seed = (seed * 1103515245 + 12345) % 2147483648;
      return seed % bound;
    };
    const alphabet = '{}[]:,"\\ 0123456789.-+eEtfnul/abcxyz';
    const bases = [
      valid(),
      valid({ mode: "automatic", batteryShare: null }),
      valid({ mode: "discharge", batteryShare: null }),
    ];
    const result: string[] = [];
    for (let i = 0; i < count; i += 1) {
      let text = bases[next(bases.length)]!;
      for (let step = 1 + next(3); step > 0; step -= 1) {
        const position = next(text.length);
        const char = alphabet[next(alphabet.length)]!;
        const kind = next(3);
        if (kind === 0) text = text.slice(0, position) + text.slice(position + 1);
        else if (kind === 1) text = text.slice(0, position) + char + text.slice(position + 1);
        else text = text.slice(0, position) + char + text.slice(position);
      }
      result.push(text);
    }
    return result;
  }

  let program: CompiledProgram | null = null;
  beforeAll(() => {
    if (compiler) program = compileProgram(compiler, "test/control/parse_setpoint.cpp");
  });
  afterAll(() => program?.dispose());

  itWithCompiler(
    "donne le même verdict que SetpointSchema sur des consignes écrites à la main",
    () => {
      const actual = program!.run([], handWritten.join("\n") + "\n");
      const expected = handWritten.map(reference);
      expect(actual).toEqual(expected);
      // Les trois verdicts sont représentés
      expect(expected.some((line) => line.startsWith("valid"))).toBe(true);
      expect(expected.some((line) => line.startsWith("invalid"))).toBe(true);
      expect(expected).toContain("unreadable");
    },
  );

  itWithCompiler("donne le même verdict que SetpointSchema sur 3 000 consignes altérées", () => {
    const lines = mutations(3000).filter((line) => line.trim().length > 0);
    const actual = program!.run([], lines.join("\n") + "\n");
    const expected = lines.map(reference);
    const different = lines
      .map((line, index) => ({ line, actual: actual[index], expected: expected[index] }))
      .filter((entry) => entry.actual !== entry.expected);
    expect(different.slice(0, 5)).toEqual([]);
    expect(actual.length).toBe(lines.length);
  });
});
