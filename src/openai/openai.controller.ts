import { Controller, Get, Query, UseGuards } from '@nestjs/common';
import { OpenAIService } from './openai.service';
import {
  ApiTags,
  ApiOperation,
  ApiQuery,
  ApiBearerAuth,
  ApiResponse,
} from '@nestjs/swagger';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';

@ApiTags('openai')
@Controller('openai')
@UseGuards(JwtAuthGuard)
@ApiBearerAuth('JWT-auth')
export class OpenAIController {
  constructor(private readonly openaiService: OpenAIService) {}

  @Get('embedding')
  @ApiOperation({ summary: 'Generate embedding for text' })
  @ApiQuery({ name: 'text', required: true, type: String })
  @ApiResponse({ status: 200, description: '임베딩 생성 성공' })
  @ApiResponse({ status: 401, description: '인증 필요' })
  async getEmbedding(@Query('text') text: string) {
    return this.openaiService.getEmbedding(text);
  }
}
