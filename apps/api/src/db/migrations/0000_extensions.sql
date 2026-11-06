-- Extensions requises, créées avant toute table (citext sert au type de users.email).
CREATE EXTENSION IF NOT EXISTS timescaledb;
--> statement-breakpoint
CREATE EXTENSION IF NOT EXISTS citext;
