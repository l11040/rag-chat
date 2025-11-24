import {
  IsEmail,
  IsEnum,
  IsOptional,
  IsString,
  MinLength,
} from 'class-validator';
import { ApiPropertyOptional } from '@nestjs/swagger';
import { Role } from '../enums/role.enum';

export class UpdateUserDto {
  @ApiPropertyOptional({ description: '이메일', example: 'user@example.com' })
  @IsOptional()
  @IsEmail({}, { message: '유효한 이메일 형식이 아닙니다.' })
  email?: string;

  @ApiPropertyOptional({ description: '비밀번호', example: 'newpassword123' })
  @IsOptional()
  @IsString()
  @MinLength(8, { message: '비밀번호는 최소 8자 이상이어야 합니다.' })
  password?: string;

  @ApiPropertyOptional({
    description: '역할',
    enum: Role,
    example: Role.USER,
  })
  @IsOptional()
  @IsEnum(Role, { message: '유효한 역할이 아닙니다.' })
  role?: Role;
}
