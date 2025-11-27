import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { SwaggerDocument } from './entities/swagger-document.entity';
import { SwaggerService } from './swagger.service';
import { SwaggerController } from './swagger.controller';
import { OpenAIModule } from '../openai/openai.module';
import { QdrantModule } from '../qdrant/qdrant.module';
import { ConversationModule } from '../conversation/conversation.module';
import { TokenUsageModule } from '../token-usage/token-usage.module';

@Module({
  imports: [
    TypeOrmModule.forFeature([SwaggerDocument]),
    OpenAIModule,
    QdrantModule,
    ConversationModule,
    TokenUsageModule,
  ],
  controllers: [SwaggerController],
  providers: [SwaggerService],
  exports: [SwaggerService],
})
export class SwaggerModule {}
