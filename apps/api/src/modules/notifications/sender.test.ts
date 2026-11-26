// Le SDK Expo est simulé : aucun appel réseau.
import { beforeEach, describe, expect, it, vi } from "vitest";

const sdk = vi.hoisted(() => ({
  constructed: [] as unknown[],
  send: vi.fn(),
}));

vi.mock("expo-server-sdk", () => {
  class Expo {
    constructor(options: unknown) {
      sdk.constructed.push(options);
    }
    static isExpoPushToken(token: unknown) {
      return typeof token === "string" && token.startsWith("ExponentPushToken[");
    }
    chunkPushNotifications(messages: unknown[]) {
      return [messages];
    }
    sendPushNotificationsAsync = sdk.send;
  }
  return { Expo };
});

import { createExpoSender, type PushMessage } from "./sender";

const message = (to: string): PushMessage => ({
  to,
  title: "Alerte",
  body: "Texte",
  data: { alertId: "a" },
});
const GOOD = "ExponentPushToken[good]";
const GONE = "ExponentPushToken[gone]";

describe("envoi par le service Expo", () => {
  beforeEach(() => {
    sdk.constructed.length = 0;
    sdk.send.mockReset();
  });

  it("fonctionne sans jeton d'accès Expo (facultatif)", async () => {
    sdk.send.mockResolvedValue([{ status: "ok", id: "1" }]);
    const results = await createExpoSender(undefined)([message(GOOD)]);
    expect(sdk.constructed).toEqual([{}]);
    expect(results).toEqual([{ ok: true }]);
  });

  it("transmet le jeton d'accès quand il est défini", async () => {
    sdk.send.mockResolvedValue([{ status: "ok", id: "1" }]);
    await createExpoSender("secret-expo")([message(GOOD)]);
    expect(sdk.constructed).toEqual([{ accessToken: "secret-expo" }]);
  });

  it("signale DeviceNotRegistered pour un jeton refusé et pour un jeton mal formé", async () => {
    sdk.send.mockResolvedValue([
      { status: "ok", id: "1" },
      { status: "error", message: "refusé", details: { error: "DeviceNotRegistered" } },
    ]);
    const results = await createExpoSender()([
      message(GOOD),
      message("pas-un-jeton"),
      message(GONE),
    ]);
    expect(results).toEqual([
      { ok: true },
      { ok: false, error: "DeviceNotRegistered" },
      { ok: false, error: "DeviceNotRegistered" },
    ]);
    // Le jeton mal formé n'est jamais envoyé à Expo.
    expect(sdk.send.mock.calls[0]?.[0]).toHaveLength(2);
  });

  it("une erreur réseau est comptée en échec sans supprimer de jeton ni lever d'exception", async () => {
    sdk.send.mockRejectedValue(new Error("réseau"));
    const results = await createExpoSender()([message(GOOD)]);
    expect(results).toEqual([{ ok: false, error: "SendFailed" }]);
  });
});
