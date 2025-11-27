import {
  Controller,
  Get,
  Post,
  Put,
  Delete,
  Body,
  Param,
  UseGuards,
  Request,
  Logger,
} from '@nestjs/common';
import {
  ApiTags,
  ApiOperation,
  ApiResponse,
  ApiProperty,
  ApiBearerAuth,
} from '@nestjs/swagger';
import { IsString, IsOptional, MaxLength } from 'class-validator';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { ConversationService } from './conversation.service';

class CreateConversationDto {
  @ApiProperty({
    required: false,
    description: '대화 제목',
    maxLength: 500,
  })
  @IsOptional()
  @IsString()
  @MaxLength(500)
  title?: string;
}

class UpdateConversationTitleDto {
  @ApiProperty({
    required: true,
    description: '대화 제목',
    maxLength: 500,
  })
  @IsString()
  @MaxLength(500)
  title: string;
}

@ApiTags('Conversation')
@Controller('conversations')
@UseGuards(JwtAuthGuard)
@ApiBearerAuth('JWT-auth')
export class ConversationController {
  private readonly logger = new Logger(ConversationController.name);

  constructor(private readonly conversationService: ConversationService) {}

  @Post()
  @ApiOperation({ summary: '새 대화 생성' })
  @ApiResponse({ status: 201, description: '대화 생성 성공' })
  @ApiResponse({ status: 401, description: '인증 필요' })
  async createConversation(
    @Request() req: { user: { id: string } },
    @Body() body: CreateConversationDto,
  ) {
    const conversation = await this.conversationService.createConversation(
      req.user.id,
      body.title,
    );
    return {
      success: true,
      conversation: {
        id: conversation.id,
        title: conversation.title,
        createdAt: conversation.createdAt,
        updatedAt: conversation.updatedAt,
      },
    };
  }

  @Get()
  @ApiOperation({ summary: '사용자의 모든 대화 목록 조회' })
  @ApiResponse({ status: 200, description: '대화 목록 반환' })
  @ApiResponse({ status: 401, description: '인증 필요' })
  async getConversations(@Request() req: { user: { id: string } }) {
    const conversations = await this.conversationService.getConversations(
      req.user.id,
    );
    return {
      success: true,
      conversations: conversations.map((conv) => ({
        id: conv.id,
        title: conv.title,
        messageCount: conv.messages?.length || 0,
        createdAt: conv.createdAt,
        updatedAt: conv.updatedAt,
      })),
    };
  }

  @Get(':id')
  @ApiOperation({ summary: '특정 대화 조회 (메시지 포함)' })
  @ApiResponse({ status: 200, description: '대화 정보 반환' })
  @ApiResponse({ status: 401, description: '인증 필요' })
  @ApiResponse({ status: 404, description: '대화를 찾을 수 없음' })
  async getConversation(
    @Request() req: { user: { id: string } },
    @Param('id') id: string,
  ) {
    const conversation = await this.conversationService.getConversation(
      id,
      req.user.id,
    );
    return {
      success: true,
      conversation: {
        id: conversation.id,
        title: conversation.title,
        messages: conversation.messages.map((msg) => ({
          id: msg.id,
          role: msg.role,
          content: msg.content,
          metadata: msg.metadata,
          createdAt: msg.createdAt,
        })),
        createdAt: conversation.createdAt,
        updatedAt: conversation.updatedAt,
      },
    };
  }

  @Put(':id/title')
  @ApiOperation({ summary: '대화 제목 업데이트' })
  @ApiResponse({ status: 200, description: '제목 업데이트 성공' })
  @ApiResponse({ status: 401, description: '인증 필요' })
  @ApiResponse({ status: 404, description: '대화를 찾을 수 없음' })
  async updateConversationTitle(
    @Request() req: { user: { id: string } },
    @Param('id') id: string,
    @Body() body: UpdateConversationTitleDto,
  ) {
    const conversation = await this.conversationService.updateConversationTitle(
      id,
      req.user.id,
      body.title,
    );
    return {
      success: true,
      conversation: {
        id: conversation.id,
        title: conversation.title,
        updatedAt: conversation.updatedAt,
      },
    };
  }

  @Delete(':id')
  @ApiOperation({ summary: '대화 삭제' })
  @ApiResponse({ status: 200, description: '대화 삭제 성공' })
  @ApiResponse({ status: 401, description: '인증 필요' })
  @ApiResponse({ status: 404, description: '대화를 찾을 수 없음' })
  async deleteConversation(
    @Request() req: { user: { id: string } },
    @Param('id') id: string,
  ) {
    await this.conversationService.deleteConversation(id, req.user.id);
    return {
      success: true,
      message: '대화가 삭제되었습니다.',
    };
  }
}
