CREATE TYPE "public"."alert_severity" AS ENUM('info', 'warning', 'critical');--> statement-breakpoint
CREATE TYPE "public"."alert_status" AS ENUM('active', 'resolved');--> statement-breakpoint
CREATE TYPE "public"."alert_type" AS ENUM('low_production', 'overheating', 'battery_low', 'battery_full', 'setpoint_rejected', 'setpoint_no_response', 'device_offline');--> statement-breakpoint
CREATE TYPE "public"."control_mode" AS ENUM('manual', 'automatic', 'discharge');--> statement-breakpoint
CREATE TYPE "public"."device_status" AS ENUM('unknown', 'online', 'offline');--> statement-breakpoint
CREATE TYPE "public"."mobile_platform" AS ENUM('android', 'ios');--> statement-breakpoint
CREATE TYPE "public"."panel_source" AS ENUM('seed', 'discovered', 'manual');--> statement-breakpoint
CREATE TYPE "public"."rejection_reason" AS ENUM('battery_full', 'battery_low', 'charge_limit', 'invalid_setpoint');--> statement-breakpoint
CREATE TYPE "public"."setpoint_status" AS ENUM('sent', 'applied', 'partial', 'rejected', 'no_response');--> statement-breakpoint
CREATE TYPE "public"."user_role" AS ENUM('operator', 'viewer');--> statement-breakpoint
CREATE TABLE "alerts" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"site_id" uuid NOT NULL,
	"panel_id" uuid,
	"type" "alert_type" NOT NULL,
	"severity" "alert_severity" NOT NULL,
	"message" text NOT NULL,
	"status" "alert_status" DEFAULT 'active' NOT NULL,
	"started_at" timestamp with time zone DEFAULT now() NOT NULL,
	"ended_at" timestamp with time zone,
	CONSTRAINT "alerts_message_length_check" CHECK (char_length("alerts"."message") BETWEEN 1 AND 200),
	CONSTRAINT "alerts_ended_at_check" CHECK (("alerts"."status" = 'resolved') = ("alerts"."ended_at" IS NOT NULL))
);
--> statement-breakpoint
CREATE TABLE "devices" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"site_id" uuid NOT NULL,
	"mqtt_client_id" text NOT NULL,
	"status" "device_status" DEFAULT 'unknown' NOT NULL,
	"last_seen_at" timestamp with time zone,
	"firmware_version" text,
	CONSTRAINT "devices_mqttClientId_unique" UNIQUE("mqtt_client_id")
);
--> statement-breakpoint
CREATE TABLE "panel_measurements" (
	"time" timestamp with time zone NOT NULL,
	"panel_id" uuid NOT NULL,
	"production_w" real NOT NULL,
	"temperature_c" real NOT NULL,
	CONSTRAINT "panel_measurements_panel_id_time_pk" PRIMARY KEY("panel_id","time"),
	CONSTRAINT "panel_measurements_production_check" CHECK ("panel_measurements"."production_w" >= 0),
	CONSTRAINT "panel_measurements_temperature_check" CHECK ("panel_measurements"."temperature_c" BETWEEN -40 AND 125)
);
--> statement-breakpoint
CREATE TABLE "panels" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"site_id" uuid NOT NULL,
	"code" text NOT NULL,
	"name" text NOT NULL,
	"latitude" double precision,
	"longitude" double precision,
	"rated_power_w" integer NOT NULL,
	"source" "panel_source" DEFAULT 'manual' NOT NULL,
	CONSTRAINT "panels_site_id_code_unique" UNIQUE("site_id","code"),
	CONSTRAINT "panels_code_format_check" CHECK ("panels"."code" ~ '^P[0-9]{2,3}$'),
	CONSTRAINT "panels_name_length_check" CHECK (char_length("panels"."name") BETWEEN 1 AND 100),
	CONSTRAINT "panels_latitude_check" CHECK ("panels"."latitude" BETWEEN -90 AND 90),
	CONSTRAINT "panels_longitude_check" CHECK ("panels"."longitude" BETWEEN -180 AND 180),
	CONSTRAINT "panels_rated_power_w_check" CHECK ("panels"."rated_power_w" > 0),
	CONSTRAINT "panels_position_check" CHECK (("panels"."latitude" IS NULL) = ("panels"."longitude" IS NULL))
);
--> statement-breakpoint
CREATE TABLE "push_tokens" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"token" text NOT NULL,
	"platform" "mobile_platform" NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "push_tokens_token_unique" UNIQUE("token")
);
--> statement-breakpoint
CREATE TABLE "setpoints" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"site_id" uuid NOT NULL,
	"author_id" uuid NOT NULL,
	"mode" "control_mode" NOT NULL,
	"requested_battery_share" smallint,
	"status" "setpoint_status" DEFAULT 'sent' NOT NULL,
	"applied_battery_share" smallint,
	"rejection_reason" "rejection_reason",
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"responded_at" timestamp with time zone,
	CONSTRAINT "setpoints_requested_battery_share_check" CHECK ("setpoints"."requested_battery_share" BETWEEN 0 AND 100),
	CONSTRAINT "setpoints_applied_battery_share_check" CHECK ("setpoints"."applied_battery_share" BETWEEN 0 AND 100),
	CONSTRAINT "setpoints_manual_share_check" CHECK (("setpoints"."mode" = 'manual') = ("setpoints"."requested_battery_share" IS NOT NULL)),
	CONSTRAINT "setpoints_rejection_reason_check" CHECK (("setpoints"."status" IN ('partial', 'rejected')) = ("setpoints"."rejection_reason" IS NOT NULL))
);
--> statement-breakpoint
CREATE TABLE "site_measurements" (
	"time" timestamp with time zone NOT NULL,
	"site_id" uuid NOT NULL,
	"irradiance_w_m2" real NOT NULL,
	"production_w" real NOT NULL,
	"temperature_c" real NOT NULL,
	"battery_level_pct" real NOT NULL,
	"battery_power_w" real NOT NULL,
	"grid_power_w" real NOT NULL,
	"mode" "control_mode" NOT NULL,
	"simulated_fault" boolean DEFAULT false NOT NULL,
	CONSTRAINT "site_measurements_site_id_time_pk" PRIMARY KEY("site_id","time"),
	CONSTRAINT "site_measurements_irradiance_check" CHECK ("site_measurements"."irradiance_w_m2" >= 0),
	CONSTRAINT "site_measurements_production_check" CHECK ("site_measurements"."production_w" >= 0),
	CONSTRAINT "site_measurements_temperature_check" CHECK ("site_measurements"."temperature_c" BETWEEN -40 AND 125),
	CONSTRAINT "site_measurements_battery_level_check" CHECK ("site_measurements"."battery_level_pct" BETWEEN 0 AND 100),
	CONSTRAINT "site_measurements_grid_power_check" CHECK ("site_measurements"."grid_power_w" >= 0)
);
--> statement-breakpoint
CREATE TABLE "sites" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"code" text NOT NULL,
	"name" text NOT NULL,
	"latitude" double precision NOT NULL,
	"longitude" double precision NOT NULL,
	"peak_power_w" integer NOT NULL,
	"battery_capacity_wh" integer NOT NULL,
	"max_charge_power_w" integer NOT NULL,
	"production_factor" real NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "sites_code_unique" UNIQUE("code"),
	CONSTRAINT "sites_code_format_check" CHECK ("sites"."code" ~ '^[A-Z0-9]{3,16}$'),
	CONSTRAINT "sites_name_length_check" CHECK (char_length("sites"."name") BETWEEN 1 AND 100),
	CONSTRAINT "sites_latitude_check" CHECK ("sites"."latitude" BETWEEN -90 AND 90),
	CONSTRAINT "sites_longitude_check" CHECK ("sites"."longitude" BETWEEN -180 AND 180),
	CONSTRAINT "sites_peak_power_w_check" CHECK ("sites"."peak_power_w" > 0),
	CONSTRAINT "sites_battery_capacity_wh_check" CHECK ("sites"."battery_capacity_wh" > 0),
	CONSTRAINT "sites_max_charge_power_w_check" CHECK ("sites"."max_charge_power_w" > 0),
	CONSTRAINT "sites_production_factor_check" CHECK ("sites"."production_factor" > 0)
);
--> statement-breakpoint
CREATE TABLE "users" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"email" "citext" NOT NULL,
	"name" text NOT NULL,
	"password_hash" text NOT NULL,
	"role" "user_role" DEFAULT 'viewer' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "users_email_unique" UNIQUE("email"),
	CONSTRAINT "users_name_length_check" CHECK (char_length("users"."name") BETWEEN 1 AND 100)
);
--> statement-breakpoint
ALTER TABLE "alerts" ADD CONSTRAINT "alerts_site_id_sites_id_fk" FOREIGN KEY ("site_id") REFERENCES "public"."sites"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "alerts" ADD CONSTRAINT "alerts_panel_id_panels_id_fk" FOREIGN KEY ("panel_id") REFERENCES "public"."panels"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "devices" ADD CONSTRAINT "devices_site_id_sites_id_fk" FOREIGN KEY ("site_id") REFERENCES "public"."sites"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "panel_measurements" ADD CONSTRAINT "panel_measurements_panel_id_panels_id_fk" FOREIGN KEY ("panel_id") REFERENCES "public"."panels"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "panels" ADD CONSTRAINT "panels_site_id_sites_id_fk" FOREIGN KEY ("site_id") REFERENCES "public"."sites"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "push_tokens" ADD CONSTRAINT "push_tokens_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "setpoints" ADD CONSTRAINT "setpoints_site_id_sites_id_fk" FOREIGN KEY ("site_id") REFERENCES "public"."sites"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "setpoints" ADD CONSTRAINT "setpoints_author_id_users_id_fk" FOREIGN KEY ("author_id") REFERENCES "public"."users"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "site_measurements" ADD CONSTRAINT "site_measurements_site_id_sites_id_fk" FOREIGN KEY ("site_id") REFERENCES "public"."sites"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "alerts_status_started_idx" ON "alerts" USING btree ("status","started_at" DESC);--> statement-breakpoint
CREATE UNIQUE INDEX "alerts_active_unique_idx" ON "alerts" USING btree ("site_id","panel_id","type") NULLS NOT DISTINCT WHERE "alerts"."status" = 'active';--> statement-breakpoint
CREATE INDEX "push_tokens_user_idx" ON "push_tokens" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "setpoints_site_created_idx" ON "setpoints" USING btree ("site_id","created_at" DESC);