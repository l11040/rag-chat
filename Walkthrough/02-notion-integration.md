# Notion API Integration

## 개요

Notion API를 사용하여 특정 데이터베이스의 페이지 목록을 가져오고, 각 페이지의 콘텐츠(블록)를 조회하는 기능을 구현했습니다.

## 구현 내용

### 1. NotionModule 및 NotionService

- `NotionModule`: Notion 기능을 캡슐화하는 모듈
- `NotionService`: Notion API와 통신하는 서비스
  - `getDatabase(databaseId)`: 데이터베이스의 페이지 목록을 조회 (Native Fetch 사용)
  - `getPageContent(pageId)`: 페이지의 블록(콘텐츠) 목록을 조회 (`@notionhq/client` 사용)
  - `getDatabaseMetadata(databaseId)`: 데이터베이스 메타데이터 조회

### 2. 환경 변수 설정

- `.env` 파일에 `NOTION_API_KEY`와 `NOTION_DATABASE_ID` 설정

### 3. 검증 스크립트

- `scripts/test-notion.ts`: Notion 연동을 테스트하는 스크립트
  - 데이터베이스 존재 여부 확인
  - 페이지 목록 조회
  - 첫 번째 페이지의 콘텐츠 조회

### 4. API 엔드포인트

- `GET /notion/database`: 설정된 데이터베이스의 페이지 목록을 반환합니다.

## 사용 방법

```bash
# Notion 연동 테스트 실행
npx ts-node scripts/test-notion.ts

# API 엔드포인트 테스트 (서버 실행 중일 때)
curl http://localhost:3001/notion/database
```

## 주의사항

- `@notionhq/client`의 `databases.query` 메서드가 런타임에 존재하지 않는 문제가 있어, `getDatabase` 메서드는 Node.js의 native `fetch`를 사용하여 구현했습니다.
