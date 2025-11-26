import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { randomUUID } from 'crypto';
import { OpenAIService } from '../openai/openai.service';
import { QdrantService } from '../qdrant/qdrant.service';
import {
  SwaggerDocument,
  SwaggerIndexingStatus,
} from './entities/swagger-document.entity';

interface SwaggerSpec {
  info?: {
    title?: string;
    version?: string;
    description?: string;
  };
  paths?: Record<string, Record<string, any>>;
  tags?: Array<{ name: string; description?: string }>;
  components?: {
    schemas?: Record<string, any>;
  };
}

interface ApiInfo {
  method: string;
  path: string;
  summary: string;
  description: string;
  tags: string[];
  operationId?: string;
  parameters?: any[];
  requestBody?: any;
  responses?: any;
}

@Injectable()
export class SwaggerService {
  private readonly logger = new Logger(SwaggerService.name);
  private readonly COLLECTION_NAME = 'api_recommendations';
  private readonly VECTOR_SIZE = 1536; // text-embedding-3-small 차원

  constructor(
    private readonly openaiService: OpenAIService,
    private readonly qdrantService: QdrantService,
    @InjectRepository(SwaggerDocument)
    private readonly swaggerDocumentRepository: Repository<SwaggerDocument>,
  ) {}

  /**
   * Swagger JSON URL에서 스펙을 가져옵니다
   */
  private async fetchSwaggerSpec(url: string): Promise<SwaggerSpec> {
    try {
      this.logger.log(`Fetching Swagger spec from: ${url}`);
      const response = await fetch(url);
      
      if (!response.ok) {
        const errorText = await response.text().catch(() => 'Unable to read error response');
        this.logger.error(
          `Failed to fetch Swagger spec: ${response.status} ${response.statusText}. Response: ${errorText}`,
        );
        throw new Error(
          `Failed to fetch Swagger spec: ${response.status} ${response.statusText}`,
        );
      }
      
      const contentType = response.headers.get('content-type');
      if (!contentType || !contentType.includes('application/json')) {
        this.logger.warn(
          `Unexpected content-type: ${contentType}. Expected application/json`,
        );
      }
      
      const jsonData = await response.json();
      this.logger.log(`Successfully fetched Swagger spec. Paths count: ${Object.keys(jsonData.paths || {}).length}`);
      return jsonData;
    } catch (error) {
      this.logger.error(
        `Error fetching Swagger spec from ${url}: ${error instanceof Error ? error.message : String(error)}`,
      );
      throw error;
    }
  }

  /**
   * Swagger 스펙에서 API 정보를 추출합니다
   */
  private extractApisFromSwagger(spec: SwaggerSpec): ApiInfo[] {
    const apis: ApiInfo[] = [];

    if (!spec.paths) {
      return apis;
    }

    for (const [path, methods] of Object.entries(spec.paths)) {
      for (const [method, details] of Object.entries(methods)) {
        if (
          !['get', 'post', 'put', 'patch', 'delete', 'options', 'head'].includes(
            method.toLowerCase(),
          )
        ) {
          continue;
        }

        const apiInfo: ApiInfo = {
          method: method.toUpperCase(),
          path,
          summary: details.summary || '',
          description: details.description || '',
          tags: details.tags || [],
          operationId: details.operationId,
          parameters: details.parameters,
          requestBody: details.requestBody,
          responses: details.responses,
        };

        apis.push(apiInfo);
      }
    }

    return apis;
  }

  /**
   * 스키마 정보를 텍스트로 변환합니다
   */
  private schemaToText(schema: any, schemas?: Record<string, any>): string {
    if (!schema) return '';

    const parts: string[] = [];

    // $ref 참조 처리
    if (schema.$ref) {
      const refName = schema.$ref.split('/').pop();
      if (schemas && refName && schemas[refName]) {
        return this.schemaToText(schemas[refName], schemas);
      }
      return refName || '';
    }

    // 타입 정보
    if (schema.type) {
      parts.push(`타입: ${schema.type}`);
    }

    // 포맷 정보
    if (schema.format) {
      parts.push(`포맷: ${schema.format}`);
    }

    // 설명
    if (schema.description) {
      parts.push(`설명: ${schema.description}`);
    }

    // 예시
    if (schema.example !== undefined) {
      parts.push(`예시: ${JSON.stringify(schema.example)}`);
    }

    // enum 값들
    if (schema.enum) {
      parts.push(`가능한 값: ${schema.enum.join(', ')}`);
    }

    // 객체 속성
    if (schema.properties) {
      const props: string[] = [];
      for (const [propName, propSchema] of Object.entries(schema.properties)) {
        const propText = this.schemaToText(propSchema as any, schemas);
        const required = schema.required?.includes(propName) ? '(필수)' : '(선택)';
        props.push(`  - ${propName} ${required}: ${propText}`);
      }
      if (props.length > 0) {
        parts.push(`속성:\n${props.join('\n')}`);
      }
    }

    // 배열 아이템
    if (schema.type === 'array' && schema.items) {
      const itemText = this.schemaToText(schema.items, schemas);
      parts.push(`배열 아이템: ${itemText}`);
    }

    return parts.join('\n');
  }

  /**
   * 파라미터 정보를 텍스트로 변환합니다
   */
  private parametersToText(parameters: any[]): string {
    if (!parameters || parameters.length === 0) {
      return '';
    }

    const parts: string[] = [];
    for (const param of parameters) {
      const paramParts: string[] = [];
      paramParts.push(`- ${param.name || param.in}`);
      if (param.in) {
        paramParts.push(`위치: ${param.in}`);
      }
      if (param.required) {
        paramParts.push('(필수)');
      }
      if (param.schema) {
        const schemaText = this.schemaToText(param.schema);
        if (schemaText) {
          paramParts.push(schemaText);
        }
      }
      if (param.description) {
        paramParts.push(`설명: ${param.description}`);
      }
      if (param.example !== undefined) {
        paramParts.push(`예시: ${JSON.stringify(param.example)}`);
      }
      parts.push(paramParts.join(', '));
    }

    return parts.join('\n');
  }

  /**
   * 요청 본문 정보를 텍스트로 변환합니다
   */
  private requestBodyToText(requestBody: any, schemas?: Record<string, any>): string {
    if (!requestBody) {
      return '';
    }

    const parts: string[] = [];

    if (requestBody.description) {
      parts.push(`요청 본문 설명: ${requestBody.description}`);
    }

    if (requestBody.required) {
      parts.push('요청 본문: 필수');
    }

    if (requestBody.content) {
      for (const [contentType, content] of Object.entries(requestBody.content)) {
        parts.push(`Content-Type: ${contentType}`);
        if ((content as any).schema) {
          const schemaText = this.schemaToText((content as any).schema, schemas);
          if (schemaText) {
            parts.push(`스키마:\n${schemaText}`);
          }
        }
        if ((content as any).example) {
          parts.push(`예시: ${JSON.stringify((content as any).example, null, 2)}`);
        }
      }
    }

    return parts.join('\n');
  }

  /**
   * 응답 정보를 텍스트로 변환합니다
   */
  private responsesToText(responses: any, schemas?: Record<string, any>): string {
    if (!responses) {
      return '';
    }

    const parts: string[] = [];

    for (const [statusCode, response] of Object.entries(responses)) {
      const responseParts: string[] = [];
      responseParts.push(`응답 코드: ${statusCode}`);

      if ((response as any).description) {
        responseParts.push(`설명: ${(response as any).description}`);
      }

      if ((response as any).content) {
        for (const [contentType, content] of Object.entries((response as any).content)) {
          responseParts.push(`Content-Type: ${contentType}`);
          if ((content as any).schema) {
            const schemaText = this.schemaToText((content as any).schema, schemas);
            if (schemaText) {
              responseParts.push(`스키마:\n${schemaText}`);
            }
          }
          if ((content as any).example) {
            responseParts.push(`예시: ${JSON.stringify((content as any).example, null, 2)}`);
          }
        }
      }

      parts.push(responseParts.join('\n'));
    }

    return parts.join('\n');
  }

  /**
   * API 정보를 벡터화용 텍스트로 변환합니다
   */
  private formatApiForEmbedding(
    api: ApiInfo,
    swaggerInfo: SwaggerSpec['info'],
    schemas?: Record<string, any>,
  ): string {
    const parts: string[] = [];

    // 기본 정보
    parts.push(`${api.method} ${api.path}`);
    if (api.summary) {
      parts.push(`요약: ${api.summary}`);
    }
    if (api.description) {
      parts.push(`설명: ${api.description}`);
    }

    // 태그
    if (api.tags && api.tags.length > 0) {
      parts.push(`태그: ${api.tags.join(', ')}`);
    }

    // Swagger 문서 정보
    if (swaggerInfo?.title) {
      parts.push(`문서: ${swaggerInfo.title}`);
    }
    if (swaggerInfo?.version) {
      parts.push(`버전: ${swaggerInfo.version}`);
    }

    // 파라미터 정보 (상세)
    if (api.parameters && api.parameters.length > 0) {
      const paramsText = this.parametersToText(api.parameters);
      if (paramsText) {
        parts.push(`\n파라미터:\n${paramsText}`);
      }
    }

    // 요청 본문 정보 (상세)
    if (api.requestBody) {
      const requestBodyText = this.requestBodyToText(api.requestBody, schemas);
      if (requestBodyText) {
        parts.push(`\n요청 본문:\n${requestBodyText}`);
      }
    }

    // 응답 정보 (상세)
    if (api.responses) {
      const responsesText = this.responsesToText(api.responses, schemas);
      if (responsesText) {
        parts.push(`\n응답:\n${responsesText}`);
      }
    }

    return parts.join('\n');
  }

  /**
   * Swagger 문서를 벡터DB에 업로드합니다
   */
  async uploadSwaggerDocument(
    key: string,
    swaggerUrl: string,
  ): Promise<{
    success: boolean;
    message: string;
    swaggerDocument?: SwaggerDocument;
    apiCount?: number;
  }> {
    this.logger.log(`Starting Swagger document upload: key=${key}, url=${swaggerUrl}`);

    try {
      // 1. 기존 Swagger 문서 확인 (키 기준)
      let swaggerDoc = await this.swaggerDocumentRepository.findOne({
        where: { key },
      });

      if (swaggerDoc) {
        // 기존 문서가 있으면 삭제 후 재업로드
        this.logger.log(
          `Existing Swagger document found. Deleting old data for key: ${key}`,
        );
        await this.deleteSwaggerDocument(swaggerDoc.id);
        swaggerDoc = null;
      }

      // 2. Swagger JSON 가져오기
      const swaggerSpec = await this.fetchSwaggerSpec(swaggerUrl);

      // 3. DB에 Swagger 문서 메타데이터 저장
      swaggerDoc = this.swaggerDocumentRepository.create({
        key,
        swaggerUrl,
        title: swaggerSpec.info?.title || null,
        version: swaggerSpec.info?.version || null,
        description: swaggerSpec.info?.description || null,
        indexingStatus: SwaggerIndexingStatus.PROCESSING,
        apiCount: 0,
      });
      swaggerDoc = await this.swaggerDocumentRepository.save(swaggerDoc);

      // 4. Qdrant 컬렉션 생성 (이미 존재하면 무시됨)
      await this.qdrantService.createCollection(
        this.COLLECTION_NAME,
        this.VECTOR_SIZE,
      );

      // 5. API 정보 추출
      const apis = this.extractApisFromSwagger(swaggerSpec);
      this.logger.log(`Extracted ${apis.length} APIs from Swagger spec`);

      if (apis.length === 0) {
        swaggerDoc.indexingStatus = SwaggerIndexingStatus.FAILED;
        swaggerDoc.errorMessage = 'No APIs found in Swagger spec';
        await this.swaggerDocumentRepository.save(swaggerDoc);
        return {
          success: false,
          message: 'Swagger 스펙에서 API를 찾을 수 없습니다.',
        };
      }

      // 스키마 정보 추출 (components.schemas)
      const schemas = swaggerSpec.components?.schemas || {};

      // 6. 각 API를 벡터화하여 저장 (기존 코드처럼 하나씩 저장)
      let savedCount = 0;
      for (const api of apis) {
        try {
          // API 정보를 텍스트로 변환 (스키마 정보 포함)
          const apiText = this.formatApiForEmbedding(
            api,
            swaggerSpec.info,
            schemas,
          );

          // 임베딩 생성
          const embeddingResult = await this.openaiService.getEmbedding(apiText);

          // Qdrant 포인트 생성 (UUID 사용하여 안전한 ID 생성)
          const pointId = randomUUID();

          // 상세 정보를 JSON으로 저장 (검색 결과에서 바로 사용 가능)
          const parametersText = api.parameters
            ? this.parametersToText(api.parameters)
            : null;
          const requestBodyText = api.requestBody
            ? this.requestBodyToText(api.requestBody, schemas)
            : null;
          const responsesText = api.responses
            ? this.responsesToText(api.responses, schemas)
            : null;

          // Qdrant에 저장 (기존 코드처럼 하나씩 저장)
          await this.qdrantService.upsertPoints(this.COLLECTION_NAME, [
            {
              id: pointId,
              vector: embeddingResult.embedding,
              payload: {
                endpoint: `${api.method} ${api.path}`,
                method: api.method,
                path: api.path,
                summary: api.summary,
                description: api.description,
                tags: api.tags,
                operationId: api.operationId,
                swaggerUrl: swaggerUrl,
                swaggerDocumentId: swaggerDoc.id,
                swaggerKey: key, // key 추가 (필터링용)
                swaggerTitle: swaggerSpec.info?.title || null,
                swaggerVersion: swaggerSpec.info?.version || null,
                documentType: 'API', // 일반 문서와 구분
                // 상세 정보 추가
                parameters: api.parameters || null,
                parametersText: parametersText || null,
                requestBody: api.requestBody || null,
                requestBodyText: requestBodyText || null,
                responses: api.responses || null,
                responsesText: responsesText || null,
                // 전체 텍스트 (검색 결과에서 바로 보여줄 수 있도록)
                fullText: apiText,
              },
            },
          ]);

          savedCount++;
        } catch (error) {
          this.logger.error(
            `Error processing API ${api.method} ${api.path}: ${error}`,
          );
          // 개별 API 실패는 건너뛰고 계속 진행
        }
      }

      // 7. 저장 완료 로그
      if (savedCount > 0) {
        this.logger.log(`Saved ${savedCount} API vectors to Qdrant`);
      }

      // 8. DB 상태 업데이트
      swaggerDoc.indexingStatus = SwaggerIndexingStatus.COMPLETED;
      swaggerDoc.apiCount = savedCount;
      swaggerDoc.lastIndexedAt = new Date();
      swaggerDoc.errorMessage = null;
      await this.swaggerDocumentRepository.save(swaggerDoc);

      this.logger.log(
        `Swagger document upload completed: key=${key}, url=${swaggerUrl}, APIs: ${savedCount}`,
      );

      return {
        success: true,
        message: 'Swagger 문서가 성공적으로 업로드되었습니다.',
        swaggerDocument: swaggerDoc,
        apiCount: savedCount,
      };
    } catch (error) {
      const errorMessage =
        error instanceof Error ? error.message : String(error);
      const errorStack = error instanceof Error ? error.stack : undefined;
      
      this.logger.error(
        `Error uploading Swagger document: ${errorMessage}`,
        errorStack,
      );

      // 에러 발생 시 DB 상태 업데이트
      let swaggerDoc = await this.swaggerDocumentRepository.findOne({
        where: { key },
      });
      if (swaggerDoc) {
        swaggerDoc.indexingStatus = SwaggerIndexingStatus.FAILED;
        swaggerDoc.errorMessage = errorMessage;
        await this.swaggerDocumentRepository.save(swaggerDoc);
      }

      return {
        success: false,
        message: `Swagger 문서 업로드 실패: ${errorMessage}`,
      };
    }
  }

  /**
   * Swagger 문서를 삭제합니다 (벡터DB에서도 함께 삭제)
   */
  async deleteSwaggerDocument(swaggerDocumentId: string): Promise<{
    success: boolean;
    message: string;
    deletedApis?: number;
  }> {
    try {
      const swaggerDoc = await this.swaggerDocumentRepository.findOne({
        where: { id: swaggerDocumentId },
      });

      if (!swaggerDoc) {
        return {
          success: false,
          message: 'Swagger 문서를 찾을 수 없습니다.',
        };
      }

      // Qdrant에서 해당 Swagger 문서의 모든 API 벡터 삭제
      const deletedCount = await this.qdrantService.deleteSwaggerDocumentPoints(
        this.COLLECTION_NAME,
        swaggerDoc.id,
      );

      // DB에서 Swagger 문서 삭제
      await this.swaggerDocumentRepository.remove(swaggerDoc);

      this.logger.log(
        `Deleted Swagger document: ${swaggerDoc.swaggerUrl}, APIs: ${deletedCount}`,
      );

      return {
        success: true,
        message: 'Swagger 문서가 삭제되었습니다.',
        deletedApis: deletedCount,
      };
    } catch (error) {
      this.logger.error(`Error deleting Swagger document: ${error}`);
      return {
        success: false,
        message: `Swagger 문서 삭제 실패: ${error instanceof Error ? error.message : String(error)}`,
      };
    }
  }

  /**
   * Swagger 문서 목록을 조회합니다
   */
  async getSwaggerDocuments(): Promise<SwaggerDocument[]> {
    return await this.swaggerDocumentRepository.find({
      order: { createdAt: 'DESC' },
    });
  }

  /**
   * 특정 Swagger 문서를 조회합니다
   */
  async getSwaggerDocument(id: string): Promise<SwaggerDocument | null> {
    return await this.swaggerDocumentRepository.findOne({
      where: { id },
    });
  }
}

