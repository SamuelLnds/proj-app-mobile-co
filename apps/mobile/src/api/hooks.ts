import {
  type AcceptEnrollmentRequest,
  DEFAULT_PAGE_LIMIT,
  SITE_MEASUREMENT_PERIOD_S,
  type AlertStatus,
  type CreateSetpointRequest,
  type MeasurementInterval,
  type UpdatePanelRequest,
} from "@solar/contracts";
import { useInfiniteQuery, useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import { dataSource, DataSourceError } from "../data";
import { readResponse, saveResponse } from "../storage";
import { setLastSync } from "./last-sync";

/** Rafraîchissement des écrans visibles : au rythme des mesures du site. */
const REFRESH_MS = SITE_MEASUREMENT_PERIOD_S * 1000;
/** Rafraîchissement rapide pendant l'attente de la réponse de l'objet à une consigne. */
const PENDING_REFRESH_MS = 2000;
/** Durée maximale de ce rafraîchissement rapide (l'API passe la consigne en `no_response` à 30 s). */
const PENDING_MAX_MS = 60_000;

export type Period = "1h" | "24h" | "7d";
const PERIODS: Record<Period, { ms: number; interval: MeasurementInterval }> = {
  "1h": { ms: 3_600_000, interval: "1m" },
  "24h": { ms: 86_400_000, interval: "15m" },
  "7d": { ms: 7 * 86_400_000, interval: "1h" },
};

const measurementQuery = (period: Period) => {
  const to = Date.now();
  return {
    from: new Date(to - PERIODS[period].ms).toISOString(),
    to: new Date(to).toISOString(),
    interval: PERIODS[period].interval,
  };
};

export const queryKeys = {
  sites: ["sites"] as const,
  site: (id: string) => ["sites", id] as const,
  siteMeasurements: (id: string, period: Period) => ["sites", id, "measurements", period] as const,
  panels: (siteId: string) => ["sites", siteId, "panels"] as const,
  panel: (id: string) => ["panels", id] as const,
  panelMeasurements: (id: string, period: Period) =>
    ["panels", id, "measurements", period] as const,
  // Hors de la branche `sites` : une page de l'historique ne doit jamais être rechargée seule.
  setpoints: (siteId: string) => ["setpoints", siteId] as const,
  alerts: (status?: AlertStatus) => ["alerts", status ?? "all"] as const,
  enrollments: ["enrollments"] as const,
};

/**
 * Appel de la source avec copie locale (D014) : chaque réponse est enregistrée dans SQLite ;
 * si le serveur est injoignable, la dernière réponse enregistrée est renvoyée à la place.
 */
export async function withLocalCopy<T>(
  key: readonly unknown[],
  fetcher: () => Promise<T>,
): Promise<T> {
  const storageKey = JSON.stringify(key);
  try {
    const value = await fetcher();
    await saveResponse(storageKey, value);
    setLastSync(new Date().toISOString());
    return value;
  } catch (error) {
    if (error instanceof DataSourceError && error.code === "NETWORK_ERROR") {
      const stored = await readResponse<T>(storageKey);
      if (stored) {
        setLastSync(stored.savedAt);
        return stored.value;
      }
    }
    throw error;
  }
}

/** Site supervisé : le premier site visible par l'utilisateur (un seul dans le socle). */
export function useSites() {
  return useQuery({
    queryKey: queryKeys.sites,
    queryFn: () => withLocalCopy(queryKeys.sites, () => dataSource.listSites()),
  });
}

export function useCurrentSiteId(): string | undefined {
  return useSites().data?.[0]?.id;
}

export function useSite(siteId: string | undefined) {
  return useQuery({
    queryKey: queryKeys.site(siteId ?? ""),
    queryFn: () => withLocalCopy(queryKeys.site(siteId ?? ""), () => dataSource.getSite(siteId!)),
    enabled: !!siteId,
    refetchInterval: (query) => {
      const current = query.state.data?.currentSetpoint;
      const waiting =
        current?.status === "sent" && Date.now() - Date.parse(current.createdAt) < PENDING_MAX_MS;
      return waiting ? PENDING_REFRESH_MS : REFRESH_MS;
    },
  });
}

export function useSiteMeasurements(siteId: string | undefined, period: Period) {
  return useQuery({
    queryKey: queryKeys.siteMeasurements(siteId ?? "", period),
    queryFn: () =>
      withLocalCopy(queryKeys.siteMeasurements(siteId ?? "", period), () =>
        dataSource.getSiteMeasurements(siteId!, measurementQuery(period)),
      ),
    enabled: !!siteId,
    refetchInterval: REFRESH_MS * 6,
  });
}

export function usePanels(siteId: string | undefined) {
  return useQuery({
    queryKey: queryKeys.panels(siteId ?? ""),
    queryFn: () =>
      withLocalCopy(queryKeys.panels(siteId ?? ""), () => dataSource.listPanels(siteId!)),
    enabled: !!siteId,
    refetchInterval: REFRESH_MS * 2,
  });
}

export function usePanel(panelId: string) {
  return useQuery({
    queryKey: queryKeys.panel(panelId),
    queryFn: () => withLocalCopy(queryKeys.panel(panelId), () => dataSource.getPanel(panelId)),
    refetchInterval: REFRESH_MS * 2,
  });
}

export function usePanelMeasurements(panelId: string, period: Period) {
  return useQuery({
    queryKey: queryKeys.panelMeasurements(panelId, period),
    queryFn: () =>
      withLocalCopy(queryKeys.panelMeasurements(panelId, period), () =>
        dataSource.getPanelMeasurements(panelId, measurementQuery(period)),
      ),
  });
}

/**
 * Historique des consignes, page par page (curseur `before`). Il n'est pas rafraîchi à
 * intervalle fixe : une nouvelle consigne décale les pages, l'écran le recharge depuis la
 * première page (`useResetSetpoints`) quand la consigne en vigueur change.
 */
export function useSetpoints(siteId: string | undefined) {
  return useInfiniteQuery({
    queryKey: queryKeys.setpoints(siteId ?? ""),
    initialPageParam: undefined as string | undefined,
    queryFn: ({ pageParam }) =>
      withLocalCopy([...queryKeys.setpoints(siteId ?? ""), pageParam ?? "first"], () =>
        dataSource.listSetpoints(siteId!, { limit: DEFAULT_PAGE_LIMIT, before: pageParam }),
      ),
    getNextPageParam: (last) => last.next ?? undefined,
    enabled: !!siteId,
  });
}

/** Recharge l'historique des consignes depuis la première page. */
export function useResetSetpoints(siteId: string | undefined) {
  const client = useQueryClient();
  return () => client.resetQueries({ queryKey: queryKeys.setpoints(siteId ?? "") });
}

export function useAlerts(status?: AlertStatus, options?: { enabled?: boolean }) {
  return useQuery({
    enabled: options?.enabled ?? true,
    queryKey: queryKeys.alerts(status),
    queryFn: () =>
      withLocalCopy(queryKeys.alerts(status), () =>
        dataSource.listAlerts(status ? { status, limit: 50 } : { limit: 50 }),
      ),
    refetchInterval: REFRESH_MS,
  });
}

/**
 * Demandes d'enrôlement et certificats des objets (exploitant seulement : la route renvoie 403 à
 * un lecteur). Pas de copie locale : les décisions demandent le réseau, et une demande en
 * attente expire en 30 min.
 */
export function useEnrollments(options?: { enabled?: boolean }) {
  return useQuery({
    enabled: options?.enabled ?? true,
    queryKey: queryKeys.enrollments,
    queryFn: () => dataSource.listEnrollments({ limit: 50 }),
    refetchInterval: REFRESH_MS,
  });
}

function useEnrollmentDecision<T>(decide: (variables: T) => Promise<unknown>) {
  const client = useQueryClient();
  return useMutation({
    mutationFn: decide,
    // Même en cas d'erreur (broker non rechargé, demande expirée) : la liste est relue.
    onSettled: () => client.invalidateQueries({ queryKey: queryKeys.enrollments }),
  });
}

export function useAcceptEnrollment() {
  return useEnrollmentDecision(({ id, body }: { id: string; body: AcceptEnrollmentRequest }) =>
    dataSource.acceptEnrollment(id, body),
  );
}

export function useRejectEnrollment() {
  return useEnrollmentDecision((id: string) => dataSource.rejectEnrollment(id));
}

export function useRevokeEnrollment() {
  return useEnrollmentDecision((id: string) => dataSource.revokeEnrollment(id));
}

export function useCreateSetpoint(siteId: string | undefined) {
  const client = useQueryClient();
  return useMutation({
    mutationFn: (body: CreateSetpointRequest) => dataSource.createSetpoint(siteId!, body),
    onSuccess: () => {
      void client.invalidateQueries({ queryKey: ["sites"] });
      void client.resetQueries({ queryKey: ["setpoints"] });
      void client.invalidateQueries({ queryKey: ["alerts"] });
    },
  });
}

export function useDeletePanel(siteId: string | undefined) {
  const client = useQueryClient();
  return useMutation({
    mutationFn: (panelId: string) => dataSource.deletePanel(panelId),
    onSuccess: () => {
      if (siteId) void client.invalidateQueries({ queryKey: queryKeys.panels(siteId) });
    },
  });
}

export function useUpdatePanel(siteId: string | undefined) {
  const client = useQueryClient();
  return useMutation({
    mutationFn: ({ panelId, body }: { panelId: string; body: UpdatePanelRequest }) =>
      dataSource.updatePanel(panelId, body),
    onSuccess: (panel) => {
      client.setQueryData(queryKeys.panel(panel.id), panel);
      if (siteId) void client.invalidateQueries({ queryKey: queryKeys.panels(siteId) });
    },
  });
}
