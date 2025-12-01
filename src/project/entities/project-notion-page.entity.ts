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
import { NotionPage } from '../../notion/entities/notion-page.entity';

@Entity('project_notion_pages')
@Index(['projectId', 'notionPageId'], { unique: true }) // 프로젝트-Notion 페이지 조합은 유일해야 함
export class ProjectNotionPage {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column('uuid')
  projectId: string;

  @Column('uuid')
  notionPageId: string; // NotionPage 엔티티의 id (notionPageId가 아님)

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;

  // 관계
  @ManyToOne(() => Project, (project) => project.notionPages, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'projectId' })
  project: Project;

  @ManyToOne(() => NotionPage, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'notionPageId' })
  notionPage: NotionPage;
}

