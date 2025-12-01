import { Injectable, Inject, OnModuleInit } from '@nestjs/common';
import { QdrantClient } from '@qdrant/js-client-rest';

@Injectable()
export class QdrantService implements OnModuleInit {
  constructor(
    @Inject('QDRANT_CLIENT') private readonly qdrantClient: QdrantClient,
  ) {}

  async onModuleInit() {
    try {
      const result = await this.qdrantClient.getCollections();
      console.log('Qdrant connected successfully:', result);
    } catch (error) {
      console.error('Failed to connect to Qdrant:', error);
    }
  }

  async createCollection(collectionName: string, vectorSize: number) {
    try {
      const result = await this.qdrantClient.createCollection(collectionName, {
        vectors: {
          size: vectorSize,
          distance: 'Cosine',
        },
      });
      return result;
    } catch {
      // If collection already exists, ignore error
      console.log(`Collection ${collectionName} might already exist.`);
      return null;
    }
  }

  async upsertPoints(collectionName: string, points: any[]) {
    return await this.qdrantClient.upsert(collectionName, {
      wait: true,
      // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
      points: points as any,
    });
  }

  async search(
    collectionName: string,
    vector: number[],
    limit: number = 5,
    filter?: {
      must?: Array<{
        key: string;
        match: { value: string };
      }>;
      should?: Array<{
        key: string;
        match: { value: string };
      }>;
    },
  ) {
    const searchOptions: {
      vector: number[];
      limit: number;
      filter?: {
        must?: Array<{
          key: string;
          match: { value: string };
        }>;
        should?: Array<{
          key: string;
          match: { value: string };
        }>;
      };
    } = {
      vector: vector,
      limit: limit,
    };

    if (filter) {
      searchOptions.filter = filter;
    }

    return await this.qdrantClient.search(collectionName, searchOptions as never);
  }

  async scrollPoints(collectionName: string, filter?: Record<string, any>) {
    return await this.qdrantClient.scroll(collectionName, {
      filter: filter,
      limit: 100,
      with_payload: true,
      with_vector: false,
    });
  }

  async isPageExists(collectionName: string, pageId: string): Promise<boolean> {
    try {
      // pageId로 시작하는 포인트 ID를 검색
      const result = await this.qdrantClient.scroll(collectionName, {
        filter: {
          must: [
            {
              key: 'pageId',
              match: {
                value: pageId,
              },
            },
          ],
        },
        limit: 1,
        with_payload: false,
        with_vector: false,
      });

      return result.points && result.points.length > 0;
    } catch (error) {
      console.error(`Error checking page existence: ${error}`);
      return false;
    }
  }

  getClient(): QdrantClient {
    return this.qdrantClient;
  }

  /**
   * 특정 페이지의 모든 벡터 포인트 삭제
   * @param collectionName 컬렉션 이름
   * @param pageId 삭제할 페이지 ID
   */
  async deletePagePoints(
    collectionName: string,
    pageId: string,
  ): Promise<{ deleted: number }> {
    try {
      // 먼저 해당 pageId를 가진 모든 포인트를 찾기
      const scrollResult = await this.qdrantClient.scroll(collectionName, {
        filter: {
          must: [
            {
              key: 'pageId',
              match: {
                value: pageId,
              },
            },
          ],
        },
        limit: 10000, // 충분히 큰 수
        with_payload: false,
        with_vector: false,
      });

      const pointIds = scrollResult.points.map((point) => point.id);

      if (pointIds.length === 0) {
        return { deleted: 0 };
      }

      // 찾은 포인트들 삭제
      await this.qdrantClient.delete(collectionName, {
        wait: true,
        points: pointIds,
      });

      return { deleted: pointIds.length };
    } catch (error) {
      console.error(`Error deleting page points: ${error}`);
      throw error;
    }
  }

  /**
   * 특정 Swagger 문서의 모든 벡터 포인트 삭제
   * @param collectionName 컬렉션 이름
   * @param swaggerDocumentId 삭제할 Swagger 문서 ID
   */
  async deleteSwaggerDocumentPoints(
    collectionName: string,
    swaggerDocumentId: string,
  ): Promise<number> {
    try {
      // 해당 swaggerDocumentId를 가진 모든 포인트를 찾기
      const scrollResult = await this.qdrantClient.scroll(collectionName, {
        filter: {
          must: [
            {
              key: 'swaggerDocumentId',
              match: {
                value: swaggerDocumentId,
              },
            },
          ],
        },
        limit: 10000, // 충분히 큰 수
        with_payload: false,
        with_vector: false,
      });

      const pointIds = scrollResult.points.map((point) => point.id);

      if (pointIds.length === 0) {
        return 0;
      }

      // 찾은 포인트들 삭제
      await this.qdrantClient.delete(collectionName, {
        wait: true,
        points: pointIds,
      });

      return pointIds.length;
    } catch (error) {
      console.error(`Error deleting Swagger document points: ${error}`);
      throw error;
    }
  }
}
