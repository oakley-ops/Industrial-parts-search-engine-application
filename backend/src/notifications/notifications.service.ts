import { Injectable, Logger } from '@nestjs/common';

type ExpoType = import('expo-server-sdk').default;
type ExpoPushTicket = import('expo-server-sdk').ExpoPushTicket;

@Injectable()
export class NotificationsService {
  private readonly logger = new Logger(NotificationsService.name);
  private expoClient: ExpoType | null = null;

  private async getExpo(): Promise<ExpoType> {
    if (!this.expoClient) {
      const { default: Expo } = await import('expo-server-sdk');
      this.expoClient = new Expo();
    }
    return this.expoClient;
  }

  async sendPushNotification(
    token: string,
    title: string,
    body: string,
  ): Promise<'sent' | 'device_not_registered'> {
    const { default: Expo } = await import('expo-server-sdk');

    if (!Expo.isExpoPushToken(token)) {
      throw new Error(`Invalid Expo push token: ${token}`);
    }

    const expo = await this.getExpo();
    const tickets: ExpoPushTicket[] = await expo.sendPushNotificationsAsync([
      { to: token, sound: 'default', title, body },
    ]);

    for (const ticket of tickets) {
      if (ticket.status === 'error') {
        if (ticket.details?.error === 'DeviceNotRegistered') {
          return 'device_not_registered';
        }
        throw new Error(ticket.message);
      }
    }

    return 'sent';
  }
}
