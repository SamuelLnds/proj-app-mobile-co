import type { ReactNode } from "react";
import { Modal, Pressable, StyleSheet, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { radius, spacing, typography, useTheme } from "../theme";

type BottomSheetProps = {
  visible: boolean;
  title: string;
  onClose: () => void;
  children: ReactNode;
};

/** Feuille du bas sur voile : confirmation d'une consigne, placement d'un panneau. */
export function BottomSheet({ visible, title, onClose, children }: BottomSheetProps) {
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();
  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <View style={[styles.scrim, { backgroundColor: colors.scrim }]}>
        <Pressable accessibilityLabel="Fermer" style={styles.flex} onPress={onClose} />
        <View
          accessibilityViewIsModal
          style={[
            styles.sheet,
            { backgroundColor: colors.surfaceRaised, paddingBottom: spacing[8] + insets.bottom },
          ]}
        >
          <Text accessibilityRole="header" style={[typography.title, { color: colors.ink }]}>
            {title}
          </Text>
          {children}
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  scrim: { flex: 1, justifyContent: "flex-end" },
  flex: { flex: 1 },
  sheet: {
    borderTopLeftRadius: radius.lg,
    borderTopRightRadius: radius.lg,
    padding: spacing[4],
    paddingTop: spacing[6],
    gap: spacing[4],
  },
});
