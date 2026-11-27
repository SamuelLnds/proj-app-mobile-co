import type { PanelSummary } from "@solar/contracts";
import {
  Component,
  lazy,
  Suspense,
  useMemo,
  useState,
  type ComponentType,
  type ReactNode,
} from "react";
import { StyleSheet, Text, View } from "react-native";

import { radius, spacing, typography, useTheme } from "../theme";
import { parkScene } from "../utils/park-layout";
import type { Park3DSceneProps } from "./Park3DScene";

/**
 * Chargement de la scène three.js, remplaçable dans les tests : elle importe expo-gl, module
 * natif absent des versions de l'app construites avant #58, et ne doit pas faire planter l'app.
 */
export const park3dLoader = {
  load: (): Promise<{ default: ComponentType<Park3DSceneProps> }> => import("./Park3DScene"),
};

/** Hauteur de la vue 3D (px). */
const VIEW_HEIGHT = 360;

class SceneBoundary extends Component<
  { fallback: ReactNode; children: ReactNode },
  { failed: boolean }
> {
  state = { failed: false };
  static getDerivedStateFromError() {
    return { failed: true };
  }
  render() {
    return this.state.failed ? this.props.fallback : this.props.children;
  }
}

type Park3DProps = {
  panels: PanelSummary[];
  selectedId: string | null;
  onSelect: (panel: PanelSummary) => void;
};

/**
 * Vue 3D du parc (bonus #58, D013) : les panneaux positionnés, colorés selon leur statut ;
 * toucher un panneau le sélectionne. Elle n'apporte aucune information de plus que le plan et la
 * liste : le lecteur d'écran est renvoyé vers la vue Liste.
 */
export function Park3D({ panels, selectedId, onSelect }: Park3DProps) {
  const { colors } = useTheme();
  // Un composant chargé à la demande par affichage : un échec n'est pas gardé pour la suite
  // (le module lui-même reste en cache une fois chargé).
  const [Scene] = useState(() => lazy(() => park3dLoader.load()));
  const scene = useMemo(() => parkScene(panels), [panels]);
  const counts = {
    alert: scene.panels.filter((p) => p.status === "alert").length,
    noData: scene.panels.filter((p) => p.status === "no_data").length,
  };
  const summary =
    `Vue 3D du parc : ${scene.panels.length} panneaux, dont ${counts.alert} en alerte et ` +
    `${counts.noData} sans données. Les mêmes informations sont dans la vue Liste.`;
  const message = (text: string) => (
    <View style={[styles.message, { backgroundColor: colors.mapGround }]}>
      <Text style={[typography.body, { color: colors.ink }]}>{text}</Text>
    </View>
  );

  return (
    <View
      accessible
      accessibilityLabel={summary}
      style={[styles.view, { backgroundColor: colors.mapGround }]}
      testID="park-3d"
    >
      <SceneBoundary
        fallback={message(
          "La vue 3D n'est pas disponible dans cette version de l'app. Les mêmes informations sont dans les vues Plan et Liste.",
        )}
      >
        <Suspense fallback={message("Chargement de la vue 3D…")}>
          <Scene
            scene={scene}
            colors={colors}
            selectedId={selectedId}
            onSelect={(id) => {
              const panel = panels.find((p) => p.id === id);
              if (panel) onSelect(panel);
            }}
          />
        </Suspense>
      </SceneBoundary>
    </View>
  );
}

const styles = StyleSheet.create({
  view: { height: VIEW_HEIGHT, borderRadius: radius.lg, overflow: "hidden" },
  message: { flex: 1, alignItems: "center", justifyContent: "center", padding: spacing[4] },
});
