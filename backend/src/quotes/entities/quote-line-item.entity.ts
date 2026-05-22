import { Entity, Column, PrimaryGeneratedColumn, ManyToOne, JoinColumn, CreateDateColumn } from 'typeorm';
import { Quote } from './quote.entity';

@Entity('quote_line_items')
export class QuoteLineItem {
  @PrimaryGeneratedColumn('uuid') id: string;
  @ManyToOne(() => Quote, q => q.lineItems, { onDelete: 'CASCADE' }) @JoinColumn({ name: 'quote_id' }) quote: Quote;
  @Column({ name: 'part_number' }) partNumber: string;
  @Column({ name: 'vendor_slug' }) vendorSlug: string;
  @Column({ name: 'vendor_name' }) vendorName: string;
  @Column({ name: 'vendor_sku', nullable: true }) vendorSku: string;
  @Column({ nullable: true }) description: string;
  @Column() quantity: number;
  @Column({ name: 'unit_price', type: 'numeric', precision: 12, scale: 4 }) unitPrice: number;
  @Column({ name: 'total_price', type: 'numeric', precision: 12, scale: 4 }) totalPrice: number;
  @Column({ nullable: true }) availability: string;
  @Column({ name: 'lead_time_days', nullable: true }) leadTimeDays: number;
  @Column({ name: 'product_url', nullable: true, type: 'text' }) productUrl: string;
  @CreateDateColumn({ name: 'snapshot_at' }) snapshotAt: Date;
}
