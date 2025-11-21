import { Controller, Get, Param } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiResponse } from '@nestjs/swagger';
import { NotionService } from './notion.service';
import { ConfigService } from '@nestjs/config';

@ApiTags('notion')
@Controller('notion')
export class NotionController {
  constructor(
    private readonly notionService: NotionService,
    private readonly configService: ConfigService,
  ) {}

  @Get('database')
  @ApiOperation({ summary: 'Get Notion Database pages' })
  @ApiResponse({ status: 200, description: 'Returns the list of pages in the configured Notion database.' })
  async getDatabase() {
    const databaseId = this.configService.get<string>('NOTION_DATABASE_ID');
    if (!databaseId) {
      throw new Error('NOTION_DATABASE_ID is not defined');
    }
    return this.notionService.getDatabase(databaseId);
  }

  @Get('page/:pageId')
  @ApiOperation({ summary: 'Get Notion Page content' })
  @ApiResponse({ status: 200, description: 'Returns the content of a Notion page.' })
  async getPageContent(@Param('pageId') pageId: string) {
    return this.notionService.getPageContent(pageId);
  }
}
