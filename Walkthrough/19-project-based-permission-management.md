# 프로젝트 기반 권한 관리 시스템 구현

## 개요

프로젝트별로 문서 접근 권한을 관리할 수 있는 시스템을 구현했습니다. 사용자는 프로젝트에 참여하여 해당 프로젝트의 문서만 검색할 수 있으며, 프로젝트 관리자는 프로젝트에 포함할 문서를 선택할 수 있습니다.

## 주요 기능

- 📁 **프로젝트 관리**: 프로젝트 생성, 수정, 삭제 (서브 관리자/관리자만 가능)
- 👥 **멤버 관리**: 프로젝트에 유저 추가 및 역할 관리 (서브 관리자/관리자만 가능)
- 📚 **문서 관리**: 프로젝트에 Notion 페이지 및 Swagger 문서 추가/제거 (프로젝트 관리자만 가능)
- 🔍 **프로젝트별 검색**: RAG 쿼리 시 프로젝트에 속한 문서만 검색
- 🔐 **권한 체계**: 프로젝트 멤버 권한과 시스템 권한의 이중 체계

## 작업 내용

### 1. 데이터베이스 스키마 설계

프로젝트와 관련된 4개의 테이블을 설계했습니다.

#### Project 엔티티

**`src/project/entities/project.entity.ts`**

```typescript
@Entity('projects')
export class Project {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column()
  name: string; // 프로젝트 이름

  @Column({ type: 'text', nullable: true })
  description: string | null; // 프로젝트 설명

  @OneToMany(() => ProjectMember, (member) => member.project)
  members: ProjectMember[];

  @OneToMany(() => ProjectNotionPage, (projectNotionPage) => projectNotionPage.project)
  notionPages: ProjectNotionPage[];

  @OneToMany(() => ProjectSwaggerDocument, (projectSwaggerDoc) => projectSwaggerDoc.project)
  swaggerDocuments: ProjectSwaggerDocument[];

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;
}
```

#### ProjectMember 엔티티

**`src/project/entities/project-member.entity.ts`**

```typescript
export enum ProjectRole {
  MEMBER = 'member', // 일반 멤버
  PROJECT_MANAGER = 'project_manager', // 프로젝트 관리자
}

@Entity('project_members')
@Index(['projectId', 'userId'], { unique: true })
export class ProjectMember {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column('uuid')
  projectId: string;

  @Column('uuid')
  userId: string;

  @Column({
    type: 'enum',
    enum: ProjectRole,
    default: ProjectRole.MEMBER,
  })
  role: ProjectRole; // 프로젝트 내 역할

  @ManyToOne(() => Project, (project) => project.members, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'projectId' })
  project: Project;

  @ManyToOne(() => User, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'userId' })
  user: User;

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;
}
```

**프로젝트 내 역할:**
- `MEMBER`: 일반 멤버 - 프로젝트 문서 검색 가능
- `PROJECT_MANAGER`: 프로젝트 관리자 - 프로젝트 정보 수정 및 문서 관리 가능

#### ProjectNotionPage 엔티티

**`src/project/entities/project-notion-page.entity.ts`**

```typescript
@Entity('project_notion_pages')
@Index(['projectId', 'notionPageId'], { unique: true })
export class ProjectNotionPage {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column('uuid')
  projectId: string;

  @Column('uuid')
  notionPageId: string; // NotionPage 엔티티의 id

  @ManyToOne(() => Project, (project) => project.notionPages, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'projectId' })
  project: Project;

  @ManyToOne(() => NotionPage, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'notionPageId' })
  notionPage: NotionPage;

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;
}
```

#### ProjectSwaggerDocument 엔티티

**`src/project/entities/project-swagger-document.entity.ts`**

```typescript
@Entity('project_swagger_documents')
@Index(['projectId', 'swaggerDocumentId'], { unique: true })
export class ProjectSwaggerDocument {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column('uuid')
  projectId: string;

  @Column('uuid')
  swaggerDocumentId: string;

  @ManyToOne(() => Project, (project) => project.swaggerDocuments, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'projectId' })
  project: Project;

  @ManyToOne(() => SwaggerDocument, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'swaggerDocumentId' })
  swaggerDocument: SwaggerDocument;

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;
}
```

### 2. 권한 관리 시스템 구현

프로젝트별 권한을 체크하는 Guard와 데코레이터를 구현했습니다.

#### ProjectMemberGuard

**`src/project/guards/project-member.guard.ts`**

```typescript
@Injectable()
export class ProjectMemberGuard implements CanActivate {
  constructor(
    private reflector: Reflector,
    private projectService: ProjectService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const requiredRoles = this.reflector.getAllAndOverride<ProjectRole[]>(
      PROJECT_ROLES_KEY,
      [context.getHandler(), context.getClass()],
    );

    if (!requiredRoles) {
      return true; // 역할이 지정되지 않았으면 통과
    }

    const request = context.switchToHttp().getRequest();
    const user = request.user;

    if (!user) {
      throw new UnauthorizedException('인증이 필요합니다.');
    }

    const projectId =
      request.params?.projectId ||
      request.body?.projectId ||
      request.query?.projectId;

    if (!projectId) {
      throw new ForbiddenException('프로젝트 ID가 필요합니다.');
    }

    // 사용자가 프로젝트 멤버인지 확인
    const member = await this.projectService.getProjectMember(
      projectId,
      user.id,
    );

    if (!member) {
      throw new ForbiddenException('프로젝트에 접근할 권한이 없습니다.');
    }

    // 역할 체크
    if (requiredRoles.length > 0 && !requiredRoles.includes(member.role)) {
      throw new ForbiddenException(
        `이 작업을 수행하려면 ${requiredRoles.join(' 또는 ')} 권한이 필요합니다.`,
      );
    }

    request.projectMember = member;
    return true;
  }
}
```

#### ProjectAdminGuard

**`src/project/guards/project-admin.guard.ts`**

```typescript
@Injectable()
export class ProjectAdminGuard implements CanActivate {
  canActivate(context: ExecutionContext): boolean {
    const request = context.switchToHttp().getRequest();
    const user = request.user;

    if (!user) {
      return false;
    }

    // 서브 관리자 또는 관리자만 허용
    if (user.role === Role.SUB_ADMIN || user.role === Role.ADMIN) {
      return true;
    }

    throw new ForbiddenException(
      '프로젝트 권한을 관리하려면 서브 관리자 또는 관리자 권한이 필요합니다.',
    );
  }
}
```

#### ProjectRoles 데코레이터

**`src/project/decorators/project-roles.decorator.ts`**

```typescript
export const PROJECT_ROLES_KEY = 'project_roles';
export const ProjectRoles = (...roles: ProjectRole[]) =>
  SetMetadata(PROJECT_ROLES_KEY, roles);
```

### 3. 프로젝트 서비스 구현

프로젝트 관리, 멤버 관리, 문서 관리를 위한 서비스를 구현했습니다.

**`src/project/project.service.ts`**

주요 메서드:

- `createProject()`: 프로젝트 생성 (생성자는 자동으로 프로젝트 관리자로 추가)
- `getUserProjects()`: 사용자가 멤버인 프로젝트 목록 조회
- `getProject()`: 프로젝트 상세 조회
- `addMember()`: 프로젝트에 멤버 추가
- `updateMemberRole()`: 멤버 역할 변경
- `addNotionPages()`: 프로젝트에 Notion 페이지 추가
- `addSwaggerDocuments()`: 프로젝트에 Swagger 문서 추가
- `getProjectNotionPageIds()`: 프로젝트에 속한 Notion 페이지 ID 목록 조회
- `getProjectSwaggerDocumentKeys()`: 프로젝트에 속한 Swagger 문서 키 목록 조회

### 4. 벡터 DB 필터링 구현

RAG 쿼리 시 프로젝트에 속한 문서만 검색하도록 필터링을 구현했습니다.

#### QdrantService 수정

**`src/qdrant/qdrant.service.ts`**

```typescript
async search(
  collectionName: string,
  vector: number[],
  limit: number = 5,
  filter?: {
    must?: Array<{
      key: string;
      match: { value: string };
    }>;
    should?: Array<{
      key: string;
      match: { value: string };
    }>;
  },
) {
  const searchOptions = {
    vector: vector,
    limit: limit,
  };

  if (filter) {
    searchOptions.filter = filter;
  }

  return await this.qdrantClient.search(collectionName, searchOptions as never);
}
```

#### RagService 수정

**`src/rag/rag.service.ts`**

```typescript
async query(
  question: string,
  conversationHistory?: Array<{
    role: 'user' | 'assistant';
    content: string;
  }>,
  projectId?: string,
  userId?: string,
) {
  // projectId는 필수
  if (!projectId) {
    throw new BadRequestException('프로젝트 ID는 필수입니다.');
  }

  if (!userId) {
    throw new ForbiddenException('프로젝트 쿼리를 위해서는 사용자 인증이 필요합니다.');
  }

  // 사용자가 프로젝트 멤버인지 확인
  const member = await this.projectService.getProjectMember(projectId, userId);
  if (!member) {
    throw new ForbiddenException('프로젝트에 접근할 권한이 없습니다.');
  }

  // 프로젝트에 속한 Notion 페이지 ID 목록 가져오기
  const projectNotionPageIds =
    await this.projectService.getProjectNotionPageIds(projectId);

  // 프로젝트에 문서가 없는 경우
  if (projectNotionPageIds.length === 0) {
    return {
      success: false,
      answer: '프로젝트에 문서가 없습니다. 프로젝트 관리자에게 문의하세요.',
      sources: [],
      rewrittenQuery,
    };
  }

  // Qdrant 검색 필터 설정 (프로젝트별 문서만 검색)
  const searchFilter = {
    should: projectNotionPageIds.map((pageId) => ({
      key: 'pageId',
      match: { value: pageId },
    })),
  };

  // Qdrant에서 유사한 청크 검색
  const searchResult = await this.qdrantService.search(
    this.COLLECTION_NAME,
    embedding,
    10,
    searchFilter,
  );

  // ... 나머지 로직
}
```

**중요:** Qdrant에서 여러 값을 필터링할 때는 `should`를 사용해야 합니다. 각 `pageId`에 대해 개별 `match` 조건을 만들고 `should`로 묶어서 OR 조건으로 처리합니다.

### 5. API 엔드포인트 구현

#### 프로젝트 관리

**`src/project/project.controller.ts`**

```typescript
@Controller('projects')
@UseGuards(JwtAuthGuard)
@ApiBearerAuth('JWT-auth')
export class ProjectController {
  // 프로젝트 생성 (서브 관리자/관리자만)
  @Post()
  @UseGuards(RolesGuard)
  @Roles(Role.SUB_ADMIN, Role.ADMIN)
  async createProject(@Body() createProjectDto: CreateProjectDto, @Request() req: any) {
    return await this.projectService.createProject(createProjectDto, req.user.id);
  }

  // 내 프로젝트 목록 조회
  @Get()
  async getMyProjects(@Request() req: any) {
    return await this.projectService.getUserProjects(req.user.id);
  }

  // 프로젝트 상세 조회 (프로젝트 멤버만)
  @Get(':projectId')
  @UseGuards(ProjectMemberGuard)
  async getProject(@Param('projectId') projectId: string) {
    return await this.projectService.getProject(projectId);
  }

  // 프로젝트 수정 (프로젝트 관리자만)
  @Put(':projectId')
  @UseGuards(ProjectMemberGuard)
  @ProjectRoles(ProjectRole.PROJECT_MANAGER)
  async updateProject(@Param('projectId') projectId: string, @Body() updateProjectDto: UpdateProjectDto) {
    return await this.projectService.updateProject(projectId, updateProjectDto);
  }

  // 프로젝트 삭제 (프로젝트 관리자만)
  @Delete(':projectId')
  @UseGuards(ProjectMemberGuard)
  @ProjectRoles(ProjectRole.PROJECT_MANAGER)
  async deleteProject(@Param('projectId') projectId: string) {
    await this.projectService.deleteProject(projectId);
    return { message: '프로젝트가 삭제되었습니다.' };
  }
}
```

#### 멤버 관리

```typescript
// 프로젝트 멤버 목록 조회
@Get(':projectId/members')
@UseGuards(ProjectMemberGuard)
async getProjectMembers(@Param('projectId') projectId: string) {
  return await this.projectService.getProjectMembers(projectId);
}

// 프로젝트에 멤버 추가 (서브 관리자/관리자만)
@Post(':projectId/members')
@UseGuards(ProjectMemberGuard, ProjectAdminGuard)
@UseGuards(RolesGuard)
@Roles(Role.SUB_ADMIN, Role.ADMIN)
async addMember(@Param('projectId') projectId: string, @Body() addMemberDto: AddMemberDto) {
  return await this.projectService.addMember(projectId, addMemberDto);
}

// 멤버 역할 변경 (서브 관리자/관리자만)
@Put(':projectId/members/:userId')
@UseGuards(ProjectMemberGuard, ProjectAdminGuard)
@UseGuards(RolesGuard)
@Roles(Role.SUB_ADMIN, Role.ADMIN)
async updateMemberRole(
  @Param('projectId') projectId: string,
  @Param('userId') userId: string,
  @Body() updateMemberRoleDto: UpdateMemberRoleDto,
) {
  return await this.projectService.updateMemberRole(projectId, userId, updateMemberRoleDto);
}

// 멤버 제거 (서브 관리자/관리자만)
@Delete(':projectId/members/:userId')
@UseGuards(ProjectMemberGuard, ProjectAdminGuard)
@UseGuards(RolesGuard)
@Roles(Role.SUB_ADMIN, Role.ADMIN)
async removeMember(@Param('projectId') projectId: string, @Param('userId') userId: string) {
  await this.projectService.removeMember(projectId, userId);
  return { message: '멤버가 제거되었습니다.' };
}
```

#### 문서 관리

```typescript
// 프로젝트에 Notion 페이지 추가 (프로젝트 관리자만)
@Post(':projectId/notion-pages')
@UseGuards(ProjectMemberGuard)
@ProjectRoles(ProjectRole.PROJECT_MANAGER)
async addNotionPages(
  @Param('projectId') projectId: string,
  @Body() addNotionPagesDto: AddNotionPagesDto,
) {
  return await this.projectService.addNotionPages(projectId, addNotionPagesDto);
}

// 프로젝트에서 Notion 페이지 제거 (프로젝트 관리자만)
@Delete(':projectId/notion-pages/:notionPageId')
@UseGuards(ProjectMemberGuard)
@ProjectRoles(ProjectRole.PROJECT_MANAGER)
async removeNotionPage(
  @Param('projectId') projectId: string,
  @Param('notionPageId') notionPageId: string,
) {
  await this.projectService.removeNotionPage(projectId, notionPageId);
  return { message: 'Notion 페이지가 제거되었습니다.' };
}

// 프로젝트에 Swagger 문서 추가 (프로젝트 관리자만)
@Post(':projectId/swagger-documents')
@UseGuards(ProjectMemberGuard)
@ProjectRoles(ProjectRole.PROJECT_MANAGER)
async addSwaggerDocuments(
  @Param('projectId') projectId: string,
  @Body() addSwaggerDocumentsDto: AddSwaggerDocumentsDto,
) {
  return await this.projectService.addSwaggerDocuments(projectId, addSwaggerDocumentsDto);
}

// 프로젝트에서 Swagger 문서 제거 (프로젝트 관리자만)
@Delete(':projectId/swagger-documents/:swaggerDocumentId')
@UseGuards(ProjectMemberGuard)
@ProjectRoles(ProjectRole.PROJECT_MANAGER)
async removeSwaggerDocument(
  @Param('projectId') projectId: string,
  @Param('swaggerDocumentId') swaggerDocumentId: string,
) {
  await this.projectService.removeSwaggerDocument(projectId, swaggerDocumentId);
  return { message: 'Swagger 문서가 제거되었습니다.' };
}
```

#### 선택용 조회 API

```typescript
// 프로젝트에 추가 가능한 Notion 페이지 목록 조회
@Get('selectable/notion-pages')
async getSelectableNotionPages() {
  return await this.projectService.getSelectableNotionPages();
}

// 프로젝트에 추가 가능한 Swagger 문서 목록 조회
@Get('selectable/swagger-documents')
async getSelectableSwaggerDocuments() {
  return await this.projectService.getSelectableSwaggerDocuments();
}
```

#### RAG 쿼리 수정

**`src/rag/rag.controller.ts`**

```typescript
@Post('query')
async query(@Request() req: { user: { id: string } }, @Body() body: QueryDto) {
  // ... 대화 관리 로직

  // RAG 쿼리 실행 (projectId는 필수)
  const result = await this.ragService.query(
    body.question,
    conversationHistory,
    body.projectId, // 필수
    req.user.id,
  );

  // ... 답변 저장 로직
}
```

**QueryDto 수정:**

```typescript
class QueryDto {
  @ApiProperty({ required: true, description: '사용자 질문 문자열' })
  @IsString()
  question: string;

  @ApiProperty({ required: true, description: '프로젝트 ID' })
  @IsString()
  projectId: string; // 필수로 변경

  @ApiProperty({ required: false, description: '대화 ID' })
  @IsOptional()
  @IsString()
  conversationId?: string;

  // ... 나머지 필드
}
```

### 6. 데이터베이스 마이그레이션

**`src/database/migrations/1764555692000-CreateProjectTables.ts`**

4개의 테이블을 생성하는 마이그레이션을 작성했습니다:

1. `projects`: 프로젝트 기본 정보
2. `project_members`: 프로젝트-유저 관계 (프로젝트 내 역할 포함)
3. `project_notion_pages`: 프로젝트-Notion 페이지 관계
4. `project_swagger_documents`: 프로젝트-Swagger 문서 관계

모든 관계는 `CASCADE` 삭제로 설정되어 프로젝트 삭제 시 관련 데이터가 자동으로 삭제됩니다.

## 권한 체계

### 시스템 권한 (User.role)

- **ADMIN**: 모든 권한
- **SUB_ADMIN**: 프로젝트 생성 및 멤버 관리 권한
- **PROJECT_MANAGER**: 프로젝트 관리자 역할 (시스템 레벨)
- **USER**: 일반 사용자

### 프로젝트 권한 (ProjectMember.role)

- **PROJECT_MANAGER**: 프로젝트 정보 수정 및 문서 관리
- **MEMBER**: 프로젝트 문서 검색

### 권한 매트릭스

| 작업 | USER | PROJECT_MANAGER (시스템) | SUB_ADMIN | ADMIN |
|------|------|---------------------------|-----------|-------|
| 프로젝트 생성 | ❌ | ❌ | ✅ | ✅ |
| 프로젝트 조회 | 멤버인 경우만 | 멤버인 경우만 | 멤버인 경우만 | 멤버인 경우만 |
| 프로젝트 수정 | ❌ | 프로젝트 관리자인 경우 | 프로젝트 관리자인 경우 | 프로젝트 관리자인 경우 |
| 멤버 추가 | ❌ | ❌ | ✅ | ✅ |
| 문서 추가 | ❌ | 프로젝트 관리자인 경우 | 프로젝트 관리자인 경우 | 프로젝트 관리자인 경우 |
| 문서 검색 | 멤버인 경우만 | 멤버인 경우만 | 멤버인 경우만 | 멤버인 경우만 |

## API 사용 예시

### 1. 프로젝트 생성

```bash
POST /projects
Authorization: Bearer {token}
Content-Type: application/json

{
  "name": "프론트엔드 프로젝트",
  "description": "프론트엔드 개발 관련 문서"
}
```

**응답:**
```json
{
  "id": "9254594f-0303-4c90-9d86-e6d21a657eed",
  "name": "프론트엔드 프로젝트",
  "description": "프론트엔드 개발 관련 문서",
  "createdAt": "2024-01-01T00:00:00.000Z",
  "updatedAt": "2024-01-01T00:00:00.000Z"
}
```

### 2. 프로젝트에 멤버 추가

```bash
POST /projects/{projectId}/members
Authorization: Bearer {token}
Content-Type: application/json

{
  "userId": "user-uuid",
  "role": "member"
}
```

### 3. 프로젝트에 Notion 페이지 추가

```bash
POST /projects/{projectId}/notion-pages
Authorization: Bearer {token}
Content-Type: application/json

{
  "notionPageIds": [
    "notion-page-uuid-1",
    "notion-page-uuid-2"
  ]
}
```

### 4. 프로젝트별 RAG 쿼리

```bash
POST /rag/query
Authorization: Bearer {token}
Content-Type: application/json

{
  "question": "커밋 규칙 알려줘",
  "projectId": "9254594f-0303-4c90-9d86-e6d21a657eed",
  "conversationId": "5a95de51-f51c-481e-a8d5-c20fa2255e7c"
}
```

**응답:**
```json
{
  "success": true,
  "answer": "커밋 규칙은 다음과 같습니다...",
  "sources": [
    {
      "pageTitle": "커밋 규칙",
      "pageUrl": "https://notion.so/...",
      "score": 0.85,
      "chunkText": "..."
    }
  ],
  "conversationId": "5a95de51-f51c-481e-a8d5-c20fa2255e7c",
  "rewrittenQuery": "커밋 규칙",
  "usage": {
    "promptTokens": 1200,
    "completionTokens": 150,
    "totalTokens": 1350
  }
}
```

### 5. 선택 가능한 문서 목록 조회

```bash
# Notion 페이지 목록
GET /projects/selectable/notion-pages
Authorization: Bearer {token}

# Swagger 문서 목록
GET /projects/selectable/swagger-documents
Authorization: Bearer {token}

# 유저 목록 (서브 관리자/관리자만)
GET /auth/users
Authorization: Bearer {token}
```

## 주요 개선 사항

### 1. 프로젝트별 문서 격리

- 각 프로젝트는 독립적인 문서 집합을 가짐
- 프로젝트 멤버만 해당 프로젝트의 문서를 검색할 수 있음
- 전체 문서 검색 기능 제거 (보안 강화)

### 2. 세밀한 권한 관리

- 시스템 권한과 프로젝트 권한의 이중 체계
- 프로젝트 관리자는 프로젝트 내에서만 권한을 가짐
- 서브 관리자/관리자는 프로젝트 생성 및 멤버 관리 권한

### 3. 벡터 DB 필터링 최적화

- Qdrant의 `should` 필터를 사용하여 여러 `pageId`를 효율적으로 필터링
- 프로젝트에 속한 문서만 검색하여 성능 향상

### 4. 사용자 경험 개선

- 선택 가능한 문서 목록 조회 API 제공
- 프로젝트별로 독립적인 검색 환경 제공

## 문제 해결

### Qdrant 필터 형식 오류

**문제:** 여러 `pageId`를 필터링할 때 `match: { value: string[] }` 형식이 지원되지 않음

**해결:** 각 `pageId`에 대해 개별 `match` 조건을 만들고 `should`로 묶어서 OR 조건으로 처리

```typescript
// ❌ 잘못된 형식
searchFilter = {
  must: [{
    key: 'pageId',
    match: { value: ['page1', 'page2'] } // 지원되지 않음
  }]
};

// ✅ 올바른 형식
searchFilter = {
  should: [
    { key: 'pageId', match: { value: 'page1' } },
    { key: 'pageId', match: { value: 'page2' } }
  ]
};
```

## 다음 단계

- [ ] 프로젝트별 통계 및 분석 기능
- [ ] 문서 자동 동기화 기능
- [ ] 프로젝트 템플릿 기능
- [ ] 프로젝트별 사용량 추적


