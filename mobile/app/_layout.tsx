import { useEffect, useState } from 'react';
import { Stack, router } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { getToken } from '../services/api';
import { registerForPushNotifications } from '../services/notifications';

export default function RootLayout() {
  const [checked, setChecked] = useState(false);

  useEffect(() => {
    getToken().then(token => {
      if (!token) {
        router.replace('/login');
      } else {
        registerForPushNotifications().catch(() => {});
      }
      setChecked(true);
    });
  }, []);

  if (!checked) return null;

  return (
    <>
      <StatusBar style="light" />
      <Stack screenOptions={{ headerShown: false }} />
    </>
  );
}
