# Swagger 파일 업로드 및 개선 사항

## 개요

Swagger 문서 업로드 기능을 확장하여 JSON 파일을 직접 업로드할 수 있도록 개선했습니다. 또한 대용량 파일 처리, 컨텍스트 길이 제한, 프롬프트 개선 등 여러 최적화 작업을 수행했습니다.

## 주요 기능

- 📁 **파일 직접 업로드**: Swagger JSON 파일을 multipart/form-data로 직접 업로드
- ⚡ **비동기 처리**: 파일 업로드 후 즉시 응답 반환, 백그라운드에서 처리
- 📊 **상태 확인**: 키 또는 ID로 업로드 처리 상태 실시간 확인
- 🔧 **컨텍스트 최적화**: 토큰 제한을 고려한 검색 결과 및 텍스트 길이 제한
- 💡 **프롬프트 개선**: 프론트엔드 개발자 관점의 실용적인 답변 제공
- 🔄 **순환 참조 처리**: Swagger 스키마의 순환 참조 문제 해결

## 작업 내용

### 1. 파일 직접 업로드 기능 추가

기존 URL 업로드 방식에 추가로 JSON 파일을 직접 업로드할 수 있는 기능을 추가했습니다.

#### 1.1 엔티티 수정

**`src/swagger/entities/swagger-document.entity.ts`**

```typescript
@Column({ type: 'varchar', length: 500, nullable: true })
swaggerUrl: string | null; // Swagger JSON URL (파일 업로드의 경우 null)
```

- `swaggerUrl` 필드를 nullable로 변경하여 파일 업로드 시 null 허용

#### 1.2 마이그레이션 생성

**`src/database/migrations/1764211953675-MakeSwaggerUrlNullable.ts`**

```typescript
public async up(queryRunner: QueryRunner): Promise<void> {
  await queryRunner.query(
    `ALTER TABLE \`swagger_documents\` DROP COLUMN \`swaggerUrl\``,
  );
  await queryRunner.query(
    `ALTER TABLE \`swagger_documents\` ADD \`swaggerUrl\` varchar(500) NULL`,
  );
}
```

#### 1.3 컨트롤러에 파일 업로드 엔드포인트 추가

**`src/swagger/swagger.controller.ts`**

```typescript
@Post('upload-file')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(Role.ADMIN, Role.SUB_ADMIN)
@UseInterceptors(FileInterceptor('file'))
@HttpCode(HttpStatus.OK)
@ApiConsumes('multipart/form-data')
async uploadSwaggerFile(
  @Body('key') key: string,
  @UploadedFile() file: { buffer: Buffer; originalname: string } | undefined,
) {
  // 파일 검증
  if (!file) {
    throw new BadRequestException('파일이 제공되지 않았습니다.');
  }
  
  // JSON 파일 확장자 검증
  const fileName = file.originalname.toLowerCase();
  if (!fileName.endsWith('.json')) {
    throw new BadRequestException(
      '지원하지 않는 파일 형식입니다. JSON 파일만 업로드 가능합니다.',
    );
  }
  
  // 키 유효성 검증
  // ... (키 길이, 형식 검증)
  
  // 파일 내용을 JSON으로 파싱
  const fileContent = file.buffer.toString('utf-8');
  const swaggerSpec = JSON.parse(fileContent);
  
  // 문서 생성 및 비동기 처리
  const swaggerDoc = await this.swaggerService.createSwaggerDocument(
    key,
    swaggerSpec,
  );
  
  // 백그라운드에서 실제 업로드 진행
  this.swaggerService
    .uploadSwaggerDocumentFromJson(key, swaggerSpec)
    .catch((error) => {
      this.logger.error(`백그라운드 업로드 실패: ${error.message}`);
    });
  
  // 즉시 응답 반환
  return {
    success: true,
    message: 'Swagger 파일이 업로드되었습니다. 처리 중입니다.',
    documentId: swaggerDoc.id,
    key: swaggerDoc.key,
    status: swaggerDoc.indexingStatus,
  };
}
```

**주요 특징:**
- `FileInterceptor('file')`를 사용하여 파일 업로드 처리
- 파일 확장자 및 키 유효성 검증
- 즉시 응답 반환 후 백그라운드 처리

### 2. 비동기 처리 및 상태 확인

대용량 파일 처리 시 타임아웃 문제를 해결하기 위해 비동기 처리 방식을 도입했습니다.

#### 2.1 서비스 메서드 분리

**`src/swagger/swagger.service.ts`**

```typescript
/**
 * Swagger 문서를 생성합니다 (메타데이터만 저장)
 */
async createSwaggerDocument(
  key: string,
  swaggerSpec: unknown,
): Promise<SwaggerDocument> {
  // 기존 문서 확인 및 삭제
  let swaggerDoc = await this.swaggerDocumentRepository.findOne({
    where: { key },
  });
  
  if (swaggerDoc) {
    await this.deleteSwaggerDocument(swaggerDoc.id);
  }
  
  // 새 문서 생성
  swaggerDoc = this.swaggerDocumentRepository.create({
    key,
    swaggerUrl: null,
    title: spec.info?.title || null,
    version: spec.info?.version || null,
    description: spec.info?.description || null,
    indexingStatus: SwaggerIndexingStatus.PROCESSING,
    apiCount: 0,
  });
  
  return await this.swaggerDocumentRepository.save(swaggerDoc);
}

/**
 * Swagger JSON 객체를 직접 받아서 벡터DB에 업로드합니다
 */
async uploadSwaggerDocumentFromJson(
  key: string,
  swaggerSpec: unknown,
): Promise<{...}> {
  // 문서 찾기 (이미 생성되어 있어야 함)
  let swaggerDoc = await this.swaggerDocumentRepository.findOne({
    where: { key },
  });
  
  if (!swaggerDoc) {
    swaggerDoc = await this.createSwaggerDocument(key, swaggerSpec);
  }
  
  // 상태를 PROCESSING으로 업데이트
  swaggerDoc.indexingStatus = SwaggerIndexingStatus.PROCESSING;
  await this.swaggerDocumentRepository.save(swaggerDoc);
  
  // 실제 벡터화 및 저장 작업 진행
  // ...
}
```

#### 2.2 상태 확인 엔드포인트 추가

**`src/swagger/swagger.controller.ts`**

```typescript
@Get('documents/key/:key')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(Role.ADMIN, Role.SUB_ADMIN)
@ApiOperation({
  summary: '[관리자] 키로 Swagger 문서 상태 조회',
  description:
    '키를 사용하여 Swagger 문서의 처리 상태를 조회합니다. 업로드 후 상태 확인에 사용합니다.',
})
async getSwaggerDocumentByKey(@Param('key') key: string) {
  const document = await this.swaggerService.getSwaggerDocumentByKey(key);
  if (!document) {
    return {
      success: false,
      message: 'Swagger 문서를 찾을 수 없습니다.',
    };
  }
  return {
    success: true,
    document: {
      id: document.id,
      key: document.key,
      title: document.title,
      indexingStatus: document.indexingStatus,
      apiCount: document.apiCount,
      lastIndexedAt: document.lastIndexedAt,
      errorMessage: document.errorMessage,
    },
  };
}
```

**서비스 메서드:**

```typescript
async getSwaggerDocumentByKey(key: string): Promise<SwaggerDocument | null> {
  return await this.swaggerDocumentRepository.findOne({
    where: { key },
  });
}
```

**사용 방법:**
1. 파일 업로드 후 `documentId` 또는 `key` 받기
2. 주기적으로 `GET /swagger/documents/key/:key` 호출하여 상태 확인
3. `indexingStatus`가 `completed`가 될 때까지 대기

### 3. 서버 타임아웃 설정

대용량 파일 처리 시 타임아웃 문제를 해결하기 위해 서버 타임아웃을 늘렸습니다.

**`src/main.ts`**

```typescript
async function bootstrap() {
  const app = await NestFactory.create(AppModule);

  // 타임아웃 설정 (파일 업로드 등 긴 작업을 위해 5분으로 설정)
  app.getHttpAdapter().getInstance().timeout = 300000; // 5분 (300초)

  // ...
}
```

### 4. 컨텍스트 길이 제한

OpenAI 모델의 최대 컨텍스트 길이를 초과하지 않도록 검색 결과와 텍스트 길이를 제한했습니다.

**`src/swagger/swagger.service.ts`**

```typescript
// 검색 결과 수 제한
const searchOptions: QdrantSearchOptions = {
  vector: embedding,
  limit: 5, // 상위 5개 API 검색 (기존 10개에서 감소)
};

// 컨텍스트에 사용할 API 수 제한
const maxContextApis = 5;
const limitedResults = results.slice(0, maxContextApis);

// 각 API의 상세 텍스트 길이 제한
const truncateText = (text: string, maxLength: number) => {
  if (text.length <= maxLength) return text;
  return text.substring(0, maxLength) + '...';
};

const contextApis = limitedResults.map((result) => {
  const payload = result.payload;
  return {
    // ...
    parametersText: truncateText(parametersText, 500),
    requestBodyText: truncateText(requestBodyText, 500),
    responsesText: truncateText(responsesText, 500),
    // ...
  };
});
```

**변경 사항:**
- 검색 결과: 10개 → 5개
- 컨텍스트 API 수: 최대 5개
- 각 상세 텍스트: 최대 500자로 제한

### 5. 프롬프트 개선

프론트엔드 개발자 관점에서 요구사항을 파악하고 구현 방법을 설명하도록 프롬프트를 개선했습니다.

**`src/openai/openai.service.ts`**

#### 5.1 시스템 프롬프트 변경

```typescript
const systemPrompt = `당신은 프론트엔드 개발자를 위한 API 구현 가이드를 제공하는 전문가입니다.

핵심 원칙:
1. **요구사항 파악**: 사용자의 질문에서 실제로 구현하고자 하는 기능을 먼저 파악
2. **실용적 가이드**: 코드가 아닌 말로 구현 방법과 흐름을 설명
3. **API 추천**: 요구사항에 맞는 API를 찾아서 추천하고, 왜 그 API가 적합한지 설명
4. **구현 흐름**: 여러 API를 조합해야 할 경우, 어떤 순서로 호출해야 하는지 단계별로 설명
5. **주의사항**: 구현 시 주의해야 할 점이나 고려사항을 함께 안내

답변 구조:
## 1. 요구사항 파악 및 추천 API
- 어떤 기능을 구현하려는지 파악
- 그 기능을 구현하기 위해 필요한 API 추천
- 각 API가 왜 필요한지 간단히 설명

## 2. 구현 방법 설명
- 단계별 구현 흐름
- 각 API를 언제, 어떤 순서로 호출해야 하는지
- 응답 데이터를 어떻게 활용해야 하는지

## 3. API 상세 정보
- 언제 사용하나요?
- 필요한 정보
- 요청/응답 예시
- 응답 데이터 활용 방법
- 주의사항

## 4. 구현 팁 및 주의사항
- 여러 API 조합 시 순서나 타이밍
- 에러 처리 방법
- 로딩 상태 관리
`;
```

#### 5.2 사용자 프롬프트 개선

```typescript
const userPrompt = `다음은 벡터 검색으로 찾은 API 정보들입니다. **반드시 이 정보들만을 참고하여** 질문에 답변해주세요:

${contextText}

**질문**: ${question}

**중요 지시사항**:
1. 위에 제공된 API 정보들([API 1], [API 2] 등)을 **반드시 참고**하여 답변하세요
2. 제공된 API 정보에 없는 내용은 절대 추가하지 마세요
3. 각 API의 엔드포인트, 메서드, 경로, 파라미터, 요청 본문, 응답 형식 등을 **정확히** 참고하세요
4. 사용자의 질문과 관련된 API를 찾아서 추천하고, 그 API의 실제 정보를 바탕으로 설명하세요
`;
```

**주요 개선 사항:**
- 프론트엔드 개발자 관점의 답변 제공
- 코드 예시 없이 말로 구현 방법 설명
- 벡터DB 검색 결과를 명확히 참조하도록 강조
- API 번호([API 1], [API 2])로 참조 용이성 향상

### 6. 순환 참조 문제 해결

Swagger 스키마의 순환 참조로 인한 스택 오버플로우 문제를 해결했습니다.

**`src/swagger/swagger.service.ts`**

```typescript
private schemaToText(
  schema: unknown,
  schemas?: Record<string, unknown>,
  visited: Set<string> = new Set(), // 방문한 스키마 추적
): string {
  if (!schema) return '';

  const schemaObj = schema as Record<string, unknown>;
  const parts: string[] = [];

  // $ref 참조 처리
  if (schemaObj.$ref && typeof schemaObj.$ref === 'string') {
    const refName = schemaObj.$ref.split('/').pop();
    if (!refName) {
      return '';
    }

    // 순환 참조 감지
    if (visited.has(refName)) {
      return `[순환 참조: ${refName}]`;
    }

    if (schemas && schemas[refName]) {
      visited.add(refName);
      const result = this.schemaToText(schemas[refName], schemas, visited);
      visited.delete(refName); // 백트래킹
      return result;
    }
    return refName;
  }

  // ... 나머지 로직
}
```

**해결 방법:**
- `visited` Set을 사용하여 방문한 스키마 추적
- 순환 참조 감지 시 `[순환 참조: 스키마명]` 반환
- 백트래킹을 위해 처리 후 `visited`에서 제거

## API 엔드포인트

### 1. POST /swagger/upload-file (신규)

Swagger JSON 파일을 직접 업로드합니다.

**요청:**
- Content-Type: `multipart/form-data`
- `key`: Swagger 문서 고유 키
- `file`: Swagger JSON 파일

**응답:**
```json
{
  "success": true,
  "message": "Swagger 파일이 업로드되었습니다. 처리 중입니다.",
  "documentId": "uuid",
  "key": "my_api",
  "status": "processing"
}
```

### 2. GET /swagger/documents/key/:key (신규)

키로 Swagger 문서의 처리 상태를 조회합니다.

**응답:**
```json
{
  "success": true,
  "document": {
    "id": "uuid",
    "key": "my_api",
    "title": "API 문서",
    "indexingStatus": "completed",
    "apiCount": 150,
    "lastIndexedAt": "2024-01-01T00:00:00Z",
    "errorMessage": null
  }
}
```

**상태 값:**
- `pending`: 대기 중
- `processing`: 처리 중
- `completed`: 완료
- `failed`: 실패

### 3. POST /swagger/query (수정)

컨텍스트 길이 제한 및 프롬프트 개선이 적용되었습니다.

**변경 사항:**
- 검색 결과 수: 10개 → 5개
- 각 API 상세 텍스트: 최대 500자로 제한
- 프론트엔드 개발자 관점의 답변 제공

## 사용 예시

### 파일 업로드 및 상태 확인

```bash
# 1. 파일 업로드
curl -X POST http://localhost:3001/swagger/upload-file \
  -H "Authorization: Bearer {token}" \
  -F "key=my_api" \
  -F "file=@swagger.json"

# 응답:
# {
#   "success": true,
#   "documentId": "uuid",
#   "key": "my_api",
#   "status": "processing"
# }

# 2. 상태 확인 (폴링)
curl -X GET http://localhost:3001/swagger/documents/key/my_api \
  -H "Authorization: Bearer {token}"

# 응답:
# {
#   "success": true,
#   "document": {
#     "indexingStatus": "completed",
#     "apiCount": 150
#   }
# }
```

### 프론트엔드 구현 예시

```typescript
// 파일 업로드
const formData = new FormData();
formData.append('key', 'my_api');
formData.append('file', file);

const response = await axios.post('/swagger/upload-file', formData, {
  headers: { 'Content-Type': 'multipart/form-data' },
});

const { documentId, key, status } = response.data;

// 상태 확인 (폴링)
const checkStatus = async () => {
  const statusResponse = await axios.get(`/swagger/documents/key/${key}`);
  const { indexingStatus } = statusResponse.data.document;
  
  if (indexingStatus === 'completed') {
    console.log('업로드 완료!');
  } else if (indexingStatus === 'failed') {
    console.error('업로드 실패');
  } else {
    // 3초 후 다시 확인
    setTimeout(checkStatus, 3000);
  }
};

checkStatus();
```

## 개선 효과

1. **사용자 경험 향상**
   - 파일 업로드 후 즉시 응답 반환으로 대기 시간 제거
   - 상태 확인을 통한 진행 상황 파악 가능

2. **안정성 향상**
   - 대용량 파일 처리 시 타임아웃 문제 해결
   - 순환 참조로 인한 스택 오버플로우 방지

3. **답변 품질 개선**
   - 프론트엔드 개발자 관점의 실용적인 답변
   - 벡터DB 검색 결과를 정확히 참조

4. **성능 최적화**
   - 컨텍스트 길이 제한으로 토큰 사용량 감소
   - 불필요한 정보 제거로 처리 속도 향상

## 주의사항

1. **파일 크기 제한**
   - 서버 타임아웃이 5분으로 설정되어 있으므로, 매우 큰 파일의 경우 처리 시간이 오래 걸릴 수 있습니다.
   - 프론트엔드에서도 타임아웃을 적절히 설정해야 합니다.

2. **상태 확인 주기**
   - 폴링 주기는 3-5초 정도가 적절합니다.
   - 너무 짧은 주기는 서버 부하를 증가시킬 수 있습니다.

3. **에러 처리**
   - `indexingStatus`가 `failed`인 경우 `errorMessage`를 확인하여 원인을 파악하세요.
   - 네트워크 오류 등으로 상태 확인이 실패할 수 있으므로 재시도 로직을 구현하는 것이 좋습니다.

## 다음 단계

향후 개선 가능한 사항:

1. **WebSocket 지원**: 실시간 상태 업데이트를 위한 WebSocket 연결
2. **진행률 표시**: 처리 중인 API 개수와 전체 개수를 비교하여 진행률 표시
3. **배치 처리**: 여러 파일을 한 번에 업로드하고 일괄 처리
4. **압축 파일 지원**: ZIP 파일 내의 여러 Swagger 파일 자동 추출 및 처리

