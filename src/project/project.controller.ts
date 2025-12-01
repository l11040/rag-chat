import {
  Controller,
  Get,
  Post,
  Put,
  Delete,
  Body,
  Param,
  UseGuards,
  Request,
} from '@nestjs/common';
import {
  ApiTags,
  ApiOperation,
  ApiResponse,
  ApiBearerAuth,
  ApiParam,
} from '@nestjs/swagger';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { Roles } from '../auth/decorators/roles.decorator';
import { Role } from '../auth/enums/role.enum';
import { ProjectAdminGuard } from './guards/project-admin.guard';
import { ProjectMemberGuard } from './guards/project-member.guard';
import { ProjectRoles } from './decorators/project-roles.decorator';
import { ProjectRole } from './entities/project-member.entity';
import { ProjectService } from './project.service';
import { CreateProjectDto } from './dto/create-project.dto';
import { UpdateProjectDto } from './dto/update-project.dto';
import { AddMemberDto } from './dto/add-member.dto';
import { UpdateMemberRoleDto } from './dto/update-member-role.dto';
import {
  AddNotionPagesDto,
  AddSwaggerDocumentsDto,
} from './dto/add-documents.dto';

@ApiTags('projects')
@Controller('projects')
@UseGuards(JwtAuthGuard)
@ApiBearerAuth('JWT-auth')
export class ProjectController {
  constructor(private readonly projectService: ProjectService) {}

  @Post()
  @UseGuards(RolesGuard)
  @Roles(Role.SUB_ADMIN, Role.ADMIN)
  @ApiOperation({ summary: '프로젝트 생성 (서브 관리자/관리자 전용)' })
  @ApiResponse({ status: 201, description: '프로젝트 생성 성공' })
  @ApiResponse({ status: 401, description: '인증 필요' })
  @ApiResponse({ status: 403, description: '권한 없음' })
  async createProject(
    @Body() createProjectDto: CreateProjectDto,
    @Request() req: any,
  ) {
    return await this.projectService.createProject(
      createProjectDto,
      req.user.id,
    );
  }

  @Get()
  @ApiOperation({ summary: '내 프로젝트 목록 조회' })
  @ApiResponse({ status: 200, description: '프로젝트 목록 조회 성공' })
  @ApiResponse({ status: 401, description: '인증 필요' })
  async getMyProjects(@Request() req: any) {
    return await this.projectService.getUserProjects(req.user.id);
  }

  @Get(':projectId')
  @ApiOperation({ summary: '프로젝트 상세 조회' })
  @ApiParam({ name: 'projectId', description: '프로젝트 ID' })
  @ApiResponse({ status: 200, description: '프로젝트 조회 성공' })
  @ApiResponse({ status: 401, description: '인증 필요' })
  @ApiResponse({ status: 404, description: '프로젝트를 찾을 수 없음' })
  @UseGuards(ProjectMemberGuard)
  async getProject(@Param('projectId') projectId: string) {
    return await this.projectService.getProject(projectId);
  }

  @Put(':projectId')
  @ApiOperation({ summary: '프로젝트 수정' })
  @ApiParam({ name: 'projectId', description: '프로젝트 ID' })
  @ApiResponse({ status: 200, description: '프로젝트 수정 성공' })
  @ApiResponse({ status: 401, description: '인증 필요' })
  @ApiResponse({ status: 403, description: '권한 없음' })
  @UseGuards(ProjectMemberGuard)
  @ProjectRoles(ProjectRole.PROJECT_MANAGER)
  async updateProject(
    @Param('projectId') projectId: string,
    @Body() updateProjectDto: UpdateProjectDto,
  ) {
    return await this.projectService.updateProject(projectId, updateProjectDto);
  }

  @Delete(':projectId')
  @ApiOperation({ summary: '프로젝트 삭제' })
  @ApiParam({ name: 'projectId', description: '프로젝트 ID' })
  @ApiResponse({ status: 200, description: '프로젝트 삭제 성공' })
  @ApiResponse({ status: 401, description: '인증 필요' })
  @ApiResponse({ status: 403, description: '권한 없음' })
  @UseGuards(ProjectMemberGuard)
  @ProjectRoles(ProjectRole.PROJECT_MANAGER)
  async deleteProject(@Param('projectId') projectId: string) {
    await this.projectService.deleteProject(projectId);
    return { message: '프로젝트가 삭제되었습니다.' };
  }

  // 멤버 관리
  @Get(':projectId/members')
  @ApiOperation({ summary: '프로젝트 멤버 목록 조회' })
  @ApiParam({ name: 'projectId', description: '프로젝트 ID' })
  @ApiResponse({ status: 200, description: '멤버 목록 조회 성공' })
  @UseGuards(ProjectMemberGuard)
  async getProjectMembers(@Param('projectId') projectId: string) {
    return await this.projectService.getProjectMembers(projectId);
  }

  @Post(':projectId/members')
  @ApiOperation({ summary: '프로젝트에 멤버 추가' })
  @ApiParam({ name: 'projectId', description: '프로젝트 ID' })
  @ApiResponse({ status: 201, description: '멤버 추가 성공' })
  @ApiResponse({ status: 403, description: '권한 없음' })
  @UseGuards(ProjectMemberGuard, ProjectAdminGuard)
  @UseGuards(RolesGuard)
  @Roles(Role.SUB_ADMIN, Role.ADMIN)
  async addMember(
    @Param('projectId') projectId: string,
    @Body() addMemberDto: AddMemberDto,
  ) {
    return await this.projectService.addMember(projectId, addMemberDto);
  }

  @Put(':projectId/members/:userId')
  @ApiOperation({ summary: '프로젝트 멤버 역할 변경' })
  @ApiParam({ name: 'projectId', description: '프로젝트 ID' })
  @ApiParam({ name: 'userId', description: '사용자 ID' })
  @ApiResponse({ status: 200, description: '멤버 역할 변경 성공' })
  @ApiResponse({ status: 403, description: '권한 없음' })
  @UseGuards(ProjectMemberGuard, ProjectAdminGuard)
  @UseGuards(RolesGuard)
  @Roles(Role.SUB_ADMIN, Role.ADMIN)
  async updateMemberRole(
    @Param('projectId') projectId: string,
    @Param('userId') userId: string,
    @Body() updateMemberRoleDto: UpdateMemberRoleDto,
  ) {
    return await this.projectService.updateMemberRole(
      projectId,
      userId,
      updateMemberRoleDto,
    );
  }

  @Delete(':projectId/members/:userId')
  @ApiOperation({ summary: '프로젝트에서 멤버 제거' })
  @ApiParam({ name: 'projectId', description: '프로젝트 ID' })
  @ApiParam({ name: 'userId', description: '사용자 ID' })
  @ApiResponse({ status: 200, description: '멤버 제거 성공' })
  @ApiResponse({ status: 403, description: '권한 없음' })
  @UseGuards(ProjectMemberGuard, ProjectAdminGuard)
  @UseGuards(RolesGuard)
  @Roles(Role.SUB_ADMIN, Role.ADMIN)
  async removeMember(
    @Param('projectId') projectId: string,
    @Param('userId') userId: string,
  ) {
    await this.projectService.removeMember(projectId, userId);
    return { message: '멤버가 제거되었습니다.' };
  }

  // 문서 관리
  @Post(':projectId/notion-pages')
  @ApiOperation({ summary: '프로젝트에 Notion 페이지 추가' })
  @ApiParam({ name: 'projectId', description: '프로젝트 ID' })
  @ApiResponse({ status: 201, description: 'Notion 페이지 추가 성공' })
  @ApiResponse({ status: 403, description: '권한 없음' })
  @UseGuards(ProjectMemberGuard)
  @ProjectRoles(ProjectRole.PROJECT_MANAGER)
  async addNotionPages(
    @Param('projectId') projectId: string,
    @Body() addNotionPagesDto: AddNotionPagesDto,
  ) {
    return await this.projectService.addNotionPages(
      projectId,
      addNotionPagesDto,
    );
  }

  @Delete(':projectId/notion-pages/:notionPageId')
  @ApiOperation({ summary: '프로젝트에서 Notion 페이지 제거' })
  @ApiParam({ name: 'projectId', description: '프로젝트 ID' })
  @ApiParam({ name: 'notionPageId', description: 'Notion 페이지 ID' })
  @ApiResponse({ status: 200, description: 'Notion 페이지 제거 성공' })
  @ApiResponse({ status: 403, description: '권한 없음' })
  @UseGuards(ProjectMemberGuard)
  @ProjectRoles(ProjectRole.PROJECT_MANAGER)
  async removeNotionPage(
    @Param('projectId') projectId: string,
    @Param('notionPageId') notionPageId: string,
  ) {
    await this.projectService.removeNotionPage(projectId, notionPageId);
    return { message: 'Notion 페이지가 제거되었습니다.' };
  }

  @Post(':projectId/swagger-documents')
  @ApiOperation({ summary: '프로젝트에 Swagger 문서 추가' })
  @ApiParam({ name: 'projectId', description: '프로젝트 ID' })
  @ApiResponse({ status: 201, description: 'Swagger 문서 추가 성공' })
  @ApiResponse({ status: 403, description: '권한 없음' })
  @UseGuards(ProjectMemberGuard)
  @ProjectRoles(ProjectRole.PROJECT_MANAGER)
  async addSwaggerDocuments(
    @Param('projectId') projectId: string,
    @Body() addSwaggerDocumentsDto: AddSwaggerDocumentsDto,
  ) {
    return await this.projectService.addSwaggerDocuments(
      projectId,
      addSwaggerDocumentsDto,
    );
  }

  @Delete(':projectId/swagger-documents/:swaggerDocumentId')
  @ApiOperation({ summary: '프로젝트에서 Swagger 문서 제거' })
  @ApiParam({ name: 'projectId', description: '프로젝트 ID' })
  @ApiParam({ name: 'swaggerDocumentId', description: 'Swagger 문서 ID' })
  @ApiResponse({ status: 200, description: 'Swagger 문서 제거 성공' })
  @ApiResponse({ status: 403, description: '권한 없음' })
  @UseGuards(ProjectMemberGuard)
  @ProjectRoles(ProjectRole.PROJECT_MANAGER)
  async removeSwaggerDocument(
    @Param('projectId') projectId: string,
    @Param('swaggerDocumentId') swaggerDocumentId: string,
  ) {
    await this.projectService.removeSwaggerDocument(
      projectId,
      swaggerDocumentId,
    );
    return { message: 'Swagger 문서가 제거되었습니다.' };
  }

  // 선택용 조회 API
  @Get('selectable/notion-pages')
  @ApiOperation({ summary: '프로젝트에 추가 가능한 Notion 페이지 목록 조회' })
  @ApiResponse({ status: 200, description: 'Notion 페이지 목록 반환' })
  @ApiResponse({ status: 401, description: '인증 필요' })
  async getSelectableNotionPages() {
    return await this.projectService.getSelectableNotionPages();
  }

  @Get('selectable/swagger-documents')
  @ApiOperation({ summary: '프로젝트에 추가 가능한 Swagger 문서 목록 조회' })
  @ApiResponse({ status: 200, description: 'Swagger 문서 목록 반환' })
  @ApiResponse({ status: 401, description: '인증 필요' })
  async getSelectableSwaggerDocuments() {
    return await this.projectService.getSelectableSwaggerDocuments();
  }
}

