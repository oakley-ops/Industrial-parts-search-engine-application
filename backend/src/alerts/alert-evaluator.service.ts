import { Injectable, Logger } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { AlertsService } from './alerts.service';
import { VendorsService } from '../vendors/vendors.service';
import { NotificationsService } from '../notifications/notifications.service';
import { UsersService } from '../users/users.service';
import { Alert } from './entities/alert.entity';
import { AlertType } from './dto/create-alert.dto';
import { PriceResult } from '../vendors/scrapers/base.scraper';

@Injectable()
export class AlertEvaluatorService {
  private readonly logger = new Logger(AlertEvaluatorService.name);

  constructor(
    private alertsService: AlertsService,
    private vendorsService: VendorsService,
    private notificationsService: NotificationsService,
    private usersService: UsersService,
  ) {}

  @Cron('0 * * * *')
  async evaluateAlerts(): Promise<void> {
    const alerts = await this.alertsService.findAllActive();

    const groups = new Map<string, Alert[]>();
    for (const alert of alerts) {
      const existing = groups.get(alert.partNumber) ?? [];
      groups.set(alert.partNumber, [...existing, alert]);
    }

    let checked = 0, triggered = 0, partsScraped = 0, errors = 0;

    for (const [partNumber, group] of groups) {
      try {
        const prices = await this.fetchPrices(partNumber, group);
        partsScraped++;

        for (const alert of group) {
          checked++;
          const match = this.evaluate(alert, prices);
          if (match) {
            triggered++;
            await this.notifyAndDisable(alert, match);
          }
        }
      } catch (err) {
        errors++;
        this.logger.warn(`Skipping ${partNumber}: ${(err as Error).message}`);
      }
    }

    this.logger.log(
      `Alert evaluation: checked=${checked} triggered=${triggered} partsScraped=${partsScraped} errors=${errors}`,
    );
  }

  private async fetchPrices(partNumber: string, group: Alert[]): Promise<PriceResult[]> {
    const allSameVendor =
      group.length > 0 &&
      group.every(a => a.vendorSlug && a.vendorSlug === group[0].vendorSlug);

    if (allSameVendor && group[0].vendorSlug) {
      const result = await this.vendorsService.getPriceFromVendor(group[0].vendorSlug, partNumber);
      return result ? [result] : [];
    }

    return this.vendorsService.getPricesForPart(partNumber);
  }

  private evaluate(
    alert: Alert,
    prices: PriceResult[],
  ): { price: PriceResult; message: string } | null {
    for (const price of prices) {
      if (alert.vendorSlug && price.vendorSlug !== alert.vendorSlug) continue;

      if (
        alert.alertType === AlertType.PRICE_BELOW &&
        price.price !== null &&
        price.price < alert.thresholdValue
      ) {
        return {
          price,
          message: `Price at ${price.vendorName} dropped to $${price.price} (your threshold: $${alert.thresholdValue})`,
        };
      }

      if (alert.alertType === AlertType.IN_STOCK && price.inStock) {
        return {
          price,
          message: `${alert.partNumber} is back in stock at ${price.vendorName}`,
        };
      }

      if (
        alert.alertType === AlertType.LEAD_TIME_ABOVE &&
        price.leadTimeDays !== null &&
        price.leadTimeDays > alert.thresholdValue
      ) {
        return {
          price,
          message: `Lead time at ${price.vendorName} is now ${price.leadTimeDays} days (your threshold: ${alert.thresholdValue} days)`,
        };
      }
    }

    return null;
  }

  private async notifyAndDisable(
    alert: Alert,
    result: { price: PriceResult; message: string },
  ): Promise<void> {
    const user = await this.usersService.findById(alert.userId);

    if (user?.expoPushToken) {
      const outcome = await this.notificationsService.sendPushNotification(
        user.expoPushToken,
        `Alert: ${alert.partNumber}`,
        result.message,
      );
      if (outcome === 'device_not_registered') {
        await this.usersService.updatePushToken(user.id, null);
        this.logger.log(`Cleared stale push token for user ${user.id}`);
      }
    }

    await this.alertsService.disableAndStampAlert(alert.id);
  }
}
