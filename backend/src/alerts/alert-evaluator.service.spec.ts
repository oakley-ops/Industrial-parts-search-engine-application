import { Test } from '@nestjs/testing';
import { AlertEvaluatorService } from './alert-evaluator.service';
import { AlertsService } from './alerts.service';
import { VendorsService } from '../vendors/vendors.service';
import { NotificationsService } from '../notifications/notifications.service';
import { UsersService } from '../users/users.service';
import { Alert } from './entities/alert.entity';
import { AlertType } from './dto/create-alert.dto';

const makeAlert = (overrides: Partial<Alert> = {}): Alert => ({
  id: 'alert-1',
  userId: 'user-1',
  partNumber: 'PN-123',
  vendorSlug: null,
  alertType: AlertType.PRICE_BELOW,
  thresholdValue: 100,
  notes: null,
  isActive: true,
  lastTriggered: null,
  createdAt: new Date(),
  ...overrides,
} as Alert);

const makePrice = (overrides = {}) => ({
  vendorSlug: 'grainger',
  vendorName: 'Grainger',
  vendorSku: 'SKU-1',
  price: 90,
  currency: 'USD',
  quantityOnHand: 5,
  source: 'VENDOR_WAREHOUSE' as const,
  leadTimeDays: null,
  minOrderQty: 1,
  unitOfMeasure: 'EA',
  productUrl: 'http://grainger.com/PN-123',
  inStock: true,
  scrapedAt: new Date().toISOString(),
  ...overrides,
});

describe('AlertEvaluatorService', () => {
  let service: AlertEvaluatorService;
  let alertsService: jest.Mocked<Pick<AlertsService, 'findAllActive' | 'disableAndStampAlert'>>;
  let vendorsService: jest.Mocked<Pick<VendorsService, 'getPricesForPart' | 'getPriceFromVendor'>>;
  let notificationsService: jest.Mocked<Pick<NotificationsService, 'sendPushNotification'>>;
  let usersService: jest.Mocked<Pick<UsersService, 'findById' | 'updatePushToken'>>;

  beforeEach(async () => {
    alertsService = {
      findAllActive: jest.fn(),
      disableAndStampAlert: jest.fn().mockResolvedValue(undefined),
    };
    vendorsService = {
      getPricesForPart: jest.fn(),
      getPriceFromVendor: jest.fn(),
    };
    notificationsService = { sendPushNotification: jest.fn().mockResolvedValue('sent') };
    usersService = {
      findById: jest.fn(),
      updatePushToken: jest.fn().mockResolvedValue(undefined),
    };

    const module = await Test.createTestingModule({
      providers: [
        AlertEvaluatorService,
        { provide: AlertsService, useValue: alertsService },
        { provide: VendorsService, useValue: vendorsService },
        { provide: NotificationsService, useValue: notificationsService },
        { provide: UsersService, useValue: usersService },
      ],
    }).compile();

    service = module.get(AlertEvaluatorService);
  });

  it('does nothing when there are no active alerts', async () => {
    alertsService.findAllActive.mockResolvedValue([]);
    await service.evaluateAlerts();
    expect(vendorsService.getPricesForPart).not.toHaveBeenCalled();
    expect(notificationsService.sendPushNotification).not.toHaveBeenCalled();
  });

  it('triggers PRICE_BELOW when price is below threshold', async () => {
    const alert = makeAlert({ alertType: AlertType.PRICE_BELOW, thresholdValue: 100 });
    alertsService.findAllActive.mockResolvedValue([alert]);
    vendorsService.getPricesForPart.mockResolvedValue([makePrice({ price: 85 })]);
    usersService.findById.mockResolvedValue({ id: 'user-1', expoPushToken: 'ExponentPushToken[abc]' } as any);

    await service.evaluateAlerts();

    expect(notificationsService.sendPushNotification).toHaveBeenCalledWith(
      'ExponentPushToken[abc]',
      'Alert: PN-123',
      expect.stringContaining('85'),
    );
    expect(alertsService.disableAndStampAlert).toHaveBeenCalledWith('alert-1');
  });

  it('does NOT trigger PRICE_BELOW when price is above threshold', async () => {
    const alert = makeAlert({ alertType: AlertType.PRICE_BELOW, thresholdValue: 100 });
    alertsService.findAllActive.mockResolvedValue([alert]);
    vendorsService.getPricesForPart.mockResolvedValue([makePrice({ price: 110 })]);

    await service.evaluateAlerts();

    expect(notificationsService.sendPushNotification).not.toHaveBeenCalled();
    expect(alertsService.disableAndStampAlert).not.toHaveBeenCalled();
  });

  it('triggers IN_STOCK when part is in stock', async () => {
    const alert = makeAlert({ alertType: AlertType.IN_STOCK, thresholdValue: null });
    alertsService.findAllActive.mockResolvedValue([alert]);
    vendorsService.getPricesForPart.mockResolvedValue([makePrice({ inStock: true })]);
    usersService.findById.mockResolvedValue({ id: 'user-1', expoPushToken: 'ExponentPushToken[abc]' } as any);

    await service.evaluateAlerts();

    expect(notificationsService.sendPushNotification).toHaveBeenCalledWith(
      'ExponentPushToken[abc]',
      'Alert: PN-123',
      expect.stringContaining('in stock'),
    );
    expect(alertsService.disableAndStampAlert).toHaveBeenCalledWith('alert-1');
  });

  it('triggers LEAD_TIME_ABOVE when lead time exceeds threshold', async () => {
    const alert = makeAlert({ alertType: AlertType.LEAD_TIME_ABOVE, thresholdValue: 14 });
    alertsService.findAllActive.mockResolvedValue([alert]);
    vendorsService.getPricesForPart.mockResolvedValue([makePrice({ leadTimeDays: 21 })]);
    usersService.findById.mockResolvedValue({ id: 'user-1', expoPushToken: 'ExponentPushToken[abc]' } as any);

    await service.evaluateAlerts();

    expect(notificationsService.sendPushNotification).toHaveBeenCalledWith(
      'ExponentPushToken[abc]',
      'Alert: PN-123',
      expect.stringContaining('21 days'),
    );
    expect(alertsService.disableAndStampAlert).toHaveBeenCalledWith('alert-1');
  });

  it('disables alert even when user has no push token', async () => {
    const alert = makeAlert({ alertType: AlertType.IN_STOCK });
    alertsService.findAllActive.mockResolvedValue([alert]);
    vendorsService.getPricesForPart.mockResolvedValue([makePrice({ inStock: true })]);
    usersService.findById.mockResolvedValue({ id: 'user-1', expoPushToken: null } as any);

    await service.evaluateAlerts();

    expect(notificationsService.sendPushNotification).not.toHaveBeenCalled();
    expect(alertsService.disableAndStampAlert).toHaveBeenCalledWith('alert-1');
  });

  it('clears push token on DeviceNotRegistered and still disables alert', async () => {
    const alert = makeAlert({ alertType: AlertType.IN_STOCK });
    alertsService.findAllActive.mockResolvedValue([alert]);
    vendorsService.getPricesForPart.mockResolvedValue([makePrice({ inStock: true })]);
    usersService.findById.mockResolvedValue({ id: 'user-1', expoPushToken: 'ExponentPushToken[old]' } as any);
    notificationsService.sendPushNotification.mockResolvedValue('device_not_registered');

    await service.evaluateAlerts();

    expect(usersService.updatePushToken).toHaveBeenCalledWith('user-1', null);
    expect(alertsService.disableAndStampAlert).toHaveBeenCalledWith('alert-1');
  });

  it('skips a group and leaves alerts active when scraper throws', async () => {
    const alert = makeAlert();
    alertsService.findAllActive.mockResolvedValue([alert]);
    vendorsService.getPricesForPart.mockRejectedValue(new Error('scraper timeout'));

    await service.evaluateAlerts();

    expect(alertsService.disableAndStampAlert).not.toHaveBeenCalled();
  });

  it('uses getPriceFromVendor when all alerts in group share the same vendorSlug', async () => {
    const alert = makeAlert({ vendorSlug: 'grainger', alertType: AlertType.IN_STOCK });
    alertsService.findAllActive.mockResolvedValue([alert]);
    vendorsService.getPriceFromVendor.mockResolvedValue(makePrice({ inStock: true }));
    usersService.findById.mockResolvedValue({ id: 'user-1', expoPushToken: 'ExponentPushToken[abc]' } as any);

    await service.evaluateAlerts();

    expect(vendorsService.getPriceFromVendor).toHaveBeenCalledWith('grainger', 'PN-123');
    expect(vendorsService.getPricesForPart).not.toHaveBeenCalled();
  });
});
