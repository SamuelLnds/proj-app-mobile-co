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

jest.mock("expo-sqlite", () => ({
  openDatabaseAsync: () => Promise.reject(new Error("SQLite indisponible dans les tests")),
}));

beforeEach(() => {
  // Chaque test part d'un stockage local et d'une session vides.
  const { createMemoryStore, setResponseStore } = require("../src/storage");
  setResponseStore(createMemoryStore());
  require("expo-secure-store").__items.clear();
});
