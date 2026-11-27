import type { StreamEvent, User } from "@solar/contracts";
import { useQuery } from "@tanstack/react-query";
import { act, render, screen } from "@testing-library/react-native";
import { Text } from "react-native";

import { QueryProvider } from "../src/api";
import {
  LIVE_FALLBACK_MS,
  LiveUpdates,
  liveInterval,
  RECONNECT_MIN_MS,
  useIsLive,
} from "../src/api/live";
import { AuthProvider } from "../src/auth/AuthProvider";
import { saveSession } from "../src/auth/session";
import { dataSource } from "../src/data";
import type { EventStreamHandlers } from "../src/data/api/event-stream";
import { openEventStream, parseSse, STREAM_SILENCE_MS } from "../src/data/api/event-stream";

const AT = "2026-11-27T10:00:00.000Z";
const event = (topic: StreamEvent["topic"]): StreamEvent => ({
  v: 1,
  topic,
  siteCode: "SITE01",
  at: AT,
});
const sse = (e: StreamEvent) => `event: change\ndata: ${JSON.stringify(e)}\n\n`;

describe("lecture du flux SSE", () => {
  it("garde les événements change valides, ignore commentaires, autres événements et JSON cassé", () => {
    const text = `retry: 3000\n\n: ping\n\n${sse(event("site"))}event: other\ndata: {}\n\nevent: change\ndata: {cassé\n\n${sse(event("alerts"))}`;
    const { events, rest } = parseSse(text);
    expect(events.map((e) => e.topic)).toEqual(["site", "alerts"]);
    expect(rest).toBe("");
  });

  it("garde un bloc incomplet pour la suite", () => {
    const full = sse(event("panels"));
    const first = parseSse(full.slice(0, 20));
    expect(first.events).toEqual([]);
    const second = parseSse(first.rest + full.slice(20));
    expect(second.events.map((e) => e.topic)).toEqual(["panels"]);
  });
});

/** XMLHttpRequest factice, piloté par le test. */
function fakeXhr() {
  const xhr = {
    readyState: 0,
    status: 0,
    responseText: "",
    headers: {} as Record<string, string>,
    aborted: false,
    onreadystatechange: null as (() => void) | null,
    onprogress: null as (() => void) | null,
    onerror: null as (() => void) | null,
    open: jest.fn(),
    send: jest.fn(),
    setRequestHeader(name: string, value: string) {
      this.headers[name] = value;
    },
    abort() {
      this.aborted = true;
    },
    receive(text: string, status = 200) {
      this.status = status;
      this.readyState = 3;
      this.responseText += text;
      this.onprogress?.();
    },
  };
  return xhr;
}

describe("client du flux", () => {
  beforeEach(() => jest.useFakeTimers());
  afterEach(() => jest.useRealTimers());

  const handlers = () => ({ onOpen: jest.fn(), onEvent: jest.fn(), onClose: jest.fn() });

  it("envoie le jeton, s'ouvre sur un 200 et transmet les événements reçus par morceaux", () => {
    const xhr = fakeXhr();
    const h = handlers();
    openEventStream("http://api/v1/events", "jeton", h, () => xhr as never);
    expect(xhr.headers.Authorization).toBe("Bearer jeton");
    xhr.receive("retry: 3000\n\n");
    expect(h.onOpen).toHaveBeenCalledTimes(1);
    const full = sse(event("site"));
    xhr.receive(full.slice(0, 30));
    expect(h.onEvent).not.toHaveBeenCalled();
    xhr.receive(full.slice(30));
    expect(h.onEvent).toHaveBeenCalledWith(event("site"));
  });

  it("se ferme sur un refus, sans s'ouvrir", () => {
    const xhr = fakeXhr();
    const h = handlers();
    openEventStream("http://api/v1/events", "jeton", h, () => xhr as never);
    xhr.receive('{"error":{}}', 401);
    expect(h.onOpen).not.toHaveBeenCalled();
    expect(h.onClose).toHaveBeenCalledWith("refusé (HTTP 401)");
    expect(xhr.aborted).toBe(true);
  });

  it("se ferme après deux battements sans aucun octet, une seule fois", () => {
    const xhr = fakeXhr();
    const h = handlers();
    openEventStream("http://api/v1/events", "jeton", h, () => xhr as never);
    xhr.receive(": ping\n\n");
    jest.advanceTimersByTime(STREAM_SILENCE_MS - 1);
    expect(h.onClose).not.toHaveBeenCalled();
    xhr.receive(": ping\n\n");
    jest.advanceTimersByTime(STREAM_SILENCE_MS);
    expect(h.onClose).toHaveBeenCalledTimes(1);
    expect(h.onClose).toHaveBeenCalledWith("battements manqués");
    xhr.onerror?.();
    expect(h.onClose).toHaveBeenCalledTimes(1);
  });
});

describe("mise à jour en direct (LiveUpdates)", () => {
  const USER: User = {
    id: "00000000-0000-4000-8000-000000000001",
    email: "o@demo.local",
    name: "Exploitant",
    role: "operator",
  };
  let streams: EventStreamHandlers[];
  let fetches: Record<string, number>;

  function Probe({ name, queryKey }: { name: string; queryKey: unknown[] }) {
    useQuery({
      queryKey,
      queryFn: async () => {
        fetches[name] = (fetches[name] ?? 0) + 1;
        return fetches[name];
      },
      staleTime: Infinity,
    });
    return null;
  }

  function LiveFlag() {
    return <Text testID="live">{useIsLive() ? "oui" : "non"}</Text>;
  }

  beforeEach(async () => {
    jest.useFakeTimers();
    streams = [];
    fetches = {};
    jest.replaceProperty(dataSource, "kind", "api" as never);
    jest.spyOn(dataSource, "openEventStream").mockImplementation((handlers) => {
      streams.push(handlers);
      return () => undefined;
    });
    await saveSession({ token: "t", expiresAt: "2099-01-01T00:00:00.000Z", user: USER });
  });
  afterEach(() => {
    jest.useRealTimers();
    jest.restoreAllMocks();
  });

  async function renderLive() {
    await render(
      <QueryProvider>
        <AuthProvider>
          <LiveUpdates />
          <LiveFlag />
          <Probe name="site" queryKey={["sites", "s1"]} />
          <Probe name="chart" queryKey={["sites", "s1", "measurements", "24h"]} />
          <Probe name="alerts" queryKey={["alerts", "active"]} />
        </AuthProvider>
      </QueryProvider>,
    );
    await act(async () => {
      await jest.advanceTimersByTimeAsync(0);
    });
  }
  const flush = () =>
    act(async () => {
      await jest.advanceTimersByTimeAsync(0);
    });

  it("ouvre le flux, espace les interrogations, et relit seulement ce qui a changé", async () => {
    await renderLive();
    expect(streams).toHaveLength(1);
    await act(async () => streams[0]!.onOpen());
    await flush();
    expect(screen.getByTestId("live").props.children).toBe("oui");
    expect(liveInterval(5000)).toBe(LIVE_FALLBACK_MS);

    const before = { ...fetches };
    await act(async () => streams[0]!.onEvent(event("site")));
    await flush();
    expect(fetches.site).toBe(before.site! + 1);
    // La courbe du site et les alertes ne sont pas relues pour un signal « site ».
    expect(fetches.chart).toBe(before.chart);
    expect(fetches.alerts).toBe(before.alerts);

    await act(async () => streams[0]!.onEvent(event("alerts")));
    await flush();
    expect(fetches.alerts).toBe(before.alerts! + 1);
  });

  it("coupure : retour immédiat à l'interrogation normale, puis reconnexion après 3 s, puis 6 s", async () => {
    await renderLive();
    await act(async () => streams[0]!.onOpen());
    await flush();
    const before = { ...fetches };
    await act(async () => streams[0]!.onClose("erreur réseau"));
    await flush();
    expect(screen.getByTestId("live").props.children).toBe("non");
    expect(liveInterval(5000)).toBe(5000);
    // Les requêtes sont relues aussitôt (elles reprennent leur période normale).
    expect(fetches.site).toBe(before.site! + 1);

    await act(async () => {
      await jest.advanceTimersByTimeAsync(RECONNECT_MIN_MS - 1);
    });
    expect(streams).toHaveLength(1);
    await act(async () => {
      await jest.advanceTimersByTimeAsync(1);
    });
    expect(streams).toHaveLength(2);

    // Nouvel échec sans ouverture : l'attente double.
    await act(async () => streams[1]!.onClose("connexion impossible"));
    await act(async () => {
      await jest.advanceTimersByTimeAsync(2 * RECONNECT_MIN_MS - 1);
    });
    expect(streams).toHaveLength(2);
    await act(async () => {
      await jest.advanceTimersByTimeAsync(1);
    });
    expect(streams).toHaveLength(3);
  });

  it("n'ouvre aucun flux avec les données d'exemple", async () => {
    jest.replaceProperty(dataSource, "kind", "mock" as never);
    await renderLive();
    expect(streams).toHaveLength(0);
    expect(screen.getByTestId("live").props.children).toBe("non");
  });
});
