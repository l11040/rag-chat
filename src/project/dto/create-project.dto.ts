import { ApiProperty } from '@nestjs/swagger';
import { IsString, IsOptional, MaxLength } from 'class-validator';

export class CreateProjectDto {
  @ApiProperty({
    description: '프로젝트 이름',
    example: 'My Project',
  })
  @IsString()
  @MaxLength(255)
  name: string;

  @ApiProperty({
    description: '프로젝트 설명',
    example: 'This is a sample project',
    required: false,
  })
  @IsOptional()
  @IsString()
  description?: string;
}

