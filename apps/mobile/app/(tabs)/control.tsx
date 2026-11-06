import {
  BATTERY_SHARE_STEP_PCT,
  type ControlMode,
  type SetpointRecord,
  type SiteDetail,
} from "@solar/contracts";
import { useState } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";

import {
  useConnectivity,
  useCreateSetpoint,
  useCurrentSiteId,
  useSetpoints,
  useSite,
} from "../../src/api";
import { useAuth } from "../../src/auth/AuthProvider";
import {
  Banner,
  BottomSheet,
  Button,
  Card,
  Gauge,
  Screen,
  SectionTitle,
  Segmented,
  StatusChip,
  type Tone,
} from "../../src/components";
import { DataSourceError } from "../../src/data";
import { Icon, radius, sizes, spacing, typography, useTheme } from "../../src/theme";
import { formatDateTime, formatPercent, formatPower, formatTime } from "../../src/utils/format";
import {
  MODE_LABEL,
  REJECTION_LABEL,
  SETPOINT_STATUS,
  modeDescription,
} from "../../src/utils/labels";

const MODES: { value: ControlMode; label: string }[] = [
  { value: "manual", label: "Manuel" },
  { value: "automatic", label: "Automatique" },
  { value: "discharge", label: "Restitution" },
];

/** Résultat de la dernière consigne envoyée depuis cet écran. */
function resultBanner(record: SetpointRecord) {
  const share = record.appliedBatteryShare;
  switch (record.status) {
    case "applied":
      return {
        tone: "normal" as Tone,
        title: "Consigne appliquée",
        text:
          record.mode === "manual" && share !== null
            ? `${formatPercent(share)} de la production part vers la batterie.`
            : `Mode ${MODE_LABEL[record.mode].toLowerCase()} appliqué.`,
      };
    case "partial":
      return {
        tone: "warning" as Tone,
        title: "Appliquée en partie",
        text: `La puissance de charge maximale est atteinte : ${formatPercent(share ?? 0)} vers la batterie au lieu de ${formatPercent(record.requestedBatteryShare ?? 0)}.`,
      };
    case "rejected":
      return {
        tone: "critical" as Tone,
        title: `Refusée : ${REJECTION_LABEL[record.rejectionReason ?? "invalid_setpoint"]}`,
        text:
          record.rejectionReason === "battery_full"
            ? "Toute la production part vers le réseau. La charge reprendra sous 90 %."
            : "L'état précédent reste appliqué.",
      };
    case "no_response":
      return {
        tone: "critical" as Tone,
        title: "L'objet ne répond pas",
        text: "Une alerte a été créée. La consigne sera appliquée à son retour.",
      };
    default:
      return null;
  }
}

function AppliedState({ site }: { site: SiteDetail }) {
  const { colors } = useTheme();
  const m = site.latestMeasurement;
  const state = site.controlState;
  const pending = site.currentSetpoint?.status === "sent";
  const offline = site.deviceStatus === "offline";

  const chip: { tone: Tone; label: string } = offline
    ? { tone: "nodata", label: "Dernier état connu" }
    : pending
      ? { tone: "neutral", label: "En attente" }
      : state?.status === "partial"
        ? { tone: "warning", label: "Appliquée en partie" }
        : state?.status === "rejected"
          ? { tone: "critical", label: "Refusée" }
          : { tone: "normal", label: "Appliquée" };

  const line = pending
    ? `Consigne envoyée à ${formatTime(site.currentSetpoint!.createdAt)} (${modeDescription(
        site.currentSetpoint!.mode,
        site.currentSetpoint!.requestedBatteryShare,
      )}). En attente de la réponse de l'objet.`
    : state
      ? `${modeDescription(state.mode, state.appliedBatteryShare)}${
          state.reason ? ` : ${REJECTION_LABEL[state.reason]}` : ""
        }.`
      : "Aucune consigne reçue par l'objet.";

  const production = m?.production ?? 0;
  const toBattery = Math.max(0, m?.batteryPower ?? 0);
  const toGrid = m?.gridPower ?? 0;
  const total = Math.max(1, toBattery + toGrid);

  return (
    <Card>
      <View style={[styles.row, styles.between]}>
        <SectionTitle>État appliqué</SectionTitle>
        <StatusChip
          tone={chip.tone}
          label={chip.label}
          icon={pending || offline ? "Clock" : undefined}
        />
      </View>
      <Text style={[typography.body, { color: colors.ink }]}>{line}</Text>

      <View
        accessible
        accessibilityLabel={`Production ${formatPower(production)}, batterie ${formatPower(toBattery)}, réseau ${formatPower(toGrid)}`}
        style={{ gap: spacing[2] }}
      >
        <View style={[styles.row, styles.between]}>
          <View style={styles.row}>
            <View style={[styles.swatch, { backgroundColor: colors.sun }]} />
            <Text style={[typography.label, { color: colors.ink }]}>Production</Text>
          </View>
          <Text style={[typography.value, { color: colors.ink }]}>{formatPower(production)}</Text>
        </View>
        <View style={[styles.split, { backgroundColor: colors.surfaceSunken }]}>
          <View style={{ flex: toBattery / total, backgroundColor: colors.primary }} />
          <View style={{ flex: toGrid / total, backgroundColor: colors.grid }} />
        </View>
        <View style={[styles.row, styles.between]}>
          <View style={styles.row}>
            <View style={[styles.swatch, { backgroundColor: colors.primary }]} />
            <Text style={[typography.label, { color: colors.ink }]}>
              Batterie {formatPower(toBattery)}
            </Text>
          </View>
          <View style={styles.row}>
            <View style={[styles.swatch, { backgroundColor: colors.grid }]} />
            <Text style={[typography.label, { color: colors.ink }]}>
              Réseau {formatPower(toGrid)}
            </Text>
          </View>
        </View>
      </View>

      <View style={[styles.row, styles.battery, { borderTopColor: colors.line }]}>
        <Icon name="BatteryHigh" color={colors.inkMuted} />
        <View style={styles.flex}>
          <Gauge value={(m?.batteryLevel ?? 0) / 100} color={colors.primary} />
        </View>
        <Text style={[typography.value, { color: colors.ink }]}>
          {formatPercent(m?.batteryLevel ?? 0)}
        </Text>
      </View>
    </Card>
  );
}

function ShareStepper({
  value,
  onChange,
  disabled,
}: {
  value: number;
  onChange: (value: number) => void;
  disabled: boolean;
}) {
  const { colors } = useTheme();
  const step = (delta: number) => onChange(Math.max(0, Math.min(100, value + delta)));
  const button = (delta: number, icon: "CaretLeft" | "CaretRight", label: string) => (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      disabled={disabled || (delta < 0 ? value <= 0 : value >= 100)}
      onPress={() => step(delta)}
      style={[
        styles.stepButton,
        { borderColor: disabled ? colors.disabledLine : colors.lineStrong },
      ]}
    >
      <Icon name={icon} color={colors.ink} />
    </Pressable>
  );
  return (
    <View
      accessible
      accessibilityRole="adjustable"
      accessibilityLabel="Part de la production vers la batterie"
      accessibilityValue={{ min: 0, max: 100, now: value, text: formatPercent(value) }}
      accessibilityActions={[{ name: "increment" }, { name: "decrement" }]}
      onAccessibilityAction={(e) =>
        !disabled &&
        step(
          e.nativeEvent.actionName === "increment"
            ? BATTERY_SHARE_STEP_PCT
            : -BATTERY_SHARE_STEP_PCT,
        )
      }
      style={{ gap: spacing[2] }}
    >
      <Text style={[typography.label, { color: colors.inkMuted }]}>
        Part de la production vers la batterie
      </Text>
      <View style={styles.row}>
        {button(-BATTERY_SHARE_STEP_PCT, "CaretLeft", "Diminuer de 10 %")}
        <View style={[styles.split, styles.flex, { backgroundColor: colors.surfaceSunken }]}>
          <View
            style={{
              flex: value,
              backgroundColor: disabled ? colors.disabledFill : colors.primary,
            }}
          />
          <View
            style={{
              flex: 100 - value,
              backgroundColor: disabled ? colors.surfaceSunken : colors.grid,
            }}
          />
        </View>
        {button(BATTERY_SHARE_STEP_PCT, "CaretRight", "Augmenter de 10 %")}
      </View>
      <View style={[styles.row, styles.between]}>
        <Text style={[typography.body, { color: colors.ink }]}>
          Batterie <Text style={typography.value}>{formatPercent(value)}</Text>
        </Text>
        <Text style={[typography.body, { color: colors.ink }]}>
          Réseau <Text style={typography.value}>{formatPercent(100 - value)}</Text>
        </Text>
      </View>
    </View>
  );
}

function History({ items }: { items: SetpointRecord[] }) {
  const { colors } = useTheme();
  return (
    <View style={{ gap: spacing[2] }}>
      <SectionTitle>Historique des consignes</SectionTitle>
      <View style={[styles.list, { backgroundColor: colors.surfaceRaised }]}>
        {items.map((s) => {
          const status = SETPOINT_STATUS[s.status];
          const color =
            status.tone === "normal"
              ? colors.statusNormal
              : status.tone === "critical"
                ? colors.statusCritical
                : status.tone === "warning"
                  ? colors.statusWarning
                  : colors.inkMuted;
          return (
            <View key={s.id} style={[styles.listRow, { borderBottomColor: colors.line }]}>
              <View style={styles.flex}>
                <Text style={[typography.body, { color: colors.ink }]}>
                  {modeDescription(s.mode, s.requestedBatteryShare)}
                </Text>
                <Text style={[typography.caption, { color: colors.inkMuted }]}>
                  {formatDateTime(s.createdAt)} · {s.author.name}
                </Text>
              </View>
              <Text style={[typography.labelBold, { color }]}>
                {status.label}
                {s.status === "rejected" && s.rejectionReason
                  ? ` : ${REJECTION_LABEL[s.rejectionReason]}`
                  : ""}
              </Text>
            </View>
          );
        })}
      </View>
    </View>
  );
}

export default function ControlScreen() {
  const { colors } = useTheme();
  const { user } = useAuth();
  const { online } = useConnectivity();
  const siteId = useCurrentSiteId();
  const site = useSite(siteId);
  const setpoints = useSetpoints(siteId);
  const create = useCreateSetpoint(siteId);

  const [mode, setMode] = useState<ControlMode>("manual");
  const [share, setShare] = useState(70);
  const [confirming, setConfirming] = useState(false);
  const [submittedId, setSubmittedId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const data = site.data;
  const viewer = user?.role !== "operator";
  const deviceOffline = data?.deviceStatus === "offline";
  const pending = data?.currentSetpoint?.status === "sent";
  const disabled = viewer || !online || deviceOffline || pending || !data;

  const submitted =
    submittedId && data?.currentSetpoint?.id === submittedId ? data.currentSetpoint : null;
  const result = submitted && submitted.status !== "sent" ? resultBanner(submitted) : null;

  const send = () => {
    setConfirming(false);
    setError(null);
    create.mutate(
      { mode, batteryShare: mode === "manual" ? share : null },
      {
        onSuccess: (record) => setSubmittedId(record.id),
        onError: (e) =>
          setError(
            e instanceof DataSourceError ? e.message : "La consigne n'a pas pu être envoyée.",
          ),
      },
    );
  };

  const disabledHint = viewer
    ? null
    : !online
      ? "Pilotage indisponible sans réseau."
      : deviceOffline
        ? "Pilotage indisponible tant que l'objet est hors ligne."
        : pending
          ? "Sans réponse de l'objet sous 30 s, une alerte sera créée."
          : null;

  return (
    <Screen
      title="Pilotage"
      subtitle={data?.name ?? "Parc solaire"}
      refreshing={site.isRefetching}
      onRefresh={() => void site.refetch()}
      overlay={
        <BottomSheet
          visible={confirming}
          title="Appliquer cette consigne ?"
          onClose={() => setConfirming(false)}
        >
          <View style={styles.summary}>
            <Text style={[typography.body, { color: colors.inkMuted }]}>Mode</Text>
            <Text style={[typography.bodyBold, { color: colors.ink }]}>{MODE_LABEL[mode]}</Text>
            {mode === "manual" ? (
              <>
                <Text style={[typography.body, { color: colors.inkMuted }]}>Batterie</Text>
                <Text style={[typography.bodyBold, { color: colors.ink }]}>
                  {formatPercent(share)} de la production
                </Text>
                <Text style={[typography.body, { color: colors.inkMuted }]}>Réseau</Text>
                <Text style={[typography.bodyBold, { color: colors.ink }]}>
                  {formatPercent(100 - share)} de la production
                </Text>
              </>
            ) : null}
          </View>
          <Text style={[typography.label, { color: colors.inkMuted }]}>
            L'objet applique la consigne dans la limite de ses règles de sécurité (batterie pleine,
            puissance de charge maximale).
          </Text>
          <View style={styles.row}>
            <View style={styles.flex}>
              <Button label="Annuler" variant="secondary" onPress={() => setConfirming(false)} />
            </View>
            <View style={styles.flex}>
              <Button label="Appliquer" onPress={send} />
            </View>
          </View>
        </BottomSheet>
      }
    >
      {viewer ? (
        <Banner
          tone="neutral"
          icon="Lock"
          title="Consultation seule"
          text="Le pilotage est réservé aux exploitants. L'état appliqué et l'historique restent consultables."
        />
      ) : null}
      {!online ? (
        <Banner
          tone="nodata"
          title="Hors ligne"
          text="Le pilotage reprendra au retour du réseau."
        />
      ) : null}
      {online && deviceOffline ? (
        <Banner
          tone="critical"
          title="L'objet du site est hors ligne"
          text="Le pilotage reprendra à son retour. La dernière consigne lui sera appliquée automatiquement."
        />
      ) : null}
      {result ? <Banner tone={result.tone} title={result.title} text={result.text} /> : null}
      {error ? <Banner tone="critical" title={error} /> : null}

      {data ? <AppliedState site={data} /> : null}

      <Card style={disabled ? { backgroundColor: colors.surfaceSunken } : undefined}>
        <SectionTitle>Nouvelle consigne</SectionTitle>
        <Text style={[typography.label, { color: colors.inkMuted }]}>Mode</Text>
        <Segmented
          accessibilityLabel="Mode"
          options={MODES}
          value={mode}
          onChange={setMode}
          disabled={disabled}
        />
        {mode === "manual" ? (
          <ShareStepper value={share} onChange={setShare} disabled={disabled} />
        ) : (
          <Text style={[typography.body, { color: colors.ink }]}>
            {mode === "automatic"
              ? "La batterie se charge jusqu'à 80 %, puis toute la production part vers le réseau."
              : "La batterie se décharge vers le réseau jusqu'à 20 %."}
          </Text>
        )}
        <Button
          label={pending || create.isPending ? "Envoi en cours…" : "Appliquer"}
          disabled={disabled || create.isPending}
          onPress={() => setConfirming(true)}
        />
        {disabledHint ? (
          <Text style={[typography.label, { color: colors.ink }]}>{disabledHint}</Text>
        ) : null}
      </Card>

      {setpoints.data ? <History items={setpoints.data.items} /> : null}
    </Screen>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: "row", alignItems: "center", gap: spacing[2] },
  between: { justifyContent: "space-between", flexWrap: "wrap" },
  flex: { flex: 1 },
  swatch: { width: 12, height: 12, borderRadius: 3 },
  split: { flexDirection: "row", height: 14, borderRadius: 7, overflow: "hidden" },
  battery: { borderTopWidth: 1, paddingTop: spacing[3], marginTop: spacing[1] },
  stepButton: {
    width: sizes.touchTarget,
    height: sizes.touchTarget,
    borderRadius: radius.md,
    borderWidth: 1,
    alignItems: "center",
    justifyContent: "center",
  },
  summary: { flexDirection: "row", flexWrap: "wrap", rowGap: spacing[2] },
  list: { borderRadius: radius.md, overflow: "hidden" },
  listRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing[3],
    padding: spacing[4],
    borderBottomWidth: 1,
  },
});
