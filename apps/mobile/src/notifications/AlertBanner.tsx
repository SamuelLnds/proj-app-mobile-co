import type { Alert } from "@solar/contracts";
import { usePathname, useRouter } from "expo-router";
import { useCallback, useEffect, useRef, useState } from "react";
import { AccessibilityInfo, Pressable, StyleSheet, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { useAlerts, useReadAlerts } from "../api";
import { useAuth } from "../auth/AuthProvider";
import { toneColors } from "../components";
import { Icon, radius, sizes, spacing, typography, useTheme } from "../theme";
import { SEVERITY, SEVERITY_ICON } from "../utils/labels";
import {
  ALERT_BANNER_DURATION_MS,
  bannerTarget,
  highestSeverity,
  newBannerAlerts,
} from "./alert-banner";

/** Chemin de l'écran Alertes : la liste y suffit, aucun bandeau. */
const ALERTS_PATH = "/alerts";

/**
 * Nouvelles alertes à afficher dans le bandeau. La détection suit les rafraîchissements de la
 * liste des alertes actives (la même requête que la pastille de l'onglet : aucun appel de plus).
 */
function useNewAlerts(onAlertsScreen: boolean) {
  const { user } = useAuth();
  const active = useAlerts("active", { enabled: !!user });
  const { readIds, loaded } = useReadAlerts();
  const known = useRef<Set<string> | null>(null);
  const [alerts, setAlerts] = useState<Alert[] | null>(null);
  const page = active.data;

  // Nouvelle session : la première liste reçue sert de référence, sans bandeau.
  useEffect(() => {
    known.current = null;
    setAlerts(null);
  }, [user?.id]);

  useEffect(() => {
    if (!user || !page || !loaded) return;
    const items = page.items.filter((alert) => alert.status === "active");
    const fresh = newBannerAlerts(known.current, items, readIds);
    known.current = new Set(items.map((alert) => alert.id));
    if (fresh.length > 0 && !onAlertsScreen) setAlerts(fresh);
  }, [user, page, loaded, readIds, onAlertsScreen]);

  // Sur l'écran Alertes, le bandeau affiché disparaît : la liste montre déjà l'alerte.
  useEffect(() => {
    if (onAlertsScreen) setAlerts(null);
  }, [onAlertsScreen]);

  const dismiss = useCallback(() => setAlerts(null), []);
  return { alerts, dismiss };
}

/**
 * Bandeau d'alerte app au premier plan (#108), en haut de l'écran, sous la barre d'état. Aucune
 * notification système n'est affichée au premier plan (D033) : le bandeau la remplace. Il
 * disparaît après `ALERT_BANNER_DURATION_MS` ou à la fermeture ; « Voir » ne marque pas l'alerte
 * comme lue.
 */
export function AlertBanner() {
  const pathname = usePathname();
  const onAlertsScreen = pathname === ALERTS_PATH;
  const { alerts, dismiss } = useNewAlerts(onAlertsScreen);
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { colors } = useTheme();

  const severity = alerts ? highestSeverity(alerts) : "warning";
  const { label: severityLabel, tone } = SEVERITY[severity];
  const t = toneColors(colors, tone);
  const many = (alerts?.length ?? 0) > 1;
  const title = many ? `${alerts?.length} nouvelles alertes` : severityLabel;
  const text = many ? undefined : alerts?.[0]?.message;

  useEffect(() => {
    if (!alerts) return;
    AccessibilityInfo.announceForAccessibility(
      many ? title : `Nouvelle alerte, ${severityLabel} : ${text ?? ""}`,
    );
    const timer = setTimeout(dismiss, ALERT_BANNER_DURATION_MS);
    return () => clearTimeout(timer);
  }, [alerts, many, title, severityLabel, text, dismiss]);

  if (!alerts) return null;

  const open = () => {
    dismiss();
    router.push(bannerTarget(alerts) as never);
  };

  return (
    <View
      pointerEvents="box-none"
      style={[styles.host, { top: insets.top + spacing[2] }]}
      testID="alert-banner"
    >
      <View
        accessibilityRole="alert"
        accessibilityLiveRegion="assertive"
        style={[styles.banner, { backgroundColor: t.bg, borderColor: t.fg }]}
      >
        <Icon name={SEVERITY_ICON[severity]} color={t.fg} size={22} />
        <View style={styles.texts}>
          <Text style={[typography.bodyBold, { color: colors.ink }]}>{title}</Text>
          {text ? (
            <Text style={[typography.label, { color: colors.ink }]} numberOfLines={3}>
              {text}
            </Text>
          ) : null}
        </View>
        <Pressable
          accessibilityRole="button"
          accessibilityHint={many ? "Ouvre l'écran Alertes" : "Ouvre l'alerte"}
          onPress={open}
          style={({ pressed }) => [styles.action, { opacity: pressed ? 0.7 : 1 }]}
        >
          <Text style={[typography.bodyBold, { color: colors.primary }]}>Voir</Text>
        </Pressable>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Fermer"
          onPress={dismiss}
          style={({ pressed }) => [styles.close, { opacity: pressed ? 0.7 : 1 }]}
        >
          <Icon name="X" color={colors.ink} size={sizes.iconSm} />
        </Pressable>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  host: { position: "absolute", left: spacing[4], right: spacing[4], zIndex: 10, elevation: 10 },
  banner: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing[2],
    paddingLeft: spacing[3],
    paddingVertical: spacing[1],
    borderRadius: radius.md,
    borderWidth: 1,
  },
  texts: { flex: 1, gap: 2, paddingVertical: spacing[2] },
  action: {
    minHeight: sizes.touchTarget,
    minWidth: sizes.touchTarget,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: spacing[2],
  },
  close: {
    width: sizes.touchTarget,
    height: sizes.touchTarget,
    alignItems: "center",
    justifyContent: "center",
  },
});
