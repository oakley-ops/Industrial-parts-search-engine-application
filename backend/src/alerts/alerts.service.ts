import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Alert } from './entities/alert.entity';

@Injectable()
export class AlertsService {
  constructor(@InjectRepository(Alert) private repo: Repository<Alert>) {}

  findAll() { return this.repo.find({ order: { createdAt: 'DESC' } }); }

  create(data: { partNumber: string; vendorSlug?: string; alertType: string; thresholdValue?: number; notes?: string }) {
    return this.repo.save(this.repo.create(data));
  }

  async toggle(id: string) {
    const alert = await this.repo.findOne({ where: { id } });
    if (!alert) throw new NotFoundException();
    alert.isActive = !alert.isActive;
    return this.repo.save(alert);
  }

  async delete(id: string) { await this.repo.delete(id); return { deleted: true }; }
}
