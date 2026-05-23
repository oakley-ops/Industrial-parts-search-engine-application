import { Entity, Column, PrimaryGeneratedColumn, CreateDateColumn } from 'typeorm';

@Entity('users')
export class User {
  @PrimaryGeneratedColumn('uuid') id: string;
  @Column({ unique: true }) email: string;
  @Column({ name: 'password_hash' }) passwordHash: string;
  @Column({ nullable: true }) name: string;
  @Column({ name: 'expo_push_token', nullable: true, type: 'text' })
  expoPushToken: string | null;
  @CreateDateColumn({ name: 'created_at' }) createdAt: Date;
}
