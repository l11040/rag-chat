# NestJS 기본 구성 및 Qdrant 연동

## 개요

NestJS 프로젝트를 초기화하고, Vector DB인 Qdrant를 Docker로 구성하여 연동했습니다.

## 작업 내용

### 1. NestJS 프로젝트 설정

- **초기화**: `@nestjs/cli`를 사용하여 프로젝트 생성
- **포트 변경**: 기본 포트 3000번 충돌로 인해 **3001**번으로 변경 (`src/main.ts`)

### 2. Qdrant Vector DB 구성

- **Docker Compose**: `docker-compose.yml` 파일 생성
  - 이미지: `qdrant/qdrant`
  - 포트: 6333 (Host) <-> 6333 (Container)
  - 볼륨: `./qdrant_storage` (데이터 영속성)
- **환경 변수**: `test-env` 예시 파일 생성 및 `.env` 설정
  - `QDRANT_HOST=localhost`
  - `QDRANT_PORT=6333`

### 3. NestJS - Qdrant 연동

- **모듈 구현**: `src/qdrant/qdrant.module.ts`
  - `QdrantClient`를 `QDRANT_CLIENT` 토큰으로 제공
  - `ConfigModule`을 사용하여 환경 변수 주입
- **서비스 구현**: `src/qdrant/qdrant.service.ts`
  - `onModuleInit`에서 연결 테스트 수행

## 검증 결과

### 서버 실행

```bash
npm run start:dev
```

- 접속: `http://localhost:3001`
- 응답: `Hello World!`

### Qdrant 연결 확인

```bash
curl localhost:6333/collections
```

- 응답: `{"result":{"collections":[],"time":0.0}}` (정상)

### 4. CRUD 기능 테스트

`QdrantService`에 컬렉션 생성, 데이터 삽입, 검색 기능을 추가하고 테스트 엔드포인트를 통해 검증했습니다.

**데이터 삽입**

```bash
curl -X POST localhost:3001/qdrant/test
```

- 응답: `{"message":"Test data inserted"}`

**데이터 검색**

```bash
curl localhost:3001/qdrant/search
```

- 응답:
  ```json
  [
    {
      "id": 1,
      "version": 1,
      "score": 0.89463294,
      "payload": { "city": "Berlin" }
    },
    {
      "id": 3,
      "version": 1,
      "score": 0.83872515,
      "payload": { "city": "Moscow" }
    },
    {
      "id": 2,
      "version": 1,
      "score": 0.66603535,
      "payload": { "city": "London" }
    }
  ]
  ```

### 5. API 문서화 (Swagger)

`@nestjs/swagger`를 적용하여 API 문서를 자동 생성하도록 설정했습니다.

- **URL**: `http://localhost:3001/api`
- **설정**: `nest-cli.json` 플러그인 활성화로 별도의 데코레이터 없이 DTO/엔드포인트 문서화

## 파일 구조

```
rag-chat/
├── docker-compose.yml
├── test-env
├── .env
├── nest-cli.json      <-- Swagger 플러그인 추가
├── src/
│   ├── app.controller.ts
│   ├── app.module.ts
│   ├── main.ts        <-- Swagger 설정 추가
│   └── qdrant/
│       ├── qdrant.module.ts
│       └── qdrant.service.ts
└── ...
```
