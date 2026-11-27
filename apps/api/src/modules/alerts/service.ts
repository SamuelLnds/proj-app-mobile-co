// Consultation des alertes (`GET /v1/alerts`).
import { type Alert, type AlertPage, type AlertsQuery } from "@solar/contracts";
import type { AlertsRepository, AlertWithNames } from "./repository";

export interface AlertsService {
  list: (query: AlertsQuery) => Promise<AlertPage>;
}

export function toAlert(row: AlertWithNames): Alert {
  return {
    id: row.id,
    type: row.type,
    severity: row.severity,
    message: row.message,
    status: row.status,
    site: { id: row.siteId, name: row.siteName },
    panel: row.panelId && row.panelName ? { id: row.panelId, name: row.panelName } : null,
    startedAt: row.startedAt.toISOString(),
    endedAt: row.endedAt?.toISOString() ?? null,
  };
}

export function createAlertsService(repository: AlertsRepository): AlertsService {
  return {
    async list(query) {
      // Une ligne de plus que la page indique s'il en reste ; le curseur est la date de début.
      const rows = await repository.list(
        {
          status: query.status,
          siteId: query.siteId,
          before: query.before ? new Date(query.before) : undefined,
        },
        query.limit + 1,
      );
      const page = rows.slice(0, query.limit);
      const last = page.at(-1);
      return {
        items: page.map(toAlert),
        next: rows.length > query.limit && last ? last.startedAt.toISOString() : null,
      };
    },
  };
}
