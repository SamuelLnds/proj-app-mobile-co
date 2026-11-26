// Préparation des tests : modules natifs remplacés par des équivalents en mémoire.
/* eslint-disable @typescript-eslint/no-require-imports */

jest.mock("@react-native-community/netinfo", () =>
  require("@react-native-community/netinfo/jest/netinfo-mock.js"),
);

jest.mock("expo-secure-store", () => {
  const items = new Map<string, string>();
  return {
    __items: items,
    setItemAsync: jest.fn(async (key: string, value: string) => {
      items.set(key, value);
    }),
    getItemAsync: jest.fn(async (key: string) => items.get(key) ?? null),
    deleteItemAsync: jest.fn(async (key: string) => {
      items.delete(key);
    }),
  };
});

// Notifications : faux modules, chargés à la demande par l'app comme le vrai module natif.
jest.mock("expo-notifications", () => ({
  AndroidImportance: { MAX: 5 },
  setNotificationChannelAsync: jest.fn(async () => null),
  getPermissionsAsync: jest.fn(async () => ({ status: "granted" })),
  requestPermissionsAsync: jest.fn(async () => ({ status: "granted" })),
  getExpoPushTokenAsync: jest.fn(async () => ({
    type: "expo",
    data: "ExponentPushToken[jeton-de-test]",
  })),
  scheduleNotificationAsync: jest.fn(async () => "id-notification"),
  setNotificationHandler: jest.fn(),
  addNotificationReceivedListener: jest.fn(() => ({ remove: jest.fn() })),
  addNotificationResponseReceivedListener: jest.fn(() => ({ remove: jest.fn() })),
  getLastNotificationResponseAsync: jest.fn(async () => null),
}));

jest.mock("expo-device", () => ({ isDevice: true }));

jest.mock("expo-sqlite", () => ({
  openDatabaseAsync: () => Promise.reject(new Error("SQLite indisponible dans les tests")),
}));

beforeEach(() => {
  // Pas d'import() dynamique dans jest : les modules chargés à la demande sont fournis ici.
  const { nativeModules } = require("../src/notifications/local");
  nativeModules.notifications = async () => require("expo-notifications");
  nativeModules.device = async () => require("expo-device");
  // Chaque test part d'un stockage local et d'une session vides.
  const {
    createMemoryStore,
    createMemoryReadAlertStore,
    setResponseStore,
    setReadAlertStore,
  } = require("../src/storage");
  setResponseStore(createMemoryStore());
  setReadAlertStore(createMemoryReadAlertStore());
  require("expo-secure-store").__items.clear();
});
