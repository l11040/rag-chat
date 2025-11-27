import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  ManyToOne,
  JoinColumn,
  Index,
} from 'typeorm';
import { Conversation } from './conversation.entity';

export enum MessageRole {
  USER = 'user',
  ASSISTANT = 'assistant',
}

@Entity('messages')
export class Message {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column()
  @Index()
  conversationId: string; // Conversation과의 관계 (외래키)

  @ManyToOne(() => Conversation, (conversation) => conversation.messages, {
    onDelete: 'CASCADE',
  })
  @JoinColumn({ name: 'conversationId' })
  conversation: Conversation;

  @Column({
    type: 'enum',
    enum: MessageRole,
  })
  role: MessageRole; // 'user' 또는 'assistant'

  @Column({ type: 'text' })
  content: string; // 질문 또는 답변 내용

  @Column({ type: 'json', nullable: true })
  metadata: Record<string, unknown> | null; // 추가 정보 (sources, usage, rewrittenQuery 등)

  @CreateDateColumn()
  createdAt: Date;
}
