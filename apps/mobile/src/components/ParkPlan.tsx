import type { PanelStatus, PanelSummary } from "@solar/contracts";
import { useState } from "react";
import { Pressable, StyleSheet, Text, View, type LayoutChangeEvent } from "react-native";
import Svg, { Path, Rect } from "react-native-svg";

import { Icon, radius, typography, useTheme, type IconName } from "../theme";
import { toneColors, type Tone } from "./primitives";

export const PANEL_STATUS: Record<PanelStatus, { tone: Tone; label: string; icon: IconName }> = {
  normal: { tone: "normal", label: "Normal", icon: "CheckCircle" },
  alert: { tone: "warning", label: "Alerte", icon: "Warning" },
  no_data: { tone: "nodata", label: "Sans données", icon: "WifiSlash" },
};

const MARKER_W = 44;
const MARKER_H = 48;
const PAD = 36;

type ParkPlanProps = {
  panels: PanelSummary[];
  selectedId: string | null;
  onSelect: (panel: PanelSummary) => void;
  height?: number;
};

/**
 * Plan du parc vu du dessus (D025) : chaque panneau positionné est placé selon sa latitude
 * et sa longitude, avec la couleur, l'icône et le mot de son statut.
 */
export function ParkPlan({ panels, selectedId, onSelect, height = 360 }: ParkPlanProps) {
  const { colors } = useTheme();
  const [width, setWidth] = useState(0);
  const placed = panels.filter((p) => p.latitude !== null && p.longitude !== null);

  const lats = placed.map((p) => p.latitude!);
  const lngs = placed.map((p) => p.longitude!);
  const [minLat, maxLat] = [Math.min(...lats), Math.max(...lats)];
  const [minLng, maxLng] = [Math.min(...lngs), Math.max(...lngs)];
  const spanX = Math.max(maxLng - minLng, 1e-9);
  const spanY = Math.max(maxLat - minLat, 1e-9);
  const innerW = Math.max(0, width - 2 * PAD - MARKER_W);
  const innerH = height - 2 * PAD - MARKER_H;
  const x = (lng: number) => PAD + ((lng - minLng) / spanX) * innerW;
  const y = (lat: number) => PAD + ((maxLat - lat) / spanY) * innerH;

  return (
    <View
      onLayout={(e: LayoutChangeEvent) => setWidth(e.nativeEvent.layout.width)}
      style={[styles.plan, { height, backgroundColor: colors.mapGround }]}
    >
      {width > 0 ? (
        <Svg width={width} height={height} style={StyleSheet.absoluteFill}>
          <Path
            d={`M0 ${height - 60} C ${width * 0.25} ${height - 80}, ${width * 0.55} ${height - 30}, ${width} ${height - 70} L ${width} ${height} L 0 ${height} Z`}
            fill={colors.mapField}
          />
          <Rect x={14} y={0} width={10} height={height} fill={colors.mapPath} />
        </Svg>
      ) : null}
      {width > 0
        ? placed.map((panel) => {
            const status = PANEL_STATUS[panel.status];
            const t = toneColors(colors, status.tone);
            const selected = panel.id === selectedId;
            return (
              <Pressable
                key={panel.id}
                accessibilityRole="button"
                accessibilityLabel={`${panel.name} : ${status.label}`}
                accessibilityState={{ selected }}
                onPress={() => onSelect(panel)}
                style={[
                  styles.marker,
                  {
                    left: x(panel.longitude!),
                    top: y(panel.latitude!),
                    backgroundColor: panel.status === "no_data" ? colors.surfaceRaised : t.bg,
                    borderColor: selected ? colors.focus : t.fg,
                    borderWidth: selected ? 3 : 2,
                    borderStyle: panel.status === "no_data" ? "dashed" : "solid",
                  },
                ]}
              >
                <Icon name={status.icon} color={t.fg} size={16} />
                <Text style={[typography.caption, styles.code, { color: t.fg }]}>{panel.code}</Text>
              </Pressable>
            );
          })
        : null}
    </View>
  );
}

const styles = StyleSheet.create({
  plan: { borderRadius: radius.lg, overflow: "hidden" },
  marker: {
    position: "absolute",
    width: MARKER_W,
    height: MARKER_H,
    borderRadius: radius.sm,
    alignItems: "center",
    justifyContent: "center",
    gap: 2,
  },
  code: { fontSize: 11, lineHeight: 12, fontWeight: "700" },
});
