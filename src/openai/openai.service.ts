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
}
