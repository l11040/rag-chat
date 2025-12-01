import {
  Controller,
  Post,
  Body,
  Logger,
  Get,
  UseGuards,
  Query,
  Request,
} from '@nestjs/common';
import {
  ApiTags,
  ApiOperation,
  ApiResponse,
  ApiProperty,
  ApiBearerAuth,
} from '@nestjs/swagger';
import {
  IsString,
  IsOptional,
  IsArray,
  ValidateNested,
  IsEnum,
  ArrayMinSize,
} from 'class-validator';
import { Type } from 'class-transformer';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { Roles } from '../auth/decorators/roles.decorator';
import { Role } from '../auth/enums/role.enum';
import { RagService } from './rag.service';
import { ConversationService } from '../conversation/conversation.service';
import { TokenUsageService } from '../token-usage/token-usage.service';
import { MessageRole } from '../conversation/entities/message.entity';

class IngestDto {
  @ApiProperty({
    required: false,
    description:
      '처리할 Notion 데이터베이스 ID (제공하지 않으면 환경 변수 사용)',
  })
  @IsOptional()
  @IsString()
  databaseId?: string;
}

class ConversationMessage {
  @ApiProperty({
    required: true,
    description: '메시지 역할 (user 또는 assistant)',
    enum: ['user', 'assistant'],
  })
  @IsEnum(['user', 'assistant'])
  role: 'user' | 'assistant';

  @ApiProperty({
    required: true,
    description: '메시지 내용',
  })
  @IsString()
  content: string;
}

class QueryDto {
  @ApiProperty({
    required: true,
    description: '사용자 질문 문자열',
  })
  @IsString()
  question: string;

  @ApiProperty({
    required: true,
    description: '프로젝트 ID (프로젝트별 문서만 검색)',
  })
  @IsString()
  projectId: string;

  @ApiProperty({
    required: false,
    description: '대화 ID (기존 대화를 이어서 진행할 경우)',
  })
  @IsOptional()
  @IsString()
  conversationId?: string;

  @ApiProperty({
    required: false,
    description:
      '이전 대화 히스토리 (연속적인 대화를 위한 컨텍스트, conversationId가 있으면 무시됨)',
    type: [ConversationMessage],
  })
  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => ConversationMessage)
  conversationHistory?: ConversationMessage[];
}

class UpdatePageDto {
  @ApiProperty({
    required: true,
    description: '업데이트할 Notion 페이지 ID',
  })
  @IsString()
  pageId: string;
}

class UpdatePagesDto {
  @ApiProperty({
    required: true,
    description: '업데이트할 Notion 페이지 ID 목록',
    type: [String],
  })
  @IsArray()
  @ArrayMinSize(1)
  @IsString({ each: true })
  pageIds: string[];
}

@ApiTags('RAG')
@Controller('rag')
@UseGuards(JwtAuthGuard)
@ApiBearerAuth('JWT-auth')
export class RagController {
  private readonly logger = new Logger(RagController.name);

  constructor(
    private readonly ragService: RagService,
    private readonly conversationService: ConversationService,
    private readonly tokenUsageService: TokenUsageService,
  ) {}

  @Post('ingest')
  @ApiOperation({
    summary: 'Notion 데이터베이스 내용을 임베딩하여 Qdrant에 저장',
  })
  @ApiResponse({ status: 200, description: '성공적으로 저장됨' })
  @ApiResponse({ status: 401, description: '인증 필요' })
  async ingest(@Body() body: IngestDto) {
    const result = await this.ragService.ingestNotionDatabase(body.databaseId);
    return {
      success: true,
      message: '임베딩 및 저장 완료',
      ...result,
    };
  }

  @Post('query')
  @ApiOperation({ summary: '질문에 대한 LLM 기반 답변 생성 (문서 기반)' })
  @ApiResponse({
    status: 200,
    description: 'LLM이 생성한 답변과 인용된 문서 정보 반환',
  })
  @ApiResponse({ status: 401, description: '인증 필요' })
  async query(
    @Request() req: { user: { id: string } },
    @Body() body: QueryDto,
  ) {
    let conversationId = body.conversationId;
    let conversationHistory = body.conversationHistory;

    // conversationId가 제공된 경우, 해당 대화의 히스토리를 로드
    if (conversationId) {
      // 대화가 존재하고 사용자 소유인지 확인
      const exists = await this.conversationService.conversationExists(
        conversationId,
        req.user.id,
      );
      if (!exists) {
        return {
          success: false,
          error: '대화를 찾을 수 없거나 접근 권한이 없습니다.',
        };
      }

      // 대화 히스토리 로드
      conversationHistory =
        await this.conversationService.getConversationHistory(
          conversationId,
          req.user.id,
        );
    } else {
      // conversationId가 없으면 새 대화 생성
      const conversation = await this.conversationService.createConversation(
        req.user.id,
        body.question.substring(0, 100), // 첫 질문을 제목으로 사용
      );
      conversationId = conversation.id;
    }

    // 질문 메시지 저장
    await this.conversationService.addMessage(
      conversationId,
      MessageRole.USER,
      body.question,
    );

    // RAG 쿼리 실행
    const result = await this.ragService.query(
      body.question,
      conversationHistory,
      body.projectId,
      req.user.id,
    );

    // 답변 메시지 저장
    if (result.success) {
      const savedMessage = await this.conversationService.addMessage(
        conversationId,
        MessageRole.ASSISTANT,
        result.answer,
        {
          sources: result.sources,
          usage: result.usage,
          rewrittenQuery: result.rewrittenQuery,
        },
      );

      // 토큰 사용량 저장
      if (result.usage) {
        try {
          await this.tokenUsageService.saveTokenUsage(
            req.user.id,
            {
              promptTokens: result.usage.promptTokens,
              completionTokens: result.usage.completionTokens,
              totalTokens: result.usage.totalTokens,
            },
            conversationId,
            savedMessage.id, // 메시지 ID 추가
            body.question,
          );
        } catch (error) {
          // 토큰 사용량 저장 실패는 로그만 남기고 계속 진행
          this.logger.error(
            `토큰 사용량 저장 실패: ${(error as Error).message}`,
          );
        }
      }
    }

    return {
      ...result,
      conversationId, // conversationId 반환
    };
  }

  @Get('collection-info')
  @ApiOperation({ summary: 'Qdrant 컬렉션 정보 조회' })
  @ApiResponse({ status: 200, description: '컬렉션 정보 반환' })
  @ApiResponse({ status: 401, description: '인증 필요' })
  async getCollectionInfo() {
    return await this.ragService.getCollectionInfo();
  }

  @Get('sample-data')
  @ApiOperation({ summary: '저장된 데이터 샘플 조회 (최대 10개)' })
  @ApiResponse({ status: 200, description: '샘플 데이터 반환' })
  @ApiResponse({ status: 401, description: '인증 필요' })
  async getSampleData() {
    return await this.ragService.getSampleData();
  }

  @Get('stats')
  @ApiOperation({ summary: 'Qdrant 저장 통계 정보' })
  @ApiResponse({ status: 200, description: '통계 정보 반환' })
  @ApiResponse({ status: 401, description: '인증 필요' })
  async getStats() {
    return await this.ragService.getStats();
  }

  // ==================== 관리자용 API ====================

  @Post('admin/sync-pages')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(Role.ADMIN, Role.SUB_ADMIN)
  @ApiOperation({
    summary: '[관리자] Notion 페이지 목록을 데이터베이스에 동기화',
    description: 'Notion에서 페이지 목록을 가져와 메타데이터만 DB에 저장',
  })
  @ApiResponse({ status: 200, description: '동기화 완료' })
  @ApiResponse({ status: 401, description: '인증 필요' })
  @ApiResponse({ status: 403, description: '권한 없음' })
  async syncPages(@Body() body: IngestDto) {
    const result = await this.ragService.syncNotionPages(body.databaseId);
    return result;
  }

  @Get('admin/pages')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(Role.ADMIN, Role.SUB_ADMIN)
  @ApiOperation({
    summary: '[관리자] 페이지 목록 조회',
    description: '데이터베이스에 저장된 페이지 목록 조회',
  })
  @ApiResponse({ status: 200, description: '페이지 목록 반환' })
  @ApiResponse({ status: 401, description: '인증 필요' })
  @ApiResponse({ status: 403, description: '권한 없음' })
  async getPages(@Query('databaseId') databaseId?: string) {
    return await this.ragService.getPageList(databaseId);
  }

  @Post('admin/update-page')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(Role.ADMIN, Role.SUB_ADMIN)
  @ApiOperation({
    summary: '[관리자] 특정 페이지를 벡터 DB에 업데이트',
    description: '기존 벡터 데이터를 삭제하고 새로운 임베딩으로 업데이트',
  })
  @ApiResponse({ status: 200, description: '페이지 업데이트 완료' })
  @ApiResponse({ status: 401, description: '인증 필요' })
  @ApiResponse({ status: 403, description: '권한 없음' })
  async updatePage(@Body() body: UpdatePageDto) {
    return await this.ragService.updatePage(body.pageId);
  }

  @Post('admin/update-pages')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(Role.ADMIN, Role.SUB_ADMIN)
  @ApiOperation({
    summary: '[관리자] 여러 페이지를 벡터 DB에 업데이트',
    description: '선택한 여러 페이지의 벡터 데이터를 업데이트',
  })
  @ApiResponse({ status: 200, description: '페이지 업데이트 완료' })
  @ApiResponse({ status: 401, description: '인증 필요' })
  @ApiResponse({ status: 403, description: '권한 없음' })
  async updatePages(@Body() body: UpdatePagesDto) {
    return await this.ragService.updatePages(body.pageIds);
  }

  @Post('admin/update-all')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(Role.ADMIN, Role.SUB_ADMIN)
  @ApiOperation({
    summary: '[관리자] 전체 데이터베이스의 모든 페이지 업데이트',
    description: 'Notion DB의 모든 페이지를 벡터 DB에 업데이트',
  })
  @ApiResponse({ status: 200, description: '전체 업데이트 완료' })
  @ApiResponse({ status: 401, description: '인증 필요' })
  @ApiResponse({ status: 403, description: '권한 없음' })
  async updateAll(@Body() body: IngestDto) {
    return await this.ragService.updateAllPages(body.databaseId);
  }
}
