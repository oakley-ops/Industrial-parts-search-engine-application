import { Test } from '@nestjs/testing';
import Expo from 'expo-server-sdk';
import { NotificationsService } from './notifications.service';

jest.mock('expo-server-sdk');

const MockedExpo = Expo as jest.MockedClass<typeof Expo>;

describe('NotificationsService', () => {
  let service: NotificationsService;
  let mockSend: jest.Mock;

  beforeEach(async () => {
    mockSend = jest.fn();
    MockedExpo.mockImplementation(() => ({ sendPushNotificationsAsync: mockSend } as any));
    (Expo.isExpoPushToken as unknown as jest.Mock) = jest.fn().mockReturnValue(true);

    const module = await Test.createTestingModule({
      providers: [NotificationsService],
    }).compile();
    service = module.get(NotificationsService);
  });

  it('returns "sent" on a successful push', async () => {
    mockSend.mockResolvedValue([{ status: 'ok', id: 'ticket-1' }]);
    const result = await service.sendPushNotification('ExponentPushToken[abc]', 'Title', 'Body');
    expect(result).toBe('sent');
    expect(mockSend).toHaveBeenCalledWith([{
      to: 'ExponentPushToken[abc]',
      sound: 'default',
      title: 'Title',
      body: 'Body',
    }]);
  });

  it('returns "device_not_registered" on DeviceNotRegistered ticket error', async () => {
    mockSend.mockResolvedValue([{
      status: 'error',
      message: 'The recipient device is not registered',
      details: { error: 'DeviceNotRegistered' },
    }]);
    const result = await service.sendPushNotification('ExponentPushToken[abc]', 'Title', 'Body');
    expect(result).toBe('device_not_registered');
  });

  it('throws on other Expo ticket errors', async () => {
    mockSend.mockResolvedValue([{
      status: 'error',
      message: 'Message too big',
      details: { error: 'MessageTooBig' },
    }]);
    await expect(
      service.sendPushNotification('ExponentPushToken[abc]', 'Title', 'Body'),
    ).rejects.toThrow('Message too big');
  });

  it('throws if token fails Expo validation', async () => {
    (Expo.isExpoPushToken as unknown as jest.Mock).mockReturnValue(false);
    await expect(
      service.sendPushNotification('not-a-valid-token', 'Title', 'Body'),
    ).rejects.toThrow('Invalid Expo push token');
  });
});
