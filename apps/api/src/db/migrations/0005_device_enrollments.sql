CREATE TYPE "public"."enrollment_status" AS ENUM('pending', 'active', 'rejected', 'revoked', 'expired');--> statement-breakpoint
CREATE TABLE "device_enrollments" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"device_id" uuid NOT NULL,
	"fingerprint" text NOT NULL,
	"csr_pem" text NOT NULL,
	"status" "enrollment_status" DEFAULT 'pending' NOT NULL,
	"requested_at" timestamp with time zone DEFAULT now() NOT NULL,
	"pending_expires_at" timestamp with time zone NOT NULL,
	"decided_at" timestamp with time zone,
	"decided_by" uuid,
	"serial_number" text,
	"certificate_pem" text,
	"certificate_expires_at" timestamp with time zone,
	"revoked_at" timestamp with time zone,
	CONSTRAINT "device_enrollments_serialNumber_unique" UNIQUE("serial_number"),
	CONSTRAINT "device_enrollments_fingerprint_check" CHECK ("device_enrollments"."fingerprint" ~ '^[0-9a-f]{64}$'),
	CONSTRAINT "device_enrollments_serial_number_check" CHECK ("device_enrollments"."serial_number" ~ '^[0-9a-f]{32}$'),
	CONSTRAINT "device_enrollments_certificate_check" CHECK (("device_enrollments"."serial_number" IS NULL) = ("device_enrollments"."certificate_pem" IS NULL) AND ("device_enrollments"."certificate_pem" IS NULL) = ("device_enrollments"."certificate_expires_at" IS NULL)),
	CONSTRAINT "device_enrollments_issued_check" CHECK ("device_enrollments"."status" NOT IN ('active', 'revoked') OR "device_enrollments"."serial_number" IS NOT NULL),
	CONSTRAINT "device_enrollments_revoked_check" CHECK (("device_enrollments"."status" = 'revoked') = ("device_enrollments"."revoked_at" IS NOT NULL))
);
--> statement-breakpoint
ALTER TABLE "device_enrollments" ADD CONSTRAINT "device_enrollments_device_id_devices_id_fk" FOREIGN KEY ("device_id") REFERENCES "public"."devices"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "device_enrollments" ADD CONSTRAINT "device_enrollments_decided_by_users_id_fk" FOREIGN KEY ("decided_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "device_enrollments_pending_unique_idx" ON "device_enrollments" USING btree ("device_id") WHERE "device_enrollments"."status" = 'pending';--> statement-breakpoint
CREATE UNIQUE INDEX "device_enrollments_active_unique_idx" ON "device_enrollments" USING btree ("device_id") WHERE "device_enrollments"."status" = 'active';--> statement-breakpoint
CREATE INDEX "device_enrollments_fingerprint_idx" ON "device_enrollments" USING btree ("fingerprint","requested_at" DESC NULLS LAST);--> statement-breakpoint
CREATE INDEX "device_enrollments_status_idx" ON "device_enrollments" USING btree ("status","requested_at" DESC NULLS LAST);