import { DEMO_SITE_PRODUCTION_FACTOR } from "@solar/contracts";
import { Link } from "expo-router";
import { useState } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";

import {
  useConnectivity,
  useCurrentSiteId,
  useEnrollments,
  useSites,
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
  speakPower,
} from "../../src/utils/format";
import { emptyChartMessage } from "../../src/utils/chart";
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

/**
 * Accès à la section « Objets » (exploitant seulement, D027). Une demande en attente la met en
 * avant en haut de l'écran : sans certificat, l'objet n'envoie aucune mesure.
 */
function DevicesLink({ position }: { position: "top" | "bottom" }) {
  const { colors } = useTheme();
  const { user } = useAuth();
  const operator = user?.role === "operator";
  const enrollments = useEnrollments({ enabled: operator });
  if (!operator) return null;
  const pending = (enrollments.data?.items ?? []).filter((e) => e.status === "pending").length;
  if ((position === "top") !== pending > 0) return null;
  const text =
    pending === 0
      ? "Certificats et révocation"
      : pending === 1
        ? "1 demande à comparer et accepter"
        : `${pending} demandes à comparer et accepter`;
  return (
    <Link href="/devices" asChild>
      <Pressable
        accessibilityRole="link"
        accessibilityLabel={`Objets du site, ${text}`}
        style={StyleSheet.flatten([
          styles.linkCard,
          pending > 0
            ? {
                backgroundColor: colors.statusWarningSoft,
                borderColor: colors.statusWarning,
                borderWidth: 1,
              }
            : { backgroundColor: colors.surfaceRaised },
        ])}
      >
        <Icon name="Lock" color={pending > 0 ? colors.statusWarning : colors.inkMuted} />
        <View style={styles.flex}>
          <Text style={[typography.bodyBold, { color: colors.ink }]}>Objets du site</Text>
          <Text style={[typography.label, { color: colors.ink }]}>{text}</Text>
        </View>
        <Icon name="CaretRight" color={colors.ink} size={20} />
      </Pressable>
    </Link>
  );
}

export default function SupervisionScreen() {
  const { colors } = useTheme();
  const now = useNow();
  const { online } = useConnectivity();
  const sites = useSites();
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
      refreshable
    >
      <DevicesLink position="top" />
      {!data || !m ? (
        site.isError || sites.isError ? (
          <Banner
            tone="critical"
            title="Données indisponibles"
            text={`${(site.error ?? sites.error)?.message ?? ""} Tirez vers le bas pour réessayer.`.trim()}
          />
        ) : sites.isSuccess && !siteId ? (
          <Banner
            tone="neutral"
            title="Aucun site"
            text="Aucun parc n'est associé à votre compte."
          />
        ) : data && !m ? (
          <Banner
            tone="nodata"
            title="En attente de la première mesure"
            text="L'objet du site n'a encore envoyé aucune mesure. L'écran se mettra à jour tout seul."
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

          <Card
            accessibilityLabel={`Production ${speakPower(m.production)}, attendue ${speakPower(
              m.expectedProduction,
            )}, ensoleillement ${Math.round(m.irradiance)} watts par mètre carré`}
          >
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
            <Card
              style={styles.flex}
              accessibilityLabel={`Batterie ${Math.round(m.batteryLevel)} pour cent, ${
                m.batteryPower > 0
                  ? `en charge à ${speakPower(m.batteryPower)}`
                  : m.batteryPower < 0
                    ? `en décharge à ${speakPower(-m.batteryPower)}`
                    : "au repos"
              }`}
            >
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
            <Card
              style={styles.flex}
              accessibilityLabel={`Réseau : ${speakPower(m.gridPower)} injectés`}
            >
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
              // Expo Router refuse un tableau de styles sur l'enfant d'un Link asChild.
              style={StyleSheet.flatten([
                styles.linkCard,
                { backgroundColor: colors.surfaceRaised },
              ])}
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
                style={StyleSheet.flatten([
                  styles.linkCard,
                  {
                    backgroundColor: colors.statusWarningSoft,
                    borderColor: colors.statusWarning,
                    borderWidth: 1,
                  },
                ])}
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
                period={period}
                accessibilityLabel={`Production sur la période : maximum ${formatPower(
                  Math.max(...history.data.map((p) => p.production)),
                )}, actuelle ${formatPower(m.production)}`}
              />
            ) : history.isError ? (
              <View style={styles.chartEmpty}>
                <Text style={[typography.label, { color: colors.inkMuted }]}>
                  Historique indisponible pour le moment.
                </Text>
              </View>
            ) : history.data ? (
              <View style={styles.chartEmpty}>
                <Text style={[typography.label, { color: colors.inkMuted }]}>
                  {emptyChartMessage(period)}
                </Text>
              </View>
            ) : (
              <View style={styles.chartEmpty} />
            )}
          </Card>
        </>
      )}
      <DevicesLink position="bottom" />
    </Screen>
  );
}

const styles = StyleSheet.create({
  chartEmpty: { height: 150, alignItems: "center", justifyContent: "center" },
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
