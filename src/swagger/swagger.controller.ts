import {
  Controller,
  Post,
  Get,
  Delete,
  Body,
  Param,
  UseGuards,
  HttpCode,
  HttpStatus,
  Request,
  UseInterceptors,
  UploadedFile,
  BadRequestException,
  Logger,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import {
  ApiTags,
  ApiOperation,
  ApiResponse,
  ApiBearerAuth,
  ApiProperty,
  ApiConsumes,
  ApiBody,
} from '@nestjs/swagger';
import {
  IsString,
  IsUrl,
  Matches,
  MinLength,
  MaxLength,
  IsOptional,
  IsArray,
  ValidateNested,
  IsEnum,
} from 'class-validator';
import { Type } from 'class-transformer';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { Roles } from '../auth/decorators/roles.decorator';
import { Role } from '../auth/enums/role.enum';
import { SwaggerService } from './swagger.service';
import { ConversationService } from '../conversation/conversation.service';
import { TokenUsageService } from '../token-usage/token-usage.service';
import { MessageRole } from '../conversation/entities/message.entity';

class UploadSwaggerDto {
  @ApiProperty({
    description: 'Swagger 문서 고유 키 (영어, 숫자, 소문자, 언더스코어만 허용)',
    example: 'rag_chat_api',
  })
  @IsString({ message: '키는 문자열이어야 합니다.' })
  @MinLength(1, { message: '키는 최소 1자 이상이어야 합니다.' })
  @MaxLength(100, { message: '키는 최대 100자까지 가능합니다.' })
  @Matches(/^[a-z0-9_]+$/, {
    message: '키는 소문자 영어, 숫자, 언더스코어(_)만 사용할 수 있습니다.',
  })
  key: string;

  @ApiProperty({
    description: 'Swagger JSON URL (예: http://localhost:3001/api-json)',
    example: 'http://localhost:3001/api-json',
  })
  @IsUrl(
    {
      require_tld: false, // localhost 같은 경우 TLD가 없으므로 false
      require_protocol: true, // 프로토콜은 필수
    },
    { message: '유효한 URL을 입력해주세요.' },
  )
  @IsString()
  swaggerUrl: string;
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

class ApiQueryDto {
  @ApiProperty({
    required: true,
    description: '사용자 질문 문자열',
  })
  @IsString()
  question: string;

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

  @ApiProperty({
    required: false,
    description: '특정 Swagger 문서 키로 필터링 (해당 문서의 API만 검색)',
  })
  @IsOptional()
  @IsString()
  swaggerKey?: string;
}

@ApiTags('Swagger')
@Controller('swagger')
@ApiBearerAuth('JWT-auth')
export class SwaggerController {
  private readonly logger = new Logger(SwaggerController.name);

  constructor(
    private readonly swaggerService: SwaggerService,
    private readonly conversationService: ConversationService,
    private readonly tokenUsageService: TokenUsageService,
  ) {}

  @Post('query')
  @UseGuards(JwtAuthGuard)
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Swagger API 질문 답변',
    description:
      'Swagger API 문서를 기반으로 질문에 답변합니다. API 사용법, 예시, 테스트 데이터 등을 제공합니다.',
  })
  @ApiResponse({
    status: 200,
    description: 'API 질문 답변 성공',
  })
  @ApiResponse({
    status: 401,
    description: '인증 필요',
  })
  async queryApi(
    @Request() req: { user: { id: string } },
    @Body() body: ApiQueryDto,
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

    // Swagger API 쿼리 실행
    const result = await this.swaggerService.query(
      body.question,
      conversationHistory,
      body.swaggerKey,
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
            savedMessage.id,
            body.question,
          );
        } catch (error) {
          // 토큰 사용량 저장 실패는 로그만 남기고 계속 진행
          console.error(`토큰 사용량 저장 실패: ${(error as Error).message}`);
        }
      }
    }

    return {
      ...result,
      conversationId, // conversationId 반환
    };
  }

  @Post('upload')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(Role.ADMIN, Role.SUB_ADMIN)
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: '[관리자] Swagger 문서 업로드 (URL)',
    description:
      'Swagger JSON URL을 입력받아 API 정보를 벡터DB에 저장합니다. 같은 키가 이미 존재하면 기존 데이터를 삭제하고 재업로드합니다.',
  })
  @ApiResponse({
    status: 200,
    description: 'Swagger 문서 업로드 성공',
  })
  @ApiResponse({
    status: 400,
    description: '잘못된 요청 (유효하지 않은 URL 등)',
  })
  @ApiResponse({
    status: 401,
    description: '인증 필요',
  })
  @ApiResponse({
    status: 403,
    description: '권한 없음 (관리자만 접근 가능)',
  })
  async uploadSwaggerDocument(@Body() body: UploadSwaggerDto) {
    return await this.swaggerService.uploadSwaggerDocument(
      body.key,
      body.swaggerUrl,
    );
  }

  @Post('upload-file')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(Role.ADMIN, Role.SUB_ADMIN)
  @UseInterceptors(FileInterceptor('file'))
  @HttpCode(HttpStatus.OK)
  @ApiConsumes('multipart/form-data')
  @ApiOperation({
    summary: '[관리자] Swagger 문서 업로드 (파일)',
    description:
      'Swagger JSON 파일을 직접 업로드하여 API 정보를 벡터DB에 저장합니다. 같은 키가 이미 존재하면 기존 데이터를 삭제하고 재업로드합니다.',
  })
  @ApiBody({
    schema: {
      type: 'object',
      properties: {
        key: {
          type: 'string',
          description:
            'Swagger 문서 고유 키 (영어, 숫자, 소문자, 언더스코어만 허용)',
          example: 'rag_chat_api',
        },
        file: {
          type: 'string',
          format: 'binary',
          description: 'Swagger JSON 파일',
        },
      },
      required: ['key', 'file'],
    },
  })
  @ApiResponse({
    status: 200,
    description: 'Swagger 문서 업로드 성공',
  })
  @ApiResponse({
    status: 400,
    description: '잘못된 요청 (유효하지 않은 파일 형식 등)',
  })
  @ApiResponse({
    status: 401,
    description: '인증 필요',
  })
  @ApiResponse({
    status: 403,
    description: '권한 없음 (관리자만 접근 가능)',
  })
  async uploadSwaggerFile(
    @Body('key') key: string,
    @UploadedFile() file: { buffer: Buffer; originalname: string } | undefined,
  ) {
    if (!file) {
      throw new BadRequestException('파일이 제공되지 않았습니다.');
    }

    // 파일 확장자 검증
    const fileName = file.originalname.toLowerCase();
    if (!fileName.endsWith('.json')) {
      throw new BadRequestException(
        '지원하지 않는 파일 형식입니다. JSON 파일만 업로드 가능합니다.',
      );
    }

    // 키 유효성 검증
    if (!key || typeof key !== 'string') {
      throw new BadRequestException('키가 제공되지 않았습니다.');
    }

    if (key.length < 1 || key.length > 100) {
      throw new BadRequestException('키는 1자 이상 100자 이하여야 합니다.');
    }

    if (!/^[a-z0-9_]+$/.test(key)) {
      throw new BadRequestException(
        '키는 소문자 영어, 숫자, 언더스코어(_)만 사용할 수 있습니다.',
      );
    }

    // 파일 내용을 JSON으로 파싱
    let swaggerSpec: unknown;
    try {
      const fileContent = file.buffer.toString('utf-8');
      const parsed: unknown = JSON.parse(fileContent);
      if (
        typeof parsed !== 'object' ||
        parsed === null ||
        Array.isArray(parsed)
      ) {
        throw new BadRequestException('유효하지 않은 Swagger JSON 형식입니다.');
      }
      swaggerSpec = parsed;
    } catch (error) {
      if (error instanceof BadRequestException) {
        throw error;
      }
      const errorMessage =
        error instanceof Error ? error.message : String(error);
      throw new BadRequestException(`JSON 파일 파싱 실패: ${errorMessage}`);
    }

    // 1. 먼저 문서를 생성하여 ID를 얻음
    // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-call
    const swaggerDoc = (await this.swaggerService.createSwaggerDocument(
      key,
      swaggerSpec,
    )) as { id: string; key: string; indexingStatus: string };

    // 2. 비동기 처리: 백그라운드에서 실제 업로드 진행
    const uploadPromise = this.swaggerService.uploadSwaggerDocumentFromJson(
      key,
      swaggerSpec,
    ) as Promise<unknown>;
    // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access, @typescript-eslint/no-floating-promises
    uploadPromise.catch((error: unknown) => {
      const errorMessage =
        error instanceof Error ? error.message : String(error);
      this.logger.error(`백그라운드 Swagger 문서 업로드 실패: ${errorMessage}`);
    });

    // 3. 즉시 응답 반환 (문서 ID 포함)
    return {
      success: true,
      message:
        'Swagger 파일이 업로드되었습니다. 처리 중입니다. 상태는 문서 ID나 키로 확인할 수 있습니다.',
      documentId: swaggerDoc.id,
      key: swaggerDoc.key,
      status: swaggerDoc.indexingStatus,
    };
  }

  @Get('documents')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(Role.ADMIN, Role.SUB_ADMIN)
  @ApiOperation({
    summary: '[관리자] Swagger 문서 목록 조회',
    description: '업로드된 모든 Swagger 문서 목록을 조회합니다.',
  })
  @ApiResponse({
    status: 200,
    description: 'Swagger 문서 목록 반환',
  })
  @ApiResponse({
    status: 401,
    description: '인증 필요',
  })
  @ApiResponse({
    status: 403,
    description: '권한 없음',
  })
  async getSwaggerDocuments() {
    const documents = await this.swaggerService.getSwaggerDocuments();
    return {
      success: true,
      documents,
      total: documents.length,
    };
  }

  @Get('documents/:id')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(Role.ADMIN, Role.SUB_ADMIN)
  @ApiOperation({
    summary: '[관리자] 특정 Swagger 문서 조회',
    description: '특정 Swagger 문서의 상세 정보를 조회합니다.',
  })
  @ApiResponse({
    status: 200,
    description: 'Swagger 문서 정보 반환',
  })
  @ApiResponse({
    status: 404,
    description: '문서를 찾을 수 없음',
  })
  async getSwaggerDocument(@Param('id') id: string) {
    const document = await this.swaggerService.getSwaggerDocument(id);
    if (!document) {
      return {
        success: false,
        message: 'Swagger 문서를 찾을 수 없습니다.',
      };
    }
    return {
      success: true,
      document,
    };
  }

  @Delete('documents/:id')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(Role.ADMIN, Role.SUB_ADMIN)
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: '[관리자] Swagger 문서 삭제',
    description: 'Swagger 문서와 관련된 모든 벡터 데이터를 삭제합니다.',
  })
  @ApiResponse({
    status: 200,
    description: 'Swagger 문서 삭제 성공',
  })
  @ApiResponse({
    status: 404,
    description: '문서를 찾을 수 없음',
  })
  async deleteSwaggerDocument(@Param('id') id: string) {
    return await this.swaggerService.deleteSwaggerDocument(id);
  }
}
