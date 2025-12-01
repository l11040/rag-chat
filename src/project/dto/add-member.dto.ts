import { ApiProperty } from '@nestjs/swagger';
import { IsUUID, IsEnum } from 'class-validator';
import { ProjectRole } from '../entities/project-member.entity';

export class AddMemberDto {
  @ApiProperty({
    description: '추가할 사용자 ID',
    example: '123e4567-e89b-12d3-a456-426614174000',
  })
  @IsUUID()
  userId: string;

  @ApiProperty({
    description: '프로젝트 내 역할',
    enum: ProjectRole,
    example: ProjectRole.MEMBER,
    default: ProjectRole.MEMBER,
  })
  @IsEnum(ProjectRole)
  role: ProjectRole;
}

