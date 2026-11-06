import type { Alert, AlertSeverity, AlertStatus } from "@solar/contracts";
import { useRouter } from "expo-router";
import { useState } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";

import { useAlerts } from "../../src/api";
import { Banner, Card, Screen, Segmented, toneColors } from "../../src/components";
import { Icon, radius, sizes, spacing, typography, useTheme, type IconName } from "../../src/theme";
import { formatAge, formatDateTime } from "../../src/utils/format";
import { SEVERITY, useNow } from "../../src/utils/labels";

const SEVERITY_ICON: Record<AlertSeverity, IconName> = {
  info: "Info",
  warning: "Warning",
  critical: "WarningOctagon",
};

function AlertRow({ alert, now }: { alert: Alert; now: Date }) {
  const { colors } = useTheme();
  const router = useRouter();
  const severity = SEVERITY[alert.severity];
  const t = toneColors(colors, severity.tone);
  const active = alert.status === "active";
  const when = active
    ? `Depuis ${formatDateTime(alert.startedAt)} · ${formatAge(alert.startedAt, now)}`
    : `${formatDateTime(alert.startedAt)} → ${formatDateTime(alert.endedAt ?? alert.startedAt)}`;
  const target = alert.panel ? `/panel/${alert.panel.id}` : "/";

  return (
    <Pressable
      accessibilityRole="link"
      accessibilityLabel={`${severity.label} : ${alert.message}. ${when}`}
      accessibilityHint={alert.panel ? "Ouvre le détail du panneau" : "Ouvre la supervision"}
      onPress={() => router.push(target)}
      style={[styles.row, { borderBottomColor: colors.line }]}
    >
      <View style={[styles.badge, { backgroundColor: active ? t.bg : colors.surfaceSunken }]}>
        <Icon
          name={SEVERITY_ICON[alert.severity]}
          color={active ? t.fg : colors.inkMuted}
          size={sizes.iconSm}
        />
      </View>
      <View style={styles.flex}>
        <Text style={[typography.labelBold, { color: active ? t.fg : colors.inkMuted }]}>
          {severity.label}
          {active ? "" : " · résolue"}
        </Text>
        <Text style={[typography.body, { color: colors.ink }]}>{alert.message}</Text>
        <Text style={[typography.caption, { color: colors.inkMuted }]}>
          {alert.panel ? `${alert.panel.name} · ` : `${alert.site.name} · `}
          {when}
        </Text>
      </View>
      <Icon name="CaretRight" color={colors.inkMuted} size={sizes.iconSm} />
    </Pressable>
  );
}

export default function AlertsScreen() {
  const { colors } = useTheme();
  const now = useNow(15_000);
  const [status, setStatus] = useState<AlertStatus>("active");
  const alerts = useAlerts(status);
  const active = useAlerts("active");
  const items = alerts.data?.items ?? [];
  const activeCount = active.data?.items.length ?? 0;

  return (
    <Screen
      title="Alertes"
      subtitle={
        activeCount
          ? `${activeCount} alerte${activeCount > 1 ? "s" : ""} active${activeCount > 1 ? "s" : ""}`
          : "Aucune alerte active"
      }
      headerBelow={
        <Segmented
          accessibilityLabel="Statut des alertes"
          value={status}
          onChange={setStatus}
          options={[
            { value: "active", label: `Actives (${activeCount})` },
            { value: "resolved", label: "Résolues" },
          ]}
        />
      }
      refreshing={alerts.isRefetching}
      onRefresh={() => void alerts.refetch()}
    >
      {alerts.isError ? <Banner tone="critical" title="Alertes indisponibles" /> : null}
      {alerts.isLoading ? (
        <Text style={[typography.label, { color: colors.inkMuted }]}>Chargement des alertes…</Text>
      ) : items.length === 0 ? (
        <Card style={styles.empty}>
          <Icon name="CheckCircle" color={colors.statusNormal} size={40} />
          <Text style={[typography.heading, { color: colors.ink }]}>
            {status === "active" ? "Aucune alerte active" : "Aucune alerte résolue"}
          </Text>
          <Text style={[typography.body, styles.center, { color: colors.inkMuted }]}>
            {status === "active"
              ? "Le parc fonctionne normalement. Vous serez prévenu si un panneau ou l'objet du site pose problème."
              : "L'historique des alertes apparaîtra ici."}
          </Text>
        </Card>
      ) : (
        <View style={[styles.list, { backgroundColor: colors.surfaceRaised }]}>
          {items.map((alert) => (
            <AlertRow key={alert.id} alert={alert} now={now} />
          ))}
        </View>
      )}
    </Screen>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1, gap: 2 },
  center: { textAlign: "center" },
  list: { borderRadius: radius.md, overflow: "hidden" },
  row: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing[3],
    minHeight: sizes.touchTarget + 16,
    padding: spacing[4],
    borderBottomWidth: 1,
  },
  badge: {
    width: 36,
    height: 36,
    borderRadius: 18,
    alignItems: "center",
    justifyContent: "center",
  },
  empty: { alignItems: "center", gap: spacing[2], paddingVertical: spacing[8] },
});
