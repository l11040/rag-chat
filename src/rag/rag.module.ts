import { Module } from '@nestjs/common';
import { RagService } from './rag.service';
import { RagController } from './rag.controller';
import { NotionModule } from '../notion/notion.module';
import { OpenAIModule } from '../openai/openai.module';
import { QdrantModule } from '../qdrant/qdrant.module';
import { ConversationModule } from '../conversation/conversation.module';
import { TokenUsageModule } from '../token-usage/token-usage.module';
import { ProjectModule } from '../project/project.module';
import { TypeOrmModule } from '@nestjs/typeorm';
import { NotionPage } from '../notion/entities/notion-page.entity';

@Module({
  imports: [
    NotionModule,
    OpenAIModule,
    QdrantModule,
    ConversationModule,
    TokenUsageModule,
    ProjectModule,
    TypeOrmModule.forFeature([NotionPage]),
  ],
  controllers: [RagController],
  providers: [RagService],
  exports: [RagService],
})
export class RagModule {}
