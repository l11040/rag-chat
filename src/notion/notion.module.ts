import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { NotionService } from './notion.service';

import { NotionController } from './notion.controller';

@Module({
  imports: [ConfigModule],
  controllers: [NotionController],
  providers: [NotionService],
  exports: [NotionService],
})
export class NotionModule {}
