import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { AppController } from './app.controller';
import { AppService } from './app.service';
import { QdrantModule } from './qdrant/qdrant.module';
import { NotionModule } from './notion/notion.module';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
    }),
    QdrantModule,
    NotionModule,
  ],
  controllers: [AppController],
  providers: [AppService],
})
export class AppModule {}
