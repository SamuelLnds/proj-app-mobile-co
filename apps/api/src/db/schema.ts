// Schéma Drizzle : reflet exact de la section 7 de docs/conception/01-modele-donnees.md.
// Les noms de colonnes TypeScript sont en camelCase ; `casing: "snake_case"` (client et
// drizzle.config.ts) les convertit en snake_case côté base.
import { sql } from "drizzle-orm";
import {
  boolean,
  check,
  customType,
  doublePrecision,
  index,
  integer,
  pgEnum,
  pgTable,
  primaryKey,
  real,
  smallint,
  text,
  timestamp,
  unique,
  uniqueIndex,
  uuid,
} from "drizzle-orm/pg-core";

/** Texte insensible à la casse (extension `citext`). */
const citext = customType<{ data: string }>({
  dataType() {
    return "citext";
  },
});

// Enums (les valeurs sont identiques à celles de @solar/contracts)
export const userRole = pgEnum("user_role", ["operator", "viewer"]);
export const mobilePlatform = pgEnum("mobile_platform", ["android", "ios"]);
export const deviceStatus = pgEnum("device_status", ["unknown", "online", "offline"]);
export const panelSource = pgEnum("panel_source", ["seed", "discovered", "manual"]);
export const controlMode = pgEnum("control_mode", ["manual", "automatic", "discharge"]);
export const setpointStatus = pgEnum("setpoint_status", [
  "sent",
  "applied",
  "partial",
  "rejected",
  "no_response",
]);
export const rejectionReason = pgEnum("rejection_reason", [
  "battery_full",
  "battery_low",
  "charge_limit",
  "invalid_setpoint",
]);
export const alertType = pgEnum("alert_type", [
  "low_production",
  "overheating",
  "battery_low",
  "battery_full",
  "setpoint_rejected",
  "setpoint_no_response",
  "device_offline",
]);
export const alertSeverity = pgEnum("alert_severity", ["info", "warning", "critical"]);
export const alertStatus = pgEnum("alert_status", ["active", "resolved"]);

// Utilisateurs
export const users = pgTable(
  "users",
  {
    id: uuid().primaryKey().defaultRandom(),
    email: citext().notNull().unique(),
    name: text().notNull(),
    passwordHash: text().notNull(),
    role: userRole().notNull().default("viewer"),
    createdAt: timestamp({ withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [check("users_name_length_check", sql`char_length(${t.name}) BETWEEN 1 AND 100`)],
);

export const pushTokens = pgTable(
  "push_tokens",
  {
    id: uuid().primaryKey().defaultRandom(),
    userId: uuid()
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    token: text().notNull().unique(),
    platform: mobilePlatform().notNull(),
    createdAt: timestamp({ withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("push_tokens_user_idx").on(t.userId)],
);

// Parc solaire
export const sites = pgTable(
  "sites",
  {
    id: uuid().primaryKey().defaultRandom(),
    code: text().notNull().unique(),
    name: text().notNull(),
    latitude: doublePrecision().notNull(),
    longitude: doublePrecision().notNull(),
    peakPowerW: integer().notNull(),
    batteryCapacityWh: integer().notNull(),
    maxChargePowerW: integer().notNull(),
    productionFactor: real().notNull(),
    createdAt: timestamp({ withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    check("sites_code_format_check", sql`${t.code} ~ '^[A-Z0-9]{3,16}$'`),
    check("sites_name_length_check", sql`char_length(${t.name}) BETWEEN 1 AND 100`),
    check("sites_latitude_check", sql`${t.latitude} BETWEEN -90 AND 90`),
    check("sites_longitude_check", sql`${t.longitude} BETWEEN -180 AND 180`),
    check("sites_peak_power_w_check", sql`${t.peakPowerW} > 0`),
    check("sites_battery_capacity_wh_check", sql`${t.batteryCapacityWh} > 0`),
    check("sites_max_charge_power_w_check", sql`${t.maxChargePowerW} > 0`),
    check("sites_production_factor_check", sql`${t.productionFactor} > 0`),
  ],
);

export const devices = pgTable("devices", {
  id: uuid().primaryKey().defaultRandom(),
  siteId: uuid()
    .notNull()
    .references(() => sites.id, { onDelete: "cascade" }),
  mqttClientId: text().notNull().unique(),
  status: deviceStatus().notNull().default("unknown"),
  lastSeenAt: timestamp({ withTimezone: true }),
  firmwareVersion: text(),
});

export const panels = pgTable(
  "panels",
  {
    id: uuid().primaryKey().defaultRandom(),
    siteId: uuid()
      .notNull()
      .references(() => sites.id, { onDelete: "cascade" }),
    code: text().notNull(),
    name: text().notNull(),
    latitude: doublePrecision(),
    longitude: doublePrecision(),
    ratedPowerW: integer().notNull(),
    source: panelSource().notNull().default("manual"),
  },
  (t) => [
    unique("panels_site_id_code_unique").on(t.siteId, t.code),
    check("panels_code_format_check", sql`${t.code} ~ '^P[0-9]{2,3}$'`),
    check("panels_name_length_check", sql`char_length(${t.name}) BETWEEN 1 AND 100`),
    check("panels_latitude_check", sql`${t.latitude} BETWEEN -90 AND 90`),
    check("panels_longitude_check", sql`${t.longitude} BETWEEN -180 AND 180`),
    check("panels_rated_power_w_check", sql`${t.ratedPowerW} > 0`),
    check("panels_position_check", sql`(${t.latitude} IS NULL) = (${t.longitude} IS NULL)`),
  ],
);

// Mesures (hypertables TimescaleDB : create_hypertable est dans une migration manuelle)
export const siteMeasurements = pgTable(
  "site_measurements",
  {
    time: timestamp({ withTimezone: true }).notNull(),
    siteId: uuid()
      .notNull()
      .references(() => sites.id, { onDelete: "cascade" }),
    irradianceWM2: real("irradiance_w_m2").notNull(),
    productionW: real().notNull(),
    temperatureC: real().notNull(),
    batteryLevelPct: real().notNull(),
    batteryPowerW: real().notNull(),
    gridPowerW: real().notNull(),
    mode: controlMode().notNull(),
    simulatedFault: boolean().notNull().default(false),
  },
  (t) => [
    primaryKey({ columns: [t.siteId, t.time] }),
    check("site_measurements_irradiance_check", sql`${t.irradianceWM2} >= 0`),
    check("site_measurements_production_check", sql`${t.productionW} >= 0`),
    check("site_measurements_temperature_check", sql`${t.temperatureC} BETWEEN -40 AND 125`),
    check("site_measurements_battery_level_check", sql`${t.batteryLevelPct} BETWEEN 0 AND 100`),
    check("site_measurements_grid_power_check", sql`${t.gridPowerW} >= 0`),
  ],
);

export const panelMeasurements = pgTable(
  "panel_measurements",
  {
    time: timestamp({ withTimezone: true }).notNull(),
    panelId: uuid()
      .notNull()
      .references(() => panels.id, { onDelete: "cascade" }),
    productionW: real().notNull(),
    temperatureC: real().notNull(),
  },
  (t) => [
    primaryKey({ columns: [t.panelId, t.time] }),
    check("panel_measurements_production_check", sql`${t.productionW} >= 0`),
    check("panel_measurements_temperature_check", sql`${t.temperatureC} BETWEEN -40 AND 125`),
  ],
);

// Pilotage
export const setpoints = pgTable(
  "setpoints",
  {
    id: uuid().primaryKey().defaultRandom(),
    siteId: uuid()
      .notNull()
      .references(() => sites.id, { onDelete: "cascade" }),
    authorId: uuid()
      .notNull()
      .references(() => users.id, { onDelete: "restrict" }),
    mode: controlMode().notNull(),
    requestedBatteryShare: smallint(),
    status: setpointStatus().notNull().default("sent"),
    appliedBatteryShare: smallint(),
    rejectionReason: rejectionReason(),
    createdAt: timestamp({ withTimezone: true }).notNull().defaultNow(),
    respondedAt: timestamp({ withTimezone: true }),
  },
  (t) => [
    index("setpoints_site_created_idx").on(t.siteId, t.createdAt.desc()),
    check(
      "setpoints_requested_battery_share_check",
      sql`${t.requestedBatteryShare} BETWEEN 0 AND 100`,
    ),
    check("setpoints_applied_battery_share_check", sql`${t.appliedBatteryShare} BETWEEN 0 AND 100`),
    check(
      "setpoints_manual_share_check",
      sql`(${t.mode} = 'manual') = (${t.requestedBatteryShare} IS NOT NULL)`,
    ),
    check(
      "setpoints_rejection_reason_check",
      sql`(${t.status} IN ('partial', 'rejected')) = (${t.rejectionReason} IS NOT NULL)`,
    ),
  ],
);

// Alertes
export const alerts = pgTable(
  "alerts",
  {
    id: uuid().primaryKey().defaultRandom(),
    siteId: uuid()
      .notNull()
      .references(() => sites.id, { onDelete: "cascade" }),
    panelId: uuid().references(() => panels.id, { onDelete: "cascade" }),
    type: alertType().notNull(),
    severity: alertSeverity().notNull(),
    message: text().notNull(),
    status: alertStatus().notNull().default("active"),
    startedAt: timestamp({ withTimezone: true }).notNull().defaultNow(),
    endedAt: timestamp({ withTimezone: true }),
  },
  (t) => [
    index("alerts_status_started_idx").on(t.status, t.startedAt.desc()),
    // Drizzle ne sait pas exprimer NULLS NOT DISTINCT sur un index : la migration générée
    // est complétée à la main (voir src/db/migrations/0000_*.sql).
    uniqueIndex("alerts_active_unique_idx")
      .on(t.siteId, t.panelId, t.type)
      .where(sql`${t.status} = 'active'`),
    check("alerts_message_length_check", sql`char_length(${t.message}) BETWEEN 1 AND 200`),
    check("alerts_ended_at_check", sql`(${t.status} = 'resolved') = (${t.endedAt} IS NOT NULL)`),
  ],
);
