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

  async getEmbedding(text: string): Promise<number[]> {
    try {
      const response = await this.openai.embeddings.create({
        model: 'text-embedding-3-small',
        input: text,
      });
      return response.data[0].embedding;
    } catch (error) {
      this.logger.error(
        `Failed to generate embedding: ${(error as Error).message}`,
      );
      throw error;
    }
  }

  async generateAnswer(
    question: string,
    contextDocuments: Array<{ text: string; pageTitle: string; pageUrl: string }>,
  ): Promise<{ answer: string; usage: { promptTokens: number; completionTokens: number; totalTokens: number } }> {
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

중요한 규칙:
1. 반드시 제공된 문서에 있는 정보만을 사용하여 답변해야 합니다.
2. 문서에 없는 정보는 절대 포함하지 마세요.
3. 문서에 답변할 수 있는 정보가 없으면, "제공된 문서에는 이 질문에 대한 정보가 없습니다."라고 답변하세요.
4. 답변할 때 해당 정보가 어떤 문서에서 나왔는지 명확히 인용하세요 (예: "[문서 1]에 따르면...").
5. 문서에 있는 정보를 바탕으로 추론하되, 문서에 명시되지 않은 사실은 추가하지 마세요.
6. 답변은 반드시 마크다운 형식으로 작성해야 합니다. 제목, 리스트, 강조, 인용 등을 마크다운 문법을 사용하여 사용자가 쉽게 이해할 수 있도록 구조화하세요.`;

      const userPrompt = `다음 문서들을 참고하여 질문에 답변해주세요:

${contextText}

질문: ${question}

위 문서들에 있는 정보만을 사용하여 마크다운 형식으로 답변해주세요. 문서에 없는 정보는 포함하지 마세요. 답변은 제목, 리스트, 강조 표시 등을 마크다운 문법으로 잘 구조화하여 사용자가 이해하기 쉽게 작성해주세요.`;

      const response = await this.openai.chat.completions.create({
        model: 'gpt-3.5-turbo',
        messages: [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: userPrompt },
        ],
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
