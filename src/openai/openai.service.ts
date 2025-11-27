import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import OpenAI from 'openai';

@Injectable()
export class OpenAIService {
  private readonly openai: OpenAI;
  private readonly logger = new Logger(OpenAIService.name);
  private readonly chatModel: string;
  private readonly queryRewriteModel: string;

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
        model: this.queryRewriteModel,
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
      // 문서 컨텍스트를 문자열로 변환 (문서 제목을 식별자로 사용)
      const contextText = contextDocuments
        .map(
          (doc) =>
            `[문서: ${doc.pageTitle}]\n제목: ${doc.pageTitle}\nURL: ${doc.pageUrl}\n내용: ${doc.text}`,
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
- **중요**: 답변에 사용한 모든 문서는 반드시 실제 문서 제목을 사용하여 인용해야 합니다
- 예: "RAG 시스템 구현 가이드 문서에 따르면..." 또는 "인증 시스템 문서에서..."
- 여러 문서의 정보를 사용했다면 각각 실제 문서 제목으로 인용하세요
- "[문서 1]", "[문서 2]" 같은 번호 형식은 사용하지 마세요
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
        model: this.chatModel,
        messages: messages,
        temperature: 0.3, // 일관성 있는 답변을 위해 낮은 temperature
        max_tokens: 2000, // 더 상세한 답변을 위해 토큰 증가
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
      // API 컨텍스트를 구조화된 형식으로 변환 (fullText 우선 사용)
      const contextText = contextApis
        .map((api, index) => {
          // API 식별자 생성: 엔드포인트 또는 기능 설명
          const apiIdentifier = api.summary
            ? `${api.summary} (${api.endpoint})`
            : api.endpoint;

          // fullText가 있으면 우선 사용 (더 상세한 정보 포함)
          const apiDetails = api.fullText
            ? api.fullText
            : `엔드포인트: ${api.endpoint}
메서드: ${api.method}
경로: ${api.path}
요약: ${api.summary || '없음'}
설명: ${api.description || '없음'}
태그: ${api.tags?.join(', ') || '없음'}
${api.parametersText ? `\n파라미터:\n${api.parametersText}` : ''}
${api.requestBodyText ? `\n요청 본문:\n${api.requestBodyText}` : ''}
${api.responsesText ? `\n응답:\n${api.responsesText}` : ''}`;

          return `[API ${index + 1}: ${apiIdentifier}]
${apiDetails}
${api.swaggerUrl ? `\nSwagger URL: ${api.swaggerUrl}` : ''}
`;
        })
        .join('\n\n---\n\n');

      // 최적화된 시스템 프롬프트
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
        model: this.chatModel,
        messages: messages,
        temperature: 0.3, // 일관성 있는 답변을 위해 낮은 temperature
        max_tokens: 4000, // 상세한 API 가이드와 예시를 위해 토큰 증가
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
