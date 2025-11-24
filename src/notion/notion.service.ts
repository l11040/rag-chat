import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Client } from '@notionhq/client';

@Injectable()
export class NotionService {
  private notion: Client;

  constructor(private configService: ConfigService) {
    this.notion = new Client({
      auth: this.configService.get<string>('NOTION_API_KEY'),
    });
  }

  async getDatabaseMetadata(databaseId: string) {
    return await this.notion.databases.retrieve({
      database_id: databaseId,
    });
  }

  async getDatabase(databaseId: string) {
    const apiKey = this.configService.get<string>('NOTION_API_KEY');
    const response = await fetch(
      `https://api.notion.com/v1/databases/${databaseId}/query`,
      {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${apiKey}`,
          'Notion-Version': '2022-06-28',
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({}),
      },
    );

    if (!response.ok) {
      throw new Error(
        `Failed to fetch database: ${response.status} ${await response.text()}`,
      );
    }

    const data = await response.json();
    return data.results;
  }

  async getPageContent(pageId: string) {
    return await this.getAllBlocks(pageId);
  }

  /**
   * 블록과 그 자식 블록들을 재귀적으로 가져오기
   */
  private async getAllBlocks(blockId: string): Promise<any[]> {
    const response = await (this.notion as any).blocks.children.list({
      block_id: blockId,
    });

    const blocks = response.results;
    const allBlocks: any[] = [];

    for (const block of blocks) {
      allBlocks.push(block);

      // has_children이 true인 경우 자식 블록도 가져오기
      if (block.has_children) {
        const children = await this.getAllBlocks(block.id);
        allBlocks.push(...children);
      }
    }

    return allBlocks;
  }
}
