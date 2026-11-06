import { useLocalSearchParams, useRouter } from "expo-router";
import { Pressable, StyleSheet, Text, View } from "react-native";

import { usePanel, usePanelMeasurements } from "../../src/api";
import { Banner, Card, LineChart, Screen, SectionTitle, StatusChip } from "../../src/components";
import { PANEL_STATUS } from "../../src/components/ParkPlan";
import { Icon, sizes, spacing, typography, useTheme } from "../../src/theme";
import { formatPercent, formatPower, formatTemperature, formatTime } from "../../src/utils/format";
import { SEVERITY } from "../../src/utils/labels";

function Metric({ label, value }: { label: string; value: string }) {
  const { colors } = useTheme();
  return (
    <Card style={styles.metric}>
      <Text style={[typography.caption, { color: colors.inkMuted }]}>{label}</Text>
      <Text style={[typography.metric, { color: colors.ink }]}>{value}</Text>
    </Card>
  );
}

export default function PanelScreen() {
  const { colors } = useTheme();
  const router = useRouter();
  const { id } = useLocalSearchParams<{ id: string }>();
  const panel = usePanel(id);
  const history = usePanelMeasurements(id, "24h");
  const p = panel.data;
  const status = p ? PANEL_STATUS[p.status] : null;

  const back = (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel="Retour à la carte"
      onPress={() => (router.canGoBack() ? router.back() : router.replace("/map"))}
      style={styles.back}
    >
      <Icon name="CaretLeft" color={colors.primary} size={22} />
      <Text style={[typography.bodyBold, { color: colors.primary }]}>Carte</Text>
    </Pressable>
  );

  return (
    <Screen
      title={p?.name ?? "Panneau"}
      subtitle={p ? `Code ${p.code} · puissance nominale ${formatPower(p.ratedPowerW)}` : undefined}
      headerBelow={
        <View style={styles.headerBelow}>
          {back}
          {status ? (
            <StatusChip tone={status.tone} label={status.label} icon={status.icon} />
          ) : null}
        </View>
      }
      refreshing={panel.isRefetching}
      onRefresh={() => void panel.refetch()}
    >
      {!p ? (
        panel.isError ? (
          <Banner tone="critical" title="Panneau introuvable" />
        ) : (
          <Text style={[typography.label, { color: colors.inkMuted }]}>Chargement du panneau…</Text>
        )
      ) : (
        <>
          {!p.placed ? (
            <Banner
              tone="neutral"
              icon="MapPin"
              title="Panneau non positionné"
              text="Placez-le depuis la vue Liste de l'écran Carte."
            />
          ) : null}
          <View style={styles.metrics}>
            <Metric
              label="Production"
              value={p.latestProduction !== null ? formatPower(p.latestProduction) : "—"}
            />
            <Metric
              label="Attendue"
              value={p.expectedProduction !== null ? formatPower(p.expectedProduction) : "—"}
            />
            <Metric
              label="Température"
              value={p.latestTemperature !== null ? formatTemperature(p.latestTemperature) : "—"}
            />
          </View>

          {p.activeAlerts.map((alert) => (
            <Banner
              key={alert.id}
              tone={SEVERITY[alert.severity].tone}
              title={`${SEVERITY[alert.severity].label} depuis ${formatTime(alert.startedAt)}`}
              text={
                p.latestProduction !== null && p.expectedProduction
                  ? `${alert.message}. Le panneau produit ${formatPercent(
                      (p.latestProduction / p.expectedProduction) * 100,
                    )} de la production attendue.`
                  : alert.message
              }
            />
          ))}
          {p.status === "no_data" ? (
            <Banner
              tone="nodata"
              title="Aucune mesure récente"
              text="Le panneau n'envoie plus de données. Vérifiez son câblage et son boîtier."
            />
          ) : null}

          <Card>
            <SectionTitle>Dernières 24 h</SectionTitle>
            {history.data && history.data.length > 1 ? (
              <LineChart
                series={history.data.map((pt) => ({ time: pt.time, value: pt.production }))}
                formatValue={(v) => formatPower(v)}
                accessibilityLabel={`Production du panneau sur 24 heures : maximum ${formatPower(
                  Math.max(...history.data.map((pt) => pt.production)),
                )}`}
              />
            ) : (
              <View style={{ height: 150 }} />
            )}
          </Card>
        </>
      )}
    </Screen>
  );
}

const styles = StyleSheet.create({
  headerBelow: { flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
  back: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing[1],
    minHeight: sizes.touchTarget,
    paddingRight: spacing[2],
  },
  metrics: { flexDirection: "row", gap: spacing[3] },
  metric: { flex: 1, padding: spacing[3], gap: spacing[1] },
});
