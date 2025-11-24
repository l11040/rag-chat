import { Controller, Get, Post, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiResponse } from '@nestjs/swagger';
import { JwtAuthGuard } from './auth/guards/jwt-auth.guard';
import { AppService } from './app.service';
import { QdrantService } from './qdrant/qdrant.service';

@Controller()
@UseGuards(JwtAuthGuard)
@ApiBearerAuth('JWT-auth')
export class AppController {
  constructor(
    private readonly appService: AppService,
    private readonly qdrantService: QdrantService,
  ) {}

  @Get()
  @ApiResponse({ status: 200, description: 'Hello World' })
  @ApiResponse({ status: 401, description: '인증 필요' })
  getHello(): string {
    return this.appService.getHello();
  }

  @Post('qdrant/test')
  @ApiResponse({ status: 200, description: '테스트 데이터 삽입 성공' })
  @ApiResponse({ status: 401, description: '인증 필요' })
  async testQdrant() {
    const collectionName = 'test_collection';
    await this.qdrantService.createCollection(collectionName, 4);

    const points = [
      {
        id: 1,
        vector: [0.05, 0.61, 0.76, 0.74],
        payload: { city: 'Berlin' },
      },
      {
        id: 2,
        vector: [0.19, 0.81, 0.75, 0.11],
        payload: { city: 'London' },
      },
      {
        id: 3,
        vector: [0.36, 0.55, 0.47, 0.94],
        payload: { city: 'Moscow' },
      },
    ];

    await this.qdrantService.upsertPoints(collectionName, points);
    return { message: 'Test data inserted' };
  }

  @Get('qdrant/search')
  @ApiResponse({ status: 200, description: '검색 결과 반환' })
  @ApiResponse({ status: 401, description: '인증 필요' })
  async searchQdrant() {
    const collectionName = 'test_collection';
    const vector = [0.2, 0.1, 0.9, 0.7];
    return await this.qdrantService.search(collectionName, vector);
  }
}
