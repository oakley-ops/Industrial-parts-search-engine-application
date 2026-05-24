import { Entity, Column, PrimaryGeneratedColumn, CreateDateColumn, ManyToOne, JoinColumn } from 'typeorm';
import { ProcurementConversation } from './procurement-conversation.entity';

export type MessageRole = 'user' | 'assistant';
export type MessageType = 'text' | 'parts_list';

export interface ProcurementPart {
  partNumber: string;
  description: string;
  quantity: number;
  notes: string;
}

@Entity('procurement_messages')
export class ProcurementMessage {
  @PrimaryGeneratedColumn('uuid') id: string;

  @ManyToOne(() => ProcurementConversation, conv => conv.messages, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'conversation_id' })
  conversation: ProcurementConversation;

  @Column({ name: 'conversation_id' }) conversationId: string;

  @Column({ type: 'varchar' }) role: MessageRole;

  @Column({ name: 'message_type', type: 'varchar', default: 'text' }) messageType: MessageType;

  @Column({ type: 'text' }) content: string;

  @Column({ type: 'jsonb', nullable: true }) parts: ProcurementPart[] | null;

  @CreateDateColumn({ name: 'created_at' }) createdAt: Date;
}
