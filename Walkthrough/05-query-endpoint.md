# Walkthrough: Query Endpoint Implementation

## 목표

- 사용자가 질문을 보내면 Qdrant 벡터 DB에서 가장 유사한 청크를 반환하는 `/rag/query` API 엔드포인트 추가

## 구현 내용

1. **DTO 추가** (`QueryDto`) – `question: string` 필드와 Swagger `@ApiProperty` 정의
2. **컨트롤러** (`rag.controller.ts`)
   - `@Post('query')` 엔드포인트 구현
   - `RagService.query` 호출 후 결과 반환
3. **서비스** (`rag.service.ts`)
   - `query(question)` 메서드 구현
   - OpenAIService 로 질문 임베딩 생성
   - QdrantService.search 로 유사 청크 검색 (limit 3)
   - `SearchResult` 인터페이스 정의 및 타입 안전하게 결과 매핑
4. **OpenAPI** – Swagger 문서에 새로운 엔드포인트와 DTO 설명 추가
5. **Lint 정리** – import 정렬 및 불필요 공백 제거

## 검증

- `npm run start:dev` 로 서버 실행 후
- `curl -X POST http://localhost:3001/rag/query -H "Content-Type: application/json" -d '{"question":"What is this project about?"}'`
- 성공적인 JSON 응답 확인 (`success:true` 와 `results` 배열 포함)
- 반환된 `payload` 에는 원본 Notion 텍스트, 페이지 메타데이터, 청크 인덱스가 포함되어 질문‑응답 흐름이 정상 동작함을 확인

## 결과

- 질문 기반 벡터 검색 기능이 완전히 동작
- 모든 lint 오류 해결 및 작업 체크리스트(`task.md`) 완료 표시

---

_이 Walkthrough는 프로젝트 `Walkthrough/05-query-endpoint.md` 파일에 저장되었습니다._
