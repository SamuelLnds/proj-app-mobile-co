import type { Alert } from "@solar/contracts";
import { render, waitFor } from "@testing-library/react-native";

import { QueryProvider } from "../src/api";
import {
  NOTIFIED_KEY,
  notifyNewAlerts,
  takeNewAlerts,
  useLocalAlertNotifications,
} from "../src/notifications/alert-notifications";
import { nativeModules } from "../src/notifications/local";
import { createMemoryStore, readResponse, setResponseStore } from "../src/storage";

const mockAlerts = jest.fn();
jest.mock("../src/data", () => ({
  dataSource: { kind: "api", listAlerts: (...args: unknown[]) => mockAlerts(...args) },
}));

const notifications = () => jest.requireMock("expo-notifications");
const shown = () =>
  notifications().scheduleNotificationAsync.mock.calls.map((c: unknown[]) => c[0]);

let counter = 0;
function alert(overrides: Partial<Alert> = {}): Alert {
  counter += 1;
  return {
    id: `00000000-0000-4000-8000-${String(counter).padStart(12, "0")}`,
    type: "device_offline",
    severity: "critical",
    message: "L'objet du site Parc de démo est hors ligne",
    status: "active",
    site: { id: "00000000-0000-4000-8000-0000000000aa", name: "Parc de démo" },
    panel: null,
    startedAt: "2026-11-26T10:00:00.000Z",
    endedAt: null,
    ...overrides,
  };
}

beforeEach(() => {
  notifications().scheduleNotificationAsync.mockClear();
  notifications().getPermissionsAsync.mockResolvedValue({ status: "granted" });
});

describe("notifications locales des alertes", () => {
  it("au premier chargement, les alertes déjà actives sont mémorisées sans notification", async () => {
    const a = alert();
    const b = alert({ severity: "warning" });
    await notifyNewAlerts([a, b]);
    expect(shown()).toHaveLength(0);
    expect((await readResponse<string[]>(NOTIFIED_KEY))?.value).toEqual([a.id, b.id]);
  });

  it("notifie une nouvelle alerte critical avec son texte et ses identifiants", async () => {
    await notifyNewAlerts([]);
    const panel = { id: "00000000-0000-4000-8000-0000000000bb", name: "Panneau P07" };
    const fresh = alert({ panel, type: "overheating", message: "Surchauffe de P07" });
    await notifyNewAlerts([fresh]);
    expect(shown()).toEqual([
      {
        content: {
          title: "Alerte critique",
          body: "Surchauffe de P07",
          data: { alertId: fresh.id, panelId: panel.id, type: "overheating" },
        },
        trigger: null,
      },
    ]);
  });

  it("une alerte warning s'intitule « Alerte » ; une alerte info ne notifie pas", async () => {
    await notifyNewAlerts([]);
    await notifyNewAlerts([alert({ severity: "warning" }), alert({ severity: "info" })]);
    expect(shown().map((n: { content: { title: string } }) => n.content.title)).toEqual(["Alerte"]);
  });

  it("ne notifie jamais deux fois la même alerte, même après un redémarrage de l'app", async () => {
    await notifyNewAlerts([]);
    const fresh = alert();
    await notifyNewAlerts([fresh]);
    await notifyNewAlerts([fresh]);
    expect(shown()).toHaveLength(1);
    // Redémarrage : seul le stockage local survit (même contenu, nouveau passage).
    const [again] = await takeNewAlerts([fresh]);
    expect(again).toBeUndefined();
  });

  it("deux séries d'alertes reçues en même temps ne se doublonnent pas", async () => {
    await notifyNewAlerts([]);
    const fresh = alert();
    await Promise.all([notifyNewAlerts([fresh]), notifyNewAlerts([fresh])]);
    expect(shown()).toHaveLength(1);
  });

  it("sans autorisation : rien n'est affiché mais les alertes sont mémorisées", async () => {
    await notifyNewAlerts([]);
    notifications().getPermissionsAsync.mockResolvedValue({ status: "denied" });
    const fresh = alert();
    await notifyNewAlerts([fresh]);
    expect(shown()).toHaveLength(0);
    expect((await readResponse<string[]>(NOTIFIED_KEY))?.value).toContain(fresh.id);
  });

  it("sans le module natif : désactivé en silence, sans erreur", async () => {
    await notifyNewAlerts([]);
    nativeModules.notifications = () => Promise.reject(new Error("module natif absent"));
    await expect(notifyNewAlerts([alert()])).resolves.toBeUndefined();
    expect(shown()).toHaveLength(0);
  });

  it("une erreur d'affichage n'empêche rien", async () => {
    await notifyNewAlerts([]);
    notifications().scheduleNotificationAsync.mockRejectedValueOnce(new Error("système"));
    await expect(notifyNewAlerts([alert()])).resolves.toBeUndefined();
  });

  it("une erreur de stockage ne casse pas non plus le traitement", async () => {
    setResponseStore({
      write: () => Promise.reject(new Error("disque plein")),
      read: () => Promise.reject(new Error("disque plein")),
      clear: async () => undefined,
    });
    await expect(notifyNewAlerts([alert()])).resolves.toBeUndefined();
    setResponseStore(createMemoryStore());
  });
});

describe("useLocalAlertNotifications", () => {
  function Probe({ enabled }: { enabled: boolean }) {
    useLocalAlertNotifications(enabled);
    return null;
  }
  const mount = (enabled: boolean) =>
    render(
      <QueryProvider>
        <Probe enabled={enabled} />
      </QueryProvider>,
    );

  beforeEach(() => {
    mockAlerts.mockReset();
  });

  it("mémorise les alertes du premier chargement, puis notifie celles qui arrivent", async () => {
    const existing = alert();
    mockAlerts.mockResolvedValue({ items: [existing], next: null });
    const view = await mount(true);
    await waitFor(async () =>
      expect((await readResponse<string[]>(NOTIFIED_KEY))?.value).toEqual([existing.id]),
    );
    expect(shown()).toHaveLength(0);

    // Alertes interrogées toutes les 5 s : la nouvelle alerte arrive avec le passage suivant.
    const fresh = alert({ severity: "warning", message: "Batterie faible" });
    mockAlerts.mockResolvedValue({ items: [existing, fresh], next: null });
    await notifyNewAlerts([existing, fresh]);
    expect(shown()).toHaveLength(1);
    expect(shown()[0].content.body).toBe("Batterie faible");
    await view.unmount();
  });

  it("n'interroge rien tant qu'il n'est pas activé", async () => {
    const view = await mount(false);
    await new Promise((resolve) => setTimeout(resolve, 20));
    expect(mockAlerts).not.toHaveBeenCalled();
    await view.unmount();
  });
});
