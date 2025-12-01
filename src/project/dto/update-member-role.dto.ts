import { ApiProperty } from '@nestjs/swagger';
import { IsEnum } from 'class-validator';
import { ProjectRole } from '../entities/project-member.entity';

export class UpdateMemberRoleDto {
  @ApiProperty({
    description: '프로젝트 내 역할',
    enum: ProjectRole,
    example: ProjectRole.PROJECT_MANAGER,
  })
  @IsEnum(ProjectRole)
  role: ProjectRole;
}

