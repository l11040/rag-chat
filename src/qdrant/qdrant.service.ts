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

  async search(collectionName: string, vector: number[]) {
    return await this.qdrantClient.search(collectionName, {
      vector: vector,
      limit: 3,
    });
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
}
