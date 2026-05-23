import * as Notifications from 'expo-notifications';
import api from './api';

export async function registerForPushNotifications(): Promise<void> {
  const { status } = await Notifications.requestPermissionsAsync();
  if (status !== 'granted') return;
  const { data: token } = await Notifications.getExpoPushTokenAsync();
  await api.patch('/users/push-token', { token });
}
