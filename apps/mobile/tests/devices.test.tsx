import type { Enrollment, EnrollmentPage, User } from "@solar/contracts";
import { fireEvent, render, screen, waitFor, within } from "@testing-library/react-native";
import type { ReactNode } from "react";
import { SafeAreaProvider } from "react-native-safe-area-context";

import DevicesScreen from "../app/devices";
import { QueryProvider } from "../src/api";
import { AuthProvider } from "../src/auth/AuthProvider";
import { saveSession } from "../src/auth/session";
import { dataSource, DataSourceError, MockDataSource } from "../src/data";
import { ThemeProvider } from "../src/theme";
import { MOCK_PASSWORD } from "../src/data/mock/fixtures";
import { fingerprintLines, speakFingerprint } from "../src/utils/format";

jest.mock("expo-router", () => ({
  useRouter: () => ({
    push: jest.fn(),
    back: jest.fn(),
    replace: jest.fn(),
    canGoBack: () => true,
  }),
}));

const id = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, "0")}`;
const OPERATOR: User = {
  id: id(10),
  email: "operator@demo.local",
  name: "Exploitant",
  role: "operator",
};
const VIEWER: User = { id: id(11), email: "viewer@demo.local", name: "Lecteur", role: "viewer" };
const FINGERPRINT = "3fa94c0e7b21d85a6e0f4c93b7d2a1e58c6b0f37d49e2a1c85b7f6e03d9a4c21";

function enrollment(n: number, overrides: Partial<Enrollment> = {}): Enrollment {
  return {
    id: id(100 + n),
    deviceName: "device-site01",
    fingerprint: FINGERPRINT,
    status: "pending",
    requestedAt: "2026-11-27T10:00:00.000Z",
    pendingExpiresAt: "2026-11-27T10:30:00.000Z",
    decidedAt: null,
    decidedBy: null,
    serialNumber: null,
    certificateExpiresAt: null,
    revokedAt: null,
    ...overrides,
  };
}

const ACTIVE = enrollment(2, {
  fingerprint: "a81c5e0d94b7f2c6e3a05d8b1f47c92e6d0a3b5f8c1e74d29a6b0e5c3f817d4b",
  status: "active",
  decidedAt: "2026-11-27T07:04:00.000Z",
  decidedBy: { id: OPERATOR.id, name: OPERATOR.name },
  serialNumber: "0123456789abcdef0123456789abcdef",
  certificateExpiresAt: "2026-11-27T15:04:00.000Z",
});

const providers = (children: ReactNode) => (
  <SafeAreaProvider
    initialMetrics={{
      frame: { x: 0, y: 0, width: 390, height: 844 },
      insets: { top: 0, left: 0, right: 0, bottom: 0 },
    }}
  >
    <QueryProvider>
      <AuthProvider>
        <ThemeProvider>{children}</ThemeProvider>
      </AuthProvider>
    </QueryProvider>
  </SafeAreaProvider>
);

async function renderAs(user: User) {
  await saveSession({ token: "t", expiresAt: "2099-01-01T00:00:00.000Z", user });
  await render(providers(<DevicesScreen />));
}

afterEach(() => jest.restoreAllMocks());

describe("empreinte de la clé", () => {
  it("s'affiche en entier, en 4 lignes de 4 groupes de 4 caractères", () => {
    const lines = fingerprintLines(FINGERPRINT);
    expect(lines).toHaveLength(4);
    expect(lines[0]).toBe("3fa9 4c0e 7b21 d85a");
    expect(lines.join(" ").replace(/ /g, "")).toBe(FINGERPRINT);
  });

  it("est épelée caractère par caractère, avec une pause entre les groupes", () => {
    expect(speakFingerprint("3fa94c0e")).toBe("3 f a 9, 4 c 0 e");
  });
});

describe("source d'exemple (mock)", () => {
  async function loggedIn(user: User) {
    const source = new MockDataSource("normal", Date.now, 0);
    await source.login({ email: user.email, password: MOCK_PASSWORD });
    return source;
  }

  it("présente une demande en attente et un objet actif, réservés à l'exploitant", async () => {
    const source = await loggedIn(OPERATOR);
    const page = await source.listEnrollments();
    expect(page.items.map((e) => e.status)).toEqual(["pending", "active"]);
    const viewer = await loggedIn(VIEWER);
    await expect(viewer.listEnrollments()).rejects.toMatchObject({ code: "FORBIDDEN" });
  });

  it("accepter révoque le certificat précédent ; révoquer une demande en attente est refusé", async () => {
    const source = await loggedIn(OPERATOR);
    const [pending, active] = (await source.listEnrollments()).items;
    await expect(source.revokeEnrollment(pending!.id)).rejects.toMatchObject({
      code: "INVALID_ENROLLMENT_STATE",
    });
    const accepted = await source.acceptEnrollment(pending!.id, { ttlHours: 24 });
    expect(accepted.status).toBe("active");
    const after = (await source.listEnrollments()).items;
    expect(after.find((e) => e.id === active!.id)!.status).toBe("revoked");
    await expect(source.rejectEnrollment(pending!.id)).rejects.toMatchObject({
      code: "INVALID_ENROLLMENT_STATE",
    });
  });
});

describe("écran Objets", () => {
  function serve(items: Enrollment[]) {
    jest
      .spyOn(dataSource, "listEnrollments")
      .mockImplementation(async () => ({ items, next: null }) satisfies EnrollmentPage);
  }

  it("affiche la demande en attente avec son empreinte complète, lisible à voix haute", async () => {
    serve([enrollment(1), ACTIVE]);
    await renderAs(OPERATOR);
    expect(await screen.findByText("Demandes en attente")).toBeTruthy();
    expect(
      screen.getAllByLabelText(`Empreinte de la clé : ${speakFingerprint(FINGERPRINT)}`),
    ).toHaveLength(1);
    for (const line of fingerprintLines(FINGERPRINT)) expect(screen.getByText(line)).toBeTruthy();
    expect(screen.getByText(/Comparez-la caractère par caractère/)).toBeTruthy();
    expect(screen.getByText("Objets actifs")).toBeTruthy();
    expect(screen.getByText(/Valable jusqu'au/)).toBeTruthy();
  });

  it("l'acceptation rappelle de comparer l'empreinte et envoie la durée choisie", async () => {
    serve([enrollment(1)]);
    const accept = jest
      .spyOn(dataSource, "acceptEnrollment")
      .mockResolvedValue(enrollment(1, { status: "active" }));
    await renderAs(OPERATOR);
    await fireEvent.press(await screen.findByRole("button", { name: "Accepter" }));
    expect(
      await screen.findByText(/Acceptez seulement si cette empreinte est identique/),
    ).toBeTruthy();
    // L'empreinte est répétée dans la confirmation.
    expect(
      screen.getAllByLabelText(`Empreinte de la clé : ${speakFingerprint(FINGERPRINT)}`),
    ).toHaveLength(2);
    await fireEvent.press(screen.getByRole("radio", { name: "24 h" }));
    const buttons = screen.getAllByRole("button", { name: "Accepter" });
    await fireEvent.press(buttons[buttons.length - 1]!);
    await waitFor(() => expect(accept).toHaveBeenCalledWith(id(101), { ttlHours: 24 }));
  });

  it("la révocation demande une confirmation explicite avant d'être envoyée", async () => {
    serve([ACTIVE]);
    const revoke = jest
      .spyOn(dataSource, "revokeEnrollment")
      .mockResolvedValue({ ...ACTIVE, status: "revoked" });
    await renderAs(OPERATOR);
    await fireEvent.press(await screen.findByRole("button", { name: "Révoquer" }));
    expect(revoke).not.toHaveBeenCalled();
    expect(
      await screen.findByText(/ne pourra plus se reconnecter avec ce certificat/),
    ).toBeTruthy();
    const buttons = screen.getAllByRole("button", { name: "Révoquer" });
    await fireEvent.press(buttons[buttons.length - 1]!);
    await waitFor(() => expect(revoke).toHaveBeenCalledWith(ACTIVE.id));
  });

  it("signale une décision enregistrée dont le rechargement du broker a échoué", async () => {
    serve([enrollment(1)]);
    jest
      .spyOn(dataSource, "rejectEnrollment")
      .mockRejectedValue(
        new DataSourceError(
          "BROKER_UNAVAILABLE",
          "Décision enregistrée, mais le broker n'a pas pu être rechargé.",
        ),
      );
    await renderAs(OPERATOR);
    await fireEvent.press(await screen.findByRole("button", { name: "Refuser" }));
    const banner = await screen.findByText("Décision enregistrée");
    expect(banner).toBeTruthy();
  });

  it("un lecteur ne voit aucune action ni aucune demande", async () => {
    const list = jest.spyOn(dataSource, "listEnrollments");
    await renderAs(VIEWER);
    expect(await screen.findByText("Réservé aux exploitants")).toBeTruthy();
    expect(screen.queryByRole("button", { name: "Accepter" })).toBeNull();
    expect(screen.queryByRole("button", { name: "Refuser" })).toBeNull();
    expect(screen.queryByRole("button", { name: "Révoquer" })).toBeNull();
    expect(list).not.toHaveBeenCalled();
  });

  it("indique l'absence de demande et d'objet actif", async () => {
    serve([]);
    await renderAs(OPERATOR);
    expect(await screen.findByText(/Aucune demande en attente/)).toBeTruthy();
    const section = screen.getByText(/Aucun objet n'a de certificat actif/);
    expect(within(section).queryByRole("button")).toBeNull();
  });
});
