import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useCallback, useEffect, useMemo } from "react";

import { loadReadAlerts, removeReadAlerts, saveReadAlerts } from "../storage";
import { useAlerts } from "./hooks";

/**
 * Alertes lues (D034) : l'état est propre au téléphone, conservé dans SQLite. Il est tenu dans le
 * cache de TanStack Query sous une clé unique : l'écran Alertes et la pastille de l'onglet le
 * lisent au même endroit, et une action met les deux à jour aussitôt, sans attendre le
 * rafraîchissement périodique des alertes. La déconnexion vide le cache (`client.clear()`).
 */
const READ_ALERTS_KEY = ["read-alerts"] as const;

export function useReadAlerts() {
  const client = useQueryClient();
  const query = useQuery({
    queryKey: READ_ALERTS_KEY,
    queryFn: loadReadAlerts,
    // L'état local ne change que par les actions de l'utilisateur : aucun rafraîchissement.
    staleTime: Infinity,
    gcTime: Infinity,
  });
  const loaded = query.data !== undefined;
  const readIds = useMemo<ReadonlySet<string>>(() => new Set(query.data ?? []), [query.data]);

  const markAlertsRead = useCallback(
    (ids: readonly string[]) => {
      const known = client.getQueryData<string[]>(READ_ALERTS_KEY);
      const fresh = ids.filter((id) => !known?.includes(id));
      if (fresh.length === 0) return;
      // Mise à jour immédiate de l'état partagé, puis écriture dans SQLite.
      client.setQueryData<string[]>(READ_ALERTS_KEY, (previous) => [...(previous ?? []), ...fresh]);
      void saveReadAlerts(fresh).then(() => {
        // Si la lecture initiale n'était pas terminée, elle a pu renvoyer l'état d'avant l'action :
        // on relit la base, maintenant à jour.
        if (known === undefined) void client.invalidateQueries({ queryKey: READ_ALERTS_KEY });
      });
    },
    [client],
  );

  const markAlertRead = useCallback((id: string) => markAlertsRead([id]), [markAlertsRead]);

  return {
    /** Identifiants des alertes lues. Vide tant que la mémoire locale n'est pas lue. */
    readIds,
    /** La mémoire locale est lue : avant, aucune alerte n'est signalée comme non lue. */
    loaded,
    markAlertRead,
    markAllAlertsRead: markAlertsRead,
  };
}

/**
 * Nombre d'alertes actives et non lues, pour la pastille de l'onglet Alertes. Quand la liste des
 * alertes actives change, les identifiants lus qui n'y figurent plus (alertes résolues) sont
 * retirés de la mémoire locale : elle ne grossit pas.
 */
export function useUnreadAlertCount(): number {
  const client = useQueryClient();
  const active = useAlerts("active");
  const { readIds, loaded } = useReadAlerts();
  const page = active.data;
  const activeIds = useMemo(
    () => (page?.items ?? []).filter((a) => a.status === "active").map((a) => a.id),
    [page],
  );
  // Une liste paginée est incomplète : une alerte lue peut être active sans y figurer.
  const complete = page !== undefined && !page.next;

  useEffect(() => {
    if (!loaded || !complete) return;
    const current = new Set(activeIds);
    const stale = [...readIds].filter((id) => !current.has(id));
    if (stale.length === 0) return;
    client.setQueryData<string[]>(READ_ALERTS_KEY, (previous) =>
      previous?.filter((id) => current.has(id)),
    );
    void removeReadAlerts(stale);
  }, [client, loaded, complete, activeIds, readIds]);

  if (!loaded) return 0;
  return activeIds.filter((id) => !readIds.has(id)).length;
}
