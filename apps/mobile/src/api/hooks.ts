import {
  SITE_MEASUREMENT_PERIOD_S,
  type AlertStatus,
  type CreateSetpointRequest,
  type MeasurementInterval,
  type UpdatePanelRequest,
} from "@solar/contracts";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import { dataSource } from "../data";

/** Rafraîchissement des écrans visibles : au rythme des mesures du site. */
const REFRESH_MS = SITE_MEASUREMENT_PERIOD_S * 1000;
/** Rafraîchissement rapide pendant l'attente de la réponse de l'objet à une consigne. */
const PENDING_REFRESH_MS = 2000;

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
  setpoints: (siteId: string) => ["sites", siteId, "setpoints"] as const,
  alerts: (status?: AlertStatus) => ["alerts", status ?? "all"] as const,
};

/** Site supervisé : le premier site visible par l'utilisateur (un seul dans le socle). */
export function useCurrentSiteId(): string | undefined {
  const sites = useQuery({ queryKey: queryKeys.sites, queryFn: () => dataSource.listSites() });
  return sites.data?.[0]?.id;
}

export function useSite(siteId: string | undefined) {
  return useQuery({
    queryKey: queryKeys.site(siteId ?? ""),
    queryFn: () => dataSource.getSite(siteId!),
    enabled: !!siteId,
    refetchInterval: (query) =>
      query.state.data?.currentSetpoint?.status === "sent" ? PENDING_REFRESH_MS : REFRESH_MS,
  });
}

export function useSiteMeasurements(siteId: string | undefined, period: Period) {
  return useQuery({
    queryKey: queryKeys.siteMeasurements(siteId ?? "", period),
    queryFn: () => dataSource.getSiteMeasurements(siteId!, measurementQuery(period)),
    enabled: !!siteId,
    refetchInterval: REFRESH_MS * 6,
  });
}

export function usePanels(siteId: string | undefined) {
  return useQuery({
    queryKey: queryKeys.panels(siteId ?? ""),
    queryFn: () => dataSource.listPanels(siteId!),
    enabled: !!siteId,
    refetchInterval: REFRESH_MS * 2,
  });
}

export function usePanel(panelId: string) {
  return useQuery({
    queryKey: queryKeys.panel(panelId),
    queryFn: () => dataSource.getPanel(panelId),
    refetchInterval: REFRESH_MS * 2,
  });
}

export function usePanelMeasurements(panelId: string, period: Period) {
  return useQuery({
    queryKey: queryKeys.panelMeasurements(panelId, period),
    queryFn: () => dataSource.getPanelMeasurements(panelId, measurementQuery(period)),
  });
}

export function useSetpoints(siteId: string | undefined) {
  return useQuery({
    queryKey: queryKeys.setpoints(siteId ?? ""),
    queryFn: () => dataSource.listSetpoints(siteId!),
    enabled: !!siteId,
    refetchInterval: REFRESH_MS,
  });
}

export function useAlerts(status?: AlertStatus) {
  return useQuery({
    queryKey: queryKeys.alerts(status),
    queryFn: () => dataSource.listAlerts(status ? { status, limit: 50 } : { limit: 50 }),
    refetchInterval: REFRESH_MS,
  });
}

/** Nombre d'alertes actives, pour la barre d'onglets. */
export function useActiveAlertCount(): number {
  return useAlerts("active").data?.items.length ?? 0;
}

export function useCreateSetpoint(siteId: string | undefined) {
  const client = useQueryClient();
  return useMutation({
    mutationFn: (body: CreateSetpointRequest) => dataSource.createSetpoint(siteId!, body),
    onSuccess: () => {
      void client.invalidateQueries({ queryKey: ["sites"] });
      void client.invalidateQueries({ queryKey: ["alerts"] });
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
