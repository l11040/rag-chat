# 관리자 페이지 관리 기능 구현

## 개요

관리자 및 부관리자를 위한 Notion 페이지 관리 기능을 구현했습니다. 노션 페이지별 메타데이터를 데이터베이스에 저장하고, 선택한 페이지를 벡터 DB에 업데이트할 수 있는 기능을 제공합니다.

## 주요 기능

- 📚 **페이지 메타데이터 관리**: Notion 페이지 정보를 데이터베이스에 저장
- 🔄 **페이지 동기화**: Notion에서 페이지 목록을 가져와 메타데이터 동기화
- ✅ **선택적 업데이트**: 개별 또는 여러 페이지를 선택하여 벡터 DB에 업데이트
- 🔁 **전체 업데이트**: 데이터베이스의 모든 페이지를 벡터 DB에 업데이트
- 🗑️ **자동 삭제**: 업데이트 시 기존 벡터 데이터를 자동으로 삭제 후 재생성

## 작업 내용

### 1. NotionPage 엔티티 생성

Notion 페이지의 메타데이터를 저장할 엔티티를 생성했습니다.

**`src/notion/entities/notion-page.entity.ts`**

```typescript
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
```

**주요 필드 설명:**
- `notionPageId`: Notion API의 고유 페이지 ID (유니크)
- `indexingStatus`: 인덱싱 상태 추적 (`pending`, `processing`, `completed`, `failed`)
- `chunkCount`: 벡터 DB에 저장된 청크 개수
- `lastIndexedAt`: 마지막 인덱싱 시간
- `errorMessage`: 인덱싱 실패 시 에러 메시지 저장

### 2. Qdrant 서비스 확장

특정 페이지의 모든 벡터를 삭제하는 메서드를 추가했습니다.

**`src/qdrant/qdrant.service.ts`**

```typescript
/**
 * 특정 페이지의 모든 벡터 포인트 삭제
 * @param collectionName 컬렉션 이름
 * @param pageId 삭제할 페이지 ID
 */
async deletePagePoints(
  collectionName: string,
  pageId: string,
): Promise<{ deleted: number }> {
  try {
    // 먼저 해당 pageId를 가진 모든 포인트를 찾기
    const scrollResult = await this.qdrantClient.scroll(collectionName, {
      filter: {
        must: [
          {
            key: 'pageId',
            match: {
              value: pageId,
            },
          },
        ],
      },
      limit: 10000, // 충분히 큰 수
      with_payload: false,
      with_vector: false,
    });

    const pointIds = scrollResult.points.map((point) => point.id);

    if (pointIds.length === 0) {
      return { deleted: 0 };
    }

    // 찾은 포인트들 삭제
    await this.qdrantClient.delete(collectionName, {
      wait: true,
      points: pointIds,
    });

    return { deleted: pointIds.length };
  } catch (error) {
    console.error(`Error deleting page points: ${error}`);
    throw error;
  }
}
```

### 3. RAG 서비스 확장

페이지 관리 및 업데이트를 위한 여러 메서드를 추가했습니다.

#### 3.1 페이지 동기화

**`syncNotionPages()`**: Notion에서 페이지 목록을 가져와 메타데이터만 데이터베이스에 저장

```typescript
async syncNotionPages(databaseId?: string) {
  // Notion에서 페이지 목록 가져오기
  // 각 페이지를 데이터베이스에 저장/업데이트
  // 새 페이지는 생성, 기존 페이지는 업데이트
}
```

#### 3.2 페이지 목록 조회

**`getPageList()`**: 데이터베이스에 저장된 페이지 목록 조회

```typescript
async getPageList(databaseId?: string) {
  // 데이터베이스에서 페이지 목록 조회
  // 인덱싱 상태, 청크 개수 등 정보 포함
}
```

#### 3.3 개별 페이지 업데이트

**`updatePage()`**: 특정 페이지를 벡터 DB에 업데이트 (기존 데이터 삭제 후 재생성)

```typescript
async updatePage(pageId: string) {
  // 1. 데이터베이스에서 페이지 찾기 (id 또는 notionPageId로 검색)
  // 2. 기존 벡터 데이터 삭제
  // 3. Notion에서 페이지 내용 가져오기
  // 4. 텍스트를 청크로 분할
  // 5. 각 청크에 대해 임베딩 생성 및 저장
  // 6. 데이터베이스 상태 업데이트
}
```

**주요 특징:**
- DB의 `id` (UUID) 또는 `notionPageId`로 검색 지원
- 기존 벡터 데이터 자동 삭제 후 재생성
- 인덱싱 상태 실시간 추적 (`processing` → `completed` / `failed`)
- 에러 발생 시 상태 및 에러 메시지 저장

#### 3.4 여러 페이지 일괄 업데이트

**`updatePages()`**: 여러 페이지를 일괄 업데이트

```typescript
async updatePages(pageIds: string[]) {
  // 각 페이지에 대해 updatePage() 실행
  // 성공/실패 결과 반환
}
```

#### 3.5 전체 페이지 업데이트

**`updateAllPages()`**: 데이터베이스의 모든 페이지를 벡터 DB에 업데이트

```typescript
async updateAllPages(databaseId?: string) {
  // 1. 먼저 페이지 목록 동기화
  // 2. 데이터베이스의 모든 페이지를 순회하며 업데이트
  // 3. 통계 정보 반환
}
```

### 4. RAG 컨트롤러에 관리자 API 추가

관리자 및 부관리자 전용 API 엔드포인트를 추가했습니다.

**`src/rag/rag.controller.ts`**

```typescript
// ==================== 관리자용 API ====================

@Post('admin/sync-pages')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(Role.ADMIN, Role.SUB_ADMIN)
@ApiOperation({
  summary: '[관리자] Notion 페이지 목록을 데이터베이스에 동기화',
  description: 'Notion에서 페이지 목록을 가져와 메타데이터만 DB에 저장',
})
async syncPages(@Body() body: IngestDto) {
  const result = await this.ragService.syncNotionPages(body.databaseId);
  return result;
}

@Get('admin/pages')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(Role.ADMIN, Role.SUB_ADMIN)
@ApiOperation({
  summary: '[관리자] 페이지 목록 조회',
  description: '데이터베이스에 저장된 페이지 목록 조회',
})
async getPages(@Query('databaseId') databaseId?: string) {
  return await this.ragService.getPageList(databaseId);
}

@Post('admin/update-page')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(Role.ADMIN, Role.SUB_ADMIN)
@ApiOperation({
  summary: '[관리자] 특정 페이지를 벡터 DB에 업데이트',
  description: '기존 벡터 데이터를 삭제하고 새로운 임베딩으로 업데이트',
})
async updatePage(@Body() body: UpdatePageDto) {
  return await this.ragService.updatePage(body.pageId);
}

@Post('admin/update-pages')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(Role.ADMIN, Role.SUB_ADMIN)
@ApiOperation({
  summary: '[관리자] 여러 페이지를 벡터 DB에 업데이트',
  description: '선택한 여러 페이지의 벡터 데이터를 업데이트',
})
async updatePages(@Body() body: UpdatePagesDto) {
  return await this.ragService.updatePages(body.pageIds);
}

@Post('admin/update-all')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(Role.ADMIN, Role.SUB_ADMIN)
@ApiOperation({
  summary: '[관리자] 전체 데이터베이스의 모든 페이지 업데이트',
  description: 'Notion DB의 모든 페이지를 벡터 DB에 업데이트',
})
async updateAll(@Body() body: IngestDto) {
  return await this.ragService.updateAllPages(body.databaseId);
}
```

### 5. 모듈 업데이트

NotionModule과 RagModule에 TypeORM을 추가하여 엔티티를 사용할 수 있도록 했습니다.

**`src/notion/notion.module.ts`**

```typescript
@Module({
  imports: [ConfigModule, TypeOrmModule.forFeature([NotionPage])],
  controllers: [NotionController],
  providers: [NotionService],
  exports: [NotionService, TypeOrmModule],
})
export class NotionModule {}
```

**`src/rag/rag.module.ts`**

```typescript
@Module({
  imports: [
    NotionModule,
    OpenAIModule,
    QdrantModule,
    TypeOrmModule.forFeature([NotionPage]),
  ],
  controllers: [RagController],
  providers: [RagService],
  exports: [RagService],
})
export class RagModule {}
```

### 6. 마이그레이션 생성

데이터베이스에 `notion_pages` 테이블을 생성하는 마이그레이션을 작성했습니다.

**`src/database/migrations/1763998000000-CreateNotionPageTable.ts`**

```typescript
export class CreateNotionPageTable1763998000000 implements MigrationInterface {
  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.createTable(
      new Table({
        name: 'notion_pages',
        columns: [
          // ... 컬럼 정의
        ],
        indices: [
          new TableIndex({
            name: 'IDX_notion_pages_indexingStatus',
            columnNames: ['indexingStatus'],
            isUnique: false,
          }),
        ],
        engine: 'InnoDB',
      }),
      true,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.dropTable('notion_pages');
  }
}
```

## API 엔드포인트

### 1. 페이지 목록 동기화

**`POST /rag/admin/sync-pages`**

Notion에서 페이지 목록을 가져와 메타데이터만 데이터베이스에 저장합니다.

**요청:**
```json
{
  "databaseId": "optional-notion-database-id"
}
```

**응답:**
```json
{
  "success": true,
  "created": 5,
  "updated": 2,
  "total": 7
}
```

### 2. 페이지 목록 조회

**`GET /rag/admin/pages?databaseId=optional`**

데이터베이스에 저장된 페이지 목록을 조회합니다.

**응답:**
```json
{
  "success": true,
  "pages": [
    {
      "id": "uuid",
      "notionPageId": "notion-page-id",
      "title": "페이지 제목",
      "url": "https://notion.so/...",
      "databaseId": "database-id",
      "chunkCount": 10,
      "indexingStatus": "completed",
      "lastIndexedAt": "2025-11-25T00:00:00.000Z",
      "lastModifiedAt": "2025-11-24T23:00:00.000Z",
      "errorMessage": null,
      "createdAt": "2025-11-25T00:00:00.000Z",
      "updatedAt": "2025-11-25T00:00:00.000Z"
    }
  ],
  "total": 1
}
```

### 3. 개별 페이지 업데이트

**`POST /rag/admin/update-page`**

특정 페이지를 벡터 DB에 업데이트합니다. 기존 벡터 데이터를 삭제하고 새로 생성합니다.

**요청:**
```json
{
  "pageId": "notion-page-id 또는 db-uuid"
}
```

**응답:**
```json
{
  "success": true,
  "message": "Page updated successfully",
  "pageTitle": "페이지 제목",
  "chunksCreated": 10,
  "deletedChunks": 8
}
```

### 4. 여러 페이지 일괄 업데이트

**`POST /rag/admin/update-pages`**

여러 페이지를 선택하여 일괄 업데이트합니다.

**요청:**
```json
{
  "pageIds": [
    "page-id-1",
    "page-id-2",
    "page-id-3"
  ]
}
```

**응답:**
```json
{
  "success": true,
  "results": [
    {
      "pageId": "page-id-1",
      "success": true,
      "message": "Page updated successfully",
      "chunksCreated": 10,
      "deletedChunks": 8
    },
    {
      "pageId": "page-id-2",
      "success": true,
      "message": "Page updated successfully",
      "chunksCreated": 5,
      "deletedChunks": 5
    }
  ],
  "total": 2,
  "successful": 2,
  "failed": 0
}
```

### 5. 전체 페이지 업데이트

**`POST /rag/admin/update-all`**

데이터베이스의 모든 페이지를 벡터 DB에 업데이트합니다.

**요청:**
```json
{
  "databaseId": "optional-notion-database-id"
}
```

**응답:**
```json
{
  "success": true,
  "pagesProcessed": 10,
  "pagesFailed": 0,
  "totalPages": 10,
  "totalChunks": 150
}
```

## 사용 시나리오

### 시나리오 1: 초기 설정

1. **페이지 목록 동기화**
   ```bash
   POST /rag/admin/sync-pages
   ```
   Notion에서 페이지 목록을 가져와 메타데이터를 데이터베이스에 저장

2. **전체 업데이트**
   ```bash
   POST /rag/admin/update-all
   ```
   모든 페이지를 벡터 DB에 인덱싱

### 시나리오 2: 특정 페이지만 업데이트

1. **페이지 목록 조회**
   ```bash
   GET /rag/admin/pages
   ```
   업데이트할 페이지 선택

2. **개별 업데이트**
   ```bash
   POST /rag/admin/update-page
   Body: { "pageId": "selected-page-id" }
   ```

### 시나리오 3: 여러 페이지 선택 업데이트

1. **페이지 목록 조회**
   ```bash
   GET /rag/admin/pages
   ```

2. **일괄 업데이트**
   ```bash
   POST /rag/admin/update-pages
   Body: { "pageIds": ["id1", "id2", "id3"] }
   ```

## 주요 특징

### 1. 이중 검색 지원

`updatePage()` 메서드는 두 가지 방식으로 페이지를 검색합니다:
- 먼저 DB의 `id` (UUID)로 검색
- 없으면 `notionPageId`로 검색

프론트엔드에서 페이지 목록을 받을 때 `id`를 사용해도 정상 작동합니다.

### 2. 자동 벡터 삭제

페이지를 업데이트할 때 기존 벡터 데이터를 자동으로 삭제합니다. 이를 통해:
- 중복 데이터 방지
- 최신 내용만 벡터 DB에 저장
- 디스크 공간 절약

### 3. 인덱싱 상태 추적

각 페이지의 인덱싱 상태를 실시간으로 추적합니다:
- `pending`: 아직 인덱싱되지 않음
- `processing`: 인덱싱 중
- `completed`: 인덱싱 완료
- `failed`: 인덱싱 실패 (에러 메시지 저장)

### 4. 권한 제어

모든 관리자 API는 `RolesGuard`를 사용하여 관리자 및 부관리자만 접근 가능합니다.

```typescript
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(Role.ADMIN, Role.SUB_ADMIN)
```

## 데이터베이스 마이그레이션

마이그레이션을 실행하여 테이블을 생성합니다:

```bash
npm run migration:run
```

## 주의사항

1. **동시 업데이트**: 같은 페이지를 동시에 업데이트하지 마세요. 상태 충돌이 발생할 수 있습니다.

2. **대량 업데이트**: 많은 페이지를 한 번에 업데이트할 때는 시간이 오래 걸릴 수 있습니다. 프론트엔드에서 적절한 로딩 상태를 표시하세요.

3. **에러 처리**: 인덱싱 실패 시 `errorMessage` 필드에 에러가 저장됩니다. 주기적으로 확인하여 문제를 해결하세요.

## 향후 개선 사항

- [ ] 페이지 수정 시간 기반 자동 업데이트 스케줄링
- [ ] 배치 작업 큐 시스템 구현
- [ ] 인덱싱 진행률 추적 API
- [ ] 페이지별 통계 및 분석 기능
