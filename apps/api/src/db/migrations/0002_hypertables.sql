-- Parties propres à TimescaleDB, que drizzle-kit ne sait pas générer (section 5 du modèle de données).
-- Tranches de 1 jour, rétention de 30 jours.
SELECT create_hypertable('site_measurements', by_range('time', INTERVAL '1 day'));
--> statement-breakpoint
SELECT add_retention_policy('site_measurements', INTERVAL '30 days');
--> statement-breakpoint
SELECT create_hypertable('panel_measurements', by_range('time', INTERVAL '1 day'));
--> statement-breakpoint
SELECT add_retention_policy('panel_measurements', INTERVAL '30 days');
