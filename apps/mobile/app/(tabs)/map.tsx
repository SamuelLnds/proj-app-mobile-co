import { DEFAULT_PANEL_RATED_POWER_W, type PanelSummary } from "@solar/contracts";
import { useRouter } from "expo-router";
import { useState } from "react";
import { Alert, Pressable, StyleSheet, Text, View } from "react-native";

import {
  useCurrentSiteId,
  useDeletePanel,
  usePanels,
  useSite,
  useUpdatePanel,
} from "../../src/api";
import { useAuth } from "../../src/auth/AuthProvider";
import {
  Banner,
  BottomSheet,
  Button,
  Card,
  OfflineBanner,
  Screen,
  SectionTitle,
  Segmented,
  StatusChip,
  TextField,
  toneColors,
} from "../../src/components";
import { PANEL_STATUS, ParkPlan } from "../../src/components/ParkPlan";
import { dataSource, DataSourceError } from "../../src/data";
import { Icon, radius, sizes, spacing, typography, useTheme } from "../../src/theme";
import { formatPower } from "../../src/utils/format";
import { locatePhone, type Position } from "../../src/utils/location";

type View_ = "map" | "list";

function Legend({ panels }: { panels: PanelSummary[] }) {
  const { colors } = useTheme();
  const placed = panels.filter((p) => p.placed);
  return (
    <View accessibilityLabel="Légende" style={styles.legend}>
      {(["normal", "alert", "no_data"] as const).map((status) => {
        const s = PANEL_STATUS[status];
        const t = toneColors(colors, s.tone);
        const count = placed.filter((p) => p.status === status).length;
        return (
          <View key={status} style={styles.legendItem}>
            <Icon name={s.icon} color={t.fg} size={16} />
            <Text style={[typography.caption, { color: colors.ink }]}>
              {s.label} ({count})
            </Text>
          </View>
        );
      })}
    </View>
  );
}

function SelectedPanel({ panel }: { panel: PanelSummary }) {
  const { colors } = useTheme();
  const router = useRouter();
  const status = PANEL_STATUS[panel.status];
  return (
    <Card style={{ borderWidth: 1, borderColor: colors.line, borderRadius: radius.lg }}>
      <View style={[styles.row, styles.between]}>
        <Text accessibilityRole="header" style={[typography.heading, { color: colors.ink }]}>
          {panel.name}
        </Text>
        <StatusChip tone={status.tone} label={status.label} icon={status.icon} />
      </View>
      <Text style={[typography.body, { color: colors.ink }]}>
        {panel.latestProduction !== null
          ? `Production : ${formatPower(panel.latestProduction)}`
          : "Aucune mesure récente."}
      </Text>
      <Button
        label="Voir le détail"
        variant="secondary"
        onPress={() => router.push(`/panel/${panel.id}`)}
      />
    </Card>
  );
}

function PanelRow({ panel }: { panel: PanelSummary }) {
  const { colors } = useTheme();
  const router = useRouter();
  const status = PANEL_STATUS[panel.status];
  return (
    <Pressable
      accessibilityRole="link"
      accessibilityLabel={`${panel.name}, ${status.label}`}
      onPress={() => router.push(`/panel/${panel.id}`)}
      style={[styles.listRow, { borderBottomColor: colors.line }]}
    >
      <View style={styles.flex}>
        <Text style={[typography.body, { color: colors.ink }]}>{panel.name}</Text>
        <Text style={[typography.caption, { color: colors.inkMuted }]}>{panel.code}</Text>
      </View>
      <StatusChip tone={status.tone} label={status.label} icon={status.icon} />
      <Text style={[typography.value, styles.prod, { color: colors.ink }]}>
        {panel.latestProduction !== null ? formatPower(panel.latestProduction) : "—"}
      </Text>
    </Pressable>
  );
}

export default function MapScreen() {
  const { colors } = useTheme();
  const { user } = useAuth();
  const siteId = useCurrentSiteId();
  const site = useSite(siteId);
  const panels = usePanels(siteId);
  const update = useUpdatePanel(siteId);
  const remove = useDeletePanel(siteId);
  const [position, setPosition] = useState<Position | null>(null);
  const [locating, setLocating] = useState(false);
  const [view, setView] = useState<View_>("map");
  const [selected, setSelected] = useState<PanelSummary | null>(null);
  const [placing, setPlacing] = useState<PanelSummary | null>(null);
  const [name, setName] = useState("");
  const [power, setPower] = useState("200");
  const [placeError, setPlaceError] = useState<string | null>(null);

  const list = panels.data ?? [];
  const placed = list.filter((p) => p.placed);
  const toPlace = list.filter((p) => !p.placed);
  const operator = user?.role === "operator";
  const router = useRouter();
  const selectedPanel = selected ? (list.find((p) => p.id === selected.id) ?? null) : null;

  const locate = () => {
    if (!site.data) return;
    setLocating(true);
    setPosition(null);
    setPlaceError(null);
    locatePhone(site.data)
      .then(setPosition)
      .catch((e: unknown) =>
        setPlaceError(e instanceof Error ? e.message : "Position introuvable, réessayez."),
      )
      .finally(() => setLocating(false));
  };

  const openPlacement = (panel: PanelSummary) => {
    setPlacing(panel);
    setName(panel.name === panel.code ? "" : panel.name);
    setPower("200");
    locate();
  };

  const confirmDelete = (panel: PanelSummary) => {
    Alert.alert(
      `Supprimer ${panel.code} ?`,
      "Ses mesures et ses alertes sont supprimées. S'il publie de nouveau, il réapparaîtra comme détecté.",
      [
        { text: "Annuler", style: "cancel" },
        {
          text: "Supprimer",
          style: "destructive",
          onPress: () =>
            remove.mutate(panel.id, {
              onError: (e) =>
                Alert.alert(
                  "Suppression impossible",
                  e instanceof DataSourceError ? e.message : "Réessayez plus tard.",
                ),
            }),
        },
      ],
    );
  };

  const confirmPlacement = () => {
    if (!placing || !position) return;
    const rated = Number(power);
    if (!Number.isInteger(rated) || rated <= 0) {
      setPlaceError("La puissance nominale doit être un nombre entier de watts.");
      return;
    }
    update.mutate(
      {
        panelId: placing.id,
        body: {
          latitude: position.latitude,
          longitude: position.longitude,
          ratedPowerW: rated,
          ...(name.trim() ? { name: name.trim() } : {}),
        },
      },
      {
        onSuccess: () => setPlacing(null),
        onError: (e) =>
          setPlaceError(
            e instanceof DataSourceError ? e.message : "Le panneau n'a pas pu être placé.",
          ),
      },
    );
  };

  return (
    <Screen
      title="Carte"
      refreshable
      subtitle={
        list.length
          ? `${list.length} panneaux${toPlace.length ? ` dont ${toPlace.length} à positionner` : ""}`
          : "Parc solaire"
      }
      headerBelow={
        <Segmented
          accessibilityLabel="Affichage"
          value={view}
          onChange={setView}
          options={[
            { value: "map", label: "Carte" },
            { value: "list", label: "Liste" },
          ]}
        />
      }
      overlay={
        <BottomSheet
          visible={!!placing}
          title={`Placer ${placing?.code ?? ""} ici ?`}
          onClose={() => setPlacing(null)}
        >
          <View style={{ gap: spacing[1] }}>
            <Text style={[typography.label, { color: colors.inkMuted }]}>
              {dataSource.kind === "mock"
                ? "Position du téléphone (simulée en démonstration)"
                : "Position du téléphone"}
            </Text>
            <Text style={[typography.value, { color: colors.ink }]}>
              {position
                ? `${position.latitude.toFixed(5).replace(".", ",")} · ${position.longitude
                    .toFixed(5)
                    .replace(".", ",")} (± ${position.accuracy} m)`
                : locating
                  ? "Recherche de la position…"
                  : "Position indisponible"}
            </Text>
            {!position && !locating ? (
              <Button label="Réessayer" variant="secondary" icon="MapPin" onPress={locate} />
            ) : null}
          </View>
          {placeError ? <Banner tone="critical" title={placeError} /> : null}
          <TextField
            label="Nom"
            value={name}
            onChangeText={setName}
            placeholder="Rangée E, panneau 21"
          />
          <TextField
            label="Puissance nominale (W)"
            value={power}
            onChangeText={setPower}
            keyboardType="number-pad"
          />
          <View style={styles.row}>
            <View style={styles.flex}>
              <Button label="Annuler" variant="secondary" onPress={() => setPlacing(null)} />
            </View>
            <View style={styles.flex}>
              <Button
                label={update.isPending ? "Placement…" : "Placer"}
                disabled={update.isPending || !position}
                onPress={confirmPlacement}
              />
            </View>
          </View>
        </BottomSheet>
      }
    >
      <OfflineBanner />
      {operator ? (
        <Button
          label="Ajouter un panneau"
          icon="MapPin"
          variant="secondary"
          onPress={() => router.push("/panel/new")}
          accessibilityHint="Scanne le QR code d'un nouveau panneau et l'enregistre à la position du téléphone"
        />
      ) : null}
      {panels.isError ? (
        <Banner tone="critical" title="Panneaux indisponibles" text={panels.error?.message} />
      ) : null}
      {view === "map" ? (
        <>
          {placed.length ? (
            <ParkPlan
              panels={placed}
              selectedId={selectedPanel?.id ?? null}
              onSelect={setSelected}
            />
          ) : (
            <View style={[styles.empty, { backgroundColor: colors.mapGround }]} />
          )}
          <Legend panels={list} />
          {selectedPanel ? (
            <SelectedPanel panel={selectedPanel} />
          ) : (
            <Text style={[typography.label, { color: colors.inkMuted }]}>
              Touchez un panneau pour afficher sa production.
            </Text>
          )}
        </>
      ) : (
        <>
          {toPlace.length ? (
            <View style={{ gap: spacing[2] }}>
              <SectionTitle>{`Panneaux à positionner (${toPlace.length})`}</SectionTitle>
              {toPlace.map((panel) => (
                <Card
                  key={panel.id}
                  style={{ borderWidth: 1, borderStyle: "dashed", borderColor: colors.lineStrong }}
                >
                  <View style={[styles.row, styles.between]}>
                    <View style={styles.detected}>
                      <Text style={[typography.bodyBold, { color: colors.ink }]}>{panel.code}</Text>
                      <Text style={[typography.label, { color: colors.inkMuted }]}>
                        {`Détecté automatiquement · ${formatPower(DEFAULT_PANEL_RATED_POWER_W)} par défaut`}
                      </Text>
                    </View>
                    <Text style={[typography.value, styles.detectedPower, { color: colors.ink }]}>
                      {panel.latestProduction !== null ? formatPower(panel.latestProduction) : "—"}
                    </Text>
                  </View>
                  {operator ? (
                    <>
                      <Text style={[typography.label, { color: colors.ink }]}>
                        Placez-vous devant le panneau : sa position sera celle du téléphone.
                      </Text>
                      <View style={styles.row}>
                        <View style={styles.flex}>
                          <Button
                            label="Supprimer"
                            variant="secondary"
                            onPress={() => confirmDelete(panel)}
                          />
                        </View>
                        <View style={styles.flex}>
                          <Button
                            label="Placer ici"
                            icon="MapPin"
                            onPress={() => openPlacement(panel)}
                          />
                        </View>
                      </View>
                    </>
                  ) : (
                    <Text style={[typography.label, { color: colors.inkMuted }]}>
                      Le positionnement est réservé aux exploitants.
                    </Text>
                  )}
                </Card>
              ))}
            </View>
          ) : null}
          <View style={{ gap: spacing[2] }}>
            <SectionTitle>{`Tous les panneaux (${placed.length})`}</SectionTitle>
            <View style={[styles.list, { backgroundColor: colors.surfaceRaised }]}>
              {placed.map((panel) => (
                <PanelRow key={panel.id} panel={panel} />
              ))}
            </View>
          </View>
        </>
      )}
    </Screen>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: "row", alignItems: "center", gap: spacing[3] },
  between: { justifyContent: "space-between" },
  flex: { flex: 1 },
  detected: { flex: 1, minWidth: 0, gap: spacing[1] },
  detectedPower: { flexShrink: 0 },
  legend: { flexDirection: "row", flexWrap: "wrap", gap: spacing[3] },
  legendItem: { flexDirection: "row", alignItems: "center", gap: 6 },
  empty: { height: 360, borderRadius: radius.lg },
  list: { borderRadius: radius.md, overflow: "hidden" },
  listRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing[3],
    minHeight: sizes.touchTarget + 8,
    paddingHorizontal: spacing[4],
    paddingVertical: spacing[2],
    borderBottomWidth: 1,
  },
  prod: { width: 72, textAlign: "right" },
});
