import { DEFAULT_PANEL_RATED_POWER_W } from "@solar/contracts";
import { useRouter } from "expo-router";
import { useEffect, useState, type ComponentType } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";

import { useConnectivity, useCreatePanel, useCurrentSiteId, useSite } from "../../src/api";
import { useAuth } from "../../src/auth/AuthProvider";
import {
  Banner,
  Button,
  Card,
  OfflineBanner,
  Screen,
  SectionTitle,
  StatusChip,
  TextField,
} from "../../src/components";
import { dataSource } from "../../src/data";
import { Icon, radius, spacing, typography, useTheme } from "../../src/theme";
import { locatePhone, LocationRefusedError, type Position } from "../../src/utils/location";
import { parsePanelQr } from "../../src/utils/panel-qr";

/** Ce que l'écran utilise de expo-camera (chargé à la demande : module natif). */
export type CameraModule = {
  Camera: { requestCameraPermissionsAsync: () => Promise<{ granted: boolean }> };
  CameraView: ComponentType<{
    style?: object;
    facing?: "back" | "front";
    barcodeScannerSettings?: { barcodeTypes: string[] };
    onBarcodeScanned?: (result: { data: string }) => void;
  }>;
};

/** Chargement de expo-camera, remplaçable dans les tests (pas d'import dynamique avec jest). */
export const cameraLoader = {
  load: (): Promise<CameraModule> => import("expo-camera") as unknown as Promise<CameraModule>,
};

type CameraState = "loading" | "ready" | "refused" | "unavailable";

const formatCoordinate = (value: number) => value.toFixed(5).replace(".", ",");
const parseNumber = (text: string) => {
  const value = Number(text.trim().replace(",", "."));
  return text.trim() !== "" && Number.isFinite(value) ? value : null;
};

/**
 * Ajout d'un panneau sur le terrain (UC18, bonus #63, charte « Ajout d'un panneau ») : code lu
 * dans le QR code du panneau ou saisi, position du téléphone ou saisie, puissance nominale.
 */
export default function NewPanelScreen() {
  const { colors } = useTheme();
  const router = useRouter();
  const { user } = useAuth();
  const { online } = useConnectivity();
  const operator = user?.role === "operator";
  const siteId = useCurrentSiteId();
  const site = useSite(siteId);
  const create = useCreatePanel(siteId);

  const [camera, setCamera] = useState<CameraModule | null>(null);
  const [cameraState, setCameraState] = useState<CameraState>("loading");
  const [code, setCode] = useState<string | null>(null);
  const [manualCode, setManualCode] = useState(false);
  const [codeText, setCodeText] = useState("");
  const [position, setPosition] = useState<Position | null>(null);
  const [locating, setLocating] = useState(false);
  const [locationRefused, setLocationRefused] = useState(false);
  const [locationError, setLocationError] = useState<string | null>(null);
  const [manualPosition, setManualPosition] = useState(false);
  const [latitudeText, setLatitudeText] = useState("");
  const [longitudeText, setLongitudeText] = useState("");
  const [name, setName] = useState("");
  const [powerText, setPowerText] = useState(String(DEFAULT_PANEL_RATED_POWER_W));
  const [failure, setFailure] = useState<string | null>(null);

  // Caméra : module natif chargé à la demande, puis autorisation. Sans elle, saisie à la main.
  useEffect(() => {
    if (!operator || dataSource.kind === "mock") {
      setCameraState("unavailable");
      setManualCode(true);
      return;
    }
    let cancelled = false;
    cameraLoader
      .load()
      .then(async (module) => {
        const { granted } = await module.Camera.requestCameraPermissionsAsync();
        if (cancelled) return;
        setCamera(module);
        setCameraState(granted ? "ready" : "refused");
        if (!granted) setManualCode(true);
      })
      .catch(() => {
        if (cancelled) return;
        setCameraState("unavailable");
        setManualCode(true);
      });
    return () => {
      cancelled = true;
    };
  }, [operator]);

  const typedCode = manualCode ? parsePanelQr(codeText) : null;
  const finalCode = code ?? typedCode;
  const typedPosition =
    manualPosition && parseNumber(latitudeText) !== null && parseNumber(longitudeText) !== null
      ? { latitude: parseNumber(latitudeText)!, longitude: parseNumber(longitudeText)! }
      : null;
  const finalPosition = position ?? typedPosition;
  const power = parseNumber(powerText);
  const powerValid = power !== null && Number.isInteger(power) && power > 0;
  const ready = !!finalCode && !!finalPosition && powerValid && !!siteId;

  const locate = () => {
    if (!site.data) return;
    setLocating(true);
    setLocationError(null);
    locatePhone(site.data)
      .then((found) => {
        setPosition(found);
        setManualPosition(false);
      })
      .catch((error: unknown) => {
        if (error instanceof LocationRefusedError) {
          setLocationRefused(true);
          setManualPosition(true);
        } else {
          setLocationError(
            error instanceof Error ? error.message : "Position introuvable, réessayez.",
          );
        }
      })
      .finally(() => setLocating(false));
  };

  const submit = () => {
    if (!ready) return;
    setFailure(null);
    create
      .mutateAsync({
        code: finalCode,
        latitude: finalPosition.latitude,
        longitude: finalPosition.longitude,
        ratedPowerW: power!,
        ...(name.trim() ? { name: name.trim() } : {}),
      })
      .then((panel) => router.replace(`/panel/${encodeURIComponent(panel.id)}` as never))
      .catch((error: Error) => setFailure(error.message));
  };

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

  if (!operator) {
    return (
      <Screen title="Ajouter un panneau" headerBelow={back}>
        <Banner
          tone="neutral"
          icon="Lock"
          title="Réservé aux exploitants"
          text="Seul un exploitant peut ajouter un panneau au parc."
        />
      </Screen>
    );
  }

  const CameraView = camera?.CameraView;
  return (
    <Screen title="Ajouter un panneau" subtitle={site.data?.name} headerBelow={back}>
      <OfflineBanner text="L'ajout reprendra au retour du réseau." />
      {failure ? <Banner tone="critical" title="Ajout impossible" text={failure} /> : null}

      <SectionTitle>1. Code du panneau</SectionTitle>
      <Card>
        {code ? (
          <View style={styles.row}>
            <Text style={[typography.metric, { color: colors.ink }]}>{code}</Text>
            <StatusChip tone="normal" label="Code lu" />
          </View>
        ) : cameraState === "ready" && CameraView && !manualCode ? (
          <>
            <View style={styles.camera}>
              <CameraView
                style={StyleSheet.absoluteFill}
                facing="back"
                barcodeScannerSettings={{ barcodeTypes: ["qr"] }}
                onBarcodeScanned={({ data }) => {
                  const scanned = parsePanelQr(data);
                  if (scanned) setCode(scanned);
                }}
              />
            </View>
            <Text style={[typography.label, { color: colors.inkMuted }]}>
              Visez le QR code collé sur le panneau.
            </Text>
          </>
        ) : null}
        {cameraState === "refused" ? (
          <Banner
            tone="neutral"
            title="Caméra non autorisée"
            text="La caméra sert à lire le QR code du panneau sans erreur de saisie. Vous pouvez saisir le code à la main, ou l'autoriser dans les réglages du téléphone."
          />
        ) : null}
        {manualCode && !code ? (
          <TextField
            label="Code du panneau"
            placeholder="P21"
            autoCapitalize="characters"
            value={codeText}
            onChangeText={setCodeText}
            invalid={codeText.trim() !== "" && !typedCode}
          />
        ) : null}
        {code ? (
          <Button label="Lire un autre code" variant="secondary" onPress={() => setCode(null)} />
        ) : !manualCode ? (
          <Button
            label="Saisir le code à la main"
            variant="secondary"
            onPress={() => setManualCode(true)}
          />
        ) : null}
      </Card>

      <SectionTitle>2. Position</SectionTitle>
      <Card>
        {position ? (
          <Text style={[typography.body, { color: colors.ink }]}>
            {`Position du téléphone : ${formatCoordinate(position.latitude)}, ${formatCoordinate(position.longitude)} (précision ${position.accuracy} m)`}
          </Text>
        ) : null}
        {locationRefused ? (
          <Banner
            tone="neutral"
            title="Localisation non autorisée"
            text="La position du téléphone place le panneau sur la carte. Vous pouvez saisir ses coordonnées, ou l'autoriser dans les réglages."
          />
        ) : null}
        {locationError ? (
          <Banner tone="warning" title="Position introuvable" text={locationError} />
        ) : null}
        {manualPosition && !position ? (
          <View style={styles.row}>
            <View style={styles.flex}>
              <TextField
                label="Latitude"
                keyboardType="numeric"
                value={latitudeText}
                onChangeText={setLatitudeText}
              />
            </View>
            <View style={styles.flex}>
              <TextField
                label="Longitude"
                keyboardType="numeric"
                value={longitudeText}
                onChangeText={setLongitudeText}
              />
            </View>
          </View>
        ) : null}
        <Button
          label={position ? "Reprendre ma position" : "Utiliser ma position"}
          icon="MapPin"
          variant={position ? "secondary" : "primary"}
          disabled={locating || !site.data}
          onPress={locate}
        />
        {!manualPosition && !position ? (
          <Button
            label="Saisir les coordonnées"
            variant="secondary"
            onPress={() => setManualPosition(true)}
          />
        ) : null}
      </Card>

      <SectionTitle>3. Description</SectionTitle>
      <Card>
        <TextField
          label="Nom (facultatif)"
          placeholder={finalCode ? `Panneau ${finalCode}` : "Panneau P21"}
          value={name}
          onChangeText={setName}
        />
        <TextField
          label="Puissance nominale (W)"
          keyboardType="numeric"
          value={powerText}
          onChangeText={setPowerText}
          invalid={!powerValid}
        />
      </Card>

      <Button
        label="Ajouter le panneau"
        disabled={!ready || !online || create.isPending}
        onPress={submit}
        accessibilityHint="Enregistre le panneau à cette position ; il apparaît ensuite sur la carte"
      />
    </Screen>
  );
}

const styles = StyleSheet.create({
  back: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing[1],
    minHeight: 48,
    alignSelf: "flex-start",
  },
  camera: { aspectRatio: 1, borderRadius: radius.md, overflow: "hidden" },
  row: { flexDirection: "row", alignItems: "center", gap: spacing[3], flexWrap: "wrap" },
  flex: { flex: 1 },
});
