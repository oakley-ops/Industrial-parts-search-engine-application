import { Tabs, router } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { useEffect } from 'react';
import { getToken } from '../../services/api';
import { registerForPushNotifications } from '../../services/notifications';
import { theme } from '../../constants/theme';

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
      headerStyle: { backgroundColor: theme.colors.surface },
      headerTintColor: theme.colors.textPrimary,
      headerTitleStyle: { fontWeight: '700', letterSpacing: 0.5, color: theme.colors.textPrimary },
      tabBarActiveTintColor: theme.colors.primary,
      tabBarInactiveTintColor: theme.colors.textMuted,
      tabBarStyle: {
        backgroundColor: theme.colors.background,
        borderTopColor: theme.colors.border,
        borderTopWidth: 1,
      },
    }}>
      <Tabs.Screen
        name="index"
        options={{
          title: 'Search Parts',
          tabBarLabel: 'Search',
          tabBarIcon: ({ color, size }) => <Ionicons name="search" size={size} color={color} />,
        }}
      />
      <Tabs.Screen
        name="quotes"
        options={{
          title: 'My Quotes',
          tabBarLabel: 'Quotes',
          tabBarIcon: ({ color, size }) => <Ionicons name="document-text" size={size} color={color} />,
        }}
      />
      <Tabs.Screen
        name="alerts"
        options={{
          title: 'Alerts',
          tabBarLabel: 'Alerts',
          tabBarIcon: ({ color, size }) => <Ionicons name="notifications" size={size} color={color} />,
        }}
      />
      <Tabs.Screen
        name="procure"
        options={{
          title: 'Assistant',
          tabBarLabel: 'Assistant',
          tabBarIcon: ({ color, size }) => <Ionicons name="chatbubble-outline" size={size} color={color} />,
        }}
      />
    </Tabs>
  );
}
