import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  UpdateDateColumn,
  Index,
} from 'typeorm';

export enum SwaggerIndexingStatus {
  PENDING = 'pending',
  PROCESSING = 'processing',
  COMPLETED = 'completed',
  FAILED = 'failed',
}

@Entity('swagger_documents')
export class SwaggerDocument {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ unique: true })
  key: string; // 사용자 지정 키 (고유 식별자)

  @Column({ type: 'varchar', length: 500, nullable: true })
  swaggerUrl: string | null; // Swagger JSON URL (파일 업로드의 경우 null)

  @Column({ type: 'varchar', length: 500, nullable: true })
  title: string | null; // Swagger 문서 제목 (info.title)

  @Column({ type: 'varchar', length: 500, nullable: true })
  version: string | null; // Swagger 문서 버전 (info.version)

  @Column({ type: 'text', nullable: true })
  description: string | null; // Swagger 문서 설명 (info.description)

  @Column({ type: 'int', default: 0 })
  apiCount: number; // 벡터 DB에 저장된 API 개수

  @Column({
    type: 'enum',
    enum: SwaggerIndexingStatus,
    default: SwaggerIndexingStatus.PENDING,
  })
  @Index()
  indexingStatus: SwaggerIndexingStatus; // 인덱싱 상태

  @Column({ type: 'timestamp', nullable: true })
  lastIndexedAt: Date | null; // 마지막 인덱싱 시간

  @Column({ type: 'text', nullable: true })
  errorMessage: string | null; // 인덱싱 실패 시 에러 메시지

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;
}
