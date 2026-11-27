// Historiques du site et des panneaux : points moyennés, triés par date croissante.
import type {
  MeasurementQuery,
  PanelMeasurementPoint,
  SiteMeasurementSeries,
} from "@solar/contracts";
import { AppError, DEFAULT_MESSAGES } from "../../errors";
import type { HistoryRepository } from "./repository";

export interface HistoryService {
  siteSeries: (siteId: string, query: MeasurementQuery) => Promise<SiteMeasurementSeries>;
  panelSeries: (panelId: string, query: MeasurementQuery) => Promise<PanelMeasurementPoint[]>;
}

/** Arrondi d'affichage : les moyennes n'ont pas besoin de plus de deux décimales. */
const round = (value: number) => Math.round(value * 100) / 100;
const iso = (time: Date | string) => new Date(time).toISOString();
const notFound = () => new AppError("NOT_FOUND", DEFAULT_MESSAGES.NOT_FOUND);

export function createHistoryService(repository: HistoryRepository): HistoryService {
  return {
    async siteSeries(siteId, query) {
      if (!(await repository.siteExists(siteId))) throw notFound();
      const rows = await repository.sitePoints(siteId, query);
      return rows.map((row) => ({
        time: iso(row.time),
        irradiance: round(row.irradiance),
        production: round(row.production),
        temperature: round(row.temperature),
        batteryLevel: round(row.batteryLevel),
        batteryPower: round(row.batteryPower),
        gridPower: round(row.gridPower),
      }));
    },

    async panelSeries(panelId, query) {
      if (!(await repository.panelExists(panelId))) throw notFound();
      const rows = await repository.panelPoints(panelId, query);
      return rows.map((row) => ({
        time: iso(row.time),
        production: round(row.production),
        temperature: round(row.temperature),
      }));
    },
  };
}
