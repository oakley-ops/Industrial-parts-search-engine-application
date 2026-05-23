import { Injectable, Logger } from '@nestjs/common';
import Expo, { ExpoPushTicket } from 'expo-server-sdk';

@Injectable()
export class NotificationsService {
  private readonly expo = new Expo();
  private readonly logger = new Logger(NotificationsService.name);

  async sendPushNotification(
    token: string,
    title: string,
    body: string,
  ): Promise<'sent' | 'device_not_registered'> {
    if (!Expo.isExpoPushToken(token)) {
      throw new Error(`Invalid Expo push token: ${token}`);
    }

    const tickets: ExpoPushTicket[] = await this.expo.sendPushNotificationsAsync([
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
