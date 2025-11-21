import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { NotionService } from '../notion/notion.service';
import { OpenAIService } from '../openai/openai.service';
import { QdrantService } from '../qdrant/qdrant.service';
import { randomUUID } from 'crypto';

// Define the shape of a Qdrant search result
export interface SearchResult {
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
  private readonly MIN_SCORE_THRESHOLD = 0.35; // 최소 유사도 점수 (Cosine similarity)

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
   * LLM 답변에서 실제로 사용된 문서 번호 추출
   * "[문서 1]", "[문서 2]" 같은 패턴을 찾아서 Set으로 반환
   */
  private extractUsedDocumentIndices(answer: string): Set<number> {
    const usedIndices = new Set<number>();
    
    // "[문서 N]" 패턴 찾기 (N은 숫자)
    const documentPattern = /\[문서\s*(\d+)\]/g;
    let match;
    
    while ((match = documentPattern.exec(answer)) !== null) {
      const docIndex = parseInt(match[1], 10);
      if (!isNaN(docIndex)) {
        usedIndices.add(docIndex);
      }
    }
    
    // 만약 인용이 하나도 없으면, 모든 문서를 사용한 것으로 간주 (하위 호환성)
    // 하지만 실제로는 답변이 생성되었다는 것은 최소한 일부 문서가 사용되었다는 의미
    // 따라서 인용이 없어도 답변이 생성되었다면, 상위 점수 문서들만 사용한 것으로 간주
    if (usedIndices.size === 0) {
      // 인용이 없으면 상위 3개 문서를 사용한 것으로 간주
      // (실제로는 LLM이 인용 없이 답변을 생성했을 수 있으므로)
      this.logger.warn('답변에서 문서 인용을 찾을 수 없습니다. 상위 문서들을 사용한 것으로 간주합니다.');
      // 빈 Set을 반환하면 필터링에서 모든 문서가 제외되므로, 최소한 상위 문서는 포함
      // 하지만 이 경우는 실제로 사용 여부를 알 수 없으므로, 모든 문서를 반환하지 않고
      // 상위 점수 문서만 반환하는 것이 더 나을 수 있습니다.
      // 일단 인용이 없으면 빈 Set을 반환하고, rag.service에서 처리하도록 합니다.
    }
    
    return usedIndices;
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
  async query(
    question: string,
    conversationHistory?: Array<{ role: 'user' | 'assistant'; content: string }>,
  ) {
    try {
      // 1. LLM을 사용하여 질문을 검색에 최적화된 쿼리로 재작성
      this.logger.log(`원본 질문: "${question}"`);
      const rewrittenQuery = await this.openaiService.rewriteQueryForSearch(
        question,
        conversationHistory,
      );
      this.logger.log(`재작성된 검색 쿼리: "${rewrittenQuery}"`);

      // 2. 재작성된 쿼리에 대한 임베딩 생성
      const embedding = await this.openaiService.getEmbedding(rewrittenQuery);

      // 3. Qdrant에서 유사한 청크 검색 (상위 10개로 증가하여 더 많은 컨텍스트 확보)
      const searchResult = await this.qdrantService.search(
        this.COLLECTION_NAME,
        embedding,
        10, // limit을 5에서 10으로 증가
      );

      // 3. 검색 결과 포맷팅 및 스코어 필터링
      const allResults: SearchResult[] = (searchResult || []).map((item: any) => ({
        id: item.id,
        score: item.score,
        payload: item.payload,
      }));

      // 4. 최소 스코어 임계값 이상인 결과만 필터링
      let results = allResults.filter(
        (result) => result.score >= this.MIN_SCORE_THRESHOLD,
      );

      this.logger.log(
        `검색 결과: 전체 ${allResults.length}개, 필터링 후 ${results.length}개 (임계값: ${this.MIN_SCORE_THRESHOLD})`,
      );

      // 5. 필터링 후 결과가 없으면 임계값을 낮춰서 재시도
      if (results.length === 0 && allResults.length > 0) {
        const maxScore = allResults[0].score;
        // 최고 점수가 0.25 이상이면 임계값을 낮춰서 재시도
        if (maxScore >= 0.25) {
          const loweredThreshold = Math.max(0.25, maxScore - 0.05);
          results = allResults.filter(
            (result) => result.score >= loweredThreshold,
          );
          this.logger.log(
            `임계값을 ${this.MIN_SCORE_THRESHOLD}에서 ${loweredThreshold.toFixed(3)}으로 낮춰서 재시도: ${results.length}개 결과 발견`,
          );
        }
      }

      // 6. 여전히 결과가 없으면 에러 반환
      if (results.length === 0) {
        const maxScore = allResults.length > 0 ? allResults[0].score : 0;
        this.logger.warn(
          `검색 결과가 없습니다. 최고 점수: ${maxScore.toFixed(4)}`,
        );
        return {
          success: false,
          answer: '제공된 문서에는 이 질문에 대한 충분히 관련성 있는 정보가 없습니다.',
          sources: [],
          maxScore: maxScore,
          threshold: this.MIN_SCORE_THRESHOLD,
          rewrittenQuery, // 재작성된 쿼리도 반환
        };
      }

      // 7. 검색된 문서들을 LLM에 전달할 형식으로 변환
      const contextDocuments = results.map((result) => ({
        text: result.payload.text || '',
        pageTitle: result.payload.pageTitle || 'Unknown',
        pageUrl: result.payload.pageUrl || '',
      }));

      this.logger.log(
        `LLM 답변 생성 시작: ${results.length}개의 문서 청크 사용 (최고 점수: ${results[0].score.toFixed(3)})`,
      );

      // 8. LLM을 사용하여 문서 기반 답변 생성
      const { answer, usage } = await this.openaiService.generateAnswer(
        question,
        contextDocuments,
        conversationHistory,
      );

      // 9. 답변에서 실제로 사용된 문서 인덱스 추출
      const usedDocumentIndices = this.extractUsedDocumentIndices(answer);
      
      // 10. 실제로 사용된 문서만 필터링하여 반환
      let sources;
      if (usedDocumentIndices.size > 0) {
        // 인용된 문서가 있으면 해당 문서만 반환
        sources = results
          .filter((_, index) => usedDocumentIndices.has(index + 1)) // 문서 번호는 1부터 시작
          .map((result) => ({
            pageTitle: result.payload.pageTitle || 'Unknown',
            pageUrl: result.payload.pageUrl || '',
            score: result.score,
            chunkText: (result.payload.text || '').substring(0, 200) + '...', // 미리보기
          }));
        this.logger.log(
          `답변에 실제로 사용된 문서: ${usedDocumentIndices.size}개 (전체 검색 결과: ${results.length}개)`,
        );
      } else {
        // 인용이 없으면 상위 점수 문서 3개만 반환 (실제로 사용되었을 가능성이 높음)
        sources = results
          .slice(0, 3)
          .map((result) => ({
            pageTitle: result.payload.pageTitle || 'Unknown',
            pageUrl: result.payload.pageUrl || '',
            score: result.score,
            chunkText: (result.payload.text || '').substring(0, 200) + '...', // 미리보기
          }));
        this.logger.log(
          `답변에서 문서 인용을 찾을 수 없어 상위 3개 문서를 반환합니다.`,
        );
      }

      return {
        success: true,
        answer,
        sources,
        question,
        rewrittenQuery, // 재작성된 쿼리도 반환하여 디버깅/모니터링에 유용
        usage,
      };
    } catch (error) {
      this.logger.error(`Failed to process query: ${(error as Error).message}`);
      return {
        success: false,
        answer: '답변 생성 중 오류가 발생했습니다.',
        error: (error as Error).message,
        sources: [],
      };
    }
  }
}

