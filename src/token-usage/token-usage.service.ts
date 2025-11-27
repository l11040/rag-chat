import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { TokenUsage } from './entities/token-usage.entity';

@Injectable()
export class TokenUsageService {
  private readonly logger = new Logger(TokenUsageService.name);

  constructor(
    @InjectRepository(TokenUsage)
    private readonly tokenUsageRepository: Repository<TokenUsage>,
  ) {}

  /**
   * 토큰 사용량 저장
   */
  async saveTokenUsage(
    userId: string,
    usage: {
      promptTokens: number;
      completionTokens: number;
      totalTokens: number;
    },
    conversationId?: string | null,
    messageId?: string | null,
    question?: string | null,
  ): Promise<TokenUsage> {
    try {
      const tokenUsage = this.tokenUsageRepository.create({
        userId,
        conversationId: conversationId || null,
        messageId: messageId || null,
        promptTokens: usage.promptTokens,
        completionTokens: usage.completionTokens,
        totalTokens: usage.totalTokens,
        question: question || null,
      });

      const saved = await this.tokenUsageRepository.save(tokenUsage);
      this.logger.log(
        `토큰 사용량 저장 완료: userId=${userId}, totalTokens=${usage.totalTokens}`,
      );
      return saved;
    } catch (error) {
      this.logger.error(`토큰 사용량 저장 실패: ${(error as Error).message}`);
      throw error;
    }
  }

  /**
   * 사용자의 토큰 사용량 조회 (전체)
   */
  async getUserTokenUsage(
    userId: string,
    limit?: number,
    offset?: number,
  ): Promise<{ data: TokenUsage[]; total: number }> {
    try {
      const [data, total] = await this.tokenUsageRepository.findAndCount({
        where: { userId },
        order: { createdAt: 'DESC' },
        take: limit,
        skip: offset,
      });

      return { data, total };
    } catch (error) {
      this.logger.error(`토큰 사용량 조회 실패: ${(error as Error).message}`);
      throw error;
    }
  }

  /**
   * 사용자의 토큰 사용량 통계 조회
   */
  async getUserTokenUsageStats(userId: string): Promise<{
    totalPromptTokens: number;
    totalCompletionTokens: number;
    totalTokens: number;
    usageCount: number;
    averageTokensPerQuery: number;
  }> {
    try {
      const result = await this.tokenUsageRepository
        .createQueryBuilder('token_usage')
        .select('SUM(token_usage.promptTokens)', 'totalPromptTokens')
        .addSelect('SUM(token_usage.completionTokens)', 'totalCompletionTokens')
        .addSelect('SUM(token_usage.totalTokens)', 'totalTokens')
        .addSelect('COUNT(token_usage.id)', 'usageCount')
        .where('token_usage.userId = :userId', { userId })
        .getRawOne<{
          totalPromptTokens: string | null;
          totalCompletionTokens: string | null;
          totalTokens: string | null;
          usageCount: string | null;
        }>();

      const totalPromptTokens = parseInt(result?.totalPromptTokens || '0', 10);
      const totalCompletionTokens = parseInt(
        result?.totalCompletionTokens || '0',
        10,
      );
      const totalTokens = parseInt(result?.totalTokens || '0', 10);
      const usageCount = parseInt(result?.usageCount || '0', 10);

      return {
        totalPromptTokens,
        totalCompletionTokens,
        totalTokens,
        usageCount,
        averageTokensPerQuery:
          usageCount > 0 ? Math.round(totalTokens / usageCount) : 0,
      };
    } catch (error) {
      this.logger.error(
        `토큰 사용량 통계 조회 실패: ${(error as Error).message}`,
      );
      throw error;
    }
  }

  /**
   * 특정 대화의 토큰 사용량 조회
   */
  async getConversationTokenUsage(
    conversationId: string,
    userId: string,
  ): Promise<{ data: TokenUsage[]; total: number }> {
    try {
      const [data, total] = await this.tokenUsageRepository.findAndCount({
        where: { conversationId, userId },
        order: { createdAt: 'ASC' },
      });

      return { data, total };
    } catch (error) {
      this.logger.error(
        `대화별 토큰 사용량 조회 실패: ${(error as Error).message}`,
      );
      throw error;
    }
  }

  /**
   * 날짜 범위별 토큰 사용량 조회
   */
  async getTokenUsageByDateRange(
    userId: string,
    startDate: Date,
    endDate: Date,
  ): Promise<{ data: TokenUsage[]; total: number }> {
    try {
      const queryBuilder = this.tokenUsageRepository
        .createQueryBuilder('token_usage')
        .where('token_usage.userId = :userId', { userId })
        .andWhere('token_usage.createdAt >= :startDate', { startDate })
        .andWhere('token_usage.createdAt <= :endDate', { endDate })
        .orderBy('token_usage.createdAt', 'DESC');

      const [data, total] = await queryBuilder.getManyAndCount();
      return { data, total };
    } catch (error) {
      this.logger.error(
        `날짜 범위별 토큰 사용량 조회 실패: ${(error as Error).message}`,
      );
      throw error;
    }
  }

  /**
   * 특정 메시지의 토큰 사용량 조회
   */
  async getMessageTokenUsage(
    messageId: string,
    userId: string,
  ): Promise<TokenUsage | null> {
    try {
      const tokenUsage = await this.tokenUsageRepository.findOne({
        where: { messageId, userId },
      });

      return tokenUsage;
    } catch (error) {
      this.logger.error(
        `메시지별 토큰 사용량 조회 실패: ${(error as Error).message}`,
      );
      throw error;
    }
  }
}
