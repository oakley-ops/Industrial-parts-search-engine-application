import { Entity, Column, PrimaryGeneratedColumn, CreateDateColumn, Index } from 'typeorm';
import { AlertType } from '../dto/create-alert.dto';

@Entity('alerts')
export class Alert {
  @PrimaryGeneratedColumn('uuid') id: string;

  @Index()
  @Column({ name: 'user_id' }) userId: string;

  @Column({ name: 'part_number' }) partNumber: string;
  @Column({ name: 'vendor_slug', nullable: true }) vendorSlug: string;

  @Column({ name: 'alert_type', type: 'enum', enum: AlertType })
  alertType: AlertType;

  @Column({ name: 'threshold_value', type: 'numeric', precision: 12, scale: 4, nullable: true })
  thresholdValue: number;

  @Column({ nullable: true, type: 'text' }) notes: string;
  @Column({ name: 'is_active', default: true }) isActive: boolean;
  @Column({ name: 'last_triggered', nullable: true }) lastTriggered: Date;
  @CreateDateColumn({ name: 'created_at' }) createdAt: Date;
}
