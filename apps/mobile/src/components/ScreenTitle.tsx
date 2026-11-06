import { StyleSheet, Text, View } from "react-native";

type ScreenTitleProps = { title: string };

// Écran vide provisoire : affiche uniquement le titre de la route.
export function ScreenTitle({ title }: ScreenTitleProps) {
  return (
    <View style={styles.container}>
      <Text style={styles.title}>{title}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, alignItems: "center", justifyContent: "center" },
  title: { fontSize: 24, fontWeight: "600" },
});
