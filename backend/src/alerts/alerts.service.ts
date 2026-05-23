import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Alert } from './entities/alert.entity';
import { CreateAlertDto } from './dto/create-alert.dto';

@Injectable()
export class AlertsService {
  constructor(@InjectRepository(Alert) private repo: Repository<Alert>) {}

  findAll(userId: string) {
    return this.repo.find({ where: { userId }, order: { createdAt: 'DESC' } });
  }

  findAllActive(): Promise<Alert[]> {
    return this.repo.find({ where: { isActive: true } });
  }

  create(data: CreateAlertDto, userId: string) {
    return this.repo.save(this.repo.create({ ...data, userId }));
  }

  async toggle(id: string, userId: string) {
    const alert = await this.repo.findOne({ where: { id, userId } });
    if (!alert) throw new NotFoundException();
    alert.isActive = !alert.isActive;
    return this.repo.save(alert);
  }

  async delete(id: string, userId: string) {
    const alert = await this.repo.findOne({ where: { id, userId } });
    if (!alert) throw new NotFoundException();
    await this.repo.delete(id);
    return { deleted: true };
  }

  async disableAndStampAlert(id: string): Promise<void> {
    const alert = await this.repo.findOne({ where: { id } });
    if (!alert) throw new NotFoundException();
    alert.isActive = false;
    alert.lastTriggered = new Date();
    await this.repo.save(alert);
  }
}
