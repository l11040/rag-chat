import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { TypeOrmModule } from '@nestjs/typeorm';
import { NotionService } from './notion.service';
import { NotionController } from './notion.controller';
import { NotionPage } from './entities/notion-page.entity';

@Module({
  imports: [ConfigModule, TypeOrmModule.forFeature([NotionPage])],
  controllers: [NotionController],
  providers: [NotionService],
  exports: [NotionService, TypeOrmModule],
})
export class NotionModule {}
