import { Module } from '@nestjs/common';
import { RagService } from './rag.service';
import { RagController } from './rag.controller';
import { NotionModule } from '../notion/notion.module';
import { OpenAIModule } from '../openai/openai.module';
import { QdrantModule } from '../qdrant/qdrant.module';

@Module({
  imports: [NotionModule, OpenAIModule, QdrantModule],
  controllers: [RagController],
  providers: [RagService],
  exports: [RagService],
})
export class RagModule {}
