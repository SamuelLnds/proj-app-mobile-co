import type { Alert, AlertStatus } from "@solar/contracts";
import { useRouter } from "expo-router";
import { useState } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";

import { useAlerts, useReadAlerts } from "../../src/api";
import {
  Banner,
  Button,
  Card,
  OfflineBanner,
  Screen,
  Segmented,
  toneColors,
} from "../../src/components";
import { Icon, radius, sizes, spacing, typography, useTheme } from "../../src/theme";
import { formatAge, formatDateTime } from "../../src/utils/format";
import { SEVERITY, SEVERITY_ICON, useNow } from "../../src/utils/labels";

/** Largeur de la pastille de gravité (px). */
const BADGE_SIZE = 36;

type AlertRowProps = {
  alert: Alert;
  now: Date;
  /** Alerte active non lue : repère « Nouvelle » ; un appui la marque comme lue (D034). */
  unread: boolean;
  onMarkRead: (id: string) => void;
};

function AlertRow({ alert, now, unread, onMarkRead }: AlertRowProps) {
  const { colors } = useTheme();
  const router = useRouter();
  const severity = SEVERITY[alert.severity];
  const t = toneColors(colors, severity.tone);
  const active = alert.status === "active";
  const when = active
    ? `Depuis ${formatDateTime(alert.startedAt)} · ${formatAge(alert.startedAt, now)}`
    : `${formatDateTime(alert.startedAt)} → ${formatDateTime(alert.endedAt ?? alert.startedAt)}`;
  const label = `${severity.label}${unread ? ", non lue" : ""}${active ? "" : ", résolue"} : ${alert.message}. ${when}`;
  const panel = alert.panel;

  return (
    <View style={[styles.row, { borderBottomColor: colors.line }]}>
      {/* Seule une alerte non lue est un bouton : l'appui la marque comme lue, sans navigation. */}
      <Pressable
        accessibilityRole={unread ? "button" : undefined}
        accessibilityLabel={label}
        accessibilityHint={unread ? "Marque l'alerte comme lue" : undefined}
        onPress={unread ? () => onMarkRead(alert.id) : undefined}
        style={styles.body}
      >
        <View style={[styles.badge, { backgroundColor: active ? t.bg : colors.surfaceSunken }]}>
          <Icon
            name={SEVERITY_ICON[alert.severity]}
            color={active ? t.fg : colors.inkMuted}
            size={sizes.iconSm}
          />
        </View>
        <View style={styles.flex}>
          <View style={styles.titleLine}>
            <Text style={[typography.labelBold, { color: active ? t.fg : colors.inkMuted }]}>
              {severity.label}
              {active ? "" : " · résolue"}
            </Text>
            {unread ? (
              // Point plein et mot : l'état « non lue » ne repose pas sur la couleur seule.
              <View style={styles.newMarker}>
                <View style={[styles.dot, { backgroundColor: colors.ink }]} />
                <Text style={[typography.labelBold, { color: colors.ink }]}>Nouvelle</Text>
              </View>
            ) : null}
          </View>
          <Text style={[typography.body, { color: colors.ink }]}>{alert.message}</Text>
          <Text style={[typography.caption, { color: colors.inkMuted }]}>
            {panel ? `${panel.name} · ` : `${alert.site.name} · `}
            {when}
          </Text>
        </View>
      </Pressable>
      {panel ? (
        // Contrôle séparé : ouvrir le panneau ne marque pas l'alerte comme lue. Une alerte du
        // site n'a pas de navigation.
        <Pressable
          accessibilityRole="link"
          accessibilityLabel={`Voir le panneau ${panel.name}`}
          onPress={() => router.push(`/panel/${panel.id}`)}
          style={styles.panelLink}
        >
          <Text style={[typography.labelBold, { color: colors.primary }]}>Voir le panneau</Text>
          <Icon name="CaretRight" color={colors.primary} size={sizes.iconSm} />
        </Pressable>
      ) : null}
    </View>
  );
}

export default function AlertsScreen() {
  const { colors } = useTheme();
  const now = useNow(15_000);
  const [status, setStatus] = useState<AlertStatus>("active");
  const alerts = useAlerts(status);
  const active = useAlerts("active");
  const { readIds, loaded, markAlertRead, markAllAlertsRead } = useReadAlerts();
  const items = alerts.data?.items ?? [];
  const activeCount = active.data?.items.length ?? 0;
  // Tant que la mémoire locale n'est pas lue, aucune alerte n'est signalée comme non lue.
  const unreadIds = loaded
    ? (active.data?.items ?? []).filter((a) => !readIds.has(a.id)).map((a) => a.id)
    : [];

  return (
    <Screen
      title="Alertes"
      subtitle={
        activeCount
          ? `${activeCount} alerte${activeCount > 1 ? "s" : ""} active${activeCount > 1 ? "s" : ""}`
          : "Aucune alerte active"
      }
      // À droite du titre : le bouton apparaît et disparaît sans changer la hauteur de l'en-tête,
      // donc sans faire bouger la liste.
      headerRight={
        status === "active" && unreadIds.length > 0 ? (
          <Button
            variant="secondary"
            label="Tout marquer comme lu"
            accessibilityHint="Marque toutes les alertes actives comme lues"
            onPress={() => markAllAlertsRead(unreadIds)}
          />
        ) : null
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
      onRefresh={() => alerts.refetch()}
    >
      <OfflineBanner />
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
            <AlertRow
              key={alert.id}
              alert={alert}
              now={now}
              unread={status === "active" && unreadIds.includes(alert.id)}
              onMarkRead={markAlertRead}
            />
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
  row: { padding: spacing[4], gap: spacing[1], borderBottomWidth: 1 },
  body: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing[3],
    minHeight: sizes.touchTarget,
  },
  titleLine: { flexDirection: "row", alignItems: "center", flexWrap: "wrap", gap: spacing[2] },
  newMarker: { flexDirection: "row", alignItems: "center", gap: spacing[1] },
  dot: { width: 8, height: 8, borderRadius: 4 },
  panelLink: {
    alignSelf: "flex-start",
    flexDirection: "row",
    alignItems: "center",
    gap: spacing[1],
    minHeight: sizes.touchTarget,
    // Aligné sur le texte de l'alerte (après la pastille de gravité et son écart).
    marginLeft: BADGE_SIZE + spacing[3],
  },
  badge: {
    width: BADGE_SIZE,
    height: BADGE_SIZE,
    borderRadius: BADGE_SIZE / 2,
    alignItems: "center",
    justifyContent: "center",
  },
  empty: { alignItems: "center", gap: spacing[2], paddingVertical: spacing[8] },
});
