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

  getClient(): QdrantClient {
    return this.qdrantClient;
  }
}
