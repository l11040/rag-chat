import { ApiProperty } from '@nestjs/swagger';
import { IsString, IsOptional, MaxLength } from 'class-validator';

export class UpdateProjectDto {
  @ApiProperty({
    description: '프로젝트 이름',
    example: 'Updated Project Name',
    required: false,
  })
  @IsOptional()
  @IsString()
  @MaxLength(255)
  name?: string;

  @ApiProperty({
    description: '프로젝트 설명',
    example: 'Updated project description',
    required: false,
  })
  @IsOptional()
  @IsString()
  description?: string;
}

