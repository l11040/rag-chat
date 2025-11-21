# RAG Chat

Notion 문서를 기반으로 한 RAG(Retrieval-Augmented Generation) 시스템입니다. 사용자의 질문에 대해 문서에서 관련 정보를 검색하고, LLM을 사용하여 자연어 답변을 생성합니다.

## 주요 기능

- 📚 **Notion 문서 통합**: Notion 데이터베이스의 문서를 자동으로 수집하고 임베딩
- 🔍 **지능형 검색**: LLM 기반 쿼리 재작성으로 검색 정확도 향상
- 💬 **대화 컨텍스트**: 이전 대화 히스토리를 고려한 연속적인 대화 지원
- 🎯 **의도 기반 답변**: 사용자의 의도(예시 요청, 방법 요청 등)를 파악하여 적절한 형식으로 답변
- 📊 **벡터 검색**: Qdrant 벡터 데이터베이스를 사용한 유사도 기반 문서 검색
- 🤖 **LLM 답변 생성**: GPT-3.5-turbo를 사용한 문서 기반 자연어 답변 생성

## 기술 스택

- **프레임워크**: NestJS
- **언어**: TypeScript
- **벡터 DB**: Qdrant
- **LLM**: OpenAI (GPT-3.5-turbo, text-embedding-3-small)
- **문서 소스**: Notion API
- **API 문서**: Swagger

## 프로젝트 구조

```
rag-chat/
├── src/
│   ├── notion/          # Notion API 연동
│   ├── qdrant/          # Qdrant 벡터 DB 연동
│   ├── openai/          # OpenAI API 연동 (임베딩, 답변 생성, 쿼리 재작성)
│   ├── rag/             # RAG 파이프라인 (검색 + 답변 생성)
│   └── main.ts          # 애플리케이션 진입점
├── Walkthrough/         # 개발 과정 문서
├── docker-compose.yml    # Qdrant Docker 설정
└── qdrant_storage/       # Qdrant 데이터 저장소
```

## 시작하기

### 사전 요구사항

- Node.js (v18 이상)
- Docker & Docker Compose
- Notion API 토큰
- OpenAI API 키

### 설치

1. **저장소 클론 및 의존성 설치**

```bash
git clone <repository-url>
cd rag-chat
npm install
```

2. **환경 변수 설정**

`.env` 파일을 생성하고 다음 변수들을 설정하세요:

```env
# Notion
NOTION_API_KEY=secret_xxxxx
NOTION_DATABASE_ID=xxxxx

# OpenAI
OPENAI_API_KEY=sk-proj-xxxxx

# Qdrant
QDRANT_HOST=localhost
QDRANT_PORT=6333

# Server
PORT=3001
```

3. **Qdrant 실행**

```bash
docker-compose up -d
```

4. **서버 실행**

```bash
# 개발 모드
npm run start:dev

# 프로덕션 모드
npm run build
npm run start:prod
```

서버는 기본적으로 `http://localhost:3001`에서 실행됩니다.

## API 사용법

### Swagger UI

서버 실행 후 `http://localhost:3001/api`에서 Swagger UI를 통해 API를 테스트할 수 있습니다.

### 주요 엔드포인트

#### 1. Notion 문서 수집 (Ingestion)

Notion 데이터베이스의 문서를 벡터 DB에 저장합니다.

```bash
POST /rag/ingest
Content-Type: application/json

{
  "databaseId": "optional-database-id"  # 생략 시 환경 변수 사용
}
```

#### 2. 질문하기 (Query)

문서를 기반으로 질문에 답변합니다.

```bash
POST /rag/query
Content-Type: application/json

{
  "question": "HMW-445와 같은 지라티켓 번호를 가진것의 건강관련 기능 구현하는 브랜치는 어떻게 만들까?",
  "conversationHistory": [  # 선택사항
    {
      "role": "user",
      "content": "이전 사용자 메시지"
    },
    {
      "role": "assistant",
      "content": "이전 어시스턴트 답변"
    }
  ]
}
```

**응답 예시**:

```json
{
  "success": true,
  "answer": "지라 티켓 번호 HMW-445와 같은 건강관련 기능 구현 브랜치는 다음과 같이 생성합니다:\n\n```\nfeature/HMW-445-healthcare\n```",
  "rewrittenQuery": "HMW-445 지라 티켓 건강관련 기능 구현 브랜치 만들기",
  "sources": [
    {
      "pageTitle": "브랜치 전략",
      "pageUrl": "https://www.notion.so/...",
      "score": 0.383,
      "chunkText": "1. 브랜치 전략..."
    }
  ],
  "question": "HMW-445와 같은 지라티켓 번호를 가진것의 건강관련 기능 구현하는 브랜치는 어떻게 만들까?",
  "usage": {
    "promptTokens": 1195,
    "completionTokens": 125,
    "totalTokens": 1320
  }
}
```

#### 3. 컬렉션 정보 조회

```bash
GET /rag/collection-info
```

#### 4. 통계 정보 조회

```bash
GET /rag/stats
```

## 핵심 기능 설명

### 1. LLM 기반 쿼리 재작성

사용자의 자연어 질문을 벡터 검색에 최적화된 형태로 재작성합니다.

**예시**:
- 원본: "HMW-445와 같은 지라티켓 번호를 가진것의 건강관련 기능 구현하는 브랜치는 어떻게 만들까?"
- 재작성: "HMW-445 지라 티켓 건강관련 기능 구현 브랜치 만들기"

**효과**: 검색 정확도 향상 (0.33 → 0.38)

### 2. 대화 히스토리 지원

이전 대화 맥락을 고려하여 연속적인 대화를 지원합니다.

```json
{
  "question": "그것은 어떻게 작동하나요?",
  "conversationHistory": [
    {
      "role": "user",
      "content": "RAG 시스템이 뭐야?"
    },
    {
      "role": "assistant",
      "content": "RAG는 Retrieval-Augmented Generation의 약자로..."
    }
  ]
}
```

→ 재작성된 쿼리: "RAG 시스템 작동 방식"

### 3. 동적 임계값 조정

검색 결과가 없을 때 자동으로 임계값을 낮춰서 관련 문서를 찾습니다.

- 기본 임계값: 0.35
- 최고 점수가 0.25 이상이면 자동으로 임계값 조정

### 4. 의도 기반 답변 생성

사용자의 의도를 파악하여 적절한 형식으로 답변합니다.

- **예시 요청**: 코드 블록(```)으로 명확한 예시 제공
- **방법 요청**: 단계별 번호 리스트로 간결하게 설명
- **설명 요청**: 핵심 개념만 간단히 설명

## 데이터 처리 흐름

```
1. 사용자 질문 입력
   ↓
2. LLM으로 쿼리 재작성 (대화 히스토리 고려)
   ↓
3. 재작성된 쿼리 임베딩 생성
   ↓
4. Qdrant에서 유사한 문서 검색 (상위 10개)
   ↓
5. 검색 결과가 없으면 임계값 조정 후 재시도
   ↓
6. 검색된 문서를 LLM에 전달하여 답변 생성
   ↓
7. 간결하고 명확한 답변 반환
```

## 개발 문서

프로젝트의 개발 과정과 구현 세부사항은 `Walkthrough/` 디렉토리에서 확인할 수 있습니다:

- `01-setup-and-qdrant.md`: 프로젝트 설정 및 Qdrant 연동
- `02-notion-integration.md`: Notion API 연동
- `03-openai-integration.md`: OpenAI API 연동
- `04-rag-pipeline-integration.md`: RAG 파이프라인 통합
- `05-query-endpoint.md`: 질문 엔드포인트 구현
- `06-llm-answer-generation.md`: LLM 기반 답변 생성
- `07-query-optimization-and-answer-improvement.md`: 쿼리 최적화 및 답변 품질 개선

## 환경 변수

| 변수명 | 설명 | 필수 |
|--------|------|------|
| `NOTION_API_KEY` | Notion API 토큰 | ✅ |
| `NOTION_DATABASE_ID` | Notion 데이터베이스 ID | ✅ |
| `OPENAI_API_KEY` | OpenAI API 키 | ✅ |
| `QDRANT_HOST` | Qdrant 호스트 (기본: localhost) | ❌ |
| `QDRANT_PORT` | Qdrant 포트 (기본: 6333) | ❌ |
| `PORT` | 서버 포트 (기본: 3001) | ❌ |

## 스크립트

```bash
# 개발 모드 실행 (watch 모드)
npm run start:dev

# 프로덕션 빌드
npm run build

# 프로덕션 실행
npm run start:prod

# 린트
npm run lint

# 테스트
npm run test

# E2E 테스트
npm run test:e2e
```

## 주요 개선 사항

### 검색 정확도 향상
- LLM 기반 쿼리 재작성으로 검색 정확도 개선
- 동적 임계값 조정으로 관련 문서 놓치지 않음
- 검색 결과 개수 증가 (5개 → 10개)

### 답변 품질 개선
- 사용자 의도 파악하여 적절한 형식으로 답변
- 간결하고 명확한 답변 생성
- 예시 요청 시 코드 블록으로 명확하게 제공

### 대화 연속성
- 이전 대화 맥락을 고려한 질문 이해
- 대명사나 생략된 표현도 정확히 파악

## 문제 해결

### Qdrant 연결 실패

```bash
# Qdrant 컨테이너 상태 확인
docker-compose ps

# Qdrant 재시작
docker-compose restart
```

### 검색 결과가 없음

- 문서가 제대로 수집되었는지 확인: `GET /rag/stats`
- 임계값이 너무 높을 수 있음 (자동으로 조정됨)
- 질문을 더 구체적으로 작성

### 답변 품질이 낮음

- 관련 문서가 충분히 수집되었는지 확인
- 질문을 더 명확하게 작성
- 대화 히스토리를 포함하여 컨텍스트 제공

## 라이선스

UNLICENSED

## 기여

이슈 및 풀 리퀘스트를 환영합니다!
