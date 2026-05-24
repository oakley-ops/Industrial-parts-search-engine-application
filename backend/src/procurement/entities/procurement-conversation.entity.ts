import { Entity, Column, PrimaryGeneratedColumn, CreateDateColumn, UpdateDateColumn, OneToMany, Index } from 'typeorm';
import { ProcurementMessage } from './procurement-message.entity';

@Entity('procurement_conversations')
export class ProcurementConversation {
  @PrimaryGeneratedColumn('uuid') id: string;

  @Index()
  @Column({ name: 'user_id' }) userId: string;

  @Column({ default: 'New Conversation' }) title: string;

  @OneToMany(() => ProcurementMessage, msg => msg.conversation, { cascade: true, eager: true })
  messages: ProcurementMessage[];

  @CreateDateColumn({ name: 'created_at' }) createdAt: Date;
  @UpdateDateColumn({ name: 'updated_at' }) updatedAt: Date;
}
