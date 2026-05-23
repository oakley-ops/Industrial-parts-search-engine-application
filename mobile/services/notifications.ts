import * as Notifications from 'expo-notifications';
import Constants from 'expo-constants';
import api from './api';

export async function registerForPushNotifications(): Promise<void> {
  const { status } = await Notifications.requestPermissionsAsync();
  if (status !== 'granted') return;
  const projectId = Constants.expoConfig?.extra?.eas?.projectId as string | undefined;
  const { data: token } = await Notifications.getExpoPushTokenAsync(
    projectId ? { projectId } : {},
  );
  await api.patch('/users/push-token', { token });
}
