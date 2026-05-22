import { Entity, Column, PrimaryGeneratedColumn, CreateDateColumn } from 'typeorm';

@Entity('alerts')
export class Alert {
  @PrimaryGeneratedColumn('uuid') id: string;
  @Column({ name: 'part_number' }) partNumber: string;
  @Column({ name: 'vendor_slug', nullable: true }) vendorSlug: string;
  @Column({ name: 'alert_type' }) alertType: string;
  @Column({ name: 'threshold_value', type: 'numeric', precision: 12, scale: 4, nullable: true }) thresholdValue: number;
  @Column({ nullable: true, type: 'text' }) notes: string;
  @Column({ name: 'is_active', default: true }) isActive: boolean;
  @Column({ name: 'last_triggered', nullable: true }) lastTriggered: Date;
  @CreateDateColumn({ name: 'created_at' }) createdAt: Date;
}
