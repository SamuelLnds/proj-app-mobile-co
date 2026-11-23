import { Redirect, useRouter } from "expo-router";
import { useState } from "react";
import {
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

import { useAuth } from "../src/auth/AuthProvider";
import { Banner, Button, TextField } from "../src/components";
import {
  dataSource,
  DataSourceError,
  MOCK_SCENARIOS,
  MockDataSource,
  type MockScenario,
} from "../src/data";
import { Icon, radius, spacing, typography, useTheme } from "../src/theme";

/** Marque de l'app : les trois flux de la charte (soleil, batterie, réseau). */
function BrandMark() {
  const { colors } = useTheme();
  return (
    <View
      style={styles.mark}
      accessibilityElementsHidden
      importantForAccessibility="no-hide-descendants"
    >
      <View style={[styles.markSun, { backgroundColor: colors.sun }]} />
      <View style={styles.markGrid}>
        <View style={[styles.markCell, { backgroundColor: colors.primary }]} />
        <View style={[styles.markCell, { backgroundColor: colors.primary }]} />
        <View style={[styles.markCell, { backgroundColor: colors.grid }]} />
        <View style={[styles.markCell, { backgroundColor: colors.grid }]} />
      </View>
    </View>
  );
}

/** Choix du scénario de démonstration, visible seulement avec la source `mock`. */
function ScenarioPicker() {
  const { colors } = useTheme();
  const mock = dataSource instanceof MockDataSource ? dataSource : null;
  const [scenario, setScenario] = useState<MockScenario | null>(mock?.scenario ?? null);
  if (!mock) return null;
  return (
    <View style={[styles.scenarios, { borderColor: colors.line }]}>
      <Text style={[typography.labelBold, { color: colors.ink }]}>
        Démonstration : données d'exemple
      </Text>
      <View accessibilityRole="radiogroup" accessibilityLabel="Scénario de démonstration">
        {MOCK_SCENARIOS.map((s) => {
          const selected = s.value === scenario;
          return (
            <Pressable
              key={s.value}
              accessibilityRole="radio"
              accessibilityState={{ selected }}
              onPress={() => {
                mock.reset(s.value);
                setScenario(s.value);
              }}
              style={styles.scenario}
            >
              <View
                style={[
                  styles.radio,
                  { borderColor: selected ? colors.primary : colors.lineStrong },
                ]}
              >
                {selected ? (
                  <View style={[styles.radioDot, { backgroundColor: colors.primary }]} />
                ) : null}
              </View>
              <Text style={[typography.label, { color: colors.ink }]}>{s.label}</Text>
            </Pressable>
          );
        })}
      </View>
      <Text style={[typography.caption, { color: colors.inkMuted }]}>
        Comptes : operator@demo.local (exploitant) ou viewer@demo.local (lecteur), mot de passe «
        demo ».
      </Text>
    </View>
  );
}

export default function LoginScreen() {
  const { colors } = useTheme();
  const { user, login } = useAuth();
  const router = useRouter();
  const [email, setEmail] = useState("operator@demo.local");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  if (user) return <Redirect href="/" />;

  const submit = async () => {
    setError(null);
    setSubmitting(true);
    try {
      await login({ email, password });
      router.replace("/");
    } catch (e) {
      setError(
        e instanceof DataSourceError
          ? e.message
          : "Connexion impossible. Réessayez dans un instant.",
      );
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <SafeAreaView style={[styles.root, { backgroundColor: colors.surface }]}>
      <KeyboardAvoidingView
        style={styles.root}
        behavior={Platform.OS === "ios" ? "padding" : undefined}
      >
        <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
          <View style={styles.brand}>
            <BrandMark />
            <Text style={[styles.appName, { color: colors.ink }]}>Parc Solaire</Text>
            <Text style={[typography.body, { color: colors.inkMuted }]}>
              Supervision et pilotage du parc de démonstration.
            </Text>
          </View>

          <View style={styles.form}>
            <Text accessibilityRole="header" style={[typography.title, { color: colors.ink }]}>
              Se connecter
            </Text>
            {error ? <Banner tone="critical" title={error} /> : null}
            <TextField
              label="E-mail"
              value={email}
              onChangeText={setEmail}
              autoCapitalize="none"
              autoComplete="email"
              keyboardType="email-address"
              invalid={!!error}
            />
            <TextField
              label="Mot de passe"
              value={password}
              onChangeText={setPassword}
              secureTextEntry
              autoComplete="current-password"
              invalid={!!error}
              onSubmitEditing={submit}
            />
            <Button
              label={submitting ? "Connexion…" : "Se connecter"}
              onPress={submit}
              disabled={submitting}
            />
            <View style={styles.hint}>
              <Icon name="Info" color={colors.inkMuted} size={16} />
              <Text style={[typography.caption, { color: colors.inkMuted, flex: 1 }]}>
                Les comptes sont créés par l'équipe du projet. Contactez-la en cas d'oubli du mot de
                passe.
              </Text>
            </View>
          </View>

          <ScenarioPicker />
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  content: { padding: spacing[6], paddingTop: spacing[8] * 2, gap: spacing[8] },
  brand: { gap: spacing[3] },
  appName: { ...typography.title, fontSize: 40, lineHeight: 42 },
  mark: { flexDirection: "row", gap: 6 },
  markSun: { width: 28, height: 40, borderRadius: radius.sm },
  markGrid: { width: 30, height: 40, flexDirection: "row", flexWrap: "wrap", gap: 4 },
  markCell: { width: 12, height: 18, borderRadius: 3 },
  form: { gap: spacing[4] },
  hint: { flexDirection: "row", gap: spacing[2] },
  scenarios: { borderTopWidth: 1, paddingTop: spacing[4], gap: spacing[2] },
  scenario: { flexDirection: "row", alignItems: "center", gap: spacing[3], minHeight: 44 },
  radio: {
    width: 22,
    height: 22,
    borderRadius: 11,
    borderWidth: 2,
    alignItems: "center",
    justifyContent: "center",
  },
  radioDot: { width: 10, height: 10, borderRadius: 5 },
});
