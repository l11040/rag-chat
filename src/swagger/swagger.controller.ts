import {
  Controller,
  Post,
  Get,
  Delete,
  Body,
  Param,
  UseGuards,
  HttpCode,
  HttpStatus,
} from '@nestjs/common';
import {
  ApiTags,
  ApiOperation,
  ApiResponse,
  ApiBearerAuth,
  ApiProperty,
} from '@nestjs/swagger';
import { IsString, IsUrl, Matches, MinLength, MaxLength } from 'class-validator';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { Roles } from '../auth/decorators/roles.decorator';
import { Role } from '../auth/enums/role.enum';
import { SwaggerService } from './swagger.service';

class UploadSwaggerDto {
  @ApiProperty({
    description: 'Swagger 문서 고유 키 (영어, 숫자, 소문자, 언더스코어만 허용)',
    example: 'rag_chat_api',
  })
  @IsString({ message: '키는 문자열이어야 합니다.' })
  @MinLength(1, { message: '키는 최소 1자 이상이어야 합니다.' })
  @MaxLength(100, { message: '키는 최대 100자까지 가능합니다.' })
  @Matches(/^[a-z0-9_]+$/, {
    message: '키는 소문자 영어, 숫자, 언더스코어(_)만 사용할 수 있습니다.',
  })
  key: string;

  @ApiProperty({
    description: 'Swagger JSON URL (예: http://localhost:3001/api-json)',
    example: 'http://localhost:3001/api-json',
  })
  @IsUrl(
    {
      require_tld: false, // localhost 같은 경우 TLD가 없으므로 false
      require_protocol: true, // 프로토콜은 필수
    },
    { message: '유효한 URL을 입력해주세요.' },
  )
  @IsString()
  swaggerUrl: string;
}

@ApiTags('Swagger')
@Controller('swagger')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(Role.ADMIN, Role.SUB_ADMIN)
@ApiBearerAuth('JWT-auth')
export class SwaggerController {
  constructor(private readonly swaggerService: SwaggerService) {}

  @Post('upload')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: '[관리자] Swagger 문서 업로드',
    description:
      'Swagger JSON URL을 입력받아 API 정보를 벡터DB에 저장합니다. 같은 키가 이미 존재하면 기존 데이터를 삭제하고 재업로드합니다.',
  })
  @ApiResponse({
    status: 200,
    description: 'Swagger 문서 업로드 성공',
  })
  @ApiResponse({
    status: 400,
    description: '잘못된 요청 (유효하지 않은 URL 등)',
  })
  @ApiResponse({
    status: 401,
    description: '인증 필요',
  })
  @ApiResponse({
    status: 403,
    description: '권한 없음 (관리자만 접근 가능)',
  })
  async uploadSwaggerDocument(@Body() body: UploadSwaggerDto) {
    return await this.swaggerService.uploadSwaggerDocument(body.key, body.swaggerUrl);
  }

  @Get('documents')
  @ApiOperation({
    summary: '[관리자] Swagger 문서 목록 조회',
    description: '업로드된 모든 Swagger 문서 목록을 조회합니다.',
  })
  @ApiResponse({
    status: 200,
    description: 'Swagger 문서 목록 반환',
  })
  @ApiResponse({
    status: 401,
    description: '인증 필요',
  })
  @ApiResponse({
    status: 403,
    description: '권한 없음',
  })
  async getSwaggerDocuments() {
    const documents = await this.swaggerService.getSwaggerDocuments();
    return {
      success: true,
      documents,
      total: documents.length,
    };
  }

  @Get('documents/:id')
  @ApiOperation({
    summary: '[관리자] 특정 Swagger 문서 조회',
    description: '특정 Swagger 문서의 상세 정보를 조회합니다.',
  })
  @ApiResponse({
    status: 200,
    description: 'Swagger 문서 정보 반환',
  })
  @ApiResponse({
    status: 404,
    description: '문서를 찾을 수 없음',
  })
  async getSwaggerDocument(@Param('id') id: string) {
    const document = await this.swaggerService.getSwaggerDocument(id);
    if (!document) {
      return {
        success: false,
        message: 'Swagger 문서를 찾을 수 없습니다.',
      };
    }
    return {
      success: true,
      document,
    };
  }

  @Delete('documents/:id')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: '[관리자] Swagger 문서 삭제',
    description:
      'Swagger 문서와 관련된 모든 벡터 데이터를 삭제합니다.',
  })
  @ApiResponse({
    status: 200,
    description: 'Swagger 문서 삭제 성공',
  })
  @ApiResponse({
    status: 404,
    description: '문서를 찾을 수 없음',
  })
  async deleteSwaggerDocument(@Param('id') id: string) {
    return await this.swaggerService.deleteSwaggerDocument(id);
  }
}

