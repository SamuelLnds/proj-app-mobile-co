import { useState, type ReactNode } from "react";
import { RefreshControl, ScrollView, StyleSheet, Text, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

import { spacing, typography, useTheme } from "../theme";

type ScreenProps = {
  title: string;
  subtitle?: string;
  /** Action à droite du titre (par exemple la déconnexion). */
  headerRight?: ReactNode;
  /** Contenu placé sous le titre, hors défilement (bandeau hors ligne, sélecteur). */
  headerBelow?: ReactNode;
  children: ReactNode;
  scroll?: boolean;
  /**
   * Rafraîchissement demandé en tirant l'écran. L'indicateur ne s'affiche que pendant ce geste,
   * jamais pendant les rafraîchissements automatiques en arrière-plan.
   */
  onRefresh?: () => Promise<unknown>;
  /** Élément superposé (feuille du bas, dialogue). */
  overlay?: ReactNode;
};

/** Gabarit d'écran : marges de la charte, titre, défilement, tirer pour rafraîchir. */
export function Screen({
  title,
  subtitle,
  headerRight,
  headerBelow,
  children,
  scroll = true,
  onRefresh,
  overlay,
}: ScreenProps) {
  const { colors } = useTheme();
  const [pulling, setPulling] = useState(false);
  const refresh = () => {
    if (!onRefresh) return;
    setPulling(true);
    void onRefresh().finally(() => setPulling(false));
  };
  const content = <View style={styles.content}>{children}</View>;
  return (
    <SafeAreaView edges={["top"]} style={[styles.root, { backgroundColor: colors.surface }]}>
      <View style={styles.header}>
        <View style={styles.titles}>
          <Text accessibilityRole="header" style={[typography.title, { color: colors.ink }]}>
            {title}
          </Text>
          {subtitle ? (
            <Text style={[typography.label, { color: colors.inkMuted }]}>{subtitle}</Text>
          ) : null}
        </View>
        {headerRight}
      </View>
      {headerBelow ? <View style={styles.below}>{headerBelow}</View> : null}
      {scroll ? (
        <ScrollView
          contentContainerStyle={styles.scroll}
          refreshControl={
            onRefresh ? (
              <RefreshControl refreshing={pulling} onRefresh={refresh} tintColor={colors.primary} />
            ) : undefined
          }
        >
          {content}
        </ScrollView>
      ) : (
        <View style={[styles.flex, styles.scroll]}>{content}</View>
      )}
      {overlay}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  flex: { flex: 1 },
  header: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: spacing[2],
    paddingHorizontal: spacing[4],
    paddingTop: spacing[4],
    paddingBottom: spacing[2],
  },
  titles: { flex: 1, gap: 2 },
  below: { paddingHorizontal: spacing[4], paddingBottom: spacing[2], gap: spacing[2] },
  scroll: { paddingHorizontal: spacing[4], paddingTop: spacing[2], paddingBottom: spacing[6] },
  content: { gap: spacing[4], flexGrow: 1 },
});
