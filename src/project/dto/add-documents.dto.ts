import { ApiProperty } from '@nestjs/swagger';
import { IsArray, IsUUID } from 'class-validator';

export class AddNotionPagesDto {
  @ApiProperty({
    description: '추가할 Notion 페이지 ID 목록',
    type: [String],
    example: ['123e4567-e89b-12d3-a456-426614174000'],
  })
  @IsArray()
  @IsUUID('4', { each: true })
  notionPageIds: string[];
}

export class AddSwaggerDocumentsDto {
  @ApiProperty({
    description: '추가할 Swagger 문서 ID 목록',
    type: [String],
    example: ['123e4567-e89b-12d3-a456-426614174000'],
  })
  @IsArray()
  @IsUUID('4', { each: true })
  swaggerDocumentIds: string[];
}

