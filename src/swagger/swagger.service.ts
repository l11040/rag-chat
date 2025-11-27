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
  paths?: Record<string, Record<string, SwaggerPathItem>>;
  tags?: Array<{ name: string; description?: string }>;
  components?: {
    schemas?: Record<string, unknown>;
  };
}

interface SwaggerPathItem {
  summary?: string;
  description?: string;
  tags?: string[];
  operationId?: string;
  parameters?: SwaggerParameter[];
  requestBody?: SwaggerRequestBody;
  responses?: Record<string, SwaggerResponse>;
}

interface SwaggerParameter {
  name?: string;
  in?: string;
  required?: boolean;
  schema?: unknown;
  description?: string;
  example?: unknown;
}

interface SwaggerRequestBody {
  description?: string;
  required?: boolean;
  content?: Record<string, SwaggerContent>;
}

interface SwaggerContent {
  schema?: unknown;
  example?: unknown;
}

interface SwaggerResponse {
  description?: string;
  content?: Record<string, SwaggerContent>;
}

interface ApiInfo {
  method: string;
  path: string;
  summary: string;
  description: string;
  tags: string[];
  operationId?: string;
  parameters?: SwaggerParameter[];
  requestBody?: SwaggerRequestBody;
  responses?: Record<string, SwaggerResponse>;
}

interface QdrantSearchResult {
  id: string | number;
  score: number;
  payload: {
    endpoint?: string;
    method?: string;
    path?: string;
    summary?: string;
    description?: string;
    tags?: string[];
    parameters?: unknown;
    parametersText?: string;
    requestBody?: unknown;
    requestBodyText?: string;
    responses?: unknown;
    responsesText?: string;
    fullText?: string;
    swaggerKey?: string;
    swaggerUrl?: string;
  };
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
        const errorText = await response
          .text()
          .catch(() => 'Unable to read error response');
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

      const jsonData = (await response.json()) as SwaggerSpec;
      this.logger.log(
        `Successfully fetched Swagger spec. Paths count: ${Object.keys(jsonData.paths || {}).length}`,
      );
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
          ![
            'get',
            'post',
            'put',
            'patch',
            'delete',
            'options',
            'head',
          ].includes(method.toLowerCase())
        ) {
          continue;
        }

        const pathItem = details as unknown as SwaggerPathItem;
        const apiInfo: ApiInfo = {
          method: method.toUpperCase(),
          path,
          summary: pathItem.summary || '',
          description: pathItem.description || '',
          tags: pathItem.tags || [],
          operationId: pathItem.operationId,
          parameters: pathItem.parameters,
          requestBody: pathItem.requestBody,
          responses: pathItem.responses,
        };

        apis.push(apiInfo);
      }
    }

    return apis;
  }

  /**
   * 스키마 정보를 텍스트로 변환합니다
   */
  private schemaToText(
    schema: unknown,
    schemas?: Record<string, unknown>,
    visited: Set<string> = new Set(),
  ): string {
    if (!schema) return '';

    const schemaObj = schema as Record<string, unknown>;
    const parts: string[] = [];

    // $ref 참조 처리
    if (schemaObj.$ref && typeof schemaObj.$ref === 'string') {
      const refName = schemaObj.$ref.split('/').pop();
      if (!refName) {
        return '';
      }

      // 순환 참조 감지
      if (visited.has(refName)) {
        return `[순환 참조: ${refName}]`;
      }

      if (schemas && schemas[refName]) {
        visited.add(refName);
        const result = this.schemaToText(schemas[refName], schemas, visited);
        visited.delete(refName);
        return result;
      }
      return refName;
    }

    // 타입 정보
    if (schemaObj.type) {
      const typeValue =
        typeof schemaObj.type === 'string'
          ? schemaObj.type
          : typeof schemaObj.type === 'number'
            ? String(schemaObj.type)
            : JSON.stringify(schemaObj.type);
      parts.push(`타입: ${typeValue}`);
    }

    // 포맷 정보
    if (schemaObj.format) {
      const formatValue =
        typeof schemaObj.format === 'string'
          ? schemaObj.format
          : typeof schemaObj.format === 'number'
            ? String(schemaObj.format)
            : JSON.stringify(schemaObj.format);
      parts.push(`포맷: ${formatValue}`);
    }

    // 설명
    if (schemaObj.description && typeof schemaObj.description === 'string') {
      parts.push(`설명: ${schemaObj.description}`);
    }

    // 예시
    if (schemaObj.example !== undefined) {
      parts.push(`예시: ${JSON.stringify(schemaObj.example)}`);
    }

    // enum 값들
    if (Array.isArray(schemaObj.enum)) {
      parts.push(`가능한 값: ${schemaObj.enum.join(', ')}`);
    }

    // 객체 속성
    if (
      schemaObj.properties &&
      typeof schemaObj.properties === 'object' &&
      !Array.isArray(schemaObj.properties)
    ) {
      const props: string[] = [];
      const requiredArray = Array.isArray(schemaObj.required)
        ? schemaObj.required
        : [];
      for (const [propName, propSchema] of Object.entries(
        schemaObj.properties,
      )) {
        const propText = this.schemaToText(propSchema, schemas, visited);
        const required = requiredArray.includes(propName) ? '(필수)' : '(선택)';
        props.push(`  - ${propName} ${required}: ${propText}`);
      }
      if (props.length > 0) {
        parts.push(`속성:\n${props.join('\n')}`);
      }
    }

    // 배열 아이템
    if (schemaObj.type === 'array' && schemaObj.items) {
      const itemText = this.schemaToText(schemaObj.items, schemas, visited);
      parts.push(`배열 아이템: ${itemText}`);
    }

    return parts.join('\n');
  }

  /**
   * 파라미터 정보를 텍스트로 변환합니다
   */
  private parametersToText(parameters: SwaggerParameter[]): string {
    if (!parameters || parameters.length === 0) {
      return '';
    }

    const parts: string[] = [];
    for (const param of parameters) {
      const paramParts: string[] = [];
      paramParts.push(`- ${param.name || param.in || ''}`);
      if (param.in) {
        paramParts.push(`위치: ${param.in}`);
      }
      if (param.required) {
        paramParts.push('(필수)');
      }
      if (param.schema) {
        const schemaText = this.schemaToText(param.schema, undefined, new Set());
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
  private requestBodyToText(
    requestBody: SwaggerRequestBody,
    schemas?: Record<string, unknown>,
  ): string {
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
      for (const [contentType, content] of Object.entries(
        requestBody.content,
      )) {
        parts.push(`Content-Type: ${contentType}`);
        if (content.schema) {
          const schemaText = this.schemaToText(
            content.schema,
            schemas,
            new Set(),
          );
          if (schemaText) {
            parts.push(`스키마:\n${schemaText}`);
          }
        }
        if (content.example !== undefined) {
          parts.push(`예시: ${JSON.stringify(content.example, null, 2)}`);
        }
      }
    }

    return parts.join('\n');
  }

  /**
   * 응답 정보를 텍스트로 변환합니다
   */
  private responsesToText(
    responses: Record<string, SwaggerResponse>,
    schemas?: Record<string, unknown>,
  ): string {
    if (!responses) {
      return '';
    }

    const parts: string[] = [];

    for (const [statusCode, response] of Object.entries(responses)) {
      const responseParts: string[] = [];
      responseParts.push(`응답 코드: ${statusCode}`);

      if (response.description) {
        responseParts.push(`설명: ${response.description}`);
      }

      if (response.content) {
        for (const [contentType, content] of Object.entries(response.content)) {
          responseParts.push(`Content-Type: ${contentType}`);
          if (content.schema) {
            const schemaText = this.schemaToText(
              content.schema,
              schemas,
              new Set(),
            );
            if (schemaText) {
              responseParts.push(`스키마:\n${schemaText}`);
            }
          }
          if (content.example !== undefined) {
            responseParts.push(
              `예시: ${JSON.stringify(content.example, null, 2)}`,
            );
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
   * Swagger 문서를 생성합니다 (메타데이터만 저장)
   */
  async createSwaggerDocument(
    key: string,
    swaggerSpec: unknown,
  ): Promise<SwaggerDocument> {
    const spec = swaggerSpec as SwaggerSpec;
    if (!spec || typeof spec !== 'object') {
      throw new Error('유효하지 않은 Swagger 스펙입니다.');
    }

    // 기존 Swagger 문서 확인 (키 기준)
    let swaggerDoc = await this.swaggerDocumentRepository.findOne({
      where: { key },
    });

    if (swaggerDoc) {
      // 기존 문서가 있으면 삭제 후 재생성
      this.logger.log(
        `Existing Swagger document found. Deleting old data for key: ${key}`,
      );
      await this.deleteSwaggerDocument(swaggerDoc.id);
    }

    // DB에 Swagger 문서 메타데이터 저장
    swaggerDoc = this.swaggerDocumentRepository.create({
      key,
      swaggerUrl: null, // 파일 업로드의 경우 URL 없음
      title: spec.info?.title || null,
      version: spec.info?.version || null,
      description: spec.info?.description || null,
      indexingStatus: SwaggerIndexingStatus.PROCESSING,
      apiCount: 0,
    });
    swaggerDoc = await this.swaggerDocumentRepository.save(swaggerDoc);

    return swaggerDoc;
  }

  /**
   * Swagger JSON 객체를 직접 받아서 벡터DB에 업로드합니다
   */
  async uploadSwaggerDocumentFromJson(
    key: string,
    swaggerSpec: unknown,
  ): Promise<{
    success: boolean;
    message: string;
    swaggerDocument?: SwaggerDocument;
    apiCount?: number;
  }> {
    this.logger.log(`Starting Swagger document upload from JSON: key=${key}`);

    try {
      // Swagger 스펙 타입 검증
      const spec = swaggerSpec as SwaggerSpec;
      if (!spec || typeof spec !== 'object') {
        throw new Error('유효하지 않은 Swagger 스펙입니다.');
      }

      // 1. Swagger 문서 찾기 (이미 생성되어 있어야 함)
      let swaggerDoc = await this.swaggerDocumentRepository.findOne({
        where: { key },
      });

      if (!swaggerDoc) {
        // 문서가 없으면 생성
        swaggerDoc = await this.createSwaggerDocument(key, swaggerSpec);
      }

      // 2. 상태를 PROCESSING으로 업데이트
      swaggerDoc.indexingStatus = SwaggerIndexingStatus.PROCESSING;
      await this.swaggerDocumentRepository.save(swaggerDoc);

      // 3. Qdrant 컬렉션 생성 (이미 존재하면 무시됨)
      await this.qdrantService.createCollection(
        this.COLLECTION_NAME,
        this.VECTOR_SIZE,
      );

      // 4. API 정보 추출
      const apis = this.extractApisFromSwagger(spec);
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
      const schemas = spec.components?.schemas || {};

      // 5. 각 API를 벡터화하여 저장
      let savedCount = 0;
      for (const api of apis) {
        try {
          // API 정보를 텍스트로 변환 (스키마 정보 포함)
          const apiText = this.formatApiForEmbedding(
            api,
            spec.info,
            schemas,
          );

          // 임베딩 생성
          const embeddingResult =
            await this.openaiService.getEmbedding(apiText);

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

          // Qdrant에 저장
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
                swaggerUrl: null, // 파일 업로드의 경우 URL 없음
                swaggerDocumentId: swaggerDoc.id,
                swaggerKey: key,
                swaggerTitle: spec.info?.title || null,
                swaggerVersion: spec.info?.version || null,
                documentType: 'API',
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

      // 6. 저장 완료 로그
      if (savedCount > 0) {
        this.logger.log(`Saved ${savedCount} API vectors to Qdrant`);
      }

      // 7. DB 상태 업데이트
      swaggerDoc.indexingStatus = SwaggerIndexingStatus.COMPLETED;
      swaggerDoc.apiCount = savedCount;
      swaggerDoc.lastIndexedAt = new Date();
      swaggerDoc.errorMessage = null;
      await this.swaggerDocumentRepository.save(swaggerDoc);

      this.logger.log(
        `Swagger document upload completed: key=${key}, APIs: ${savedCount}`,
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
        `Error uploading Swagger document from JSON: ${errorMessage}`,
        errorStack,
      );

      // 에러 발생 시 DB 상태 업데이트
      const swaggerDoc = await this.swaggerDocumentRepository.findOne({
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
    this.logger.log(
      `Starting Swagger document upload: key=${key}, url=${swaggerUrl}`,
    );

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
          const embeddingResult =
            await this.openaiService.getEmbedding(apiText);

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
      const swaggerDoc = await this.swaggerDocumentRepository.findOne({
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

  /**
   * 키로 Swagger 문서를 조회합니다
   */
  async getSwaggerDocumentByKey(key: string): Promise<SwaggerDocument | null> {
    return await this.swaggerDocumentRepository.findOne({
      where: { key },
    });
  }

  /**
   * Swagger API에 대한 질문에 답변 생성
   */
  async query(
    question: string,
    conversationHistory?: Array<{
      role: 'user' | 'assistant';
      content: string;
    }>,
    swaggerKey?: string, // 특정 Swagger 문서만 검색하고 싶을 때
  ): Promise<{
    success: boolean;
    answer: string;
    sources: Array<{
      endpoint: string;
      method: string;
      path: string;
      score: number;
      swaggerKey?: string;
    }>;
    question: string;
    rewrittenQuery?: string;
    usage?: {
      promptTokens: number;
      completionTokens: number;
      totalTokens: number;
    };
    maxScore?: number;
    threshold?: number;
    error?: string;
  }> {
    try {
      // 토큰 사용량 추적을 위한 변수 초기화
      const totalUsage = {
        promptTokens: 0,
        completionTokens: 0,
        totalTokens: 0,
      };

      // 1. LLM을 사용하여 질문을 검색에 최적화된 쿼리로 재작성
      this.logger.log(`원본 질문: "${question}"`);
      const { rewrittenQuery, usage: rewriteUsage } =
        await this.openaiService.rewriteQueryForSearch(
          question,
          conversationHistory,
        );
      this.logger.log(`재작성된 검색 쿼리: "${rewrittenQuery}"`);

      // 토큰 사용량 합산
      totalUsage.promptTokens += rewriteUsage.promptTokens;
      totalUsage.completionTokens += rewriteUsage.completionTokens;
      totalUsage.totalTokens += rewriteUsage.totalTokens;

      // 2. 재작성된 쿼리에 대한 임베딩 생성
      const { embedding, usage: embeddingUsage } =
        await this.openaiService.getEmbedding(rewrittenQuery);

      // 토큰 사용량 합산
      totalUsage.promptTokens += embeddingUsage.promptTokens;
      totalUsage.totalTokens += embeddingUsage.totalTokens;

      // 3. Qdrant에서 유사한 API 검색
      // 필터 설정 (특정 Swagger 문서만 검색하고 싶을 때)
      interface QdrantSearchOptions {
        vector: number[];
        limit: number;
        filter?: {
          must: Array<{
            key: string;
            match: { value: string };
          }>;
        };
      }

      const searchOptions: QdrantSearchOptions = {
        vector: embedding,
        limit: 5, // 상위 5개 API 검색 (컨텍스트 길이 제한을 위해 줄임)
      };

      // swaggerKey가 제공되면 필터 추가
      if (swaggerKey) {
        searchOptions.filter = {
          must: [
            {
              key: 'swaggerKey',
              match: { value: swaggerKey },
            },
            {
              key: 'documentType',
              match: { value: 'API' },
            },
          ],
        };
      } else {
        // swaggerKey가 없으면 API 타입만 필터링
        searchOptions.filter = {
          must: [
            {
              key: 'documentType',
              match: { value: 'API' },
            },
          ],
        };
      }

      const searchResult = await this.qdrantService
        .getClient()
        .search(this.COLLECTION_NAME, searchOptions as never);

      // 4. 검색 결과 포맷팅 및 스코어 필터링
      const MIN_SCORE_THRESHOLD = 0.35; // 최소 유사도 점수
      const searchResults = (searchResult as QdrantSearchResult[]) || [];
      const allResults = searchResults.map((item) => ({
        id: item.id,
        score: item.score,
        payload: item.payload,
      }));

      // 최소 스코어 임계값 이상인 결과만 필터링
      let results = allResults.filter(
        (result) => result.score >= MIN_SCORE_THRESHOLD,
      );

      this.logger.log(
        `검색 결과: 전체 ${allResults.length}개, 필터링 후 ${results.length}개 (임계값: ${MIN_SCORE_THRESHOLD})`,
      );

      // 5. 필터링 후 결과가 없으면 임계값을 낮춰서 재시도
      if (results.length === 0 && allResults.length > 0) {
        const maxScore = allResults[0].score;
        // 최고 점수가 0.25 이상이면 임계값을 낮춰서 재시도
        if (maxScore >= 0.25) {
          const loweredThreshold = Math.max(0.25, maxScore - 0.05);
          results = allResults.filter(
            (result) => result.score >= loweredThreshold,
          );
          this.logger.log(
            `임계값을 ${MIN_SCORE_THRESHOLD}에서 ${loweredThreshold.toFixed(3)}으로 낮춰서 재시도: ${results.length}개 결과 발견`,
          );
        }
      }

      // 6. 여전히 결과가 없으면 에러 반환
      if (results.length === 0) {
        const maxScore = allResults.length > 0 ? allResults[0].score : 0;
        this.logger.warn(
          `검색 결과가 없습니다. 최고 점수: ${maxScore.toFixed(4)}`,
        );
        return {
          success: false,
          answer:
            '제공된 API 문서에는 이 질문에 대한 충분히 관련성 있는 정보가 없습니다.',
          sources: [],
          question,
          rewrittenQuery,
          maxScore: maxScore,
          threshold: MIN_SCORE_THRESHOLD,
        };
      }

      // 7. 검색된 API들을 LLM에 전달할 형식으로 변환
      // 컨텍스트 길이 제한을 위해 상위 결과만 사용 (최대 5개)
      const maxContextApis = 5;
      const limitedResults = results.slice(0, maxContextApis);
      
      const contextApis = limitedResults.map((result) => {
        const payload = result.payload;
        // 컨텍스트를 압축하기 위해 상세 텍스트는 요약 버전만 사용
        const parametersText = (payload.parametersText as string) || '';
        const requestBodyText = (payload.requestBodyText as string) || '';
        const responsesText = (payload.responsesText as string) || '';
        
        // 긴 텍스트는 잘라서 사용 (각각 최대 500자)
        const truncateText = (text: string, maxLength: number) => {
          if (text.length <= maxLength) return text;
          return text.substring(0, maxLength) + '...';
        };
        
        return {
          endpoint: (payload.endpoint as string) || '',
          method: (payload.method as string) || '',
          path: (payload.path as string) || '',
          summary: (payload.summary as string) || '',
          description: (payload.description as string) || '',
          tags: (payload.tags as string[]) || [],
          parameters: payload.parameters as SwaggerParameter[] | undefined,
          parametersText: truncateText(parametersText, 500),
          requestBody: payload.requestBody as SwaggerRequestBody | undefined,
          requestBodyText: truncateText(requestBodyText, 500),
          responses: payload.responses as
            | Record<string, SwaggerResponse>
            | undefined,
          responsesText: truncateText(responsesText, 500),
          fullText: (payload.fullText as string) || '',
          swaggerKey: (payload.swaggerKey as string) || undefined,
          swaggerUrl: (payload.swaggerUrl as string) || undefined,
        };
      });

      this.logger.log(
        `LLM 답변 생성 시작: ${contextApis.length}개의 API 사용 (전체 검색 결과: ${results.length}개, 최고 점수: ${results[0]?.score?.toFixed(3) || 0})`,
      );

      // 8. LLM을 사용하여 API 기반 답변 생성
      const { answer, usage: answerUsage } =
        await this.openaiService.generateApiAnswer(
          question,
          contextApis,
          conversationHistory,
        );

      // 토큰 사용량 합산
      totalUsage.promptTokens += answerUsage.promptTokens;
      totalUsage.completionTokens += answerUsage.completionTokens;
      totalUsage.totalTokens += answerUsage.totalTokens;

      // 9. 답변에서 실제로 사용된 API 추출 (엔드포인트 기반)
      const usedApiEndpoints = this.extractUsedApiEndpoints(
        answer,
        contextApis,
      );

      // 10. 실제로 사용된 API만 필터링하여 반환
      let sources: Array<{
        endpoint: string;
        method: string;
        path: string;
        score: number;
        swaggerKey?: string;
      }>;
      if (usedApiEndpoints.size > 0) {
        // 인용된 API가 있으면 해당 API만 반환
        sources = allResults
          .filter((result) => {
            const endpoint = (result.payload.endpoint as string) || '';
            return usedApiEndpoints.has(endpoint);
          })
          .map((result) => ({
            endpoint: (result.payload.endpoint as string) || '',
            method: (result.payload.method as string) || '',
            path: (result.payload.path as string) || '',
            score: result.score,
            swaggerKey: (result.payload.swaggerKey as string) || undefined,
          }));
        this.logger.log(
          `답변에 실제로 사용된 API: ${usedApiEndpoints.size}개 (전체 검색 결과: ${allResults.length}개)`,
        );
      } else {
        // 인용이 없으면 상위 점수 API 3개만 반환
        sources = allResults.slice(0, 3).map((result) => ({
          endpoint: (result.payload.endpoint as string) || '',
          method: (result.payload.method as string) || '',
          path: (result.payload.path as string) || '',
          score: result.score,
          swaggerKey: (result.payload.swaggerKey as string) || undefined,
        }));
        this.logger.log(
          `답변에서 API 인용을 찾을 수 없어 상위 3개 API를 반환합니다.`,
        );
      }

      return {
        success: true,
        answer,
        sources,
        question,
        rewrittenQuery,
        usage: totalUsage,
      };
    } catch (error) {
      this.logger.error(
        `Failed to process API query: ${(error as Error).message}`,
      );
      return {
        success: false,
        answer: 'API 질문 답변 생성 중 오류가 발생했습니다.',
        error: (error as Error).message,
        sources: [],
        question,
      };
    }
  }

  /**
   * LLM 답변에서 실제로 사용된 API 엔드포인트 추출
   * 답변에 언급된 엔드포인트 패턴을 찾아서 Set으로 반환
   */
  private extractUsedApiEndpoints(
    answer: string,
    contextApis: Array<{
      endpoint: string;
      method: string;
      path: string;
      summary?: string;
    }>,
  ): Set<string> {
    const usedEndpoints = new Set<string>();

    // 각 API의 엔드포인트, 메서드, 경로, 요약을 답변에서 찾기
    for (const api of contextApis) {
      const endpoint = api.endpoint; // 예: "POST /auth/register"
      const method = api.method; // 예: "POST"
      const path = api.path; // 예: "/auth/register"
      const summary = api.summary || '';

      // 답변에서 엔드포인트 패턴 찾기
      // 패턴 예시: "POST /auth/register", "'POST' /auth/register", "POST /auth/register API"
      const patterns = [
        endpoint, // 전체 엔드포인트
        `'${method}' ${path}`, // 'POST' /auth/register 형식
        `${method} ${path}`, // POST /auth/register 형식
        path, // 경로만
      ];

      // 요약이 있으면 요약도 검색
      if (summary) {
        patterns.push(summary);
      }

      for (const pattern of patterns) {
        // 대소문자 구분 없이 검색
        const regex = new RegExp(
          pattern.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'),
          'i',
        );
        if (regex.test(answer)) {
          usedEndpoints.add(endpoint);
          break; // 하나라도 찾으면 다음 API로
        }
      }
    }

    return usedEndpoints;
  }
}
