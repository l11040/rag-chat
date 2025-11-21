# OpenAI Embedding Integration Walkthrough

이 문서는 OpenAI 텍스트 임베딩 모델(`text-embedding-3-small`)을 프로젝트에 연동하는 과정을 설명합니다.

## 1. 개요

Notion 페이지의 내용을 벡터 데이터베이스(Qdrant)에 저장하기 위해, 텍스트를 벡터로 변환하는 임베딩 서비스가 필요합니다. 이를 위해 OpenAI의 Embeddings API를 사용합니다.

## 2. 변경 사항

### 2.1. 의존성 설치

`openai` 패키지를 설치했습니다.

```bash
npm install openai
```

### 2.2. OpenAI 모듈 및 서비스 구현

**`src/openai/openai.service.ts`**

- `OpenAI` 클라이언트를 초기화하고 `getEmbedding` 메서드를 구현했습니다.
- `OPENAI_API_KEY` 환경 변수를 사용하여 인증합니다.
- `text-embedding-3-small` 모델을 사용합니다.

**`src/openai/openai.module.ts`**

- `OpenAIService`를 제공하고 내보내는 모듈입니다.
- `ConfigModule`을 import하여 환경 변수에 접근합니다.

**`src/openai/openai.controller.ts`**

- 임베딩 생성을 테스트하기 위한 임시 컨트롤러입니다.
- `GET /openai/embedding?text=...` 엔드포인트를 제공합니다.

### 2.3. AppModule 설정

**`src/app.module.ts`**

- `OpenAIModule`을 `imports` 배열에 추가하여 애플리케이션 전역에서 사용할 수 있도록 했습니다.

## 3. 검증 방법

### 3.1. 환경 변수 설정

`.env` 파일에 OpenAI API 키를 추가해야 합니다.

```env
OPENAI_API_KEY=sk-proj-...
```

### 3.2. 테스트 엔드포인트 호출

서버를 실행하고 다음 URL로 요청을 보내 임베딩이 생성되는지 확인합니다.

```bash
curl "http://localhost:3000/openai/embedding?text=Hello%20World"
```

**예상 응답:**

```json
[
  -0.006929283,
  -0.005336422,
  ...
]
```

(숫자로 구성된 긴 배열이 반환됩니다)

## 4. 다음 단계

- Notion API로 가져온 페이지 내용을 이 서비스를 통해 임베딩 벡터로 변환합니다.
- 변환된 벡터와 메타데이터를 Qdrant에 저장합니다.
