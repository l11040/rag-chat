import { Module, Global } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { QdrantClient } from '@qdrant/js-client-rest';
import { QdrantService } from './qdrant.service';

@Global()
@Module({
  imports: [ConfigModule],
  providers: [
    {
      provide: 'QDRANT_CLIENT',
      useFactory: (configService: ConfigService) => {
        return new QdrantClient({
          host: configService.get('QDRANT_HOST'),
          port: configService.get('QDRANT_PORT'),
        });
      },
      inject: [ConfigService],
    },
    QdrantService,
  ],
  exports: ['QDRANT_CLIENT', QdrantService],
})
export class QdrantModule {}
