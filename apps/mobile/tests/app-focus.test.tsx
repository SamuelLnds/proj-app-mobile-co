import { focusManager, useQuery } from "@tanstack/react-query";
import { act, renderHook } from "@testing-library/react-native";
import type { ReactNode } from "react";
import { AppState, type AppStateStatus } from "react-native";

import { QueryProvider } from "../src/api";
import { bindFocusToAppState, isForeground } from "../src/api/app-focus";

const INTERVAL_MS = 5000;

let testIndex = 0;
let changeAppState: (status: AppStateStatus) => void = () => undefined;

function wrapper({ children }: { children: ReactNode }) {
  return <QueryProvider>{children}</QueryProvider>;
}

/** Requête interrogée périodiquement, comme celles des écrans de l'app. */
async function renderPolledQuery() {
  const queryFn = jest.fn(async () => Date.now());
  await renderHook(
    () =>
      useQuery({ queryKey: ["test-app-focus", testIndex], queryFn, refetchInterval: INTERVAL_MS }),
    { wrapper },
  );
  return queryFn;
}

async function advance(ms: number) {
  await act(async () => {
    await jest.advanceTimersByTimeAsync(ms);
  });
}

beforeEach(() => {
  testIndex += 1;
  jest.useFakeTimers();
  jest.spyOn(AppState, "addEventListener").mockImplementation((_event, handler) => {
    changeAppState = handler as (status: AppStateStatus) => void;
    return { remove: jest.fn() };
  });
  bindFocusToAppState();
  // Chaque test commence app au premier plan.
  focusManager.setFocused(true);
});

afterEach(() => {
  jest.useRealTimers();
  jest.restoreAllMocks();
});

describe("état de l'app et rafraîchissements (#111)", () => {
  it("seul l'état active compte comme premier plan", () => {
    expect(isForeground("active")).toBe(true);
    expect(isForeground("inactive")).toBe(false);
    expect(isForeground("background")).toBe(false);
  });

  it("aucune requête pendant que l'app est en arrière-plan", async () => {
    const queryFn = await renderPolledQuery();
    await advance(0);
    expect(queryFn).toHaveBeenCalledTimes(1);

    await advance(INTERVAL_MS);
    expect(queryFn).toHaveBeenCalledTimes(2);

    await act(async () => changeAppState("background"));
    expect(focusManager.isFocused()).toBe(false);
    await advance(INTERVAL_MS * 6);
    expect(queryFn).toHaveBeenCalledTimes(2);
  });

  it("le retour au premier plan rafraîchit aussitôt les données affichées", async () => {
    const queryFn = await renderPolledQuery();
    await advance(0);
    expect(queryFn).toHaveBeenCalledTimes(1);

    await act(async () => changeAppState("background"));
    await advance(INTERVAL_MS * 3);
    expect(queryFn).toHaveBeenCalledTimes(1);

    await act(async () => changeAppState("active"));
    await advance(0);
    expect(queryFn).toHaveBeenCalledTimes(2);
  });

  it("le rafraîchissement a lieu même si les données sont récentes", async () => {
    const queryFn = await renderPolledQuery();
    await advance(0);
    await act(async () => changeAppState("background"));
    await act(async () => changeAppState("active"));
    await advance(0);
    expect(queryFn).toHaveBeenCalledTimes(2);
  });
});
