# 토큰 사용량 추적 기능 구현

## 개요

사용자의 OpenAI API 토큰 사용량을 통계적으로 추적하고 관리하는 기능을 구현했습니다. 질문할 때마다 토큰 사용량을 자동으로 저장하며, 사용자는 자신의 토큰 사용 내역과 통계를 조회할 수 있습니다.

## 주요 기능

- 📊 **자동 토큰 추적**: 질문할 때마다 프롬프트 토큰, 완성 토큰, 총 토큰 수를 자동 저장
- 📈 **사용량 통계**: 전체 토큰 사용량, 평균 토큰 수, 사용 횟수 등의 통계 제공
- 🔍 **다양한 조회 옵션**: 전체 조회, 대화별 조회, 날짜 범위별 조회 지원
- 📄 **페이지네이션**: 대량의 데이터를 효율적으로 조회할 수 있는 페이지네이션 지원
- 🔗 **대화 연동**: 각 토큰 사용량을 특정 대화와 연결하여 추적 가능
- 💬 **메시지 연동**: 각 토큰 사용량을 특정 메시지와 1:1로 연결하여 개별 메시지별 추적 가능

## 작업 내용

### 1. TokenUsage Entity 생성

토큰 사용량을 저장할 엔티티를 생성했습니다.

**`src/token-usage/entities/token-usage.entity.ts`**

```typescript
import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  ManyToOne,
  JoinColumn,
  Index,
} from 'typeorm';
import { User } from '../../auth/entities/user.entity';
import { Conversation } from '../../conversation/entities/conversation.entity';
import { Message } from '../../conversation/entities/message.entity';

@Entity('token_usages')
export class TokenUsage {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column()
  @Index()
  userId: string; // User와의 관계 (외래키)

  @ManyToOne(() => User, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'userId' })
  user: User;

  @Column({ nullable: true })
  @Index()
  conversationId: string | null; // Conversation과의 관계 (선택적)

  @ManyToOne(() => Conversation, { onDelete: 'SET NULL', nullable: true })
  @JoinColumn({ name: 'conversationId' })
  conversation: Conversation | null;

  @Column({ nullable: true })
  @Index()
  messageId: string | null; // Message와의 관계 (선택적)

  @ManyToOne(() => Message, { onDelete: 'SET NULL', nullable: true })
  @JoinColumn({ name: 'messageId' })
  message: Message | null;

  @Column({ type: 'int', default: 0 })
  promptTokens: number; // 프롬프트 토큰 수

  @Column({ type: 'int', default: 0 })
  completionTokens: number; // 완성 토큰 수

  @Column({ type: 'int', default: 0 })
  totalTokens: number; // 총 토큰 수

  @Column({ type: 'varchar', length: 500, nullable: true })
  question: string | null; // 질문 내용 (선택적, 통계 분석용)

  @CreateDateColumn()
  createdAt: Date;
}
```

**주요 필드 설명:**
- `userId`: 토큰을 사용한 사용자 ID (필수)
- `conversationId`: 토큰이 사용된 대화 ID (선택적, 대화와 연결되지 않은 경우 null)
- `messageId`: 토큰이 사용된 메시지 ID (선택적, 메시지와 연결되지 않은 경우 null)
- `promptTokens`: 프롬프트에 사용된 토큰 수
- `completionTokens`: 완성(답변)에 사용된 토큰 수
- `totalTokens`: 총 사용된 토큰 수
- `question`: 질문 내용 (통계 분석 및 디버깅용, 선택적)
- `createdAt`: 토큰 사용 시각

### 2. TokenUsage Service 구현

토큰 사용량 저장 및 조회 기능을 제공하는 서비스를 구현했습니다.

**`src/token-usage/token-usage.service.ts`**

#### 2.1 토큰 사용량 저장

```typescript
async saveTokenUsage(
  userId: string,
  usage: {
    promptTokens: number;
    completionTokens: number;
    totalTokens: number;
  },
  conversationId?: string | null,
  messageId?: string | null,
  question?: string | null,
): Promise<TokenUsage> {
  try {
    const tokenUsage = this.tokenUsageRepository.create({
      userId,
      conversationId: conversationId || null,
      messageId: messageId || null,
      promptTokens: usage.promptTokens,
      completionTokens: usage.completionTokens,
      totalTokens: usage.totalTokens,
      question: question || null,
    });

    const saved = await this.tokenUsageRepository.save(tokenUsage);
    this.logger.log(
      `토큰 사용량 저장 완료: userId=${userId}, totalTokens=${usage.totalTokens}`,
    );
    return saved;
  } catch (error) {
    this.logger.error(
      `토큰 사용량 저장 실패: ${(error as Error).message}`,
    );
    throw error;
  }
}
```

#### 2.2 사용자별 토큰 사용량 조회

```typescript
async getUserTokenUsage(
  userId: string,
  limit?: number,
  offset?: number,
): Promise<{ data: TokenUsage[]; total: number }> {
  try {
    const [data, total] = await this.tokenUsageRepository.findAndCount({
      where: { userId },
      order: { createdAt: 'DESC' },
      take: limit,
      skip: offset,
    });

    return { data, total };
  } catch (error) {
    this.logger.error(
      `토큰 사용량 조회 실패: ${(error as Error).message}`,
    );
    throw error;
  }
}
```

#### 2.3 토큰 사용량 통계 조회

```typescript
async getUserTokenUsageStats(userId: string): Promise<{
  totalPromptTokens: number;
  totalCompletionTokens: number;
  totalTokens: number;
  usageCount: number;
  averageTokensPerQuery: number;
}> {
  try {
    const result = await this.tokenUsageRepository
      .createQueryBuilder('token_usage')
      .select('SUM(token_usage.promptTokens)', 'totalPromptTokens')
      .addSelect('SUM(token_usage.completionTokens)', 'totalCompletionTokens')
      .addSelect('SUM(token_usage.totalTokens)', 'totalTokens')
      .addSelect('COUNT(token_usage.id)', 'usageCount')
      .where('token_usage.userId = :userId', { userId })
      .getRawOne();

    const totalPromptTokens = parseInt(result?.totalPromptTokens || '0', 10);
    const totalCompletionTokens = parseInt(
      result?.totalCompletionTokens || '0',
      10,
    );
    const totalTokens = parseInt(result?.totalTokens || '0', 10);
    const usageCount = parseInt(result?.usageCount || '0', 10);

    return {
      totalPromptTokens,
      totalCompletionTokens,
      totalTokens,
      usageCount,
      averageTokensPerQuery:
        usageCount > 0 ? Math.round(totalTokens / usageCount) : 0,
    };
  } catch (error) {
    this.logger.error(
      `토큰 사용량 통계 조회 실패: ${(error as Error).message}`,
    );
    throw error;
  }
}
```

#### 2.4 대화별 토큰 사용량 조회

```typescript
async getConversationTokenUsage(
  conversationId: string,
  userId: string,
): Promise<{ data: TokenUsage[]; total: number }> {
  try {
    const [data, total] = await this.tokenUsageRepository.findAndCount({
      where: { conversationId, userId },
      order: { createdAt: 'ASC' },
    });

    return { data, total };
  } catch (error) {
    this.logger.error(
      `대화별 토큰 사용량 조회 실패: ${(error as Error).message}`,
    );
    throw error;
  }
}
```

#### 2.5 날짜 범위별 토큰 사용량 조회

```typescript
async getTokenUsageByDateRange(
  userId: string,
  startDate: Date,
  endDate: Date,
): Promise<{ data: TokenUsage[]; total: number }> {
  try {
    const queryBuilder = this.tokenUsageRepository
      .createQueryBuilder('token_usage')
      .where('token_usage.userId = :userId', { userId })
      .andWhere('token_usage.createdAt >= :startDate', { startDate })
      .andWhere('token_usage.createdAt <= :endDate', { endDate })
      .orderBy('token_usage.createdAt', 'DESC');

    const [data, total] = await queryBuilder.getManyAndCount();
    return { data, total };
  } catch (error) {
    this.logger.error(
      `날짜 범위별 토큰 사용량 조회 실패: ${(error as Error).message}`,
    );
    throw error;
  }
}
```

#### 2.6 특정 메시지의 토큰 사용량 조회

```typescript
async getMessageTokenUsage(
  messageId: string,
  userId: string,
): Promise<TokenUsage | null> {
  try {
    const tokenUsage = await this.tokenUsageRepository.findOne({
      where: { messageId, userId },
    });

    return tokenUsage;
  } catch (error) {
    this.logger.error(
      `메시지별 토큰 사용량 조회 실패: ${(error as Error).message}`,
    );
    throw error;
  }
}
```

### 3. TokenUsage Controller 구현

토큰 사용량 조회를 위한 REST API 엔드포인트를 구현했습니다.

**`src/token-usage/token-usage.controller.ts`**

#### 3.1 사용자 토큰 사용량 조회

```typescript
@Get()
@ApiOperation({
  summary: '사용자의 토큰 사용량 조회',
  description: '사용자의 모든 토큰 사용 내역을 조회합니다.',
})
async getTokenUsage(
  @Request() req: { user: { id: string } },
  @Query('limit', new DefaultValuePipe(undefined), new ParseIntPipe({ optional: true })) limit?: number,
  @Query('offset', new DefaultValuePipe(undefined), new ParseIntPipe({ optional: true })) offset?: number,
) {
  const result = await this.tokenUsageService.getUserTokenUsage(
    req.user.id,
    limit,
    offset,
  );

  return {
    success: true,
    data: result.data,
    total: result.total,
    limit: limit || null,
    offset: offset || null,
  };
}
```

**엔드포인트:** `GET /token-usage?limit=10&offset=0`

**응답 예시:**
```json
{
  "success": true,
  "data": [
    {
      "id": "uuid",
      "userId": "user-uuid",
      "conversationId": "conversation-uuid",
      "promptTokens": 150,
      "completionTokens": 200,
      "totalTokens": 350,
      "question": "질문 내용",
      "createdAt": "2024-01-01T00:00:00.000Z"
    }
  ],
  "total": 100,
  "limit": 10,
  "offset": 0
}
```

#### 3.2 토큰 사용량 통계 조회

```typescript
@Get('stats')
@ApiOperation({
  summary: '사용자의 토큰 사용량 통계 조회',
  description: '사용자의 전체 토큰 사용량 통계를 조회합니다.',
})
async getTokenUsageStats(@Request() req: { user: { id: string } }) {
  const stats = await this.tokenUsageService.getUserTokenUsageStats(
    req.user.id,
  );

  return {
    success: true,
    stats,
  };
}
```

**엔드포인트:** `GET /token-usage/stats`

**응답 예시:**
```json
{
  "success": true,
  "stats": {
    "totalPromptTokens": 15000,
    "totalCompletionTokens": 20000,
    "totalTokens": 35000,
    "usageCount": 100,
    "averageTokensPerQuery": 350
  }
}
```

#### 3.3 대화별 토큰 사용량 조회

```typescript
@Get('conversation/:conversationId')
@ApiOperation({
  summary: '특정 대화의 토큰 사용량 조회',
  description: '특정 대화에서 사용된 토큰 사용량을 조회합니다.',
})
async getConversationTokenUsage(
  @Request() req: { user: { id: string } },
  @Param('conversationId') conversationId: string,
) {
  const result = await this.tokenUsageService.getConversationTokenUsage(
    conversationId,
    req.user.id,
  );

  return {
    success: true,
    conversationId,
    data: result.data,
    total: result.total,
  };
}
```

**엔드포인트:** `GET /token-usage/conversation/{conversationId}`

#### 3.4 날짜 범위별 토큰 사용량 조회

```typescript
@Get('date-range')
@ApiOperation({
  summary: '날짜 범위별 토큰 사용량 조회',
  description: '지정한 날짜 범위의 토큰 사용량을 조회합니다.',
})
async getTokenUsageByDateRange(
  @Request() req: { user: { id: string } },
  @Query('startDate') startDateStr: string,
  @Query('endDate') endDateStr: string,
) {
  const startDate = new Date(startDateStr);
  const endDate = new Date(endDateStr);

  if (isNaN(startDate.getTime()) || isNaN(endDate.getTime())) {
    return {
      success: false,
      error: '유효하지 않은 날짜 형식입니다.',
    };
  }

  const result = await this.tokenUsageService.getTokenUsageByDateRange(
    req.user.id,
    startDate,
    endDate,
  );

  return {
    success: true,
    startDate: startDate.toISOString(),
    endDate: endDate.toISOString(),
    data: result.data,
    total: result.total,
  };
}
```

**엔드포인트:** `GET /token-usage/date-range?startDate=2024-01-01T00:00:00Z&endDate=2024-12-31T23:59:59Z`

#### 3.5 메시지별 토큰 사용량 조회

```typescript
@Get('message/:messageId')
@ApiOperation({
  summary: '특정 메시지의 토큰 사용량 조회',
  description: '특정 메시지에서 사용된 토큰 사용량을 조회합니다.',
})
async getMessageTokenUsage(
  @Request() req: { user: { id: string } },
  @Param('messageId') messageId: string,
) {
  const tokenUsage = await this.tokenUsageService.getMessageTokenUsage(
    messageId,
    req.user.id,
  );

  if (!tokenUsage) {
    return {
      success: false,
      error: '해당 메시지의 토큰 사용량을 찾을 수 없습니다.',
    };
  }

  return {
    success: true,
    messageId,
    data: tokenUsage,
  };
}
```

**엔드포인트:** `GET /token-usage/message/{messageId}`

**응답 예시:**
```json
{
  "success": true,
  "messageId": "message-uuid",
  "data": {
    "id": "token-usage-uuid",
    "userId": "user-uuid",
    "conversationId": "conversation-uuid",
    "messageId": "message-uuid",
    "promptTokens": 150,
    "completionTokens": 200,
    "totalTokens": 350,
    "question": "질문 내용",
    "createdAt": "2024-01-01T00:00:00.000Z"
  }
}
```

### 4. RAG Controller에 자동 저장 기능 추가

질문할 때마다 토큰 사용량을 자동으로 저장하도록 RAG Controller를 수정했습니다.

**`src/rag/rag.controller.ts`**

```typescript
@Post('query')
async query(
  @Request() req: { user: { id: string } },
  @Body() body: QueryDto,
) {
  // ... 기존 코드 (대화 생성, 질문 저장 등) ...

  // RAG 쿼리 실행
  const result = await this.ragService.query(
    body.question,
    conversationHistory,
  );

  // 답변 메시지 저장
  if (result.success) {
    const savedMessage = await this.conversationService.addMessage(
      conversationId,
      MessageRole.ASSISTANT,
      result.answer,
      {
        sources: result.sources,
        usage: result.usage,
        rewrittenQuery: result.rewrittenQuery,
      },
    );

    // 토큰 사용량 저장
    if (result.usage) {
      try {
        await this.tokenUsageService.saveTokenUsage(
          req.user.id,
          {
            promptTokens: result.usage.promptTokens,
            completionTokens: result.usage.completionTokens,
            totalTokens: result.usage.totalTokens,
          },
          conversationId,
          savedMessage.id, // 메시지 ID 추가
          body.question,
        );
      } catch (error) {
        // 토큰 사용량 저장 실패는 로그만 남기고 계속 진행
        this.logger.error(
          `토큰 사용량 저장 실패: ${(error as Error).message}`,
        );
      }
    }
  }

  return {
    ...result,
    conversationId,
  };
}
```

**동작 방식:**
1. 사용자가 질문을 하면 RAG 서비스가 답변을 생성합니다.
2. 답변 생성 과정에서 사용된 토큰 정보가 `result.usage`에 포함됩니다.
3. 답변 메시지를 저장하고 저장된 메시지의 ID를 받아옵니다.
4. 토큰 사용량을 자동으로 데이터베이스에 저장하며, 메시지 ID를 포함하여 메시지와 1:1로 연결합니다.
5. 토큰 사용량 저장 실패 시에도 답변은 정상적으로 반환됩니다 (에러 로그만 기록).

### 5. TokenUsage Module 생성 및 등록

토큰 사용량 기능을 위한 모듈을 생성하고 애플리케이션에 등록했습니다.

**`src/token-usage/token-usage.module.ts`**

```typescript
import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { TokenUsage } from './entities/token-usage.entity';
import { TokenUsageService } from './token-usage.service';
import { TokenUsageController } from './token-usage.controller';

@Module({
  imports: [TypeOrmModule.forFeature([TokenUsage])],
  controllers: [TokenUsageController],
  providers: [TokenUsageService],
  exports: [TokenUsageService], // 다른 모듈에서 사용할 수 있도록 export
})
export class TokenUsageModule {}
```

**`src/app.module.ts`에 등록:**

```typescript
import { TokenUsageModule } from './token-usage/token-usage.module';

@Module({
  imports: [
    // ... 기존 모듈들 ...
    TokenUsageModule,
  ],
  // ...
})
export class AppModule {}
```

**`src/rag/rag.module.ts`에 import 추가:**

```typescript
import { TokenUsageModule } from '../token-usage/token-usage.module';

@Module({
  imports: [
    // ... 기존 모듈들 ...
    TokenUsageModule,
  ],
  // ...
})
export class RagModule {}
```

### 6. 데이터베이스 마이그레이션

토큰 사용량 테이블을 생성하는 마이그레이션 파일을 작성했습니다.

**`src/database/migrations/1764001000000-CreateTokenUsageTable.ts`**

```typescript
import {
  MigrationInterface,
  QueryRunner,
  Table,
  TableColumn,
  TableForeignKey,
  TableIndex,
} from 'typeorm';

export class CreateTokenUsageTable1764001000000
  implements MigrationInterface
{
  name = 'CreateTokenUsageTable1764001000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    // token_usages 테이블 생성
    await queryRunner.createTable(
      new Table({
        name: 'token_usages',
        columns: [
          new TableColumn({
            name: 'id',
            type: 'varchar',
            length: '36',
            isPrimary: true,
            isNullable: false,
          }),
          new TableColumn({
            name: 'userId',
            type: 'varchar',
            length: '36',
            isNullable: false,
          }),
          new TableColumn({
            name: 'conversationId',
            type: 'varchar',
            length: '36',
            isNullable: true,
          }),
          new TableColumn({
            name: 'messageId',
            type: 'varchar',
            length: '36',
            isNullable: true,
          }),
          new TableColumn({
            name: 'promptTokens',
            type: 'int',
            default: 0,
            isNullable: false,
          }),
          new TableColumn({
            name: 'completionTokens',
            type: 'int',
            default: 0,
            isNullable: false,
          }),
          new TableColumn({
            name: 'totalTokens',
            type: 'int',
            default: 0,
            isNullable: false,
          }),
          new TableColumn({
            name: 'question',
            type: 'varchar',
            length: '500',
            isNullable: true,
          }),
          new TableColumn({
            name: 'createdAt',
            type: 'datetime',
            precision: 6,
            default: 'CURRENT_TIMESTAMP(6)',
            isNullable: false,
          }),
        ],
        indices: [
          new TableIndex({
            name: 'IDX_token_usages_userId',
            columnNames: ['userId'],
            isUnique: false,
          }),
          new TableIndex({
            name: 'IDX_token_usages_conversationId',
            columnNames: ['conversationId'],
            isUnique: false,
          }),
          new TableIndex({
            name: 'IDX_token_usages_messageId',
            columnNames: ['messageId'],
            isUnique: false,
          }),
        ],
        engine: 'InnoDB',
      }),
      true,
    );

    // 외래키 추가
    await queryRunner.createForeignKey(
      'token_usages',
      new TableForeignKey({
        columnNames: ['userId'],
        referencedColumnNames: ['id'],
        referencedTableName: 'users',
        onDelete: 'CASCADE',
        onUpdate: 'CASCADE',
      }),
    );

    await queryRunner.createForeignKey(
      'token_usages',
      new TableForeignKey({
        columnNames: ['conversationId'],
        referencedColumnNames: ['id'],
        referencedTableName: 'conversations',
        onDelete: 'SET NULL',
        onUpdate: 'CASCADE',
      }),
    );

    // messageId 외래키 추가
    await queryRunner.createForeignKey(
      'token_usages',
      new TableForeignKey({
        columnNames: ['messageId'],
        referencedColumnNames: ['id'],
        referencedTableName: 'messages',
        onDelete: 'SET NULL',
        onUpdate: 'CASCADE',
      }),
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    // 외래키 삭제 후 테이블 삭제
    await queryRunner.dropTable('token_usages');
  }
}
```

**마이그레이션 실행:**

```bash
npm run migration:run
```

## 사용 방법

### 1. 토큰 사용량 자동 저장

질문을 하면 자동으로 토큰 사용량이 저장됩니다. 별도의 API 호출이 필요하지 않습니다.

```bash
POST /rag/query
Authorization: Bearer <token>
Content-Type: application/json

{
  "question": "질문 내용",
  "conversationId": "optional-conversation-id"
}
```

### 2. 토큰 사용량 조회

#### 전체 조회 (페이지네이션 지원)

```bash
GET /token-usage?limit=10&offset=0
Authorization: Bearer <token>
```

#### 통계 조회

```bash
GET /token-usage/stats
Authorization: Bearer <token>
```

**응답:**
```json
{
  "success": true,
  "stats": {
    "totalPromptTokens": 15000,
    "totalCompletionTokens": 20000,
    "totalTokens": 35000,
    "usageCount": 100,
    "averageTokensPerQuery": 350
  }
}
```

#### 대화별 조회

```bash
GET /token-usage/conversation/{conversationId}
Authorization: Bearer <token>
```

#### 메시지별 조회

```bash
GET /token-usage/message/{messageId}
Authorization: Bearer <token>
```

**응답:**
```json
{
  "success": true,
  "messageId": "message-uuid",
  "data": {
    "id": "token-usage-uuid",
    "userId": "user-uuid",
    "conversationId": "conversation-uuid",
    "messageId": "message-uuid",
    "promptTokens": 150,
    "completionTokens": 200,
    "totalTokens": 350,
    "question": "질문 내용",
    "createdAt": "2024-01-01T00:00:00.000Z"
  }
}
```

#### 날짜 범위별 조회

```bash
GET /token-usage/date-range?startDate=2024-01-01T00:00:00Z&endDate=2024-12-31T23:59:59Z
Authorization: Bearer <token>
```

## 데이터베이스 스키마

### token_usages 테이블

| 컬럼명 | 타입 | 설명 |
|--------|------|------|
| id | VARCHAR(36) | 고유 ID (UUID) |
| userId | VARCHAR(36) | 사용자 ID (외래키) |
| conversationId | VARCHAR(36) | 대화 ID (외래키, nullable) |
| messageId | VARCHAR(36) | 메시지 ID (외래키, nullable) |
| promptTokens | INT | 프롬프트 토큰 수 |
| completionTokens | INT | 완성 토큰 수 |
| totalTokens | INT | 총 토큰 수 |
| question | VARCHAR(500) | 질문 내용 (nullable) |
| createdAt | DATETIME(6) | 생성 시각 |

### 인덱스

- `IDX_token_usages_userId`: userId 컬럼에 인덱스 (사용자별 조회 최적화)
- `IDX_token_usages_conversationId`: conversationId 컬럼에 인덱스 (대화별 조회 최적화)
- `IDX_token_usages_messageId`: messageId 컬럼에 인덱스 (메시지별 조회 최적화)

### 외래키 관계

- `users.id` → `token_usages.userId` (CASCADE DELETE)
- `conversations.id` → `token_usages.conversationId` (SET NULL DELETE)
- `messages.id` → `token_usages.messageId` (SET NULL DELETE)

## 주요 특징

### 1. 자동 추적

- 질문할 때마다 자동으로 토큰 사용량이 저장됩니다.
- 사용자가 별도로 저장 요청을 할 필요가 없습니다.
- 저장 실패 시에도 답변은 정상적으로 반환됩니다.

### 2. 다양한 조회 옵션

- **전체 조회**: 사용자의 모든 토큰 사용 내역
- **통계 조회**: 집계된 통계 정보 (총 토큰, 평균 등)
- **대화별 조회**: 특정 대화에서 사용된 토큰만 조회
- **메시지별 조회**: 특정 메시지에서 사용된 토큰만 조회 (1:1 연결)
- **날짜 범위 조회**: 특정 기간의 토큰 사용량만 조회

### 3. 성능 최적화

- userId, conversationId, messageId에 인덱스를 생성하여 조회 성능을 최적화했습니다.
- 페이지네이션을 지원하여 대량의 데이터도 효율적으로 조회할 수 있습니다.

### 4. 데이터 무결성

- 외래키 제약조건을 통해 데이터 무결성을 보장합니다.
- 사용자 삭제 시 관련 토큰 사용량도 자동으로 삭제됩니다 (CASCADE).
- 대화 삭제 시 토큰 사용량은 유지되지만 conversationId는 null로 설정됩니다 (SET NULL).
- 메시지 삭제 시 토큰 사용량은 유지되지만 messageId는 null로 설정됩니다 (SET NULL).
- 각 토큰 사용량은 특정 메시지와 1:1로 연결되어 개별 메시지별 추적이 가능합니다.

## 향후 개선 가능 사항

1. **비용 계산**: 토큰 수를 기반으로 실제 비용 계산 기능 추가
2. **사용량 제한**: 사용자별 일일/월별 토큰 사용량 제한 기능
3. **알림 기능**: 사용량이 임계값에 도달했을 때 알림 발송
4. **시각화**: 대시보드에서 토큰 사용량을 그래프로 시각화
5. **내보내기**: 토큰 사용량 데이터를 CSV/Excel로 내보내기 기능

