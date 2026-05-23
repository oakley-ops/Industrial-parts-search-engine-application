import { Entity, Column, PrimaryGeneratedColumn, CreateDateColumn, UpdateDateColumn, OneToMany, Index } from 'typeorm';
import { QuoteLineItem } from './quote-line-item.entity';
import { QuoteStatus } from '../dto/update-status.dto';

@Entity('quotes')
export class Quote {
  @PrimaryGeneratedColumn('uuid') id: string;

  @Index()
  @Column({ name: 'user_id' }) userId: string;

  @Column() title: string;

  @Column({ type: 'enum', enum: QuoteStatus, default: QuoteStatus.DRAFT })
  status: QuoteStatus;

  @Column({ nullable: true, type: 'text' }) notes: string;

  @OneToMany(() => QuoteLineItem, item => item.quote, { cascade: true, eager: true })
  lineItems: QuoteLineItem[];

  @CreateDateColumn({ name: 'created_at' }) createdAt: Date;
  @UpdateDateColumn({ name: 'updated_at' }) updatedAt: Date;
}
