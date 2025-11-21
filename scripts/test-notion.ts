import { NestFactory } from '@nestjs/core';
import { AppModule } from '../src/app.module';
import { NotionService } from '../src/notion/notion.service';
import { ConfigService } from '@nestjs/config';

async function bootstrap() {
  const app = await NestFactory.createApplicationContext(AppModule);
  const notionService = app.get(NotionService);
  const configService = app.get(ConfigService);

  const databaseId = configService.get<string>('NOTION_DATABASE_ID');
  if (!databaseId) {
    throw new Error('NOTION_DATABASE_ID is not defined');
  }
  console.log(`Fetching database with ID: ${databaseId}`);

  try {
    console.log('Verifying database existence...');
    const metadata = await notionService.getDatabaseMetadata(databaseId);
    console.log('Database found:', metadata.id);
    
    // Use the ID from metadata which has dashes
    const results = await notionService.getDatabase(metadata.id);
    console.log('Successfully fetched database pages:', results.length);
    if (results.length > 0) {
      const firstPageId = results[0].id;
      console.log('First page ID:', firstPageId);
      console.log('Fetching content for first page...');
      const content = await notionService.getPageContent(firstPageId);
      console.log('Successfully fetched page content blocks:', content.length);
    }
  } catch (error) {
    console.error('Error fetching database:', error);
    
    // Fallback: Try native fetch to debug
    console.log('Attempting native fetch...');
    const apiKey = configService.get<string>('NOTION_API_KEY');
    const response = await fetch(`https://api.notion.com/v1/databases/${databaseId}/query`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${apiKey}`,
        'Notion-Version': '2022-06-28',
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({}),
    });
    
    if (response.ok) {
      const data = await response.json();
      console.log('Native fetch success:', data.results?.length);
    } else {
      console.log('Native fetch failed:', response.status, await response.text());
    }
  }

  await app.close();
}

bootstrap();
