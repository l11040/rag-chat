import {
  Injectable,
  NotFoundException,
  BadRequestException,
  ForbiddenException,
  Logger,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, In } from 'typeorm';
import { Project } from './entities/project.entity';
import { ProjectMember, ProjectRole } from './entities/project-member.entity';
import { ProjectNotionPage } from './entities/project-notion-page.entity';
import { ProjectSwaggerDocument } from './entities/project-swagger-document.entity';
import { NotionPage } from '../notion/entities/notion-page.entity';
import { SwaggerDocument } from '../swagger/entities/swagger-document.entity';
import { CreateProjectDto } from './dto/create-project.dto';
import { UpdateProjectDto } from './dto/update-project.dto';
import { AddMemberDto } from './dto/add-member.dto';
import { UpdateMemberRoleDto } from './dto/update-member-role.dto';
import {
  AddNotionPagesDto,
  AddSwaggerDocumentsDto,
} from './dto/add-documents.dto';

@Injectable()
export class ProjectService {
  private readonly logger = new Logger(ProjectService.name);

  constructor(
    @InjectRepository(Project)
    private readonly projectRepository: Repository<Project>,
    @InjectRepository(ProjectMember)
    private readonly projectMemberRepository: Repository<ProjectMember>,
    @InjectRepository(ProjectNotionPage)
    private readonly projectNotionPageRepository: Repository<ProjectNotionPage>,
    @InjectRepository(ProjectSwaggerDocument)
    private readonly projectSwaggerDocumentRepository: Repository<ProjectSwaggerDocument>,
    @InjectRepository(NotionPage)
    private readonly notionPageRepository: Repository<NotionPage>,
    @InjectRepository(SwaggerDocument)
    private readonly swaggerDocumentRepository: Repository<SwaggerDocument>,
  ) {}

  /**
   * 프로젝트 생성
   */
  async createProject(
    createProjectDto: CreateProjectDto,
    userId: string,
  ): Promise<Project> {
    const project = this.projectRepository.create(createProjectDto);
    const savedProject = await this.projectRepository.save(project);

    // 프로젝트 생성자를 프로젝트 관리자로 추가
    await this.projectMemberRepository.save({
      projectId: savedProject.id,
      userId,
      role: ProjectRole.PROJECT_MANAGER,
    });

    this.logger.log(`Project created: ${savedProject.id} by user: ${userId}`);
    return savedProject;
  }

  /**
   * 프로젝트 목록 조회 (사용자가 멤버인 프로젝트만)
   */
  async getUserProjects(userId: string): Promise<Project[]> {
    const members = await this.projectMemberRepository.find({
      where: { userId },
      relations: ['project'],
    });

    return members.map((member) => member.project);
  }

  /**
   * 프로젝트 상세 조회
   */
  async getProject(projectId: string): Promise<Project> {
    const project = await this.projectRepository.findOne({
      where: { id: projectId },
      relations: ['members', 'members.user', 'notionPages', 'notionPages.notionPage', 'swaggerDocuments', 'swaggerDocuments.swaggerDocument'],
    });

    if (!project) {
      throw new NotFoundException('프로젝트를 찾을 수 없습니다.');
    }

    return project;
  }

  /**
   * 프로젝트 업데이트
   */
  async updateProject(
    projectId: string,
    updateProjectDto: UpdateProjectDto,
  ): Promise<Project> {
    const project = await this.getProject(projectId);

    Object.assign(project, updateProjectDto);
    return await this.projectRepository.save(project);
  }

  /**
   * 프로젝트 삭제
   */
  async deleteProject(projectId: string): Promise<void> {
    const project = await this.getProject(projectId);
    await this.projectRepository.remove(project);
    this.logger.log(`Project deleted: ${projectId}`);
  }

  /**
   * 프로젝트 멤버 조회
   */
  async getProjectMember(
    projectId: string,
    userId: string,
  ): Promise<ProjectMember | null> {
    return await this.projectMemberRepository.findOne({
      where: { projectId, userId },
      relations: ['user', 'project'],
    });
  }

  /**
   * 프로젝트 멤버 목록 조회
   */
  async getProjectMembers(projectId: string): Promise<ProjectMember[]> {
    return await this.projectMemberRepository.find({
      where: { projectId },
      relations: ['user'],
      order: { createdAt: 'ASC' },
    });
  }

  /**
   * 프로젝트에 멤버 추가
   */
  async addMember(
    projectId: string,
    addMemberDto: AddMemberDto,
  ): Promise<ProjectMember> {
    // 프로젝트 존재 확인
    await this.getProject(projectId);

    // 이미 멤버인지 확인
    const existingMember = await this.getProjectMember(
      projectId,
      addMemberDto.userId,
    );
    if (existingMember) {
      throw new BadRequestException('이미 프로젝트 멤버입니다.');
    }

    const member = this.projectMemberRepository.create({
      projectId,
      userId: addMemberDto.userId,
      role: addMemberDto.role,
    });

    return await this.projectMemberRepository.save(member);
  }

  /**
   * 프로젝트 멤버 역할 업데이트
   */
  async updateMemberRole(
    projectId: string,
    userId: string,
    updateMemberRoleDto: UpdateMemberRoleDto,
  ): Promise<ProjectMember> {
    const member = await this.getProjectMember(projectId, userId);

    if (!member) {
      throw new NotFoundException('프로젝트 멤버를 찾을 수 없습니다.');
    }

    member.role = updateMemberRoleDto.role;
    return await this.projectMemberRepository.save(member);
  }

  /**
   * 프로젝트에서 멤버 제거
   */
  async removeMember(projectId: string, userId: string): Promise<void> {
    const member = await this.getProjectMember(projectId, userId);

    if (!member) {
      throw new NotFoundException('프로젝트 멤버를 찾을 수 없습니다.');
    }

    await this.projectMemberRepository.remove(member);
  }

  /**
   * 프로젝트에 Notion 페이지 추가
   */
  async addNotionPages(
    projectId: string,
    addNotionPagesDto: AddNotionPagesDto,
  ): Promise<ProjectNotionPage[]> {
    // 프로젝트 존재 확인
    await this.getProject(projectId);

    // Notion 페이지 존재 확인
    const notionPages = await this.notionPageRepository.find({
      where: { id: In(addNotionPagesDto.notionPageIds) },
    });

    if (notionPages.length !== addNotionPagesDto.notionPageIds.length) {
      throw new NotFoundException('일부 Notion 페이지를 찾을 수 없습니다.');
    }

    // 이미 추가된 페이지 필터링
    const existingPages = await this.projectNotionPageRepository.find({
      where: {
        projectId,
        notionPageId: In(addNotionPagesDto.notionPageIds),
      },
    });

    const existingPageIds = new Set(
      existingPages.map((p) => p.notionPageId),
    );
    const newPageIds = addNotionPagesDto.notionPageIds.filter(
      (id) => !existingPageIds.has(id),
    );

    if (newPageIds.length === 0) {
      throw new BadRequestException('모든 페이지가 이미 프로젝트에 추가되어 있습니다.');
    }

    // 새 페이지 추가
    const projectNotionPages = newPageIds.map((notionPageId) =>
      this.projectNotionPageRepository.create({
        projectId,
        notionPageId,
      }),
    );

    return await this.projectNotionPageRepository.save(projectNotionPages);
  }

  /**
   * 프로젝트에서 Notion 페이지 제거
   */
  async removeNotionPage(
    projectId: string,
    notionPageId: string,
  ): Promise<void> {
    const projectNotionPage = await this.projectNotionPageRepository.findOne({
      where: { projectId, notionPageId },
    });

    if (!projectNotionPage) {
      throw new NotFoundException('프로젝트에 해당 Notion 페이지가 없습니다.');
    }

    await this.projectNotionPageRepository.remove(projectNotionPage);
  }

  /**
   * 프로젝트에 Swagger 문서 추가
   */
  async addSwaggerDocuments(
    projectId: string,
    addSwaggerDocumentsDto: AddSwaggerDocumentsDto,
  ): Promise<ProjectSwaggerDocument[]> {
    // 프로젝트 존재 확인
    await this.getProject(projectId);

    // Swagger 문서 존재 확인
    const swaggerDocuments = await this.swaggerDocumentRepository.find({
      where: { id: In(addSwaggerDocumentsDto.swaggerDocumentIds) },
    });

    if (
      swaggerDocuments.length !== addSwaggerDocumentsDto.swaggerDocumentIds.length
    ) {
      throw new NotFoundException('일부 Swagger 문서를 찾을 수 없습니다.');
    }

    // 이미 추가된 문서 필터링
    const existingDocs = await this.projectSwaggerDocumentRepository.find({
      where: {
        projectId,
        swaggerDocumentId: In(addSwaggerDocumentsDto.swaggerDocumentIds),
      },
    });

    const existingDocIds = new Set(
      existingDocs.map((d) => d.swaggerDocumentId),
    );
    const newDocIds = addSwaggerDocumentsDto.swaggerDocumentIds.filter(
      (id) => !existingDocIds.has(id),
    );

    if (newDocIds.length === 0) {
      throw new BadRequestException(
        '모든 문서가 이미 프로젝트에 추가되어 있습니다.',
      );
    }

    // 새 문서 추가
    const projectSwaggerDocuments = newDocIds.map((swaggerDocumentId) =>
      this.projectSwaggerDocumentRepository.create({
        projectId,
        swaggerDocumentId,
      }),
    );

    return await this.projectSwaggerDocumentRepository.save(
      projectSwaggerDocuments,
    );
  }

  /**
   * 프로젝트에서 Swagger 문서 제거
   */
  async removeSwaggerDocument(
    projectId: string,
    swaggerDocumentId: string,
  ): Promise<void> {
    const projectSwaggerDocument =
      await this.projectSwaggerDocumentRepository.findOne({
        where: { projectId, swaggerDocumentId },
      });

    if (!projectSwaggerDocument) {
      throw new NotFoundException(
        '프로젝트에 해당 Swagger 문서가 없습니다.',
      );
    }

    await this.projectSwaggerDocumentRepository.remove(projectSwaggerDocument);
  }

  /**
   * 프로젝트에 속한 Notion 페이지 ID 목록 조회
   */
  async getProjectNotionPageIds(projectId: string): Promise<string[]> {
    const projectNotionPages = await this.projectNotionPageRepository.find({
      where: { projectId },
      relations: ['notionPage'],
    });

    // NotionPage 엔티티의 notionPageId (실제 Notion API의 페이지 ID) 반환
    return projectNotionPages.map((pnp) => pnp.notionPage.notionPageId);
  }

  /**
   * 프로젝트에 속한 Swagger 문서 ID 목록 조회
   */
  async getProjectSwaggerDocumentIds(projectId: string): Promise<string[]> {
    const projectSwaggerDocuments =
      await this.projectSwaggerDocumentRepository.find({
        where: { projectId },
        relations: ['swaggerDocument'],
      });

    // SwaggerDocument 엔티티의 id 반환
    return projectSwaggerDocuments.map((psd) => psd.swaggerDocument.id);
  }

  /**
   * 프로젝트에 속한 Swagger 문서 키 목록 조회
   */
  async getProjectSwaggerDocumentKeys(projectId: string): Promise<string[]> {
    const projectSwaggerDocuments =
      await this.projectSwaggerDocumentRepository.find({
        where: { projectId },
        relations: ['swaggerDocument'],
      });

    // SwaggerDocument 엔티티의 key 반환
    return projectSwaggerDocuments.map((psd) => psd.swaggerDocument.key);
  }

  /**
   * 프로젝트에 추가 가능한 Notion 페이지 목록 조회
   */
  async getSelectableNotionPages() {
    const pages = await this.notionPageRepository.find({
      order: { updatedAt: 'DESC' },
    });

    return {
      success: true,
      pages: pages.map((page) => ({
        id: page.id,
        notionPageId: page.notionPageId,
        title: page.title,
        url: page.url,
        chunkCount: page.chunkCount,
        indexingStatus: page.indexingStatus,
        lastIndexedAt: page.lastIndexedAt,
      })),
      total: pages.length,
    };
  }

  /**
   * 프로젝트에 추가 가능한 Swagger 문서 목록 조회
   */
  async getSelectableSwaggerDocuments() {
    const documents = await this.swaggerDocumentRepository.find({
      order: { createdAt: 'DESC' },
    });

    return {
      success: true,
      documents: documents.map((doc) => ({
        id: doc.id,
        key: doc.key,
        title: doc.title,
        version: doc.version,
        description: doc.description,
        apiCount: doc.apiCount,
        indexingStatus: doc.indexingStatus,
        lastIndexedAt: doc.lastIndexedAt,
      })),
      total: documents.length,
    };
  }
}

