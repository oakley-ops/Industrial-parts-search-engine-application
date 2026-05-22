import { Entity, Column, PrimaryGeneratedColumn, CreateDateColumn, UpdateDateColumn, OneToMany } from 'typeorm';
import { QuoteLineItem } from './quote-line-item.entity';

@Entity('quotes')
export class Quote {
  @PrimaryGeneratedColumn('uuid') id: string;
  @Column() title: string;
  @Column({ default: 'draft' }) status: string;
  @Column({ nullable: true, type: 'text' }) notes: string;
  @OneToMany(() => QuoteLineItem, item => item.quote, { cascade: true, eager: true }) lineItems: QuoteLineItem[];
  @CreateDateColumn({ name: 'created_at' }) createdAt: Date;
  @UpdateDateColumn({ name: 'updated_at' }) updatedAt: Date;
}
