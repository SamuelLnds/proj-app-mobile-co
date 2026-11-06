import { DEMO_SITE_PRODUCTION_FACTOR } from "@solar/contracts";
import { Link } from "expo-router";
import { useState } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";

import {
  useConnectivity,
  useCurrentSiteId,
  useSite,
  useSiteMeasurements,
  type Period,
} from "../../src/api";
import { useAuth } from "../../src/auth/AuthProvider";
import {
  Banner,
  Card,
  Gauge,
  LabelWithIcon,
  LineChart,
  Screen,
  SectionTitle,
  Segmented,
  StatusChip,
} from "../../src/components";
import { Icon, radius, sizes, spacing, typography, useTheme } from "../../src/theme";
import {
  formatAge,
  formatDateTime,
  formatIrradiance,
  formatPercent,
  formatPower,
} from "../../src/utils/format";
import { modeDescription, useNow } from "../../src/utils/labels";

const PERIODS: { value: Period; label: string }[] = [
  { value: "1h", label: "1 h" },
  { value: "24h", label: "24 h" },
  { value: "7d", label: "7 j" },
];

function LogoutButton() {
  const { colors } = useTheme();
  const { logout } = useAuth();
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel="Se déconnecter"
      onPress={logout}
      style={[
        styles.iconButton,
        { borderColor: colors.lineStrong, backgroundColor: colors.surfaceRaised },
      ]}
    >
      <Icon name="SignOut" color={colors.ink} />
    </Pressable>
  );
}

function LoadingState() {
  const { colors } = useTheme();
  const block = (height: number, width?: number) => (
    <View
      style={{ height, width, borderRadius: radius.sm, backgroundColor: colors.surfaceSunken }}
    />
  );
  return (
    <View
      accessible
      accessibilityLabel="Chargement des données du site"
      style={{ gap: spacing[4] }}
    >
      {block(32, 140)}
      <Card>
        {block(16, 90)}
        {block(40, 180)}
        {block(10)}
      </Card>
      <View style={styles.row}>
        <Card style={styles.flex}>{block(98)}</Card>
        <Card style={styles.flex}>{block(98)}</Card>
      </View>
      <Text style={[typography.label, { color: colors.inkMuted, textAlign: "center" }]}>
        Chargement des données du site…
      </Text>
    </View>
  );
}

export default function SupervisionScreen() {
  const { colors } = useTheme();
  const now = useNow();
  const { online } = useConnectivity();
  const siteId = useCurrentSiteId();
  const site = useSite(siteId);
  const [period, setPeriod] = useState<Period>("24h");
  const history = useSiteMeasurements(siteId, period);

  const data = site.data;
  const m = data?.latestMeasurement ?? null;

  return (
    <Screen
      title="Supervision"
      subtitle={data?.name ?? "Parc solaire"}
      headerRight={<LogoutButton />}
      headerBelow={
        !online ? (
          <Banner
            tone="nodata"
            title="Hors ligne"
            text={`Données du ${m ? formatDateTime(m.timestamp) : "dernier chargement"}. Le pilotage est désactivé.`}
          />
        ) : null
      }
      refreshing={site.isRefetching}
      onRefresh={() => void site.refetch()}
    >
      {!data || !m ? (
        site.isError ? (
          <Banner
            tone="critical"
            title="Données indisponibles"
            text="Tirez vers le bas pour réessayer."
          />
        ) : (
          <LoadingState />
        )
      ) : (
        <>
          <View style={[styles.row, styles.between]}>
            {online && data.deviceStatus === "online" ? (
              <StatusChip tone="normal" label="Objet en ligne" />
            ) : data.deviceStatus === "offline" ? (
              <StatusChip tone="critical" label="Objet hors ligne" />
            ) : (
              <StatusChip tone="nodata" label="Dernier état connu" icon="Clock" />
            )}
            <View style={styles.row}>
              <Icon name="Clock" color={colors.inkMuted} size={16} />
              <Text style={[typography.caption, { color: colors.inkMuted }]}>
                Mis à jour {formatAge(m.timestamp, now)}
              </Text>
            </View>
          </View>

          <Card>
            <LabelWithIcon icon="Sun" label="Production" />
            <Text style={[typography.metricXl, { color: colors.ink }]}>
              {formatPower(m.production)}
            </Text>
            <Gauge
              value={m.expectedProduction > 0 ? m.production / m.expectedProduction : 0}
              color={colors.sun}
            />
            <View style={[styles.row, styles.between]}>
              <Text style={[typography.label, { color: colors.inkMuted }]}>
                Attendue : {formatPower(m.expectedProduction)} (
                {formatPercent(
                  m.expectedProduction > 0 ? (m.production / m.expectedProduction) * 100 : 0,
                )}
                )
              </Text>
              <Text style={[typography.label, { color: colors.inkMuted }]}>
                {formatIrradiance(m.irradiance)}
              </Text>
            </View>
          </Card>

          <View style={styles.row}>
            <Card style={styles.flex}>
              <LabelWithIcon
                icon={m.batteryPower > 0 ? "BatteryCharging" : "BatteryHigh"}
                label="Batterie"
              />
              <Text style={[typography.metric, { color: colors.ink }]}>
                {formatPercent(m.batteryLevel)}
              </Text>
              <Gauge value={m.batteryLevel / 100} color={colors.primary} />
              <Text style={[typography.label, { color: colors.inkMuted }]}>
                {m.batteryPower > 0
                  ? `En charge · ${formatPower(m.batteryPower)}`
                  : m.batteryPower < 0
                    ? `En décharge · ${formatPower(-m.batteryPower)}`
                    : "Au repos"}
              </Text>
            </Card>
            <Card style={styles.flex}>
              <LabelWithIcon icon="PlugsConnected" label="Réseau" />
              <Text style={[typography.metric, { color: colors.ink }]}>
                {formatPower(m.gridPower)}
              </Text>
              <Gauge
                value={m.production > 0 ? m.gridPower / m.production : 0}
                color={colors.grid}
              />
              <Text style={[typography.label, { color: colors.inkMuted }]}>
                Injection ·{" "}
                {formatPercent(m.production > 0 ? (m.gridPower / m.production) * 100 : 0)}
              </Text>
            </Card>
          </View>

          <Link href="/control" asChild>
            <Pressable
              accessibilityRole="link"
              style={[styles.linkCard, { backgroundColor: colors.surfaceRaised }]}
            >
              <View style={styles.flex}>
                <Text style={[typography.label, { color: colors.inkMuted }]}>Mode en vigueur</Text>
                <Text style={[typography.body, { color: colors.ink }]}>
                  {modeDescription(m.mode, data.controlState?.appliedBatteryShare)}
                </Text>
              </View>
              <Text style={[typography.labelBold, { color: colors.primary }]}>Piloter</Text>
              <Icon name="CaretRight" color={colors.primary} size={20} />
            </Pressable>
          </Link>

          {data.activeAlertCount > 0 ? (
            <Link href="/alerts" asChild>
              <Pressable
                accessibilityRole="link"
                style={[
                  styles.linkCard,
                  {
                    backgroundColor: colors.statusWarningSoft,
                    borderColor: colors.statusWarning,
                    borderWidth: 1,
                  },
                ]}
              >
                <Icon name="Warning" color={colors.statusWarning} />
                <View style={styles.flex}>
                  <Text style={[typography.bodyBold, { color: colors.ink }]}>
                    {data.activeAlertCount === 1
                      ? "1 alerte active"
                      : `${data.activeAlertCount} alertes actives`}
                  </Text>
                  <Text style={[typography.label, { color: colors.ink }]}>
                    Voir le détail des alertes
                  </Text>
                </View>
                <Icon name="CaretRight" color={colors.ink} size={20} />
              </Pressable>
            </Link>
          ) : null}

          <Card>
            <View style={[styles.row, styles.between]}>
              <SectionTitle>Production</SectionTitle>
              <View style={{ width: 180 }}>
                <Segmented
                  accessibilityLabel="Période"
                  options={PERIODS}
                  value={period}
                  onChange={setPeriod}
                />
              </View>
            </View>
            {history.data && history.data.length > 1 ? (
              <LineChart
                series={history.data.map((p) => ({ time: p.time, value: p.production }))}
                expected={history.data.map((p) => ({
                  time: p.time,
                  value: p.irradiance * DEMO_SITE_PRODUCTION_FACTOR,
                }))}
                formatValue={(v) => formatPower(v).replace(",00", "")}
                accessibilityLabel={`Production sur la période : maximum ${formatPower(
                  Math.max(...history.data.map((p) => p.production)),
                )}, actuelle ${formatPower(m.production)}`}
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
  row: { flexDirection: "row", alignItems: "center", gap: spacing[2] },
  between: { justifyContent: "space-between", flexWrap: "wrap" },
  flex: { flex: 1 },
  iconButton: {
    width: sizes.touchTarget,
    height: sizes.touchTarget,
    borderRadius: radius.md,
    borderWidth: 1,
    alignItems: "center",
    justifyContent: "center",
  },
  linkCard: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing[3],
    minHeight: sizes.touchTarget,
    padding: spacing[4],
    borderRadius: radius.md,
  },
});
