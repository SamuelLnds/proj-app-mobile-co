import { useEffect, useRef, useState } from "react";
import {
  StyleSheet,
  Text,
  View,
  type GestureResponderEvent,
  type LayoutChangeEvent,
} from "react-native";
import Svg, { Circle, Line, Path, Text as SvgText } from "react-native-svg";

import { fontFamilies, radius, spacing, typography, useTheme } from "../theme";
import {
  bubbleLeft,
  formatAxisTime,
  formatTooltipTime,
  isVerticalGesture,
  nearestPointIndex,
  timeAtPosition,
  type ChartPeriod,
} from "../utils/chart";

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
  /** Période affichée : détermine les graduations de l'axe du temps (24 h par défaut). */
  period?: ChartPeriod;
  height?: number;
};

const AXIS_WIDTH = 44;
const BOTTOM = 22;
const BUBBLE_WIDTH = 156;
/** Durée d'affichage de la sélection après le relâchement du doigt. */
const SELECTION_HOLD_MS = 1500;

/** Courbe simple dessinée en SVG : grille légère, aire, point final mis en valeur (D025). */
export function LineChart({
  series,
  expected,
  formatValue,
  accessibilityLabel,
  period = "24h",
  height = 150,
}: LineChartProps) {
  const { colors } = useTheme();
  const [width, setWidth] = useState(0);
  const [selected, setSelected] = useState<number | null>(null);
  const holdTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const gestureStart = useRef<{ x: number; y: number; vertical: boolean } | null>(null);
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
  const timeLabels = [0, 0.5, 1].map((f) => formatAxisTime(t0 + f * (t1 - t0), period));

  const clearHold = () => {
    if (holdTimer.current) clearTimeout(holdTimer.current);
    holdTimer.current = null;
  };
  useEffect(() => clearHold, []);

  // Lecture au toucher : le point de la courbe réelle le plus proche du doigt.
  const select = (touchX: number) => {
    const target = timeAtPosition(touchX, AXIS_WIDTH, plotW, t0, t1);
    const index = nearestPointIndex(
      series.map((p) => new Date(p.time).getTime()),
      target,
    );
    setSelected(index >= 0 ? index : null);
  };
  const onGrant = (e: GestureResponderEvent) => {
    clearHold();
    gestureStart.current = { x: e.nativeEvent.pageX, y: e.nativeEvent.pageY, vertical: false };
    select(e.nativeEvent.locationX);
  };
  const onMove = (e: GestureResponderEvent) => {
    const start = gestureStart.current;
    if (!start || start.vertical) return;
    // Geste plutôt vertical : on abandonne la lecture, l'écran peut défiler.
    if (isVerticalGesture(e.nativeEvent.pageX - start.x, e.nativeEvent.pageY - start.y)) {
      start.vertical = true;
      setSelected(null);
      return;
    }
    select(e.nativeEvent.locationX);
  };
  const onRelease = () => {
    clearHold();
    holdTimer.current = setTimeout(() => setSelected(null), SELECTION_HOLD_MS);
  };
  const onTerminate = () => {
    clearHold();
    setSelected(null);
  };

  const point = selected !== null ? series[selected] : undefined;
  const expectedIndex =
    point && expected && expected.length > 0
      ? nearestPointIndex(
          expected.map((p) => new Date(p.time).getTime()),
          new Date(point.time).getTime(),
        )
      : -1;
  const expectedPoint = expectedIndex >= 0 ? expected![expectedIndex] : undefined;

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
          {point ? (
            <Line
              x1={x(point.time)}
              x2={x(point.time)}
              y1={6}
              y2={6 + plotH}
              stroke={colors.lineStrong}
              strokeWidth={1.5}
            />
          ) : null}
          <Circle cx={x(last!.time)} cy={y(last!.value)} r={4} fill={colors.ink} />
          {point ? (
            <Circle
              cx={x(point.time)}
              cy={y(point.value)}
              r={6}
              fill={colors.ink}
              stroke={colors.surface}
              strokeWidth={2}
            />
          ) : null}
          {timeLabels.map((label, i) => (
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
      {width > 0 && series.length > 1 ? (
        <View
          testID="chart-touch-area"
          style={[styles.touchArea, { width, height }]}
          onStartShouldSetResponder={() => true}
          onResponderGrant={onGrant}
          onResponderMove={onMove}
          onResponderRelease={onRelease}
          onResponderTerminationRequest={() => true}
          onResponderTerminate={onTerminate}
        />
      ) : null}
      {point ? (
        <View
          testID="chart-bubble"
          pointerEvents="none"
          style={[
            styles.bubble,
            {
              left: bubbleLeft(x(point.time), BUBBLE_WIDTH, width),
              width: BUBBLE_WIDTH,
              backgroundColor: colors.surfaceRaised,
              borderColor: colors.lineStrong,
            },
          ]}
        >
          <Text style={[typography.caption, { color: colors.ink }]}>
            {formatTooltipTime(point.time, period)}
          </Text>
          <Text style={[typography.caption, { color: colors.ink }]}>
            {`Réelle : ${formatValue(point.value)}`}
          </Text>
          {expectedPoint ? (
            <Text style={[typography.caption, { color: colors.ink }]}>
              {`Attendue : ${formatValue(expectedPoint.value)}`}
            </Text>
          ) : null}
        </View>
      ) : null}
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
  touchArea: { position: "absolute", top: 0, left: 0 },
  bubble: {
    position: "absolute",
    top: 0,
    borderWidth: 1,
    borderRadius: radius.sm,
    paddingHorizontal: spacing[2],
    paddingVertical: spacing[1],
  },
  legend: { flexDirection: "row", gap: spacing[4], marginTop: spacing[2] },
  legendItem: { flexDirection: "row", alignItems: "center", gap: 6 },
  swatch: { width: 16, height: 3 },
  dashed: { width: 16, borderTopWidth: 2, borderStyle: "dashed" },
});
