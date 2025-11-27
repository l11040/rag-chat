# 모델 최적화 및 프롬프트 개선

## 개요

OpenAI 모델을 gpt-4o-mini로 통일하고, 프롬프트 크기를 확대하며, Swagger API 프롬프트를 더 간결하고 구조화된 형태로 개선했습니다. 또한 컨텍스트 길이를 최적화하여 토큰 사용량을 줄이면서도 답변 품질을 유지하도록 했습니다.

## 주요 개선 사항

- 🤖 **모델 통일**: 모든 작업에서 gpt-4o-mini 사용 (비용 효율성 향상)
- 📏 **프롬프트 크기 확대**: max_tokens 증가로 더 상세한 답변 가능
- ✨ **Swagger 프롬프트 개선**: 더 간결하고 구조화된 프롬프트로 답변 품질 향상
- ⚡ **컨텍스트 최적화**: 토큰 사용량 감소를 위한 컨텍스트 길이 조정

## 작업 내용

### 1. OpenAI 모델 설정 통일

**`src/openai/openai.service.ts`**

#### 1.1 모델 설정 필드 추가

```typescript
export class OpenAIService {
  private readonly openai: OpenAI;
  private readonly logger = new Logger(OpenAIService.name);
  private readonly chatModel: string;
  private readonly queryRewriteModel: string;

  constructor(private configService: ConfigService) {
    // ...
    
    // 모델 설정 (환경 변수로 오버라이드 가능, 기본값: gpt-4o-mini)
    this.chatModel =
      this.configService.get<string>('OPENAI_CHAT_MODEL') || 'gpt-4o-mini';
    this.queryRewriteModel =
      this.configService.get<string>('OPENAI_QUERY_REWRITE_MODEL') ||
      'gpt-4o-mini'; // 쿼리 재작성은 더 가벼운 모델 사용

    this.logger.log(
      `OpenAI 모델 설정: Chat=${this.chatModel}, QueryRewrite=${this.queryRewriteModel}`,
    );
  }
}
```

**주요 변경 사항:**
- `chatModel`과 `queryRewriteModel` 필드 추가
- 기본값을 `gpt-4o-mini`로 설정
- 환경 변수로 오버라이드 가능 (`OPENAI_CHAT_MODEL`, `OPENAI_QUERY_REWRITE_MODEL`)

#### 1.2 모델 사용 통일

**변경 전:**
```typescript
// 하드코딩된 모델명
const response = await this.openai.chat.completions.create({
  model: 'gpt-3.5-turbo',
  // ...
});
```

**변경 후:**
```typescript
// 설정된 모델 사용
const response = await this.openai.chat.completions.create({
  model: this.chatModel, // 또는 this.queryRewriteModel
  // ...
});
```

**적용 위치:**
- `rewriteQueryForSearch`: `this.queryRewriteModel` 사용
- `generateAnswer`: `this.chatModel` 사용
- `generateApiAnswer`: `this.chatModel` 사용

**개선 효과:**
- 모든 작업에서 일관된 모델 사용
- 환경 변수로 모델 변경 가능
- 비용 효율적인 gpt-4o-mini 사용

### 2. 프롬프트 크기 확대

더 상세한 답변을 위해 max_tokens를 증가시켰습니다.

#### 2.1 일반 답변 생성

**변경 전:**
```typescript
const response = await this.openai.chat.completions.create({
  model: this.chatModel,
  messages: messages,
  temperature: 0.3,
  max_tokens: 1000,
});
```

**변경 후:**
```typescript
const response = await this.openai.chat.completions.create({
  model: this.chatModel,
  messages: messages,
  temperature: 0.3,
  max_tokens: 2000, // 더 상세한 답변을 위해 토큰 증가
});
```

#### 2.2 API 답변 생성

**변경 전:**
```typescript
const response = await this.openai.chat.completions.create({
  model: this.chatModel,
  messages: messages,
  temperature: 0.3,
  max_tokens: 2000,
});
```

**변경 후:**
```typescript
const response = await this.openai.chat.completions.create({
  model: this.chatModel,
  messages: messages,
  temperature: 0.3,
  max_tokens: 4000, // 상세한 API 가이드와 예시를 위해 토큰 증가
});
```

**개선 효과:**
- 더 긴 답변 생성 가능
- 상세한 설명과 예시 포함 가능
- API 가이드의 완전성 향상

### 3. Swagger 프롬프트 개선

Swagger API 프롬프트를 더 간결하고 구조화된 형태로 개선했습니다.

#### 3.1 시스템 프롬프트 개선

**변경 전:**
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
## 2. 구현 방법 설명
## 3. API 상세 정보
## 4. 구현 팁 및 주의사항
`;
```

**변경 후:**
```typescript
const systemPrompt = `당신은 Swagger API 문서를 기반으로 사용자에게 정확하고 실용적인 API 가이드를 제공하는 전문가입니다.

**핵심 원칙:**
1. **정확성**: 제공된 Swagger 문서의 정보만을 사용하며, 문서에 없는 내용은 추측하지 않습니다.
2. **명확성**: 복잡한 개념도 단계별로 쉽게 이해할 수 있도록 설명합니다.
3. **완전성**: API 사용에 필요한 모든 정보(인증, 파라미터, 요청/응답 형식, 에러 처리)를 포함합니다.

**답변 구조:**
1. **요구사항 분석**: 사용자의 질문을 분석하여 무엇을 구현하려는지 명확히 파악
2. **API 추천 및 선택 근거**: 
   - 제공된 API 중 어떤 것이 적합한지 설명
   - 왜 이 API를 선택해야 하는지 논리적 근거 제시
   - 여러 API가 필요한 경우 각각의 역할과 사용 순서 설명
3. **구현 가이드**:
   - 단계별 구현 흐름 (1, 2, 3...)
   - 각 단계에서 필요한 작업과 이유
4. **API 상세 정보**: 아래 형식 준수

**Swagger 데이터 표시 형식 (무조건 준수):**

**파라미터 (Query, Path, Header):**
- 파라미터가 있는 경우만 표시
- 마크다운 테이블 형식: | 이름 | 타입 | 위치 | 필수 | 설명 |

**요청 본문 (Request Body):**
- 요청 본문이 있는 경우만 표시
- 마크다운 테이블 형식: | 필드명 | 타입 | 필수 | 설명 |
- 중첩된 객체는 들여쓰기로 표현
- 필요시 간단한 JSON 예시를 코드 블록(\`\`\`json)으로 제공

**응답 (Response):**
- 성공 응답: 코드 블록(\`\`\`json)으로 응답 예시 제공
- 에러 응답: 각 에러 코드별로 간략하게 설명 (400, 401, 404, 500 등)

**인증 및 헤더:**
- 인증이 필요한 경우 인증 방법 명시 (Bearer Token, API Key 등)
- 필요한 헤더 정보 포함

**주의사항:**
- Swagger 문서의 필드명, 타입, 제약조건을 정확히 유지
- 문서에 없는 정보는 생략 가능함
- 추측이나 일반적인 지식으로 정보를 보완하지 않음
- 여러 API를 조합해야 하는 경우 각 API의 역할과 호출 순서를 명확히 설명`;
```

**주요 개선 사항:**
- 프론트엔드 개발자 관점 제거 (더 일반적인 가이드)
- 사용 예시 부분 제거 (과도한 예시 방지)
- 더 구조화된 답변 형식
- 명확한 데이터 표시 형식 가이드
- 정확성 강조 (추측 금지)

#### 3.2 사용자 프롬프트 개선

**변경 전:**
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

**변경 후:**
```typescript
const userPrompt = `다음 Swagger API 문서를 참고하여 질문에 답변해주세요:

${contextText}

**질문:** ${question}

**답변 요구사항:**
1. 위에 제공된 Swagger API 문서의 정보만을 사용하여 답변하세요.
2. 사용자의 요구사항을 정확히 분석하고, 필요한 API를 추천하세요.
3. 구현 방법을 단계별로 상세하게 설명하세요.
4. 파라미터, 요청 본문, 응답 형식을 명확하게 표시하세요.
5. 에러 처리 방법도 함께 설명하세요.
6. 문서에 없는 정보는 추측하지 말고 "문서에 명시되지 않음"으로 표시하세요.`;
```

**주요 개선 사항:**
- 더 간결하고 명확한 지시사항
- 불필요한 반복 제거
- 핵심 요구사항만 포함

### 4. 컨텍스트 최적화

토큰 사용량을 줄이기 위해 컨텍스트 길이를 최적화했습니다.

**`src/swagger/swagger.service.ts`**

#### 4.1 컨텍스트 API 수 감소

**변경 전:**
```typescript
// 컨텍스트 길이 제한을 위해 상위 결과만 사용 (최대 5개)
const maxContextApis = 5;
const limitedResults = results.slice(0, maxContextApis);
```

**변경 후:**
```typescript
// 컨텍스트 길이 제한을 위해 상위 결과만 사용 (최대 3개로 줄임)
const maxContextApis = 3;
const limitedResults = results.slice(0, maxContextApis);
```

#### 4.2 텍스트 길이 제한 강화

**변경 전:**
```typescript
// 긴 텍스트는 잘라서 사용 (각각 최대 500자)
const truncateText = (text: string, maxLength: number) => {
  if (text.length <= maxLength) return text;
  return text.substring(0, maxLength) + '...';
};

return {
  // ...
  parametersText: truncateText(parametersText, 500),
  requestBodyText: truncateText(requestBodyText, 500),
  responsesText: truncateText(responsesText, 500),
  fullText: (payload.fullText as string) || '',
};
```

**변경 후:**
```typescript
// 긴 텍스트는 잘라서 사용 (각각 최대 300자로 줄임)
const truncateText = (text: string, maxLength: number) => {
  if (text.length <= maxLength) return text;
  return text.substring(0, maxLength) + '...';
};

// fullText도 압축 (최대 800자)
const fullText = (payload.fullText as string) || '';
const compressedFullText = truncateText(fullText, 800);

return {
  // ...
  parametersText: truncateText(parametersText, 300),
  requestBodyText: truncateText(requestBodyText, 300),
  responsesText: truncateText(responsesText, 300),
  fullText: compressedFullText,
};
```

**변경 사항 요약:**
- 컨텍스트 API 수: 5개 → 3개
- 파라미터/요청 본문/응답 텍스트: 500자 → 300자
- fullText 압축 추가: 최대 800자

**개선 효과:**
- 토큰 사용량 감소
- 처리 속도 향상
- 핵심 정보만 포함하여 답변 품질 유지

## 개선 효과

### 1. 비용 효율성 향상

- **모델 통일**: gpt-4o-mini 사용으로 비용 절감
  - 입력: $0.15/1M 토큰 (gpt-3.5-turbo: $0.50/1M)
  - 출력: $0.60/1M 토큰 (gpt-3.5-turbo: $1.50/1M)
- **컨텍스트 최적화**: 토큰 사용량 감소로 추가 비용 절감

### 2. 답변 품질 향상

- **프롬프트 개선**: 더 구조화되고 명확한 답변
- **프롬프트 크기 확대**: 더 상세한 설명 가능
- **정확성 강조**: 추측 없이 문서 기반 답변

### 3. 유지보수성 향상

- **모델 설정 중앙화**: 환경 변수로 모델 변경 가능
- **일관된 모델 사용**: 모든 작업에서 동일한 모델 사용
- **명확한 프롬프트 구조**: 향후 개선 용이

## 환경 변수 설정

모델을 변경하려면 환경 변수를 설정하세요:

```bash
# 채팅 모델 변경 (기본값: gpt-4o-mini)
OPENAI_CHAT_MODEL=gpt-4o

# 쿼리 재작성 모델 변경 (기본값: gpt-4o-mini)
OPENAI_QUERY_REWRITE_MODEL=gpt-4o-mini
```

## 비교표

| 항목 | 변경 전 | 변경 후 |
|------|---------|---------|
| 채팅 모델 | gpt-3.5-turbo (하드코딩) | gpt-4o-mini (환경 변수 가능) |
| 쿼리 재작성 모델 | gpt-3.5-turbo (하드코딩) | gpt-4o-mini (환경 변수 가능) |
| 일반 답변 max_tokens | 1000 | 2000 |
| API 답변 max_tokens | 2000 | 4000 |
| 컨텍스트 API 수 | 5개 | 3개 |
| 텍스트 길이 제한 | 500자 | 300자 |
| fullText 압축 | 없음 | 800자 |

## 주의사항

1. **모델 성능**: gpt-4o-mini는 gpt-4o보다 성능이 낮을 수 있지만, 비용 효율성이 높습니다.
2. **컨텍스트 길이**: API 수를 줄였으므로, 관련 API가 많을 경우 일부가 누락될 수 있습니다.
3. **텍스트 압축**: 긴 설명이 잘릴 수 있으므로, 중요한 정보는 앞부분에 배치하는 것이 좋습니다.

## 다음 단계

향후 개선 가능한 사항:

1. **동적 컨텍스트 조정**: 질문 복잡도에 따라 컨텍스트 크기 자동 조정
2. **프롬프트 템플릿화**: 프롬프트를 외부 파일로 분리하여 관리
3. **A/B 테스트**: 다양한 프롬프트 버전 테스트 및 비교
4. **토큰 사용량 모니터링**: 실제 토큰 사용량 추적 및 최적화

