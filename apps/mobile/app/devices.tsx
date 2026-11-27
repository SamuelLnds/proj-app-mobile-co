import {
  DEVICE_CERT_DEFAULT_TTL_H,
  DEVICE_CERT_MAX_TTL_H,
  type Enrollment,
} from "@solar/contracts";
import { useRouter } from "expo-router";
import { useState } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";

import {
  useAcceptEnrollment,
  useConnectivity,
  useEnrollments,
  useRejectEnrollment,
  useRevokeEnrollment,
} from "../src/api";
import { useAuth } from "../src/auth/AuthProvider";
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
} from "../src/components";
import { DataSourceError } from "../src/data";
import { Icon, radius, spacing, typography, useTheme } from "../src/theme";
import {
  fingerprintLines,
  formatDateTime,
  formatTime,
  speakFingerprint,
} from "../src/utils/format";

/** Durées proposées pour le certificat (h) : journée de travail (défaut), journée, semaine (maximum). */
const TTL_OPTIONS = [
  { hours: DEVICE_CERT_DEFAULT_TTL_H, label: `${DEVICE_CERT_DEFAULT_TTL_H} h` },
  { hours: 24, label: "24 h" },
  { hours: DEVICE_CERT_MAX_TTL_H, label: "1 semaine" },
].map(({ hours, label }) => ({ value: String(hours), label }));

/** Empreinte complète, 4 groupes par ligne, épelée par le lecteur d'écran. */
function Fingerprint({ value }: { value: string }) {
  const { colors } = useTheme();
  return (
    <View
      accessible
      accessibilityLabel={`Empreinte de la clé : ${speakFingerprint(value)}`}
      style={[styles.fingerprint, { backgroundColor: colors.surfaceSunken }]}
    >
      {fingerprintLines(value).map((line) => (
        <Text key={line} style={[typography.value, { color: colors.ink }]}>
          {line}
        </Text>
      ))}
    </View>
  );
}

function PendingCard({
  enrollment,
  disabled,
  onAccept,
  onReject,
}: {
  enrollment: Enrollment;
  disabled: boolean;
  onAccept: () => void;
  onReject: () => void;
}) {
  const { colors } = useTheme();
  return (
    <Card>
      <View style={styles.titleRow}>
        <Text style={[typography.bodyBold, { color: colors.ink }]}>{enrollment.deviceName}</Text>
        <StatusChip tone="warning" label="En attente" icon="Clock" />
      </View>
      <Text style={[typography.label, { color: colors.inkMuted }]}>
        Demande reçue à {formatTime(enrollment.requestedAt)} · expire à{" "}
        {formatTime(enrollment.pendingExpiresAt)}
      </Text>
      <Text style={[typography.labelBold, { color: colors.ink }]}>Empreinte de la clé</Text>
      <Fingerprint value={enrollment.fingerprint} />
      <Text style={[typography.label, { color: colors.inkMuted }]}>
        Comparez-la caractère par caractère avec l'empreinte affichée sur le moniteur série de
        l'objet. Acceptez seulement si elles sont identiques.
      </Text>
      <View style={styles.row}>
        <View style={styles.flex}>
          <Button label="Refuser" variant="secondary" disabled={disabled} onPress={onReject} />
        </View>
        <View style={styles.flex}>
          <Button
            label="Accepter"
            disabled={disabled}
            onPress={onAccept}
            accessibilityHint="Ouvre la confirmation, qui rappelle de comparer l'empreinte"
          />
        </View>
      </View>
    </Card>
  );
}

function ActiveCard({
  enrollment,
  disabled,
  onRevoke,
}: {
  enrollment: Enrollment;
  disabled: boolean;
  onRevoke: () => void;
}) {
  const { colors } = useTheme();
  return (
    <Card>
      <View style={styles.titleRow}>
        <Text style={[typography.bodyBold, { color: colors.ink }]}>{enrollment.deviceName}</Text>
        <StatusChip tone="normal" label="Certificat actif" />
      </View>
      <Text style={[typography.label, { color: colors.inkMuted }]}>
        Valable jusqu'au {formatDateTime(enrollment.certificateExpiresAt!)}
        {enrollment.decidedBy ? ` · accepté par ${enrollment.decidedBy.name}` : ""}
      </Text>
      <Fingerprint value={enrollment.fingerprint} />
      <Button
        label="Révoquer"
        variant="secondary"
        disabled={disabled}
        onPress={onRevoke}
        accessibilityHint="Ouvre la confirmation de la révocation"
      />
    </Card>
  );
}

export default function DevicesScreen() {
  const { colors } = useTheme();
  const router = useRouter();
  const { user } = useAuth();
  const { online } = useConnectivity();
  const operator = user?.role === "operator";
  const enrollments = useEnrollments({ enabled: operator });
  const accept = useAcceptEnrollment();
  const reject = useRejectEnrollment();
  const revoke = useRevokeEnrollment();
  const [accepting, setAccepting] = useState<Enrollment | null>(null);
  const [ttl, setTtl] = useState(String(DEVICE_CERT_DEFAULT_TTL_H));
  const [revoking, setRevoking] = useState<Enrollment | null>(null);
  const [failure, setFailure] = useState<DataSourceError | Error | null>(null);

  const items = enrollments.data?.items ?? [];
  const pending = items.filter((e) => e.status === "pending");
  const active = items.filter((e) => e.status === "active");
  const busy = accept.isPending || reject.isPending || revoke.isPending;
  const disabled = !online || busy;

  const run = (action: Promise<unknown>) => {
    setFailure(null);
    action.catch((error: Error) => setFailure(error));
  };
  const confirmAccept = () => {
    if (!accepting) return;
    run(accept.mutateAsync({ id: accepting.id, body: { ttlHours: Number(ttl) } }));
    setAccepting(null);
  };
  const confirmRevoke = () => {
    if (!revoking) return;
    run(revoke.mutateAsync(revoking.id));
    setRevoking(null);
  };
  // La décision est enregistrée, seul le rechargement du broker a échoué (D035).
  const brokerLate = failure instanceof DataSourceError && failure.code === "BROKER_UNAVAILABLE";

  const back = (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel="Retour à la supervision"
      onPress={() => (router.canGoBack() ? router.back() : router.replace("/"))}
      style={styles.back}
    >
      <Icon name="CaretLeft" color={colors.primary} size={22} />
      <Text style={[typography.bodyBold, { color: colors.primary }]}>Supervision</Text>
    </Pressable>
  );

  return (
    <Screen
      title="Objets"
      subtitle="Certificats des objets du site"
      headerBelow={back}
      refreshable={operator}
      overlay={
        <>
          <BottomSheet
            visible={accepting !== null}
            title={`Accepter ${accepting?.deviceName ?? ""} ?`}
            onClose={() => setAccepting(null)}
          >
            <Text style={[typography.body, { color: colors.ink }]}>
              Acceptez seulement si cette empreinte est identique à celle du moniteur série de
              l'objet.
            </Text>
            {accepting ? <Fingerprint value={accepting.fingerprint} /> : null}
            <Text style={[typography.labelBold, { color: colors.ink }]}>Durée du certificat</Text>
            <Segmented
              options={TTL_OPTIONS}
              value={ttl}
              onChange={setTtl}
              accessibilityLabel="Durée du certificat"
            />
            <Text style={[typography.label, { color: colors.inkMuted }]}>
              L'objet pourra se connecter au broker jusqu'à la fin du certificat. S'il avait déjà un
              certificat actif, celui-ci est révoqué.
            </Text>
            <View style={styles.row}>
              <View style={styles.flex}>
                <Button label="Annuler" variant="secondary" onPress={() => setAccepting(null)} />
              </View>
              <View style={styles.flex}>
                <Button label="Accepter" onPress={confirmAccept} />
              </View>
            </View>
          </BottomSheet>
          <BottomSheet
            visible={revoking !== null}
            title={`Révoquer ${revoking?.deviceName ?? ""} ?`}
            onClose={() => setRevoking(null)}
          >
            <Text style={[typography.body, { color: colors.ink }]}>
              L'objet perd aussitôt ses droits sur le broker et ne pourra plus se reconnecter avec
              ce certificat. C'est définitif : pour revenir, il devra refaire une demande.
            </Text>
            <View style={styles.row}>
              <View style={styles.flex}>
                <Button label="Annuler" variant="secondary" onPress={() => setRevoking(null)} />
              </View>
              <View style={styles.flex}>
                <Button label="Révoquer" onPress={confirmRevoke} />
              </View>
            </View>
          </BottomSheet>
        </>
      }
    >
      {!operator ? (
        <Banner
          tone="neutral"
          icon="Lock"
          title="Réservé aux exploitants"
          text="Seul un exploitant peut accepter, refuser ou révoquer un objet."
        />
      ) : (
        <>
          <OfflineBanner text="Les décisions reprendront au retour du réseau." />
          {failure ? (
            <Banner
              tone={brokerLate ? "warning" : "critical"}
              title={brokerLate ? "Décision enregistrée" : "Action impossible"}
              text={failure.message}
            />
          ) : null}
          {enrollments.isError && !enrollments.data ? (
            <Banner
              tone="critical"
              title="Objets indisponibles"
              text={`${enrollments.error.message} Tirez vers le bas pour réessayer.`}
            />
          ) : !enrollments.data ? (
            <Text style={[typography.body, { color: colors.inkMuted }]}>
              Chargement des objets…
            </Text>
          ) : (
            <>
              <SectionTitle>Demandes en attente</SectionTitle>
              {pending.length === 0 ? (
                <Text style={[typography.body, { color: colors.inkMuted }]}>
                  Aucune demande en attente. Un objet qui démarre sans certificat apparaît ici.
                </Text>
              ) : (
                pending.map((enrollment) => (
                  <PendingCard
                    key={enrollment.id}
                    enrollment={enrollment}
                    disabled={disabled}
                    onAccept={() => {
                      setTtl(String(DEVICE_CERT_DEFAULT_TTL_H));
                      setAccepting(enrollment);
                    }}
                    onReject={() => run(reject.mutateAsync(enrollment.id))}
                  />
                ))
              )}
              <SectionTitle>Objets actifs</SectionTitle>
              {active.length === 0 ? (
                <Text style={[typography.body, { color: colors.inkMuted }]}>
                  Aucun objet n'a de certificat actif : aucun ne peut se connecter au broker.
                </Text>
              ) : (
                active.map((enrollment) => (
                  <ActiveCard
                    key={enrollment.id}
                    enrollment={enrollment}
                    disabled={disabled}
                    onRevoke={() => setRevoking(enrollment)}
                  />
                ))
              )}
            </>
          )}
        </>
      )}
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
  titleRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: spacing[2],
    flexWrap: "wrap",
  },
  fingerprint: { borderRadius: radius.sm, padding: spacing[3], gap: 2 },
  row: { flexDirection: "row", gap: spacing[3] },
  flex: { flex: 1 },
});
