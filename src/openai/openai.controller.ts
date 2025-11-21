import { Controller, Get, Query } from '@nestjs/common';
import { OpenAIService } from './openai.service';
import { ApiTags, ApiOperation, ApiQuery } from '@nestjs/swagger';

@ApiTags('openai')
@Controller('openai')
export class OpenAIController {
  constructor(private readonly openaiService: OpenAIService) {}

  @Get('embedding')
  @ApiOperation({ summary: 'Generate embedding for text' })
  @ApiQuery({ name: 'text', required: true, type: String })
  async getEmbedding(@Query('text') text: string) {
    return this.openaiService.getEmbedding(text);
  }
}
