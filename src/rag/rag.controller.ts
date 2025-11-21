import { Controller, Post, Body, Logger, Get } from '@nestjs/common';
import {
  ApiTags,
  ApiOperation,
  ApiResponse,
  ApiProperty,
} from '@nestjs/swagger';
import { RagService } from './rag.service';

class IngestDto {
  @ApiProperty({ 
    required: false, 
    description: '처리할 Notion 데이터베이스 ID (제공하지 않으면 환경 변수 사용)', 
  })
  databaseId?: string;
}

class ConversationMessage {
  @ApiProperty({
    required: true,
    description: '메시지 역할 (user 또는 assistant)',
    enum: ['user', 'assistant'],
  })
  role: 'user' | 'assistant';

  @ApiProperty({
    required: true,
    description: '메시지 내용',
  })
  content: string;
}

class QueryDto {
  @ApiProperty({
    required: true,
    description: '사용자 질문 문자열',
  })
  question: string;

  @ApiProperty({
    required: false,
    description: '이전 대화 히스토리 (연속적인 대화를 위한 컨텍스트)',
    type: [ConversationMessage],
  })
  conversationHistory?: ConversationMessage[];
}

@ApiTags('RAG')
@Controller('rag')
export class RagController {
  private readonly logger = new Logger(RagController.name);

  constructor(private readonly ragService: RagService) {}

  @Post('ingest')
  @ApiOperation({ summary: 'Notion 데이터베이스 내용을 임베딩하여 Qdrant에 저장' })
  @ApiResponse({ status: 200, description: '성공적으로 저장됨' })
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
  @ApiResponse({ status: 200, description: 'LLM이 생성한 답변과 인용된 문서 정보 반환' })
  async query(@Body() body: QueryDto) {
    const result = await this.ragService.query(
      body.question,
      body.conversationHistory,
    );
    return result;
  }

  @Get('collection-info')
  @ApiOperation({ summary: 'Qdrant 컬렉션 정보 조회' })
  @ApiResponse({ status: 200, description: '컬렉션 정보 반환' })
  async getCollectionInfo() {
    return await this.ragService.getCollectionInfo();
  }

  @Get('sample-data')
  @ApiOperation({ summary: '저장된 데이터 샘플 조회 (최대 10개)' })
  @ApiResponse({ status: 200, description: '샘플 데이터 반환' })
  async getSampleData() {
    return await this.ragService.getSampleData();
  }

  @Get('stats')
  @ApiOperation({ summary: 'Qdrant 저장 통계 정보' })
  @ApiResponse({ status: 200, description: '통계 정보 반환' })
  async getStats() {
    return await this.ragService.getStats();
  }
}
