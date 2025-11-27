import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { TokenUsage } from './entities/token-usage.entity';
import { TokenUsageService } from './token-usage.service';
import { TokenUsageController } from './token-usage.controller';

@Module({
  imports: [TypeOrmModule.forFeature([TokenUsage])],
  controllers: [TokenUsageController],
  providers: [TokenUsageService],
  exports: [TokenUsageService], // 다른 모듈에서 사용할 수 있도록 export
})
export class TokenUsageModule {}
