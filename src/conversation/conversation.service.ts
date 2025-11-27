import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Conversation } from './entities/conversation.entity';
import { Message, MessageRole } from './entities/message.entity';

@Injectable()
export class ConversationService {
  private readonly logger = new Logger(ConversationService.name);

  constructor(
    @InjectRepository(Conversation)
    private readonly conversationRepository: Repository<Conversation>,
    @InjectRepository(Message)
    private readonly messageRepository: Repository<Message>,
  ) {}

  /**
   * 새 대화 생성
   */
  async createConversation(
    userId: string,
    title?: string,
  ): Promise<Conversation> {
    const conversation = this.conversationRepository.create({
      userId,
      title: title || null,
    });
    return await this.conversationRepository.save(conversation);
  }

  /**
   * 대화 조회 (메시지 포함)
   */
  async getConversation(
    conversationId: string,
    userId: string,
  ): Promise<Conversation> {
    const conversation = await this.conversationRepository.findOne({
      where: { id: conversationId, userId },
      relations: ['messages'],
      order: {
        messages: {
          createdAt: 'ASC',
        },
      },
    });

    if (!conversation) {
      throw new NotFoundException('대화를 찾을 수 없습니다.');
    }

    return conversation;
  }

  /**
   * 사용자의 모든 대화 목록 조회
   */
  async getConversations(userId: string): Promise<Conversation[]> {
    return await this.conversationRepository.find({
      where: { userId },
      relations: ['messages'],
      order: { updatedAt: 'DESC' },
    });
  }

  /**
   * 대화에 메시지 추가
   */
  async addMessage(
    conversationId: string,
    role: MessageRole,
    content: string,
    metadata?: Record<string, unknown>,
  ): Promise<Message> {
    // 대화 존재 확인
    const conversation = await this.conversationRepository.findOne({
      where: { id: conversationId },
    });

    if (!conversation) {
      throw new NotFoundException('대화를 찾을 수 없습니다.');
    }

    // 메시지 생성
    const message = this.messageRepository.create({
      conversationId,
      role,
      content,
      metadata: metadata || null,
    });

    const savedMessage = await this.messageRepository.save(message);

    // 대화의 updatedAt 업데이트
    conversation.updatedAt = new Date();
    await this.conversationRepository.save(conversation);

    return savedMessage;
  }

  /**
   * 대화의 메시지 히스토리를 conversationHistory 형식으로 반환
   */
  async getConversationHistory(
    conversationId: string,
    userId: string,
  ): Promise<Array<{ role: 'user' | 'assistant'; content: string }>> {
    const conversation = await this.getConversation(conversationId, userId);

    return conversation.messages.map((message) => ({
      role: message.role as 'user' | 'assistant',
      content: message.content,
    }));
  }

  /**
   * 대화 제목 업데이트
   */
  async updateConversationTitle(
    conversationId: string,
    userId: string,
    title: string,
  ): Promise<Conversation> {
    const conversation = await this.getConversation(conversationId, userId);
    conversation.title = title;
    return await this.conversationRepository.save(conversation);
  }

  /**
   * 대화 삭제
   */
  async deleteConversation(
    conversationId: string,
    userId: string,
  ): Promise<void> {
    const conversation = await this.getConversation(conversationId, userId);
    await this.conversationRepository.remove(conversation);
  }

  /**
   * 대화가 존재하는지 확인
   */
  async conversationExists(
    conversationId: string,
    userId: string,
  ): Promise<boolean> {
    const count = await this.conversationRepository.count({
      where: { id: conversationId, userId },
    });
    return count > 0;
  }
}
