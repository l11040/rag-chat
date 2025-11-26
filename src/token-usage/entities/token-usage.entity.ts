import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  ManyToOne,
  JoinColumn,
  Index,
} from 'typeorm';
import { User } from '../../auth/entities/user.entity';
import { Conversation } from '../../conversation/entities/conversation.entity';
import { Message } from '../../conversation/entities/message.entity';

@Entity('token_usages')
export class TokenUsage {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column()
  @Index()
  userId: string; // User와의 관계 (외래키)

  @ManyToOne(() => User, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'userId' })
  user: User;

  @Column({ nullable: true })
  @Index()
  conversationId: string | null; // Conversation과의 관계 (선택적)

  @ManyToOne(() => Conversation, { onDelete: 'SET NULL', nullable: true })
  @JoinColumn({ name: 'conversationId' })
  conversation: Conversation | null;

  @Column({ nullable: true })
  @Index()
  messageId: string | null; // Message와의 관계 (선택적)

  @ManyToOne(() => Message, { onDelete: 'SET NULL', nullable: true })
  @JoinColumn({ name: 'messageId' })
  message: Message | null;

  @Column({ type: 'int', default: 0 })
  promptTokens: number; // 프롬프트 토큰 수

  @Column({ type: 'int', default: 0 })
  completionTokens: number; // 완성 토큰 수

  @Column({ type: 'int', default: 0 })
  totalTokens: number; // 총 토큰 수

  @Column({ type: 'varchar', length: 500, nullable: true })
  question: string | null; // 질문 내용 (선택적, 통계 분석용)

  @CreateDateColumn()
  createdAt: Date;
}
