-- Indicateurs de performance tirés de la télémétrie (#110), sur la période [from, to[.
-- Aucune table ni fonction créée : lectures seules sur les tables de docs/conception/01-modele-donnees.md.
-- Lancé par infra/perf/report.mjs (pnpm perf:report), qui fournit les variables psql `from` et `to`.

\set ON_ERROR_STOP on
\pset footer off
\pset null '-'

\echo '== Latence des consignes (responded_at - created_at, en secondes) =='
SELECT status,
       count(*) AS consignes,
       round(percentile_cont(0.5) WITHIN GROUP (ORDER BY extract(epoch FROM responded_at - created_at))::numeric, 2) AS mediane_s,
       round(percentile_cont(0.95) WITHIN GROUP (ORDER BY extract(epoch FROM responded_at - created_at))::numeric, 2) AS p95_s,
       round(max(extract(epoch FROM responded_at - created_at))::numeric, 2) AS max_s
FROM setpoints
WHERE created_at >= :'from'::timestamptz AND created_at < :'to'::timestamptz
GROUP BY status
ORDER BY status;

\echo '== Régularité des mesures du site (attendu : 5 s) =='
WITH ordered AS (
  SELECT site_id, time, extract(epoch FROM time - lag(time) OVER (PARTITION BY site_id ORDER BY time)) AS gap
  FROM site_measurements
  WHERE time >= :'from'::timestamptz AND time < :'to'::timestamptz
)
SELECT count(*) AS mesures,
       round(percentile_cont(0.5) WITHIN GROUP (ORDER BY gap)::numeric, 2) AS ecart_median_s,
       round(percentile_cont(0.95) WITHIN GROUP (ORDER BY gap)::numeric, 2) AS ecart_p95_s,
       round(max(gap)::numeric, 1) AS ecart_max_s,
       -- Mesures manquantes : écarts de plus de 1,5 fois la période, rapportés aux mesures attendues.
       round(100.0 * coalesce(sum(greatest(round(gap / 5.0) - 1, 0)) FILTER (WHERE gap > 7.5), 0)
             / nullif(count(*) + coalesce(sum(greatest(round(gap / 5.0) - 1, 0)) FILTER (WHERE gap > 7.5), 0), 0), 1) AS manquantes_pct
FROM ordered;

\echo '== Régularité des mesures des panneaux (attendu : 10 s) =='
WITH ordered AS (
  SELECT panel_id, extract(epoch FROM time - lag(time) OVER (PARTITION BY panel_id ORDER BY time)) AS gap
  FROM panel_measurements
  WHERE time >= :'from'::timestamptz AND time < :'to'::timestamptz
)
SELECT count(DISTINCT panel_id) AS panneaux,
       count(*) AS mesures,
       round(percentile_cont(0.5) WITHIN GROUP (ORDER BY gap)::numeric, 2) AS ecart_median_s,
       round(percentile_cont(0.95) WITHIN GROUP (ORDER BY gap)::numeric, 2) AS ecart_p95_s,
       round(max(gap)::numeric, 1) AS ecart_max_s,
       round(100.0 * coalesce(sum(greatest(round(gap / 10.0) - 1, 0)) FILTER (WHERE gap > 15), 0)
             / nullif(count(*) + coalesce(sum(greatest(round(gap / 10.0) - 1, 0)) FILTER (WHERE gap > 15), 0), 0), 1) AS manquantes_pct
FROM ordered;

\echo '== Détection d''un objet hors ligne (dernière mesure reçue -> ouverture de device_offline, attendu : moins de 70 s) =='
SELECT a.started_at AS alerte_ouverte,
       last.time AS derniere_mesure,
       round(extract(epoch FROM a.started_at - last.time)::numeric, 1) AS delai_s
FROM alerts a
LEFT JOIN LATERAL (
  SELECT max(m.time) AS time FROM site_measurements m
  WHERE m.site_id = a.site_id AND m.time <= a.started_at
) last ON true
WHERE a.type = 'device_offline'
  AND a.started_at >= :'from'::timestamptz AND a.started_at < :'to'::timestamptz
ORDER BY a.started_at;

\echo '== Alertes par type (ouvertes sur la période, durée moyenne avant résolution) =='
SELECT type,
       count(*) AS ouvertes,
       count(*) FILTER (WHERE status = 'active') AS encore_actives,
       round(avg(extract(epoch FROM ended_at - started_at)) FILTER (WHERE status = 'resolved')::numeric, 0) AS duree_moyenne_s
FROM alerts
WHERE started_at >= :'from'::timestamptz AND started_at < :'to'::timestamptz
GROUP BY type
ORDER BY ouvertes DESC, type;

\echo '== Volume stocké (hypertables, toutes périodes) =='
SELECT 'site_measurements' AS hypertable,
       (SELECT count(*) FROM site_measurements) AS lignes,
       pg_size_pretty(hypertable_size('site_measurements')) AS taille
UNION ALL
SELECT 'panel_measurements',
       (SELECT count(*) FROM panel_measurements),
       pg_size_pretty(hypertable_size('panel_measurements'));
