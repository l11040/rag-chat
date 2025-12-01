import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  UpdateDateColumn,
  ManyToOne,
  JoinColumn,
  Index,
} from 'typeorm';
import { Project } from './project.entity';
import { SwaggerDocument } from '../../swagger/entities/swagger-document.entity';

@Entity('project_swagger_documents')
@Index(['projectId', 'swaggerDocumentId'], { unique: true }) // 프로젝트-Swagger 문서 조합은 유일해야 함
export class ProjectSwaggerDocument {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column('uuid')
  projectId: string;

  @Column('uuid')
  swaggerDocumentId: string;

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;

  // 관계
  @ManyToOne(() => Project, (project) => project.swaggerDocuments, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'projectId' })
  project: Project;

  @ManyToOne(() => SwaggerDocument, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'swaggerDocumentId' })
  swaggerDocument: SwaggerDocument;
}

