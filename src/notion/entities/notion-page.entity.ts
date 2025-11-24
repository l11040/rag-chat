import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  UpdateDateColumn,
  Index,
} from 'typeorm';

export enum IndexingStatus {
  PENDING = 'pending',
  PROCESSING = 'processing',
  COMPLETED = 'completed',
  FAILED = 'failed',
}

@Entity('notion_pages')
export class NotionPage {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ unique: true })
  notionPageId: string; // Notion API의 페이지 ID

  @Column()
  title: string; // 페이지 제목

  @Column({ type: 'text', nullable: true })
  url: string; // Notion 페이지 URL

  @Column({ type: 'varchar', length: 255, nullable: true })
  databaseId: string; // 속한 데이터베이스 ID

  @Column({ type: 'int', default: 0 })
  chunkCount: number; // 벡터 DB에 저장된 청크 개수

  @Column({
    type: 'enum',
    enum: IndexingStatus,
    default: IndexingStatus.PENDING,
  })
  @Index()
  indexingStatus: IndexingStatus; // 인덱싱 상태

  @Column({ type: 'timestamp', nullable: true })
  lastIndexedAt: Date | null; // 마지막 인덱싱 시간

  @Column({ type: 'timestamp', nullable: true })
  lastModifiedAt: Date | null; // Notion에서 마지막 수정 시간

  @Column({ type: 'text', nullable: true })
  errorMessage: string | null; // 인덱싱 실패 시 에러 메시지

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;
}
