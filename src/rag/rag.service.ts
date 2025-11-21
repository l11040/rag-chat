import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { NotionService } from '../notion/notion.service';
import { OpenAIService } from '../openai/openai.service';
import { QdrantService } from '../qdrant/qdrant.service';
import { randomUUID } from 'crypto';

// Define the shape of a Qdrant search result
interface SearchResult {
  id: string | number;
  score: number;
  payload: any;
}

interface NotionBlock {
  type: string;
  [key: string]: any;
}

interface NotionPage {
  id: string;
  url: string;
  properties: any;
}

@Injectable()
export class RagService {
  private readonly logger = new Logger(RagService.name);
  private readonly COLLECTION_NAME = 'notion_pages';
  private readonly VECTOR_SIZE = 1536; // text-embedding-3-small 차원
  private readonly CHUNK_SIZE = 1000; // 청크 크기 (문자 수)
  private readonly CHUNK_OVERLAP = 200; // 청크 오버랩

  constructor(
    private readonly notionService: NotionService,
    private readonly openaiService: OpenAIService,
    private readonly qdrantService: QdrantService,
    private readonly configService: ConfigService,
  ) {}

  async ingestNotionDatabase(databaseId?: string) {
    // databaseId가 제공되지 않으면 환경 변수에서 가져오기
    const targetDatabaseId = databaseId || this.configService.get<string>('NOTION_DATABASE_ID');
    
    if (!targetDatabaseId) {
      throw new Error('Database ID must be provided either as parameter or in NOTION_DATABASE_ID environment variable');
    }

    this.logger.log(`Starting ingestion for database: ${targetDatabaseId}`);

    // 1. Qdrant 컬렉션 생성 (이미 존재하면 무시됨)
    await this.qdrantService.createCollection(
      this.COLLECTION_NAME,
      this.VECTOR_SIZE,
    );

    // 2. Notion 데이터베이스에서 페이지 목록 가져오기
    const pages = (await this.notionService.getDatabase(
      targetDatabaseId,
    )) as NotionPage[];
    this.logger.log(`Found ${pages.length} pages`);

    let totalChunks = 0;
    let pagesSkipped = 0;

    // 3. 각 페이지 처리
    for (const page of pages) {
      try {
        const pageId = page.id;
        const pageUrl = page.url;
        const pageTitle = this.extractPageTitle(page);

        // 페이지가 이미 벡터 DB에 존재하는지 확인
        const exists = await this.qdrantService.isPageExists(
          this.COLLECTION_NAME,
          pageId,
        );

        if (exists) {
          this.logger.log(
            `Page "${pageTitle}" already exists in vector DB, skipping`,
          );
          pagesSkipped++;
          continue;
        }

        this.logger.log(`Processing page: ${pageTitle} (${pageId})`);

        // 4. 페이지 내용 가져오기
        const blocks = (await this.notionService.getPageContent(
          pageId,
        )) as NotionBlock[];

        // 5. 블록을 텍스트로 변환
        const fullText = this.blocksToText(blocks);
        this.logger.log(`Extracted text length: ${fullText.length} characters`);

        if (!fullText.trim()) {
          this.logger.warn(`Page ${pageTitle} has no text content, skipping`);
          continue;
        }

        // 6. 텍스트를 청크로 분할
        const chunks = this.splitTextIntoChunks(fullText);
        this.logger.log(`Split into ${chunks.length} chunks`);

        // 7. 각 청크에 대해 임베딩 생성 및 저장
        for (let i = 0; i < chunks.length; i++) {
          const chunk = chunks[i];
          const embedding = await this.openaiService.getEmbedding(chunk);

          // 8. Qdrant에 저장 (UUID 생성)
          const pointId = randomUUID();
          await this.qdrantService.upsertPoints(this.COLLECTION_NAME, [
            {
              id: pointId,
              vector: embedding,
              payload: {
                text: chunk,
                pageId: pageId,
                pageUrl: pageUrl,
                pageTitle: pageTitle,
                chunkIndex: i,
                totalChunks: chunks.length,
              },
            },
          ]);

          totalChunks++;
        }

        this.logger.log(`Completed processing page: ${pageTitle}`);
      } catch (error) {
        this.logger.error(
          `Failed to process page ${page.id}: ${(error as Error).message}`,
        );
      }
    }

    this.logger.log(
      `Ingestion complete. Total: ${pages.length} pages, Processed: ${pages.length - pagesSkipped}, Skipped: ${pagesSkipped}, Chunks created: ${totalChunks}`,
    );

    return {
      pagesProcessed: pages.length - pagesSkipped,
      pagesSkipped: pagesSkipped,
      chunksCreated: totalChunks,
    };
  }

  /**
   * Notion 페이지에서 제목 추출
   */
  private extractPageTitle(page: NotionPage): string {
    try {
      // Notion 페이지의 properties에서 title 속성 찾기
      const properties = page.properties;
      for (const key in properties) {
        const prop = properties[key];
        if (prop.type === 'title' && prop.title && prop.title.length > 0) {
          return prop.title.map((t: any) => t.plain_text).join('');
        }
      }
      return 'Untitled';
    } catch {
      return 'Untitled';
    }
  }

  /**
   * Notion 블록을 평문 텍스트로 변환
   */
  private blocksToText(blocks: NotionBlock[]): string {
    const textParts: string[] = [];

    for (const block of blocks) {
      const text = this.extractTextFromBlock(block);
      if (text) {
        textParts.push(text);
      }
    }

    return textParts.join('\n\n');
  }

  /**
   * 개별 블록에서 텍스트 추출
   */
  private extractTextFromBlock(block: NotionBlock): string {
    const type = block.type;

    // 텍스트가 포함된 블록 타입들
    const textTypes = [
      'paragraph',
      'heading_1',
      'heading_2',
      'heading_3',
      'bulleted_list_item',
      'numbered_list_item',
      'to_do',
      'toggle',
      'quote',
      'callout',
    ];

    if (textTypes.includes(type)) {
      const content = block[type];
      if (content && content.rich_text) {
        return content.rich_text
          .map((rt: any) => rt.plain_text || '')
          .join('');
      }
    }

    // 코드 블록
    if (type === 'code') {
      const content = block.code;
      if (content && content.rich_text) {
        return content.rich_text
          .map((rt: any) => rt.plain_text || '')
          .join('');
      }
    }

    return '';
  }

  /**
   * 텍스트를 청크로 분할 (오버랩 포함)
   */
  private splitTextIntoChunks(text: string): string[] {
    const chunks: string[] = [];
    let start = 0;

    while (start < text.length) {
      const end = Math.min(start + this.CHUNK_SIZE, text.length);
      const chunk = text.substring(start, end);
      chunks.push(chunk);

      // 마지막 청크가 아니면 오버랩만큼 뒤로 이동
      if (end < text.length) {
        start = end - this.CHUNK_OVERLAP;
      } else {
        break;
      }
    }

    return chunks;
  }

  /**
   * Qdrant 컬렉션 정보 조회
   */
  async getCollectionInfo() {
    try {
      const client = this.qdrantService.getClient();
      const collectionInfo = await client.getCollection(this.COLLECTION_NAME);
      
      return {
        success: true,
        collectionName: this.COLLECTION_NAME,
        info: collectionInfo,
      };
    } catch (error) {
      this.logger.error(`Failed to get collection info: ${(error as Error).message}`);
      return {
        success: false,
        error: (error as Error).message,
      };
    }
  }

  /**
   * 저장된 데이터 샘플 조회
   */
  async getSampleData() {
    try {
      const result = await this.qdrantService.scrollPoints(
        this.COLLECTION_NAME,
      );
      
      // 최대 10개만 반환
      const samples = result.points.slice(0, 10).map((point: any) => ({
        id: point.id,
        payload: point.payload,
      }));

      return {
        success: true,
        count: samples.length,
        totalPoints: result.points.length,
        samples,
      };
    } catch (error) {
      this.logger.error(`Failed to get sample data: ${(error as Error).message}`);
      return {
        success: false,
        error: (error as Error).message,
      };
    }
  }

  /**
   * Qdrant 저장 통계 정보
   */
  async getStats() {
    try {
      const client = this.qdrantService.getClient();
      const collectionInfo = await client.getCollection(this.COLLECTION_NAME);
      
      // 모든 포인트 가져오기
      const result = await this.qdrantService.scrollPoints(
        this.COLLECTION_NAME,
      );

      // 페이지별 통계 계산
      const pageStats = new Map<string, {
        pageId: string;
        pageTitle: string;
        pageUrl: string;
        chunkCount: number;
      }>();

      for (const point of result.points) {
        const payload = point.payload as any;
        const pageId = payload.pageId;
        
        if (!pageStats.has(pageId)) {
          pageStats.set(pageId, {
            pageId,
            pageTitle: payload.pageTitle || 'Unknown',
            pageUrl: payload.pageUrl || '',
            chunkCount: 0,
          });
        }
        
        const stats = pageStats.get(pageId)!;
        stats.chunkCount++;
      }

      return {
        success: true,
        collectionName: this.COLLECTION_NAME,
        totalVectors: collectionInfo.points_count,
        totalPages: pageStats.size,
        vectorSize: this.VECTOR_SIZE,
        pages: Array.from(pageStats.values()),
      };
    } catch (error) {
      this.logger.error(`Failed to get stats: ${(error as Error).message}`);
      return {
        success: false,
        error: (error as Error).message,
      };
    }
  }
  async query(question: string) {
    // Generate embedding for the question
    const embedding = await this.openaiService.getEmbedding(question);

    // Search Qdrant for similar chunks
    const searchResult = await this.qdrantService.search(this.COLLECTION_NAME, embedding);

    // Format the results with proper typing
    const results: SearchResult[] = (searchResult || []).map((item: any) => ({
      id: item.id,
      score: item.score,
      payload: item.payload,
    }));

    return { success: true, results };
  }
}

