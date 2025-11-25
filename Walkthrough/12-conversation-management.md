# 대화 관리 기능 구현

## 개요

ChatGPT처럼 연속적인 대화를 지원하는 기능을 구현했습니다. 사용자는 여러 질문을 하나의 대화 세션으로 묶어 관리할 수 있으며, 이전 대화 내용을 기반으로 컨텍스트를 유지한 채로 질문을 이어갈 수 있습니다.

## 주요 기능

- 💬 **대화 세션 관리**: 사용자별로 독립적인 대화 세션 생성 및 관리
- 📝 **메시지 저장**: 질문과 답변을 자동으로 데이터베이스에 저장
- 🔄 **연속 대화 지원**: 이전 대화 히스토리를 기반으로 컨텍스트 유지
- 📋 **대화 목록 조회**: 사용자의 모든 대화 목록 확인
- ✏️ **대화 제목 관리**: 대화 제목 수정 및 삭제 기능
- 🔍 **대화 상세 조회**: 특정 대화의 모든 메시지 조회

## 작업 내용

### 1. 데이터베이스 스키마 설계

대화와 메시지를 저장하기 위한 두 개의 테이블을 설계했습니다.

#### Conversation 엔티티

**`src/conversation/entities/conversation.entity.ts`**

```typescript
import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  UpdateDateColumn,
  ManyToOne,
  OneToMany,
  JoinColumn,
  Index,
} from 'typeorm';
import { User } from '../../auth/entities/user.entity';
import { Message } from './message.entity';

@Entity('conversations')
export class Conversation {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column()
  @Index()
  userId: string; // User와의 관계 (외래키)

  @ManyToOne(() => User, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'userId' })
  user: User;

  @Column({ type: 'varchar', length: 500, nullable: true })
  title: string | null; // 대화 제목 (첫 질문으로 자동 생성 가능)

  @OneToMany(() => Message, (message) => message.conversation, {
    cascade: true,
  })
  messages: Message[];

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;
}
```

**주요 필드 설명:**
- `id`: 대화 고유 ID (UUID)
- `userId`: 대화를 소유한 사용자 ID
- `title`: 대화 제목 (첫 질문의 일부로 자동 생성)
- `messages`: 해당 대화에 속한 모든 메시지 (관계)

#### Message 엔티티

**`src/conversation/entities/message.entity.ts`**

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
import { Conversation } from './conversation.entity';

export enum MessageRole {
  USER = 'user',
  ASSISTANT = 'assistant',
}

@Entity('messages')
export class Message {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column()
  @Index()
  conversationId: string; // Conversation과의 관계 (외래키)

  @ManyToOne(() => Conversation, (conversation) => conversation.messages, {
    onDelete: 'CASCADE',
  })
  @JoinColumn({ name: 'conversationId' })
  conversation: Conversation;

  @Column({
    type: 'enum',
    enum: MessageRole,
  })
  role: MessageRole; // 'user' 또는 'assistant'

  @Column({ type: 'text' })
  content: string; // 질문 또는 답변 내용

  @Column({ type: 'json', nullable: true })
  metadata: Record<string, unknown> | null; // 추가 정보 (sources, usage, rewrittenQuery 등)

  @CreateDateColumn()
  createdAt: Date;
}
```

**주요 필드 설명:**
- `id`: 메시지 고유 ID (UUID)
- `conversationId`: 속한 대화 ID
- `role`: 메시지 역할 (`user` 또는 `assistant`)
- `content`: 메시지 내용 (질문 또는 답변)
- `metadata`: 추가 정보 (답변에 사용된 소스, 토큰 사용량 등)

### 2. 마이그레이션 생성

데이터베이스 테이블을 생성하기 위한 마이그레이션 파일을 작성했습니다.

**`src/database/migrations/1764000000000-CreateConversationAndMessageTables.ts`**

```typescript
import {
  MigrationInterface,
  QueryRunner,
  Table,
  TableColumn,
  TableForeignKey,
  TableIndex,
} from 'typeorm';

export class CreateConversationAndMessageTables1764000000000
  implements MigrationInterface
{
  name = 'CreateConversationAndMessageTables1764000000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    // 1. conversations 테이블 생성
    await queryRunner.createTable(
      new Table({
        name: 'conversations',
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
            name: 'title',
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
          new TableColumn({
            name: 'updatedAt',
            type: 'datetime',
            precision: 6,
            default: 'CURRENT_TIMESTAMP(6)',
            onUpdate: 'CURRENT_TIMESTAMP(6)',
            isNullable: false,
          }),
        ],
        indices: [
          new TableIndex({
            name: 'IDX_conversations_userId',
            columnNames: ['userId'],
            isUnique: false,
          }),
        ],
        engine: 'InnoDB',
      }),
      true,
    );

    // 2. messages 테이블 생성
    await queryRunner.createTable(
      new Table({
        name: 'messages',
        columns: [
          new TableColumn({
            name: 'id',
            type: 'varchar',
            length: '36',
            isPrimary: true,
            isNullable: false,
          }),
          new TableColumn({
            name: 'conversationId',
            type: 'varchar',
            length: '36',
            isNullable: false,
          }),
          new TableColumn({
            name: 'role',
            type: 'enum',
            enum: ['user', 'assistant'],
            isNullable: false,
          }),
          new TableColumn({
            name: 'content',
            type: 'text',
            isNullable: false,
          }),
          new TableColumn({
            name: 'metadata',
            type: 'json',
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
            name: 'IDX_messages_conversationId',
            columnNames: ['conversationId'],
            isUnique: false,
          }),
        ],
        engine: 'InnoDB',
      }),
      true,
    );

    // 3. 외래키 추가
    await queryRunner.createForeignKey(
      'messages',
      new TableForeignKey({
        columnNames: ['conversationId'],
        referencedColumnNames: ['id'],
        referencedTableName: 'conversations',
        onDelete: 'CASCADE',
        onUpdate: 'CASCADE',
      }),
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.dropTable('messages');
    await queryRunner.dropTable('conversations');
  }
}
```

**마이그레이션 실행:**

```bash
npm run migration:run
```

### 3. Conversation 서비스 구현

대화 관리를 위한 서비스를 구현했습니다.

**`src/conversation/conversation.service.ts`**

주요 메서드:

- `createConversation(userId, title?)`: 새 대화 생성
- `getConversation(conversationId, userId)`: 특정 대화 조회 (메시지 포함)
- `getConversations(userId)`: 사용자의 모든 대화 목록 조회
- `addMessage(conversationId, role, content, metadata?)`: 대화에 메시지 추가
- `getConversationHistory(conversationId, userId)`: 대화 히스토리를 conversationHistory 형식으로 반환
- `updateConversationTitle(conversationId, userId, title)`: 대화 제목 업데이트
- `deleteConversation(conversationId, userId)`: 대화 삭제
- `conversationExists(conversationId, userId)`: 대화 존재 여부 확인

### 4. Conversation 컨트롤러 구현

대화 관리를 위한 REST API 엔드포인트를 구현했습니다.

**`src/conversation/conversation.controller.ts`**

#### API 엔드포인트

##### `POST /conversations`
새 대화 생성

**요청:**
```json
{
  "title": "대화 제목 (선택사항)"
}
```

**응답:**
```json
{
  "success": true,
  "conversation": {
    "id": "conversation-uuid",
    "title": "대화 제목",
    "createdAt": "2025-11-25T00:00:00.000Z",
    "updatedAt": "2025-11-25T00:00:00.000Z"
  }
}
```

##### `GET /conversations`
사용자의 모든 대화 목록 조회

**응답:**
```json
{
  "success": true,
  "conversations": [
    {
      "id": "conversation-uuid",
      "title": "대화 제목",
      "messageCount": 5,
      "createdAt": "2025-11-25T00:00:00.000Z",
      "updatedAt": "2025-11-25T00:00:00.000Z"
    }
  ]
}
```

##### `GET /conversations/:id`
특정 대화 조회 (메시지 포함)

**응답:**
```json
{
  "success": true,
  "conversation": {
    "id": "conversation-uuid",
    "title": "대화 제목",
    "messages": [
      {
        "id": "message-uuid",
        "role": "user",
        "content": "질문 내용",
        "metadata": null,
        "createdAt": "2025-11-25T00:00:00.000Z"
      },
      {
        "id": "message-uuid",
        "role": "assistant",
        "content": "답변 내용",
        "metadata": {
          "sources": [...],
          "usage": {...}
        },
        "createdAt": "2025-11-25T00:00:01.000Z"
      }
    ],
    "createdAt": "2025-11-25T00:00:00.000Z",
    "updatedAt": "2025-11-25T00:00:01.000Z"
  }
}
```

##### `PUT /conversations/:id/title`
대화 제목 업데이트

**요청:**
```json
{
  "title": "새로운 대화 제목"
}
```

##### `DELETE /conversations/:id`
대화 삭제

**응답:**
```json
{
  "success": true,
  "message": "대화가 삭제되었습니다."
}
```

### 5. RAG 쿼리 API 수정

기존 RAG 쿼리 API에 대화 연속 기능을 추가했습니다.

**`src/rag/rag.controller.ts`**

#### 수정된 `POST /rag/query` 엔드포인트

**요청:**
```json
{
  "question": "사용자 질문",
  "conversationId": "conversation-uuid (선택사항)"
}
```

**동작 방식:**
1. `conversationId`가 제공된 경우:
   - 해당 대화가 존재하고 사용자 소유인지 확인
   - 대화의 모든 메시지를 히스토리로 로드
   - RAG 서비스에 히스토리와 함께 전달하여 컨텍스트 유지

2. `conversationId`가 없는 경우:
   - 새 대화를 자동 생성
   - 첫 질문의 일부를 제목으로 사용

3. 질문과 답변을 자동으로 메시지로 저장

**응답:**
```json
{
  "success": true,
  "answer": "LLM이 생성한 답변",
  "sources": [
    {
      "pageTitle": "문서 제목",
      "pageUrl": "문서 URL",
      "score": 0.85,
      "chunkText": "관련 텍스트..."
    }
  ],
  "question": "사용자 질문",
  "rewrittenQuery": "검색 최적화된 쿼리",
  "usage": {
    "promptTokens": 1000,
    "completionTokens": 500,
    "totalTokens": 1500
  },
  "conversationId": "conversation-uuid"
}
```

### 6. 모듈 통합

Conversation 모듈을 애플리케이션에 통합했습니다.

**`src/app.module.ts`**

```typescript
import { ConversationModule } from './conversation/conversation.module';

@Module({
  imports: [
    // ... 기존 모듈들
    ConversationModule,
  ],
})
export class AppModule {}
```

**`src/rag/rag.module.ts`**

```typescript
import { ConversationModule } from '../conversation/conversation.module';

@Module({
  imports: [
    // ... 기존 모듈들
    ConversationModule,
  ],
})
export class RagModule {}
```

## 사용 예제

### 1. 새 대화 시작

```bash
curl -X POST http://localhost:3001/rag/query \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer YOUR_JWT_TOKEN" \
  -d '{
    "question": "이 프로젝트는 무엇에 관한 것인가요?"
  }'
```

**응답:**
```json
{
  "success": true,
  "answer": "이 프로젝트는 RAG 기반 챗봇 시스템입니다...",
  "conversationId": "abc123-def456-ghi789",
  ...
}
```

### 2. 기존 대화 이어가기

```bash
curl -X POST http://localhost:3001/rag/query \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer YOUR_JWT_TOKEN" \
  -d '{
    "question": "그럼 어떻게 사용하나요?",
    "conversationId": "abc123-def456-ghi789"
  }'
```

이전 대화의 컨텍스트를 기반으로 답변이 생성됩니다.

### 3. 대화 목록 조회

```bash
curl -X GET http://localhost:3001/conversations \
  -H "Authorization: Bearer YOUR_JWT_TOKEN"
```

### 4. 특정 대화 조회

```bash
curl -X GET http://localhost:3001/conversations/abc123-def456-ghi789 \
  -H "Authorization: Bearer YOUR_JWT_TOKEN"
```

### 5. 대화 제목 수정

```bash
curl -X PUT http://localhost:3001/conversations/abc123-def456-ghi789/title \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer YOUR_JWT_TOKEN" \
  -d '{
    "title": "프로젝트 관련 질문"
  }'
```

### 6. 대화 삭제

```bash
curl -X DELETE http://localhost:3001/conversations/abc123-def456-ghi789 \
  -H "Authorization: Bearer YOUR_JWT_TOKEN"
```

## 데이터베이스 관계

```
users (1) ──< (N) conversations (1) ──< (N) messages
```

- 한 사용자는 여러 대화를 가질 수 있음
- 한 대화는 여러 메시지를 가질 수 있음
- 대화 삭제 시 관련 메시지도 자동 삭제 (CASCADE)

## 보안 고려사항

- 모든 API 엔드포인트는 JWT 인증이 필요함
- 사용자는 자신의 대화만 조회/수정/삭제 가능
- `conversationId` 검증을 통해 다른 사용자의 대화에 접근하는 것을 방지

## 주요 특징

1. **자동 대화 생성**: 첫 질문 시 자동으로 새 대화 생성
2. **컨텍스트 유지**: 이전 대화 히스토리를 자동으로 로드하여 연속 대화 지원
3. **메타데이터 저장**: 답변에 사용된 소스, 토큰 사용량 등 추가 정보 저장
4. **자동 제목 생성**: 첫 질문의 일부를 대화 제목으로 자동 설정
5. **캐스케이드 삭제**: 대화 삭제 시 관련 메시지도 자동 삭제

## 검증

1. 마이그레이션 실행 확인:
   ```bash
   npm run migration:show
   ```
   `CreateConversationAndMessageTables1764000000000` 마이그레이션이 실행되었는지 확인

2. API 테스트:
   - Swagger UI (`http://localhost:3001/api`)에서 모든 엔드포인트 테스트
   - 새 대화 생성 및 메시지 저장 확인
   - 기존 대화 이어가기 기능 확인

3. 데이터베이스 확인:
   - `conversations` 테이블에 대화가 저장되는지 확인
   - `messages` 테이블에 질문과 답변이 저장되는지 확인

## 결과

- ✅ ChatGPT처럼 연속적인 대화를 지원하는 기능 완성
- ✅ 사용자별 대화 세션 관리 기능 구현
- ✅ 대화 히스토리 기반 컨텍스트 유지 기능 구현
- ✅ 대화 목록 조회, 제목 수정, 삭제 기능 구현
- ✅ 모든 API 엔드포인트에 인증 및 권한 검증 적용

---

_이 Walkthrough는 프로젝트 `Walkthrough/12-conversation-management.md` 파일에 저장되었습니다._

