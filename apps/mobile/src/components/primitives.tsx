import type { ReactNode } from "react";
import { Pressable, StyleSheet, Text, View, type StyleProp, type ViewStyle } from "react-native";

import { Icon, radius, sizes, spacing, typography, useTheme, type IconName } from "../theme";
import type { ColorTokens } from "../theme";

/** Tonalité d'un état : chaque tonalité a une couleur, un fond clair et une icône (jamais la couleur seule). */
export type Tone = "normal" | "warning" | "critical" | "nodata" | "neutral";

export function toneColors(colors: ColorTokens, tone: Tone) {
  switch (tone) {
    case "normal":
      return {
        fg: colors.statusNormal,
        bg: colors.statusNormalSoft,
        icon: "CheckCircle" as IconName,
      };
    case "warning":
      return {
        fg: colors.statusWarning,
        bg: colors.statusWarningSoft,
        icon: "Warning" as IconName,
      };
    case "critical":
      return {
        fg: colors.statusCritical,
        bg: colors.statusCriticalSoft,
        icon: "WarningOctagon" as IconName,
      };
    case "nodata":
      return { fg: colors.statusNodata, bg: colors.surfaceSunken, icon: "WifiSlash" as IconName };
    default:
      return { fg: colors.lineStrong, bg: colors.surfaceSunken, icon: "Info" as IconName };
  }
}

/** Carte : surface surélevée, sans ombre (charte). */
export function Card({ children, style }: { children: ReactNode; style?: StyleProp<ViewStyle> }) {
  const { colors } = useTheme();
  return (
    <View style={[styles.card, { backgroundColor: colors.surfaceRaised }, style]}>{children}</View>
  );
}

/** Pastille d'état : fond clair bordé de la couleur d'état, icône et mot. */
export function StatusChip({ tone, label, icon }: { tone: Tone; label: string; icon?: IconName }) {
  const { colors } = useTheme();
  const t = toneColors(colors, tone);
  return (
    <View style={[styles.chip, { backgroundColor: t.bg, borderColor: t.fg }]}>
      <Icon name={icon ?? t.icon} color={t.fg} size={16} />
      <Text style={[typography.label, { color: colors.ink }]}>{label}</Text>
    </View>
  );
}

/** Bandeau d'information ou d'alerte, annoncé au lecteur d'écran. */
export function Banner({
  tone,
  title,
  text,
  icon,
}: {
  tone: Tone;
  title: string;
  text?: string;
  icon?: IconName;
}) {
  const { colors } = useTheme();
  const t = toneColors(colors, tone);
  return (
    <View
      accessibilityRole="alert"
      accessible
      accessibilityLiveRegion="polite"
      style={[styles.banner, { backgroundColor: t.bg, borderColor: t.fg }]}
    >
      <Icon name={icon ?? t.icon} color={t.fg} size={22} />
      <View style={styles.flex}>
        <Text style={[typography.bodyBold, { color: colors.ink }]}>{title}</Text>
        {text ? <Text style={[typography.label, { color: colors.ink }]}>{text}</Text> : null}
      </View>
    </View>
  );
}

/** Jauge horizontale ; la valeur est toujours affichée à côté sous forme de texte. */
export function Gauge({ value, color }: { value: number; color: string }) {
  const { colors } = useTheme();
  const pct = Math.max(0, Math.min(1, value));
  return (
    <View style={[styles.track, { backgroundColor: colors.surfaceSunken }]}>
      <View style={{ width: `${pct * 100}%`, height: "100%", backgroundColor: color }} />
    </View>
  );
}

/** Ligne libellé + valeur, pour les petites cartes de mesure. */
export function LabelWithIcon({ icon, label }: { icon: IconName; label: string }) {
  const { colors } = useTheme();
  return (
    <View style={styles.row}>
      <Icon name={icon} color={colors.inkMuted} size={sizes.iconSm} />
      <Text style={[typography.label, { color: colors.inkMuted }]}>{label}</Text>
    </View>
  );
}

type ButtonProps = {
  label: string;
  onPress?: () => void;
  variant?: "primary" | "secondary";
  disabled?: boolean;
  icon?: IconName;
  accessibilityHint?: string;
};

/** Bouton : un seul bouton principal par écran ; hauteur au moins 48 px. */
export function Button({
  label,
  onPress,
  variant = "primary",
  disabled,
  icon,
  accessibilityHint,
}: ButtonProps) {
  const { colors } = useTheme();
  const primary = variant === "primary";
  const bg = disabled ? colors.disabledFill : primary ? colors.primary : colors.surfaceRaised;
  const fg = disabled ? colors.ink : primary ? colors.onPrimary : colors.ink;
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityState={{ disabled: !!disabled }}
      accessibilityHint={accessibilityHint}
      disabled={disabled}
      onPress={onPress}
      style={({ pressed }) => [
        styles.button,
        {
          backgroundColor: bg,
          borderColor: primary ? bg : disabled ? colors.disabledLine : colors.lineStrong,
          opacity: pressed ? 0.85 : 1,
        },
      ]}
    >
      {icon ? <Icon name={icon} color={fg} size={sizes.iconSm} /> : null}
      <Text style={[typography.bodyBold, { color: fg }]}>{label}</Text>
    </Pressable>
  );
}

/** Sélecteur segmenté (mode, période, carte ou liste). */
export function Segmented<T extends string>({
  options,
  value,
  onChange,
  disabled,
  accessibilityLabel,
}: {
  options: { value: T; label: string }[];
  value: T;
  onChange: (value: T) => void;
  disabled?: boolean;
  accessibilityLabel: string;
}) {
  const { colors } = useTheme();
  return (
    <View
      accessibilityRole="radiogroup"
      accessibilityLabel={accessibilityLabel}
      style={[
        styles.segmented,
        { borderColor: disabled ? colors.disabledLine : colors.lineStrong },
      ]}
    >
      {options.map((option, index) => {
        const selected = option.value === value;
        const bg = selected ? (disabled ? colors.disabledFill : colors.primary) : "transparent";
        const fg = selected && !disabled ? colors.onPrimary : colors.ink;
        return (
          <Pressable
            key={option.value}
            accessibilityRole="radio"
            accessibilityState={{ selected, disabled: !!disabled }}
            disabled={disabled}
            onPress={() => onChange(option.value)}
            style={[
              styles.segment,
              { backgroundColor: bg },
              index > 0 && { borderLeftWidth: 1, borderLeftColor: colors.lineStrong },
            ]}
          >
            <Text style={[selected ? typography.labelBold : typography.label, { color: fg }]}>
              {option.label}
            </Text>
          </Pressable>
        );
      })}
    </View>
  );
}

/** Titre de section dans un écran. */
export function SectionTitle({ children }: { children: string }) {
  const { colors } = useTheme();
  return (
    <Text accessibilityRole="header" style={[typography.heading, { color: colors.ink }]}>
      {children}
    </Text>
  );
}

const styles = StyleSheet.create({
  card: { borderRadius: radius.md, padding: spacing[4], gap: spacing[2] },
  chip: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing[1],
    alignSelf: "flex-start",
    paddingHorizontal: 10,
    paddingVertical: spacing[1],
    borderRadius: radius.sm,
    borderWidth: 1,
  },
  banner: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 10,
    padding: spacing[3],
    borderRadius: radius.md,
    borderWidth: 1,
  },
  flex: { flex: 1, gap: 2 },
  track: { height: 10, borderRadius: 5, overflow: "hidden" },
  row: { flexDirection: "row", alignItems: "center", gap: 6 },
  button: {
    minHeight: 52,
    borderRadius: radius.md,
    borderWidth: 1,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: spacing[2],
    paddingHorizontal: spacing[4],
  },
  segmented: { flexDirection: "row", borderWidth: 1, borderRadius: radius.md, overflow: "hidden" },
  segment: {
    flex: 1,
    minHeight: sizes.touchTarget,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: spacing[2],
  },
});
