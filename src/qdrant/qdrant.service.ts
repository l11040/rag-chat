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

  getClient(): QdrantClient {
    return this.qdrantClient;
  }
}
