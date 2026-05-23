import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { AlertsController } from './alerts.controller';
import { AlertsService } from './alerts.service';
import { AlertEvaluatorService } from './alert-evaluator.service';
import { Alert } from './entities/alert.entity';
import { NotificationsModule } from '../notifications/notifications.module';
import { UsersModule } from '../users/users.module';
import { VendorsModule } from '../vendors/vendors.module';

@Module({
  imports: [
    TypeOrmModule.forFeature([Alert]),
    NotificationsModule,
    UsersModule,
    VendorsModule,
  ],
  controllers: [AlertsController],
  providers: [AlertsService, AlertEvaluatorService],
})
export class AlertsModule {}
