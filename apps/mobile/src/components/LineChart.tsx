import { useState } from "react";
import { StyleSheet, Text, View, type LayoutChangeEvent } from "react-native";
import Svg, { Circle, Line, Path, Text as SvgText } from "react-native-svg";

import { fontFamilies, spacing, typography, useTheme } from "../theme";

export type ChartPoint = { time: string; value: number };

type LineChartProps = {
  /** Courbe réelle. */
  series: ChartPoint[];
  /** Courbe attendue, en pointillés (facultative). */
  expected?: ChartPoint[];
  /** Mise en forme d'une valeur de l'axe vertical. */
  formatValue: (value: number) => string;
  /** Résumé lu par le lecteur d'écran (valeur actuelle, maximum…). */
  accessibilityLabel: string;
  height?: number;
};

const AXIS_WIDTH = 44;
const BOTTOM = 22;

/** Courbe simple dessinée en SVG : grille légère, aire, point final mis en valeur (D025). */
export function LineChart({
  series,
  expected,
  formatValue,
  accessibilityLabel,
  height = 150,
}: LineChartProps) {
  const { colors } = useTheme();
  const [width, setWidth] = useState(0);
  const onLayout = (e: LayoutChangeEvent) => setWidth(e.nativeEvent.layout.width);

  const all = [...series, ...(expected ?? [])];
  const plotW = Math.max(0, width - AXIS_WIDTH);
  const plotH = height - BOTTOM - 6;
  const max = Math.max(1, ...all.map((p) => p.value)) * 1.1;
  const times = all.map((p) => new Date(p.time).getTime());
  const t0 = Math.min(...times);
  const t1 = Math.max(...times, t0 + 1);
  const x = (time: string) => AXIS_WIDTH + ((new Date(time).getTime() - t0) / (t1 - t0)) * plotW;
  const y = (value: number) => 6 + plotH - (value / max) * plotH;
  const toPath = (points: ChartPoint[]) =>
    points
      .map((p, i) => `${i === 0 ? "M" : "L"}${x(p.time).toFixed(1)} ${y(p.value).toFixed(1)}`)
      .join(" ");

  const last = series[series.length - 1];
  const ticks = [0, max / 2, max];
  const hourLabels = [0, 0.5, 1].map((f) => {
    const d = new Date(t0 + f * (t1 - t0));
    return `${d.getHours()} h`;
  });

  return (
    <View
      onLayout={onLayout}
      accessible
      accessibilityRole="image"
      accessibilityLabel={accessibilityLabel}
    >
      {width > 0 && series.length > 1 ? (
        <Svg width={width} height={height}>
          {ticks.map((v, i) => (
            <Line
              key={v}
              x1={AXIS_WIDTH}
              x2={width}
              y1={y(v)}
              y2={y(v)}
              stroke={i === 0 ? colors.lineStrong : colors.line}
              strokeWidth={1}
            />
          ))}
          {ticks.map((v) => (
            <SvgText
              key={`l${v}`}
              x={0}
              y={y(v) + 4}
              fill={colors.inkMuted}
              fontSize={11}
              fontFamily={fontFamilies.text}
            >
              {formatValue(v)}
            </SvgText>
          ))}
          {expected && expected.length > 1 ? (
            <Path
              d={toPath(expected)}
              stroke={colors.lineStrong}
              strokeWidth={2}
              strokeDasharray="5 4"
              fill="none"
            />
          ) : null}
          <Path
            d={`${toPath(series)} L${x(last!.time).toFixed(1)} ${y(0)} L${x(series[0]!.time).toFixed(1)} ${y(0)} Z`}
            fill={colors.sun}
            fillOpacity={0.22}
          />
          <Path d={toPath(series)} stroke={colors.sunStrong} strokeWidth={2.5} fill="none" />
          <Circle cx={x(last!.time)} cy={y(last!.value)} r={4} fill={colors.ink} />
          {hourLabels.map((label, i) => (
            <SvgText
              key={`h${i}`}
              x={AXIS_WIDTH + (i / 2) * plotW}
              y={height - 4}
              fill={colors.inkMuted}
              fontSize={11}
              fontFamily={fontFamilies.text}
              textAnchor={i === 0 ? "start" : i === 2 ? "end" : "middle"}
            >
              {label}
            </SvgText>
          ))}
        </Svg>
      ) : (
        <View style={{ height }} />
      )}
      <View style={styles.legend}>
        <View style={styles.legendItem}>
          <View style={[styles.swatch, { backgroundColor: colors.sunStrong }]} />
          <Text style={[typography.caption, { color: colors.inkMuted }]}>Réelle</Text>
        </View>
        {expected ? (
          <View style={styles.legendItem}>
            <View style={[styles.dashed, { borderColor: colors.lineStrong }]} />
            <Text style={[typography.caption, { color: colors.inkMuted }]}>Attendue</Text>
          </View>
        ) : null}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  legend: { flexDirection: "row", gap: spacing[4], marginTop: spacing[2] },
  legendItem: { flexDirection: "row", alignItems: "center", gap: 6 },
  swatch: { width: 16, height: 3 },
  dashed: { width: 16, borderTopWidth: 2, borderStyle: "dashed" },
});
