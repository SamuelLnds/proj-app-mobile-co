// Consultation des sites : assemblage de `SiteSummary` et `SiteDetail` (section 7.3).
import type { LatestMeasurement, SetpointRecord, SiteDetail, SiteSummary } from "@solar/contracts";
import { AppError, DEFAULT_MESSAGES } from "../../errors";
import type { ControlStateStore } from "./control-states";
import type { MeasurementRow, SetpointRow, SiteRow, SitesRepository } from "./repository";

export interface SitesService {
  listSites: () => Promise<SiteSummary[]>;
  getSite: (id: string) => Promise<SiteDetail>;
}

/** Production attendue (W) : ensoleillement × facteur de production du site. */
export function expectedProduction(irradiance: number, productionFactor: number): number {
  return irradiance * productionFactor;
}

function toLatestMeasurement(row: MeasurementRow, productionFactor: number): LatestMeasurement {
  return {
    timestamp: row.time.toISOString(),
    irradiance: row.irradianceWM2,
    production: row.productionW,
    expectedProduction: expectedProduction(row.irradianceWM2, productionFactor),
    temperature: row.temperatureC,
    batteryLevel: row.batteryLevelPct,
    batteryPower: row.batteryPowerW,
    gridPower: row.gridPowerW,
    mode: row.mode,
    simulatedFault: row.simulatedFault,
  };
}

function toSetpointRecord(row: SetpointRow): SetpointRecord {
  return {
    id: row.id,
    mode: row.mode,
    requestedBatteryShare: row.requestedBatteryShare,
    status: row.status,
    appliedBatteryShare: row.appliedBatteryShare,
    rejectionReason: row.rejectionReason,
    author: { id: row.authorId, name: row.authorName },
    createdAt: row.createdAt.toISOString(),
    respondedAt: row.respondedAt?.toISOString() ?? null,
  };
}

export function createSitesService(
  repository: SitesRepository,
  controlStates: ControlStateStore,
): SitesService {
  async function summary(site: SiteRow): Promise<SiteSummary> {
    const [device, latest, activeAlertCount] = await Promise.all([
      repository.findDevice(site.id),
      repository.findLatestMeasurement(site.id),
      repository.countActiveAlerts(site.id),
    ]);
    return {
      id: site.id,
      code: site.code,
      name: site.name,
      latitude: site.latitude,
      longitude: site.longitude,
      deviceStatus: device?.status ?? "unknown",
      latestMeasurement: latest ? toLatestMeasurement(latest, site.productionFactor) : null,
      activeAlertCount,
    };
  }

  return {
    async listSites() {
      const rows = await repository.listSites();
      return Promise.all(rows.map(summary));
    },

    async getSite(id) {
      const site = await repository.findSite(id);
      if (!site) throw new AppError("NOT_FOUND", DEFAULT_MESSAGES.NOT_FOUND);
      const [base, device, setpoint] = await Promise.all([
        summary(site),
        repository.findDevice(site.id),
        repository.findLatestSetpoint(site.id),
      ]);
      return {
        ...base,
        peakPowerW: site.peakPowerW,
        batteryCapacityWh: site.batteryCapacityWh,
        maxChargePowerW: site.maxChargePowerW,
        currentSetpoint: setpoint ? toSetpointRecord(setpoint) : null,
        controlState: controlStates.get(site.code),
        deviceLastSeenAt: device?.lastSeenAt?.toISOString() ?? null,
      };
    },
  };
}
