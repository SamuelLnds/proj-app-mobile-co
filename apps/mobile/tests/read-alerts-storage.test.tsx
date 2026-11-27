import { act, renderHook, waitFor } from "@testing-library/react-native";
import type { ReactNode } from "react";

import { QueryProvider } from "../src/api";
import { AuthProvider, useAuth } from "../src/auth/AuthProvider";
import { saveSession } from "../src/auth/session";
import {
  clearLocalData,
  clearReadAlerts,
  createMemoryReadAlertStore,
  createMemoryStore,
  createSqliteReadAlertStore,
  loadReadAlerts,
  readResponse,
  removeReadAlerts,
  saveReadAlerts,
  saveResponse,
  setReadAlertStore,
  setResponseStore,
  type LocalDatabase,
} from "../src/storage";

describe("stockage des alertes lues (D034)", () => {
  it("enregistre puis relit les alertes lues", async () => {
    expect(await loadReadAlerts()).toEqual([]);
    await saveReadAlerts(["a1", "a2"]);
    await saveReadAlerts(["a3"]);
    expect((await loadReadAlerts()).sort()).toEqual(["a1", "a2", "a3"]);
  });

  it("garde la date de lecture d'origine quand une alerte est enregistrée deux fois", async () => {
    const store = createMemoryReadAlertStore();
    setReadAlertStore(store);
    await saveReadAlerts(["a1"]);
    const first = store.rows.get("a1");
    await new Promise((resolve) => setTimeout(resolve, 5));
    await saveReadAlerts(["a1"]);
    expect(store.rows.get("a1")).toBe(first);
    expect(store.rows.size).toBe(1);
  });

  it("purge : retire seulement les alertes demandées", async () => {
    await saveReadAlerts(["a1", "a2", "a3"]);
    await removeReadAlerts(["a1", "a3", "inconnue"]);
    expect(await loadReadAlerts()).toEqual(["a2"]);
  });

  it("efface toutes les alertes lues", async () => {
    await saveReadAlerts(["a1", "a2"]);
    await clearReadAlerts();
    expect(await loadReadAlerts()).toEqual([]);
  });

  it("une erreur de stockage n'empêche rien : lecture vide, écritures sans effet", async () => {
    const warn = jest.spyOn(console, "warn").mockImplementation(() => undefined);
    const failing = async () => {
      throw new Error("SQLite indisponible");
    };
    setReadAlertStore({ readAll: failing, add: failing, remove: failing, clear: failing });
    expect(await loadReadAlerts()).toEqual([]);
    await expect(saveReadAlerts(["a1"])).resolves.toBeUndefined();
    await expect(removeReadAlerts(["a1"])).resolves.toBeUndefined();
    await expect(clearReadAlerts()).resolves.toBeUndefined();
    expect(warn).toHaveBeenCalledTimes(4);
    warn.mockRestore();
  });

  it("efface les alertes lues avec les réponses locales", async () => {
    await saveReadAlerts(["a1"]);
    await saveResponse("cle", { valeur: 1 });
    await clearLocalData();
    expect(await loadReadAlerts()).toEqual([]);
    expect(await readResponse("cle")).toBeNull();
  });
});

describe("requêtes SQLite de la table read_alerts", () => {
  function fakeDatabase() {
    const runs: { sql: string; params: unknown[] }[] = [];
    const db = {
      runAsync: jest.fn(async (sql: string, params: unknown[]) => {
        runs.push({ sql, params });
        return { changes: 0, lastInsertRowId: 0 };
      }),
      getAllAsync: jest.fn(async () => [{ alert_id: "a1" }, { alert_id: "a2" }]),
    };
    return { db, runs, open: async () => db as unknown as LocalDatabase };
  }

  it("lit les identifiants de la table", async () => {
    const { open } = fakeDatabase();
    expect(await createSqliteReadAlertStore(open).readAll()).toEqual(["a1", "a2"]);
  });

  it("ajoute sans écraser la date d'une alerte déjà lue", async () => {
    const { open, runs } = fakeDatabase();
    await createSqliteReadAlertStore(open).add(["a1", "a2"], "2026-11-26T10:00:00.000Z");
    expect(runs).toHaveLength(1);
    expect(runs[0]!.sql).toContain("INSERT OR IGNORE INTO read_alerts");
    expect(runs[0]!.params).toEqual([
      "a1",
      "2026-11-26T10:00:00.000Z",
      "a2",
      "2026-11-26T10:00:00.000Z",
    ]);
  });

  it("découpe les grandes listes pour rester sous la limite de paramètres", async () => {
    const { open, runs } = fakeDatabase();
    const ids = Array.from({ length: 250 }, (_, i) => `a${i}`);
    const store = createSqliteReadAlertStore(open);
    await store.add(ids, "2026-11-26T10:00:00.000Z");
    await store.remove(ids);
    expect(runs).toHaveLength(6);
    expect(Math.max(...runs.map((r) => r.params.length))).toBeLessThanOrEqual(200);
    expect(runs[3]!.sql).toContain("DELETE FROM read_alerts WHERE alert_id IN");
  });

  it("efface la table", async () => {
    const { open, runs } = fakeDatabase();
    await createSqliteReadAlertStore(open).clear();
    expect(runs[0]!.sql).toBe("DELETE FROM read_alerts");
  });
});

describe("déconnexion", () => {
  const wrapper = ({ children }: { children: ReactNode }) => (
    <QueryProvider>
      <AuthProvider>{children}</AuthProvider>
    </QueryProvider>
  );

  it("efface la table des alertes lues avec le reste des données locales", async () => {
    const reads = createMemoryReadAlertStore();
    const responses = createMemoryStore();
    setReadAlertStore(reads);
    setResponseStore(responses);
    await saveSession({
      token: "t",
      expiresAt: "2099-01-01T00:00:00.000Z",
      user: {
        id: "00000000-0000-4000-8000-000000000010",
        email: "operator@demo.local",
        name: "Exploitant",
        role: "operator",
      },
    });
    await saveReadAlerts(["a1", "a2"]);
    await saveResponse("cle", { valeur: 1 });

    const hook = await renderHook(() => useAuth(), { wrapper });
    await waitFor(() => expect(hook.result.current.user).not.toBeNull());
    await act(async () => hook.result.current.logout());

    await waitFor(() => expect(hook.result.current.user).toBeNull());
    await waitFor(() => expect(reads.rows.size).toBe(0));
    expect(responses.rows.size).toBe(0);
    await hook.unmount();
  });
});
