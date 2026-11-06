import { StyleSheet, Text, TextInput, View, type TextInputProps } from "react-native";

import { radius, typography, useTheme } from "../theme";

type TextFieldProps = TextInputProps & { label: string; invalid?: boolean };

/** Champ de saisie avec libellé visible ; bordure renforcée en cas d'erreur. */
export function TextField({ label, invalid, style, ...props }: TextFieldProps) {
  const { colors } = useTheme();
  return (
    <View style={styles.field}>
      <Text style={[typography.label, { color: colors.ink }]}>{label}</Text>
      <TextInput
        accessibilityLabel={label}
        placeholderTextColor={colors.inkMuted}
        style={[
          styles.input,
          typography.body,
          {
            color: colors.ink,
            backgroundColor: colors.surfaceRaised,
            borderColor: invalid ? colors.statusCritical : colors.lineStrong,
            borderWidth: invalid ? 2 : 1,
          },
          style,
        ]}
        {...props}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  field: { gap: 6 },
  input: { minHeight: 52, paddingHorizontal: 14, borderRadius: radius.sm },
});
