import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  UpdateDateColumn,
  OneToMany,
} from 'typeorm';
import { ProjectMember } from './project-member.entity';
import { ProjectNotionPage } from './project-notion-page.entity';
import { ProjectSwaggerDocument } from './project-swagger-document.entity';

@Entity('projects')
export class Project {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column()
  name: string; // 프로젝트 이름

  @Column({ type: 'text', nullable: true })
  description: string | null; // 프로젝트 설명

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;

  // 관계
  @OneToMany(() => ProjectMember, (member) => member.project)
  members: ProjectMember[];

  @OneToMany(() => ProjectNotionPage, (projectNotionPage) => projectNotionPage.project)
  notionPages: ProjectNotionPage[];

  @OneToMany(() => ProjectSwaggerDocument, (projectSwaggerDoc) => projectSwaggerDoc.project)
  swaggerDocuments: ProjectSwaggerDocument[];
}

