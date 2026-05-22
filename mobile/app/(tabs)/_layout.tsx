import { Tabs } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';

export default function TabsLayout() {
  return (
    <Tabs screenOptions={{
      headerStyle: { backgroundColor: '#1e40af' },
      headerTintColor: '#fff',
      headerTitleStyle: { fontWeight: '700' },
      tabBarActiveTintColor: '#1e40af',
    }}>
      <Tabs.Screen name="index" options={{ title: 'Search Parts', tabBarLabel: 'Search', tabBarIcon: ({ color, size }) => <Ionicons name="search" size={size} color={color} /> }} />
      <Tabs.Screen name="quotes" options={{ title: 'My Quotes', tabBarLabel: 'Quotes', tabBarIcon: ({ color, size }) => <Ionicons name="document-text" size={size} color={color} /> }} />
      <Tabs.Screen name="alerts" options={{ title: 'Alerts', tabBarLabel: 'Alerts', tabBarIcon: ({ color, size }) => <Ionicons name="notifications" size={size} color={color} /> }} />
    </Tabs>
  );
}
