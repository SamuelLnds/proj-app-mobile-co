import { render, waitFor } from "@testing-library/react-native";

import { QueryProvider } from "../src/api";
import { NotificationEffects } from "../src/notifications/NotificationEffects";

const mockPush = jest.fn();
let mockSignedIn = true;
let mockSourceKind: "api" | "mock" = "api";

// Même objet à chaque rendu, comme le routeur réel.
const mockRouter = { push: mockPush };
jest.mock("expo-router", () => ({
  useRouter: () => mockRouter,
  useRootNavigationState: () => ({ key: "racine" }),
}));
jest.mock("../src/auth/AuthProvider", () => ({
  useAuth: () => ({ user: mockSignedIn ? { id: "u" } : null }),
}));
jest.mock("../src/data", () => ({
  dataSource: {
    get kind() {
      return mockSourceKind;
    },
  },
}));

const notifications = () => jest.requireMock("expo-notifications");

/** Réponse à un appui sur une notification, comme la fournit expo-notifications. */
const response = (identifier: string, data: Record<string, unknown>) => ({
  notification: { request: { identifier, content: { data } } },
});

/** Fonction que l'app a enregistrée pour être prévenue des appuis sur une notification. */
const tapListener = () =>
  notifications().addNotificationResponseReceivedListener.mock.calls.at(-1)?.[0] as (
    value: unknown,
  ) => void;

describe("NotificationEffects", () => {
  beforeEach(() => {
    mockPush.mockClear();
    mockSignedIn = true;
    mockSourceKind = "api";
    for (const name of [
      "setNotificationHandler",
      "addNotificationReceivedListener",
      "addNotificationResponseReceivedListener",
      "scheduleNotificationAsync",
    ]) {
      notifications()[name].mockClear();
    }
    notifications().getLastNotificationResponseAsync.mockResolvedValue(null);
  });

  const mount = () =>
    render(
      <QueryProvider>
        <NotificationEffects />
      </QueryProvider>,
    );

  it("un appui sur une notification de panneau ouvre le détail du panneau", async () => {
    await mount();
    await waitFor(() =>
      expect(notifications().addNotificationResponseReceivedListener).toHaveBeenCalled(),
    );
    tapListener()(response("n1", { panelId: "p-7", alertId: "a" }));
    expect(mockPush).toHaveBeenCalledWith("/panel/p-7");
  });

  it("un appui sur une notification du site ouvre l'écran Alertes, une seule fois", async () => {
    await mount();
    await waitFor(() =>
      expect(notifications().addNotificationResponseReceivedListener).toHaveBeenCalled(),
    );
    tapListener()(response("n2", { panelId: null }));
    tapListener()(response("n2", { panelId: null }));
    expect(mockPush).toHaveBeenCalledTimes(1);
    expect(mockPush).toHaveBeenCalledWith("/alerts");
  });

  it("l'app lancée par une notification ouvre l'écran correspondant", async () => {
    notifications().getLastNotificationResponseAsync.mockResolvedValue(
      response("n3", { panelId: "p-3" }),
    );
    await mount();
    await waitFor(() => expect(mockPush).toHaveBeenCalledWith("/panel/p-3"));
  });

  it("ne montre aucune notification quand l'app est au premier plan", async () => {
    await mount();
    await waitFor(() => expect(notifications().setNotificationHandler).toHaveBeenCalled());
    // Le gestionnaire ne s'applique qu'au premier plan, quel que soit le push reçu (D033).
    const { handleNotification } = notifications().setNotificationHandler.mock.calls[0][0];
    const push = { request: { trigger: { type: "push" }, content: { data: { alertId: "a" } } } };
    expect(await handleNotification(push)).toEqual({
      shouldShowBanner: false,
      shouldShowList: false,
      shouldPlaySound: false,
      shouldSetBadge: false,
    });
  });

  it("ne programme aucune notification locale", async () => {
    await mount();
    await waitFor(() => expect(notifications().setNotificationHandler).toHaveBeenCalled());
    await new Promise((resolve) => setTimeout(resolve, 20));
    expect(notifications().scheduleNotificationAsync).not.toHaveBeenCalled();
  });

  it("ne fait rien sans utilisateur connecté", async () => {
    mockSignedIn = false;
    await mount();
    await new Promise((resolve) => setTimeout(resolve, 20));
    expect(notifications().addNotificationResponseReceivedListener).not.toHaveBeenCalled();
  });

  it("ne fait rien avec les données d'exemple", async () => {
    mockSourceKind = "mock";
    await mount();
    await new Promise((resolve) => setTimeout(resolve, 20));
    expect(notifications().addNotificationResponseReceivedListener).not.toHaveBeenCalled();
  });
});
