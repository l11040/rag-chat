import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import OpenAI from 'openai';

@Injectable()
export class OpenAIService {
  private readonly openai: OpenAI;
  private readonly logger = new Logger(OpenAIService.name);

  constructor(private configService: ConfigService) {
    const apiKey = this.configService.get<string>('OPENAI_API_KEY');
    if (!apiKey) {
      this.logger.warn(
        'OPENAI_API_KEY is not defined in environment variables',
      );
    }
    this.openai = new OpenAI({
      apiKey: apiKey,
    });
  }

  async getEmbedding(text: string): Promise<{
    embedding: number[];
    usage: { promptTokens: number; totalTokens: number };
  }> {
    try {
      const response = await this.openai.embeddings.create({
        model: 'text-embedding-3-small',
        input: text,
      });
      const usage = response.usage || {
        prompt_tokens: 0,
        total_tokens: 0,
      };
      return {
        embedding: response.data[0].embedding,
        usage: {
          promptTokens: usage.prompt_tokens,
          totalTokens: usage.total_tokens,
        },
      };
    } catch (error) {
      this.logger.error(
        `Failed to generate embedding: ${(error as Error).message}`,
      );
      throw error;
    }
  }

  /**
   * 질문을 검색에 더 적합한 형태로 재작성
   * 대화 히스토리가 있으면 컨텍스트를 포함하여 재작성
   */
  async rewriteQueryForSearch(
    question: string,
    conversationHistory?: Array<{
      role: 'user' | 'assistant';
      content: string;
    }>,
  ): Promise<{
    rewrittenQuery: string;
    usage: {
      promptTokens: number;
      completionTokens: number;
      totalTokens: number;
    };
  }> {
    try {
      const systemPrompt = `당신은 사용자의 질문을 벡터 검색에 최적화된 검색 쿼리로 변환하는 전문가입니다.

목표:
1. 사용자의 의도를 정확히 파악하여 핵심 키워드와 개념을 추출합니다.
2. 검색에 유용한 명사, 전문 용어, 핵심 개념을 포함합니다.
3. 불필요한 조사, 감탄사, 문맥 의존적 표현을 제거합니다.
4. 대화 히스토리가 있으면 이전 맥락을 고려하여 독립적으로 이해 가능한 쿼리로 변환합니다.

중요한 규칙:
- 티켓 번호(예: HMW-445, JIRA-123), 브랜치 이름, 코드 이름, 버전 번호 등 특정 식별자는 반드시 그대로 보존하세요.
- 기술 용어, 프로젝트 이름, 기능 이름 등은 원본 그대로 유지하세요.
- 질문의 핵심 키워드를 최대한 많이 포함하세요 (예: "지라 티켓", "브랜치", "건강관련 기능" 등).
- 검색 쿼리는 핵심 키워드들을 자연스럽게 연결한 형태로 작성하세요.
- 대명사나 생략된 표현이 있으면 이전 대화 맥락을 바탕으로 명확하게 풀어서 작성하세요.
- 검색 쿼리는 1-2문장으로 간결하게 작성하되, 모든 중요한 키워드를 포함하세요.
- 원본 질문의 의미를 왜곡하지 마세요.

예시:
- "HMW-445와 같은 지라티켓 번호를 가진것의 건강관련 기능 구현하는 브랜치는 어떻게 만들까?" 
  -> "HMW-445 지라 티켓 건강관련 기능 구현 브랜치 만들기"
- "그것은 어떻게 작동하나요?" (이전 맥락: RAG 시스템)
  -> "RAG 시스템 작동 방식"`;

      let userPrompt = `다음 질문을 벡터 검색에 최적화된 검색 쿼리로 변환해주세요:\n\n질문: ${question}`;

      // 대화 히스토리가 있으면 포함
      if (conversationHistory && conversationHistory.length > 0) {
        const historyText = conversationHistory
          .slice(-5) // 최근 5개만 사용 (토큰 절약)
          .map(
            (msg) =>
              `${msg.role === 'user' ? '사용자' : '어시스턴트'}: ${msg.content}`,
          )
          .join('\n');

        userPrompt = `다음 대화 히스토리를 참고하여, 마지막 질문을 벡터 검색에 최적화된 검색 쿼리로 변환해주세요:

대화 히스토리:
${historyText}

현재 질문: ${question}

이전 대화 맥락을 고려하여, 현재 질문을 독립적으로 이해 가능하고 검색에 최적화된 형태로 변환해주세요.`;
      }

      const response = await this.openai.chat.completions.create({
        model: 'gpt-3.5-turbo',
        messages: [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: userPrompt },
        ],
        temperature: 0.2, // 일관성 있는 변환을 위해 낮은 temperature
        max_tokens: 200,
      });

      const rewrittenQuery =
        response.choices[0]?.message?.content?.trim() || question;
      const usage = response.usage || {
        prompt_tokens: 0,
        completion_tokens: 0,
        total_tokens: 0,
      };

      this.logger.log(`쿼리 재작성: "${question}" -> "${rewrittenQuery}"`);

      return {
        rewrittenQuery,
        usage: {
          promptTokens: usage.prompt_tokens,
          completionTokens: usage.completion_tokens,
          totalTokens: usage.total_tokens,
        },
      };
    } catch (error) {
      this.logger.error(`Failed to rewrite query: ${(error as Error).message}`);
      // 에러 발생 시 원본 질문 반환
      return {
        rewrittenQuery: question,
        usage: {
          promptTokens: 0,
          completionTokens: 0,
          totalTokens: 0,
        },
      };
    }
  }

  async generateAnswer(
    question: string,
    contextDocuments: Array<{
      text: string;
      pageTitle: string;
      pageUrl: string;
    }>,
    conversationHistory?: Array<{
      role: 'user' | 'assistant';
      content: string;
    }>,
  ): Promise<{
    answer: string;
    usage: {
      promptTokens: number;
      completionTokens: number;
      totalTokens: number;
    };
  }> {
    try {
      // 문서 컨텍스트를 문자열로 변환
      const contextText = contextDocuments
        .map(
          (doc, index) =>
            `[문서 ${index + 1}]\n제목: ${doc.pageTitle}\nURL: ${doc.pageUrl}\n내용: ${doc.text}`,
        )
        .join('\n\n---\n\n');

      // 문서에 있는 정보만 사용하도록 강력하게 지시하는 프롬프트
      const systemPrompt = `당신은 제공된 문서만을 기반으로 질문에 답변하는 AI 어시스턴트입니다.

핵심 원칙:
1. **간결성**: 불필요한 설명, 서론, 결론 없이 핵심만 바로 제공
2. **의도 파악**: 사용자가 무엇을 원하는지 정확히 파악
   - "예시", "예를 들어", "보여줘" → 구체적인 예시를 코드 블록이나 명확한 형식으로 제공
   - "어떻게", "방법" → 단계별로 간결하게 (1, 2, 3...)
   - "뭐야", "설명" → 핵심 개념만 간단히
3. **문서 기반**: 제공된 문서에 있는 정보만 사용. 문서에 없는 정보는 절대 포함하지 않음
4. **형식**: 사용자의 의도에 맞는 형식으로 제공
   - 예시 요청: \`\`\` 코드 블록 사용 (예: \`\`\`bash\nfeature/HMW-445-healthcare\n\`\`\`)
   - 방법 요청: 번호 리스트 (1. 2. 3.)
   - 설명 요청: 간결한 문단

답변 작성 규칙:
- 서론/결론 없이 바로 답변 시작
- **중요**: 답변에 사용한 모든 문서는 반드시 "[문서 N]" 형식으로 명시적으로 인용해야 합니다
- 여러 문서의 정보를 사용했다면 각각 "[문서 1]", "[문서 2]" 형식으로 인용하세요
- 예시 요청 시: 1-2줄 간단한 설명 + 코드 블록(\`\`\`)으로 예시 제공
- 방법 요청 시: 단계별 번호 리스트로 간결하게
- 중복 설명 제거, 핵심만 전달
- 문서에 정보가 없으면 "제공된 문서에는 이 질문에 대한 정보가 없습니다."만 답변`;

      // 질문에서 의도 파악
      const questionLower = question.toLowerCase();
      const wantsExample =
        questionLower.includes('예시') ||
        questionLower.includes('예를') ||
        questionLower.includes('보여') ||
        questionLower.includes('알려줘');
      const wantsHowTo =
        questionLower.includes('어떻게') || questionLower.includes('방법');

      let answerGuidance = '';
      if (wantsExample) {
        answerGuidance =
          '\n\n중요: 예시를 요청했으므로, 먼저 1-2줄로 간단히 설명한 후, 구체적인 예시를 코드 블록(```) 형식으로 명확하게 제공하세요. 예시가 잘 보이도록 코드 블록을 사용하세요.';
      } else if (wantsHowTo) {
        answerGuidance =
          '\n\n중요: 방법을 물어봤으므로, 단계별로 번호를 매겨 간결하게 설명하세요.';
      }

      const userPrompt = `다음 문서들을 참고하여 질문에 답변해주세요:

${contextText}

질문: ${question}

위 문서들에 있는 정보만을 사용하여, 사용자의 의도에 맞게 간결하고 명확하게 답변하세요.${answerGuidance}
- 불필요한 설명은 모두 제거하고 핵심만 전달하세요.
- 예시가 요청되었다면 코드 블록으로 명확하게 보여주세요.`;

      // 대화 히스토리가 있으면 메시지에 포함
      const messages: Array<{
        role: 'system' | 'user' | 'assistant';
        content: string;
      }> = [{ role: 'system', content: systemPrompt }];

      // 대화 히스토리 추가 (최근 5개만)
      if (conversationHistory && conversationHistory.length > 0) {
        const recentHistory = conversationHistory.slice(-5);
        for (const msg of recentHistory) {
          messages.push({
            role: msg.role === 'user' ? 'user' : 'assistant',
            content: msg.content,
          });
        }
      }

      // 현재 질문 추가
      messages.push({ role: 'user', content: userPrompt });

      const response = await this.openai.chat.completions.create({
        model: 'gpt-3.5-turbo',
        messages: messages,
        temperature: 0.3, // 일관성 있는 답변을 위해 낮은 temperature
        max_tokens: 1000,
      });

      const answer = response.choices[0]?.message?.content || '';
      const usage = response.usage || {
        prompt_tokens: 0,
        completion_tokens: 0,
        total_tokens: 0,
      };

      return {
        answer,
        usage: {
          promptTokens: usage.prompt_tokens,
          completionTokens: usage.completion_tokens,
          totalTokens: usage.total_tokens,
        },
      };
    } catch (error) {
      this.logger.error(
        `Failed to generate answer: ${(error as Error).message}`,
      );
      throw error;
    }
  }

  /**
   * Swagger API 정보를 기반으로 질문에 답변 생성
   * API 엔드포인트, 사용법, 테스트 데이터, 예시 등을 제공
   */
  async generateApiAnswer(
    question: string,
    contextApis: Array<{
      endpoint: string;
      method: string;
      path: string;
      summary: string;
      description: string;
      tags: string[];
      parameters?: any;
      parametersText?: string;
      requestBody?: any;
      requestBodyText?: string;
      responses?: any;
      responsesText?: string;
      fullText: string;
      swaggerKey?: string;
      swaggerUrl?: string;
    }>,
    conversationHistory?: Array<{
      role: 'user' | 'assistant';
      content: string;
    }>,
  ): Promise<{
    answer: string;
    usage: {
      promptTokens: number;
      completionTokens: number;
      totalTokens: number;
    };
  }> {
    try {
      // API 컨텍스트를 구조화된 형식으로 변환
      const contextText = contextApis
        .map(
          (api, index) => `[API ${index + 1}]
엔드포인트: ${api.endpoint}
메서드: ${api.method}
경로: ${api.path}
요약: ${api.summary || '없음'}
설명: ${api.description || '없음'}
태그: ${api.tags?.join(', ') || '없음'}
${api.parametersText ? `\n파라미터:\n${api.parametersText}` : ''}
${api.requestBodyText ? `\n요청 본문:\n${api.requestBodyText}` : ''}
${api.responsesText ? `\n응답:\n${api.responsesText}` : ''}
${api.swaggerUrl ? `\nSwagger URL: ${api.swaggerUrl}` : ''}
`,
        )
        .join('\n---\n\n');

      // Swagger API 질문에 특화된 시스템 프롬프트
      const systemPrompt = `당신은 Swagger API 문서를 기반으로 API 사용법을 안내하는 전문가입니다.

핵심 원칙:
1. **정확성**: 제공된 API 정보만을 사용하여 정확한 답변 제공
2. **구조화**: 마크다운 형식으로 명확하게 구조화하여 전달
3. **가독성**: 요청/응답/에러를 명확히 구분하여 표시
4. **간결성**: 불필요한 코드 예시 없이 핵심 정보만 제공

답변 형식 규칙 (반드시 준수):

## API 사용법 질문의 경우

### API 정보
- **엔드포인트**: \`METHOD /path\`
- **설명**: API의 목적과 기능

### 요청 정보

#### 파라미터
| 이름 | 타입 | 위치 | 필수 | 설명 | 예시 |
|------|------|------|------|------|------|
| param1 | string | query | 예 | 파라미터 설명 | 예시값 |

#### 헤더
| 이름 | 타입 | 필수 | 설명 |
|------|------|------|------|
| Content-Type | string | 예 | application/json |
| Authorization | string | 예 | Bearer {token} |

#### 요청 본문
\`\`\`json
{
  "field1": "값",
  "field2": 123
}
\`\`\`

**요청 본문 필드 설명:**
- \`field1\` (string, 필수): 필드 설명
- \`field2\` (number, 선택): 필드 설명

### 응답 정보

#### 성공 응답 (200 OK)
\`\`\`json
{
  "success": true,
  "data": {
    "id": "uuid",
    "name": "예시"
  }
}
\`\`\`

**응답 필드 설명:**
- \`success\` (boolean): 요청 성공 여부
- \`data.id\` (string): 생성된 리소스 ID
- \`data.name\` (string): 리소스 이름

#### 에러 응답

**400 Bad Request**
\`\`\`json
{
  "error": "잘못된 요청",
  "message": "필수 필드가 누락되었습니다."
}
\`\`\`

**404 Not Found**
\`\`\`json
{
  "error": "리소스를 찾을 수 없음",
  "message": "요청한 리소스가 존재하지 않습니다."
}
\`\`\`

**500 Internal Server Error**
\`\`\`json
{
  "error": "서버 오류",
  "message": "서버에서 오류가 발생했습니다."
}
\`\`\`

## 여러 API 조합 질문의 경우

각 API를 단계별로 구분하여 표시:

### 단계 1: [API 이름]
[위의 형식으로 각 API 설명]

### 단계 2: [API 이름]
[위의 형식으로 각 API 설명]

## 테스트 데이터 요청의 경우

### 테스트 데이터
\`\`\`json
{
  "field1": "실제 사용 가능한 값",
  "field2": 123,
  "field3": "2024-01-01T00:00:00Z"
}
\`\`\`

**주의사항:**
- 필수 필드는 반드시 포함
- 실제 사용 가능한 형식의 값 사용 (유효한 UUID, 날짜 형식 등)

## API 찾기 질문의 경우

### 관련 API 목록

1. **\`METHOD /path\`** - [요약]
   - 설명: [설명]

2. **\`METHOD /path\`** - [요약]
   - 설명: [설명]

답변 작성 필수 규칙:
- 서론 없이 바로 답변 시작
- 마크다운 제목(##, ###)을 사용하여 섹션 구분
- 요청/응답/에러를 명확히 구분하여 표시
- 표 형식을 적극 활용 (파라미터, 헤더, 필드 설명 등)
- JSON 코드 블록은 json 태그만 사용
- 실제 사용 가능한 값으로 예시 작성
- 제공된 API 정보에 없는 내용은 절대 추가하지 않음
- 정보가 없으면 "제공된 API 정보에는 이 내용이 없습니다."라고 명확히 안내
- curl, JavaScript, Python 같은 코드 예시는 제공하지 않음
- API 인용은 자연스럽게 문맥에 포함 (예: "회원가입 API(POST /auth/register)를 사용하면...")

가독성 향상 팁:
- 섹션을 명확히 구분 (### 요청 정보, ### 응답 정보)
- 표를 사용하여 파라미터/헤더/필드 정보를 구조화
- JSON 예시는 들여쓰기로 구조화
- 응답과 에러를 별도 섹션으로 구분
- 필드 설명은 요청 본문/응답 본문 아래에 별도로 표시`;

      // 질문에서 의도 파악
      const questionLower = question.toLowerCase();
      const wantsHowTo =
        questionLower.includes('어떻게') ||
        questionLower.includes('방법') ||
        questionLower.includes('사용');
      const wantsTestData =
        questionLower.includes('테스트') ||
        questionLower.includes('예시 데이터') ||
        questionLower.includes('샘플');
      const wantsFindApi =
        questionLower.includes('어떤') ||
        questionLower.includes('찾') ||
        questionLower.includes('있나') ||
        questionLower.includes('api');

      let answerGuidance = '';
      if (wantsTestData) {
        answerGuidance =
          '\n\n중요: 테스트 데이터를 요청했으므로, ### 테스트 데이터 섹션을 만들고, 스키마에 맞는 유효한 JSON 형식을 코드 블록(json)으로 제공하세요. 필수 필드는 반드시 포함하고, 실제 사용 가능한 값으로 작성하세요.';
      } else if (wantsHowTo) {
        answerGuidance =
          '\n\n중요: 사용법을 물어봤으므로, 반드시 다음 섹션 구조를 따라 답변하세요:\n- ### API 정보\n- ### 요청 정보 (파라미터 표, 헤더 표, 요청 본문 JSON, 필드 설명)\n- ### 응답 정보 (성공 응답 JSON, 응답 필드 설명, 에러 응답 JSON)\n각 섹션을 명확히 구분하고, 표와 JSON 코드 블록을 적극 활용하세요. curl, JavaScript, Python 같은 코드 예시는 제공하지 마세요.';
      } else if (wantsFindApi) {
        answerGuidance =
          '\n\n중요: API 찾기를 요청했으므로, ### 관련 API 목록 섹션을 만들고, 각 API를 번호 리스트로 나열하세요. 각 API마다 엔드포인트(코드 형식), 요약, 설명을 포함하세요.';
      } else {
        // 기본 가이드
        answerGuidance =
          '\n\n중요: 답변은 반드시 마크다운 형식으로 구조화하세요. 요청 정보(파라미터 표, 헤더 표, 요청 본문 JSON, 필드 설명)와 응답 정보(성공/에러 응답 JSON, 필드 설명)를 명확히 구분하여 표시하세요. curl, JavaScript, Python 같은 코드 예시는 제공하지 마세요.';
      }

      const userPrompt = `다음 API 정보들을 참고하여 질문에 답변해주세요:

${contextText}

질문: ${question}

위 API 정보들에 있는 내용만을 사용하여, 사용자의 의도에 맞게 정확하고 실용적인 답변을 제공하세요.${answerGuidance}

답변 작성 시 반드시 준수할 사항:
- 마크다운 제목(##, ###)을 사용하여 섹션 구분
- 요청 정보와 응답 정보를 명확히 분리
- 파라미터/헤더/필드는 표 형식으로 표시
- JSON 코드 블록은 json 태그만 사용
- 에러 응답은 별도 섹션으로 구분
- API 인용은 자연스럽게 문맥에 포함 (예: "회원가입 API(POST /auth/register)를 사용하면...")
- curl, JavaScript, Python 같은 코드 예시는 제공하지 않음
- 불필요한 설명은 제거하고 핵심만 전달`;

      // 대화 히스토리가 있으면 메시지에 포함
      const messages: Array<{
        role: 'system' | 'user' | 'assistant';
        content: string;
      }> = [{ role: 'system', content: systemPrompt }];

      // 대화 히스토리 추가 (최근 5개만)
      if (conversationHistory && conversationHistory.length > 0) {
        const recentHistory = conversationHistory.slice(-5);
        for (const msg of recentHistory) {
          messages.push({
            role: msg.role === 'user' ? 'user' : 'assistant',
            content: msg.content,
          });
        }
      }

      // 현재 질문 추가
      messages.push({ role: 'user', content: userPrompt });

      const response = await this.openai.chat.completions.create({
        model: 'gpt-3.5-turbo',
        messages: messages,
        temperature: 0.3, // 일관성 있는 답변을 위해 낮은 temperature
        max_tokens: 2000, // API 예시는 더 길 수 있으므로 토큰 증가
      });

      const answer = response.choices[0]?.message?.content || '';
      const usage = response.usage || {
        prompt_tokens: 0,
        completion_tokens: 0,
        total_tokens: 0,
      };

      return {
        answer,
        usage: {
          promptTokens: usage.prompt_tokens,
          completionTokens: usage.completion_tokens,
          totalTokens: usage.total_tokens,
        },
      };
    } catch (error) {
      this.logger.error(
        `Failed to generate API answer: ${(error as Error).message}`,
      );
      throw error;
    }
  }
}
