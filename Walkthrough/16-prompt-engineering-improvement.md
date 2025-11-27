# 프롬프트 엔지니어링 개선

## 개요

LLM 답변의 문서 및 API 인용 방식을 개선하여 더 자연스럽고 명확한 인용을 가능하게 했습니다. 기존의 "[문서 1]", "[API 2]" 같은 번호 형식 대신 실제 문서 제목이나 API 엔드포인트를 사용하도록 변경했습니다.

## 주요 개선 사항

- 📝 **자연스러운 문서 인용**: 번호 대신 실제 문서 제목 사용
- 🔗 **명확한 API 인용**: 번호 대신 실제 엔드포인트나 기능 설명 사용
- 🎯 **정확한 소스 추출**: 제목/엔드포인트 기반으로 실제 사용된 소스 추출
- 🔍 **향상된 매칭 로직**: 답변에서 문서 제목이나 API 엔드포인트를 더 정확하게 감지

## 작업 내용

### 1. OpenAI 서비스 프롬프트 개선

**`src/openai/openai.service.ts`**

#### 1.1 문서 컨텍스트 형식 변경

**변경 전:**
```typescript
const contextText = contextDocuments
  .map(
    (doc, index) =>
      `[문서 ${index + 1}]\n제목: ${doc.pageTitle}\nURL: ${doc.pageUrl}\n내용: ${doc.text}`,
  )
  .join('\n\n---\n\n');
```

**변경 후:**
```typescript
const contextText = contextDocuments
  .map(
    (doc) =>
      `[문서: ${doc.pageTitle}]\n제목: ${doc.pageTitle}\nURL: ${doc.pageUrl}\n내용: ${doc.text}`,
  )
  .join('\n\n---\n\n');
```

**개선 효과:**
- 문서를 번호가 아닌 실제 제목으로 식별
- LLM이 답변에서 실제 문서 제목을 사용하도록 유도

#### 1.2 문서 인용 프롬프트 개선

**변경 전:**
```
- **중요**: 답변에 사용한 모든 문서는 반드시 "[문서 N]" 형식으로 명시적으로 인용해야 합니다
- 여러 문서의 정보를 사용했다면 각각 "[문서 1]", "[문서 2]" 형식으로 인용하세요
```

**변경 후:**
```
- **중요**: 답변에 사용한 모든 문서는 반드시 실제 문서 제목을 사용하여 인용해야 합니다
- 예: "RAG 시스템 구현 가이드 문서에 따르면..." 또는 "인증 시스템 문서에서..."
- 여러 문서의 정보를 사용했다면 각각 실제 문서 제목으로 인용하세요
- "[문서 1]", "[문서 2]" 같은 번호 형식은 사용하지 마세요
```

**개선 효과:**
- 더 자연스러운 문서 인용 방식
- 사용자가 문서 제목으로 답변의 출처를 쉽게 파악 가능

#### 1.3 API 컨텍스트 형식 변경

**변경 전:**
```typescript
const contextText = contextApis
  .map(
    (api, index) => `[API ${index + 1}]
엔드포인트: ${api.endpoint}
...
`,
  )
  .join('\n---\n\n');
```

**변경 후:**
```typescript
const contextText = contextApis
  .map((api) => {
    // API 식별자 생성: 엔드포인트 또는 기능 설명
    const apiIdentifier = api.summary
      ? `${api.summary} (${api.endpoint})`
      : api.endpoint;

    return `[API: ${apiIdentifier}]
엔드포인트: ${api.endpoint}
...
`;
  })
  .join('\n---\n\n');
```

**개선 효과:**
- API를 번호가 아닌 실제 엔드포인트나 기능 설명으로 식별
- 요약(summary)이 있으면 함께 표시하여 더 명확한 식별

#### 1.4 API 인용 프롬프트 개선

**변경 전:**
```
- API 인용은 자연스럽게 문맥에 포함 (예: "회원가입 API(POST /auth/register)를 사용하면...")
```

**변경 후:**
```
- **중요**: API 인용 시 "[API 1]", "[API 2]" 같은 번호 형식은 절대 사용하지 마세요
- API 인용은 실제 엔드포인트나 기능 설명을 사용하세요
  - 예: "'GET' /api/documents/{id} API를 사용하면..." 
  - 예: "문서 조회 API('GET' /api/documents/{id})를 사용하면..."
  - 예: "회원가입 API(POST /auth/register)를 사용하면..."
  - API 요약이 있으면: "회원가입 API('POST' /auth/register)를 사용하면..."
```

**개선 효과:**
- 명확한 API 인용 가이드라인 제공
- 다양한 인용 형식 예시로 LLM의 이해도 향상

### 2. RAG 서비스 소스 추출 로직 개선

**`src/rag/rag.service.ts`**

#### 2.1 문서 인용 추출 메서드 변경

**변경 전:**
```typescript
/**
 * LLM 답변에서 실제로 사용된 문서 번호 추출
 * "[문서 1]", "[문서 2]" 같은 패턴을 찾아서 Set으로 반환
 */
private extractUsedDocumentIndices(answer: string): Set<number> {
  const usedIndices = new Set<number>();

  // "[문서 N]" 패턴 찾기 (N은 숫자)
  const documentPattern = /\[문서\s*(\d+)\]/g;
  let match: RegExpExecArray | null;

  while ((match = documentPattern.exec(answer)) !== null) {
    if (match[1]) {
      const docIndex = parseInt(match[1], 10);
      if (!isNaN(docIndex)) {
        usedIndices.add(docIndex);
      }
    }
  }

  return usedIndices;
}
```

**변경 후:**
```typescript
/**
 * LLM 답변에서 실제로 사용된 문서 제목 추출
 * 답변에 언급된 문서 제목을 찾아서 Set으로 반환
 */
private extractUsedDocumentTitles(
  answer: string,
  contextDocuments: Array<{
    text: string;
    pageTitle: string;
    pageUrl: string;
  }>,
): Set<string> {
  const usedTitles = new Set<string>();

  // 각 문서의 제목을 답변에서 찾기
  for (const doc of contextDocuments) {
    const pageTitle = doc.pageTitle;
    
    if (!pageTitle || pageTitle === 'Unknown') {
      continue;
    }

    // 답변에서 문서 제목 패턴 찾기
    // 대소문자 구분 없이 검색하고, 부분 일치도 허용
    const titleWords = pageTitle
      .split(/\s+/)
      .filter((word) => word.length > 2);

    // 제목의 주요 단어들이 답변에 포함되어 있는지 확인
    let matchCount = 0;
    for (const word of titleWords) {
      const regex = new RegExp(
        word.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'),
        'i',
      );
      if (regex.test(answer)) {
        matchCount++;
      }
    }

    // 제목의 50% 이상 단어가 매치되면 사용된 것으로 간주
    if (matchCount >= Math.ceil(titleWords.length * 0.5)) {
      usedTitles.add(pageTitle);
    }

    // 전체 제목이 직접 언급된 경우도 확인
    const fullTitleRegex = new RegExp(
      pageTitle.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'),
      'i',
    );
    if (fullTitleRegex.test(answer)) {
      usedTitles.add(pageTitle);
    }
  }

  return usedTitles;
}
```

**주요 개선 사항:**
- 번호 기반 추출 → 제목 기반 추출로 변경
- 제목의 주요 단어 매칭으로 부분 일치 허용
- 전체 제목 직접 언급도 감지
- 대소문자 구분 없이 검색

#### 2.2 소스 필터링 로직 변경

**변경 전:**
```typescript
// 9. 답변에서 실제로 사용된 문서 인덱스 추출
const usedDocumentIndices = this.extractUsedDocumentIndices(answer);

// 10. 실제로 사용된 문서만 필터링하여 반환
if (usedDocumentIndices.size > 0) {
  sources = results
    .filter((_, index) => usedDocumentIndices.has(index + 1)) // 문서 번호는 1부터 시작
    .map((result) => {
      // ...
    });
}
```

**변경 후:**
```typescript
// 9. 답변에서 실제로 사용된 문서 추출 (문서 제목 기반)
const usedDocumentTitles = this.extractUsedDocumentTitles(
  answer,
  contextDocuments,
);

// 10. 실제로 사용된 문서만 필터링하여 반환
if (usedDocumentTitles.size > 0) {
  sources = results
    .filter((result) => {
      const pageTitle = (result.payload.pageTitle as string) || '';
      return usedDocumentTitles.has(pageTitle);
    })
    .map((result) => {
      // ...
    });
}
```

**개선 효과:**
- 인덱스 기반 필터링 → 제목 기반 필터링으로 변경
- 더 정확한 소스 추출
- 문서 순서가 바뀌어도 정확하게 추출 가능

### 3. Swagger 서비스 소스 추출 로직 개선

**`src/swagger/swagger.service.ts`**

#### 3.1 API 인용 추출 메서드 변경

**변경 전:**
```typescript
/**
 * LLM 답변에서 실제로 사용된 API 번호 추출
 * "[API 1]", "[API 2]" 같은 패턴을 찾아서 Set으로 반환
 */
private extractUsedApiIndices(answer: string): Set<number> {
  const usedIndices = new Set<number>();

  // "[API N]" 패턴 찾기 (N은 숫자)
  const apiPattern = /\[API\s*(\d+)\]/g;
  let match: RegExpExecArray | null;

  while ((match = apiPattern.exec(answer)) !== null) {
    if (match[1]) {
      const apiIndex = parseInt(match[1], 10);
      if (!isNaN(apiIndex)) {
        usedIndices.add(apiIndex);
      }
    }
  }

  return usedIndices;
}
```

**변경 후:**
```typescript
/**
 * LLM 답변에서 실제로 사용된 API 엔드포인트 추출
 * 답변에 언급된 엔드포인트 패턴을 찾아서 Set으로 반환
 */
private extractUsedApiEndpoints(
  answer: string,
  contextApis: Array<{
    endpoint: string;
    method: string;
    path: string;
    summary?: string;
  }>,
): Set<string> {
  const usedEndpoints = new Set<string>();

  // 각 API의 엔드포인트, 메서드, 경로, 요약을 답변에서 찾기
  for (const api of contextApis) {
    const endpoint = api.endpoint; // 예: "POST /auth/register"
    const method = api.method; // 예: "POST"
    const path = api.path; // 예: "/auth/register"
    const summary = api.summary || '';

    // 답변에서 엔드포인트 패턴 찾기
    // 패턴 예시: "POST /auth/register", "'POST' /auth/register", "POST /auth/register API"
    const patterns = [
      endpoint, // 전체 엔드포인트
      `'${method}' ${path}`, // 'POST' /auth/register 형식
      `${method} ${path}`, // POST /auth/register 형식
      path, // 경로만
    ];

    // 요약이 있으면 요약도 검색
    if (summary) {
      patterns.push(summary);
    }

    for (const pattern of patterns) {
      // 대소문자 구분 없이 검색
      const regex = new RegExp(
        pattern.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'),
        'i',
      );
      if (regex.test(answer)) {
        usedEndpoints.add(endpoint);
        break; // 하나라도 찾으면 다음 API로
      }
    }
  }

  return usedEndpoints;
}
```

**주요 개선 사항:**
- 번호 기반 추출 → 엔드포인트 기반 추출로 변경
- 다양한 인용 형식 지원 (전체 엔드포인트, 메서드+경로, 경로만, 요약)
- 대소문자 구분 없이 검색
- 하나의 패턴이라도 매치되면 해당 API를 사용한 것으로 간주

#### 3.2 소스 필터링 로직 변경

**변경 전:**
```typescript
// 9. 답변에서 실제로 사용된 API 인덱스 추출
const usedApiIndices = this.extractUsedApiIndices(answer);

// 10. 실제로 사용된 API만 필터링하여 반환
if (usedApiIndices.size > 0) {
  sources = results
    .filter((_, index) => usedApiIndices.has(index + 1)) // API 번호는 1부터 시작
    .map((result) => ({
      // ...
    }));
}
```

**변경 후:**
```typescript
// 9. 답변에서 실제로 사용된 API 추출 (엔드포인트 기반)
const usedApiEndpoints = this.extractUsedApiEndpoints(
  answer,
  contextApis,
);

// 10. 실제로 사용된 API만 필터링하여 반환
if (usedApiEndpoints.size > 0) {
  sources = results
    .filter((result) => {
      const endpoint = (result.payload.endpoint as string) || '';
      return usedApiEndpoints.has(endpoint);
    })
    .map((result) => ({
      // ...
    }));
}
```

**개선 효과:**
- 인덱스 기반 필터링 → 엔드포인트 기반 필터링으로 변경
- 더 정확한 소스 추출
- API 순서가 바뀌어도 정확하게 추출 가능

## 개선 효과

### 1. 더 자연스러운 답변

**변경 전:**
```
RAG 시스템 구현 가이드 문서에 따르면... [문서 1]
인증 시스템 문서에서... [문서 2]
```

**변경 후:**
```
RAG 시스템 구현 가이드 문서에 따르면...
인증 시스템 문서에서...
```

### 2. 명확한 출처 표시

사용자가 답변을 읽을 때 실제 문서 제목이나 API 엔드포인트를 통해 출처를 쉽게 파악할 수 있습니다.

### 3. 정확한 소스 추출

- 문서 제목 기반 매칭으로 부분 일치도 감지
- API 엔드포인트 기반 매칭으로 다양한 인용 형식 지원
- 순서에 의존하지 않는 안정적인 추출

### 4. 향상된 사용자 경험

- 번호 대신 실제 이름을 사용하여 더 직관적
- 답변의 가독성 향상
- 출처 추적 용이

## 테스트 예시

### 문서 질문 예시

**질문:** "RAG 시스템은 어떻게 구현하나요?"

**답변 예시:**
```
RAG 시스템 구현 가이드 문서에 따르면, RAG 시스템은 다음과 같이 구현할 수 있습니다:

1. 문서 벡터화
2. 유사도 검색
3. 컨텍스트 생성
4. LLM 답변 생성
```

**소스 추출:**
- "RAG 시스템 구현 가이드" 문서 제목이 답변에 포함되어 있으므로 해당 문서를 소스로 추출

### API 질문 예시

**질문:** "회원가입 API는 어떻게 사용하나요?"

**답변 예시:**
```
회원가입 API('POST' /auth/register)를 사용하면 다음과 같이 회원가입을 할 수 있습니다:

### 요청 정보
- 메서드: POST
- 경로: /auth/register
- 본문: { "email": "...", "password": "..." }
```

**소스 추출:**
- "'POST' /auth/register" 패턴이 답변에 포함되어 있으므로 해당 API를 소스로 추출

## 결론

프롬프트 엔지니어링 개선을 통해 LLM 답변의 인용 방식을 더 자연스럽고 명확하게 만들었습니다. 번호 기반 인용에서 실제 이름 기반 인용으로 변경하여 사용자 경험을 크게 향상시켰습니다.

