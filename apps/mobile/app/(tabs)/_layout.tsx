import { Tabs } from "expo-router";

// Barre d'onglets : Supervision, Carte, Pilotage, Alertes.
export default function TabsLayout() {
  return (
    <Tabs>
      <Tabs.Screen name="index" options={{ title: "Supervision" }} />
      <Tabs.Screen name="map" options={{ title: "Carte" }} />
      <Tabs.Screen name="control" options={{ title: "Pilotage" }} />
      <Tabs.Screen name="alerts" options={{ title: "Alertes" }} />
    </Tabs>
  );
}
