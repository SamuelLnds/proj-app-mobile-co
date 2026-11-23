import { Redirect, Tabs } from "expo-router";
import type { ColorValue } from "react-native";

import { useActiveAlertCount } from "../../src/api";
import { useAuth } from "../../src/auth/AuthProvider";
import { fontFamilies, Icon, useTheme, type IconName } from "../../src/theme";

const tabIcon =
  (name: IconName) =>
  ({ color }: { color: ColorValue }) => <Icon name={name} color={color} />;

// Barre d'onglets de la charte : Supervision, Carte, Pilotage, Alertes.
export default function TabsLayout() {
  const { colors } = useTheme();
  const { user } = useAuth();
  if (!user) return <Redirect href="/login" />;
  return <AuthenticatedTabs alertColor={colors.statusCritical} />;
}

function AuthenticatedTabs({ alertColor }: { alertColor: string }) {
  const { colors } = useTheme();
  const alertCount = useActiveAlertCount();
  return (
    <Tabs
      screenOptions={{
        headerShown: false,
        tabBarActiveTintColor: colors.primary,
        tabBarInactiveTintColor: colors.inkMuted,
        tabBarStyle: {
          backgroundColor: colors.surfaceRaised,
          borderTopColor: colors.line,
          minHeight: 64,
        },
        tabBarLabelStyle: { fontFamily: fontFamilies.textMedium, fontSize: 13 },
        sceneStyle: { backgroundColor: colors.surface },
      }}
    >
      <Tabs.Screen name="index" options={{ title: "Supervision", tabBarIcon: tabIcon("Gauge") }} />
      <Tabs.Screen name="map" options={{ title: "Carte", tabBarIcon: tabIcon("MapTrifold") }} />
      <Tabs.Screen
        name="control"
        options={{ title: "Pilotage", tabBarIcon: tabIcon("SlidersHorizontal") }}
      />
      <Tabs.Screen
        name="alerts"
        options={{
          title: "Alertes",
          tabBarIcon: tabIcon(alertCount > 0 ? "BellRinging" : "Bell"),
          tabBarBadge: alertCount > 0 ? alertCount : undefined,
          tabBarBadgeStyle: { backgroundColor: alertColor, color: colors.onPrimary },
          tabBarAccessibilityLabel: alertCount > 0 ? `Alertes, ${alertCount} actives` : "Alertes",
        }}
      />
    </Tabs>
  );
}
