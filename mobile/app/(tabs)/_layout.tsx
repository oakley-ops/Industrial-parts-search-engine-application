import { Tabs, router } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { useEffect } from 'react';
import { getToken } from '../../services/api';
import { registerForPushNotifications } from '../../services/notifications';
import { THEME } from '../../constants/theme';

export default function TabsLayout() {
  useEffect(() => {
    getToken().then(token => {
      if (!token) {
        router.replace('/login');
      } else {
        registerForPushNotifications().catch(() => {});
      }
    });
  }, []);

  return (
    <Tabs screenOptions={{
      headerStyle: { backgroundColor: THEME.colors.background },
      headerTintColor: THEME.colors.textPrimary,
      headerTitleStyle: { fontWeight: '700', color: THEME.colors.textPrimary },
      tabBarActiveTintColor: THEME.colors.accent,
      tabBarInactiveTintColor: THEME.colors.textSecondary,
      tabBarStyle: {
        backgroundColor: THEME.colors.background,
        borderTopColor: THEME.colors.border,
        borderTopWidth: 1,
      },
    }}>
      <Tabs.Screen name="index" options={{ title: 'Search Parts', tabBarLabel: 'Search', tabBarIcon: ({ color, size }) => <Ionicons name="search" size={size} color={color} /> }} />
      <Tabs.Screen name="quotes" options={{ title: 'My Quotes', tabBarLabel: 'Quotes', tabBarIcon: ({ color, size }) => <Ionicons name="document-text" size={size} color={color} /> }} />
      <Tabs.Screen name="alerts" options={{ title: 'Alerts', tabBarLabel: 'Alerts', tabBarIcon: ({ color, size }) => <Ionicons name="notifications" size={size} color={color} /> }} />
      <Tabs.Screen name="procure" options={{ title: 'Assistant', tabBarLabel: 'Assistant', tabBarIcon: ({ color, size }) => <Ionicons name="chatbubble-outline" size={size} color={color} /> }} />
    </Tabs>
  );
}
