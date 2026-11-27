import { request as httpRequest, type IncomingMessage } from "node:http";
import type { AddressInfo } from "node:net";
import { LoginResponseSchema, StreamEventSchema, type StreamEvent } from "@solar/contracts";
import argon2 from "argon2";
import { afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import { buildServer } from "../../server";
import type { AlertsRepository } from "../alerts/repository";
import { createAlertEngine } from "../alerts/engine";
import type { AuthRepository, UserRow } from "../auth/repository";
import { createAuthService } from "../auth/service";
import { createCoalescer, createEventBus, formatSse } from "./service";

let VIEWER: UserRow;
beforeAll(async () => {
  VIEWER = {
    id: "00000000-0000-4000-8000-000000000002",
    email: "viewer@demo.local",
    name: "Lecteur",
    role: "viewer",
    passwordHash: await argon2.hash("secret", { type: argon2.argon2id }),
    createdAt: new Date("2026-11-01T00:00:00Z"),
  };
});

const servers: Array<{ close: () => Promise<unknown> }> = [];
afterEach(async () => {
  while (servers.length) await servers.pop()!.close();
  vi.useRealTimers();
});

/** Serveur réel (le flux ne se lit pas avec `inject`), avec authentification et bus d'événements. */
async function startServer(options = { heartbeatMs: 60_000, coalesceMs: 250 }) {
  const bus = createEventBus();
  const auth: AuthRepository = {
    findUserByEmail: async (email) => (email === VIEWER.email ? VIEWER : null),
    findUserById: async (userId) => (userId === VIEWER.id ? VIEWER : null),
  };
  const app = buildServer({
    config: { LOG_LEVEL: "silent", NODE_ENV: "test" },
    checkDatabase: async () => true,
    auth: { service: createAuthService(auth), jwtSecret: "x".repeat(32) },
    events: { bus, options },
  });
  await app.listen({ port: 0, host: "127.0.0.1" });
  servers.push(app);
  const { port } = app.server.address() as AddressInfo;
  const login = await app.inject({
    method: "POST",
    url: "/v1/auth/login",
    payload: { email: VIEWER.email, password: "secret" },
  });
  const token = LoginResponseSchema.parse(login.json()).token;
  return { bus, port, token, app };
}

/** Ouvre le flux et accumule ce qui arrive. */
function openStream(port: number, token?: string) {
  return new Promise<{
    response: IncomingMessage;
    text: () => string;
    events: () => StreamEvent[];
    close: () => void;
  }>((resolve, reject) => {
    const req = httpRequest(
      {
        host: "127.0.0.1",
        port,
        path: "/v1/events",
        headers: token ? { Authorization: `Bearer ${token}` } : {},
      },
      (response) => {
        let text = "";
        response.setEncoding("utf8");
        response.on("data", (chunk: string) => (text += chunk));
        resolve({
          response,
          text: () => text,
          events: () =>
            [...text.matchAll(/^event: change\ndata: (.*)$/gm)].map((m) =>
              StreamEventSchema.parse(JSON.parse(m[1]!)),
            ),
          close: () => req.destroy(),
        });
      },
    );
    req.on("error", reject);
    req.end();
  });
}

const until = async (check: () => boolean, timeoutMs = 2000) => {
  const start = Date.now();
  while (!check()) {
    if (Date.now() - start > timeoutMs) throw new Error("délai dépassé");
    await new Promise((r) => setTimeout(r, 10));
  }
  return Date.now() - start;
};

describe("flux d'événements (GET /v1/events)", () => {
  it("refuse un client sans jeton (401)", async () => {
    const { port } = await startServer();
    const stream = await openStream(port);
    expect(stream.response.statusCode).toBe(401);
    stream.close();
  });

  it("ouvre un flux text/event-stream et y pousse un changement en moins de 2 s", async () => {
    const { bus, port, token } = await startServer();
    const stream = await openStream(port, token);
    expect(stream.response.statusCode).toBe(200);
    expect(stream.response.headers["content-type"]).toContain("text/event-stream");
    expect(stream.response.headers["x-accel-buffering"]).toBe("no");
    await until(() => stream.text().includes("retry: 3000"));
    await until(() => bus.size() === 1);

    const sentAt = Date.now();
    bus.publish("site", "SITE01");
    await until(() => stream.events().length === 1);
    expect(Date.now() - sentAt).toBeLessThan(2000);
    expect(stream.events()[0]).toMatchObject({ v: 1, topic: "site", siteCode: "SITE01" });
    stream.close();
  });

  it("regroupe les changements simultanés : 20 panneaux, un seul signal", async () => {
    const { bus, port, token } = await startServer();
    const stream = await openStream(port, token);
    await until(() => bus.size() === 1);
    for (let i = 0; i < 20; i++) bus.publish("panels", "SITE01");
    bus.publish("alerts");
    await until(() => stream.events().length === 2);
    await new Promise((r) => setTimeout(r, 400));
    expect(
      stream
        .events()
        .map((e) => e.topic)
        .sort(),
    ).toEqual(["alerts", "panels"]);
    stream.close();
  });

  it("envoie un battement régulier, que le client ignore", async () => {
    const { bus, port, token } = await startServer({ heartbeatMs: 50, coalesceMs: 250 });
    const stream = await openStream(port, token);
    await until(() => bus.size() === 1);
    await until(() => (stream.text().match(/: ping/g) ?? []).length >= 2);
    expect(stream.events()).toEqual([]);
    stream.close();
  });

  it("désabonne le flux quand le client se déconnecte", async () => {
    const { bus, port, token } = await startServer();
    const stream = await openStream(port, token);
    await until(() => bus.size() === 1);
    stream.close();
    await until(() => bus.size() === 0);
    // Publier sans abonné ne fait rien.
    expect(() => bus.publish("site")).not.toThrow();
  });
});

describe("regroupement et format", () => {
  it("formate un événement SSE nommé change", () => {
    const event: StreamEvent = {
      v: 1,
      topic: "alerts",
      siteCode: null,
      at: "2026-11-27T10:00:00.000Z",
    };
    expect(formatSse(event)).toBe(`event: change\ndata: ${JSON.stringify(event)}\n\n`);
  });

  it("envoie le dernier événement de chaque topic à la fin de la fenêtre", () => {
    vi.useFakeTimers();
    const sent: StreamEvent[] = [];
    const coalescer = createCoalescer((e) => sent.push(e), 250);
    const event = (topic: StreamEvent["topic"], at: string): StreamEvent => ({
      v: 1,
      topic,
      siteCode: "SITE01",
      at,
    });
    coalescer.push(event("site", "a"));
    coalescer.push(event("site", "b"));
    coalescer.push(event("panels", "c"));
    vi.advanceTimersByTime(249);
    expect(sent).toEqual([]);
    vi.advanceTimersByTime(1);
    expect(sent.map((e) => `${e.topic}:${e.at}`)).toEqual(["site:b", "panels:c"]);
  });
});

describe("moteur d'alertes", () => {
  it("signale l'ouverture et la résolution d'une alerte, et rien pour un doublon", async () => {
    const onChange = vi.fn();
    let active = false;
    const repository = {
      insert: async (alert: Record<string, unknown>) => {
        if (active) return null;
        active = true;
        return { id: "x", severity: "info", ...alert };
      },
      resolve: async () => {
        const count = active ? 1 : 0;
        active = false;
        return count;
      },
    } as unknown as AlertsRepository;
    const logger = { info: vi.fn(), error: vi.fn(), warn: vi.fn() } as never;
    const engine = createAlertEngine(repository, async () => undefined, logger, onChange);
    const alert = {
      siteId: "s",
      panelId: null,
      type: "battery_full",
      severity: "info",
      message: "Batterie pleine",
    } as never;
    expect(await engine.open(alert)).toBe(true);
    expect(await engine.open(alert)).toBe(false);
    expect(onChange).toHaveBeenCalledTimes(1);
    await engine.resolve({ siteId: "s" } as never, ["battery_full"], new Date());
    await engine.resolve({ siteId: "s" } as never, ["battery_full"], new Date());
    expect(onChange).toHaveBeenCalledTimes(2);
  });
});
