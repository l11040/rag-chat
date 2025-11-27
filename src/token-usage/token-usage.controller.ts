import {
  Controller,
  Get,
  Query,
  Param,
  UseGuards,
  Request,
  ParseIntPipe,
  DefaultValuePipe,
} from '@nestjs/common';
import {
  ApiTags,
  ApiOperation,
  ApiResponse,
  ApiBearerAuth,
  ApiQuery,
} from '@nestjs/swagger';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { TokenUsageService } from './token-usage.service';

@ApiTags('Token Usage')
@Controller('token-usage')
@UseGuards(JwtAuthGuard)
@ApiBearerAuth('JWT-auth')
export class TokenUsageController {
  constructor(private readonly tokenUsageService: TokenUsageService) {}

  @Get()
  @ApiOperation({
    summary: '사용자의 토큰 사용량 조회',
    description: '사용자의 모든 토큰 사용 내역을 조회합니다.',
  })
  @ApiQuery({
    name: 'limit',
    required: false,
    type: Number,
    description: '조회할 최대 개수',
  })
  @ApiQuery({
    name: 'offset',
    required: false,
    type: Number,
    description: '건너뛸 개수',
  })
  @ApiResponse({ status: 200, description: '토큰 사용량 조회 성공' })
  @ApiResponse({ status: 401, description: '인증 필요' })
  async getTokenUsage(
    @Request() req: { user: { id: string } },
    @Query(
      'limit',
      new DefaultValuePipe(undefined),
      new ParseIntPipe({ optional: true }),
    )
    limit?: number,
    @Query(
      'offset',
      new DefaultValuePipe(undefined),
      new ParseIntPipe({ optional: true }),
    )
    offset?: number,
  ) {
    const result = await this.tokenUsageService.getUserTokenUsage(
      req.user.id,
      limit,
      offset,
    );

    return {
      success: true,
      data: result.data,
      total: result.total,
      limit: limit || null,
      offset: offset || null,
    };
  }

  @Get('stats')
  @ApiOperation({
    summary: '사용자의 토큰 사용량 통계 조회',
    description: '사용자의 전체 토큰 사용량 통계를 조회합니다.',
  })
  @ApiResponse({ status: 200, description: '토큰 사용량 통계 조회 성공' })
  @ApiResponse({ status: 401, description: '인증 필요' })
  async getTokenUsageStats(@Request() req: { user: { id: string } }) {
    const stats = await this.tokenUsageService.getUserTokenUsageStats(
      req.user.id,
    );

    return {
      success: true,
      stats,
    };
  }

  @Get('conversation/:conversationId')
  @ApiOperation({
    summary: '특정 대화의 토큰 사용량 조회',
    description: '특정 대화에서 사용된 토큰 사용량을 조회합니다.',
  })
  @ApiResponse({ status: 200, description: '대화별 토큰 사용량 조회 성공' })
  @ApiResponse({ status: 401, description: '인증 필요' })
  async getConversationTokenUsage(
    @Request() req: { user: { id: string } },
    @Param('conversationId') conversationId: string,
  ) {
    const result = await this.tokenUsageService.getConversationTokenUsage(
      conversationId,
      req.user.id,
    );

    return {
      success: true,
      conversationId,
      data: result.data,
      total: result.total,
    };
  }

  @Get('date-range')
  @ApiOperation({
    summary: '날짜 범위별 토큰 사용량 조회',
    description: '지정한 날짜 범위의 토큰 사용량을 조회합니다.',
  })
  @ApiQuery({
    name: 'startDate',
    required: true,
    type: String,
    description: '시작 날짜 (ISO 8601 형식)',
  })
  @ApiQuery({
    name: 'endDate',
    required: true,
    type: String,
    description: '종료 날짜 (ISO 8601 형식)',
  })
  @ApiResponse({
    status: 200,
    description: '날짜 범위별 토큰 사용량 조회 성공',
  })
  @ApiResponse({ status: 401, description: '인증 필요' })
  async getTokenUsageByDateRange(
    @Request() req: { user: { id: string } },
    @Query('startDate') startDateStr: string,
    @Query('endDate') endDateStr: string,
  ) {
    const startDate = new Date(startDateStr);
    const endDate = new Date(endDateStr);

    if (isNaN(startDate.getTime()) || isNaN(endDate.getTime())) {
      return {
        success: false,
        error: '유효하지 않은 날짜 형식입니다.',
      };
    }

    const result = await this.tokenUsageService.getTokenUsageByDateRange(
      req.user.id,
      startDate,
      endDate,
    );

    return {
      success: true,
      startDate: startDate.toISOString(),
      endDate: endDate.toISOString(),
      data: result.data,
      total: result.total,
    };
  }

  @Get('message/:messageId')
  @ApiOperation({
    summary: '특정 메시지의 토큰 사용량 조회',
    description: '특정 메시지에서 사용된 토큰 사용량을 조회합니다.',
  })
  @ApiResponse({ status: 200, description: '메시지별 토큰 사용량 조회 성공' })
  @ApiResponse({ status: 401, description: '인증 필요' })
  @ApiResponse({ status: 404, description: '토큰 사용량을 찾을 수 없음' })
  async getMessageTokenUsage(
    @Request() req: { user: { id: string } },
    @Param('messageId') messageId: string,
  ) {
    const tokenUsage = await this.tokenUsageService.getMessageTokenUsage(
      messageId,
      req.user.id,
    );

    if (!tokenUsage) {
      return {
        success: false,
        error: '해당 메시지의 토큰 사용량을 찾을 수 없습니다.',
      };
    }

    return {
      success: true,
      messageId,
      data: tokenUsage,
    };
  }
}
