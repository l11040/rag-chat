# 역할 기반 접근 제어 (RBAC) 시스템 구현

## 개요

사용자 권한 관리 시스템을 구현했습니다. 4가지 권한 레벨(관리자, 부관리자, 프로젝트 관리자, 일반 유저)을 제공하며, 관리자는 모든 사용자 정보를 조회하고 수정할 수 있는 API를 제공합니다.

## 작업 내용

### 1. Role Enum 생성

4가지 권한 레벨을 정의했습니다.

**`src/auth/enums/role.enum.ts`**

```typescript
export enum Role {
  USER = 'user', // 일반 유저
  PROJECT_MANAGER = 'project_manager', // 프로젝트 관리자
  SUB_ADMIN = 'sub_admin', // 부관리자
  ADMIN = 'admin', // 관리자
}
```

**권한 계층 구조:**
- `ADMIN` (관리자) - 최고 권한
- `SUB_ADMIN` (부관리자)
- `PROJECT_MANAGER` (프로젝트 관리자)
- `USER` (일반 유저) - 기본 권한

### 2. User Entity에 Role 필드 추가

User 엔티티에 `role` 필드를 추가했습니다.

**`src/auth/entities/user.entity.ts`**

```typescript
import { Role } from '../enums/role.enum';

@Entity('users')
export class User {
  // ... 기존 필드들

  @Column({
    type: 'enum',
    enum: Role,
    default: Role.USER,
  })
  role: Role;

  // ... 나머지 필드들
}
```

- 기본값: `Role.USER` (일반 유저)
- Enum 타입으로 데이터베이스에 저장

### 3. Role 기반 데코레이터 및 가드 구현

역할 기반 접근 제어를 위한 데코레이터와 가드를 구현했습니다.

**`src/auth/decorators/roles.decorator.ts`**

```typescript
import { SetMetadata } from '@nestjs/common';
import { Role } from '../enums/role.enum';

export const ROLES_KEY = 'roles';
export const Roles = (...roles: Role[]) => SetMetadata(ROLES_KEY, roles);
```

**`src/auth/guards/roles.guard.ts`**

```typescript
import {
  Injectable,
  CanActivate,
  ExecutionContext,
  ForbiddenException,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { Role } from '../enums/role.enum';
import { ROLES_KEY } from '../decorators/roles.decorator';
import { User } from '../entities/user.entity';

@Injectable()
export class RolesGuard implements CanActivate {
  constructor(private reflector: Reflector) {}

  canActivate(context: ExecutionContext): boolean {
    const requiredRoles = this.reflector.getAllAndOverride<Role[]>(ROLES_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);

    if (!requiredRoles) {
      return true; // 역할 제한이 없으면 통과
    }

    const request = context.switchToHttp().getRequest<{ user: User }>();
    const user = request.user;

    if (!user) {
      throw new ForbiddenException('인증된 사용자가 아닙니다.');
    }

    // 역할 우선순위: ADMIN > SUB_ADMIN > PROJECT_MANAGER > USER
    const roleHierarchy: Record<Role, number> = {
      [Role.USER]: 1,
      [Role.PROJECT_MANAGER]: 2,
      [Role.SUB_ADMIN]: 3,
      [Role.ADMIN]: 4,
    };

    const userRoleLevel = roleHierarchy[user.role];
    const hasRequiredRole = requiredRoles.some(
      (role) => userRoleLevel >= roleHierarchy[role],
    );

    if (!hasRequiredRole) {
      throw new ForbiddenException('이 작업을 수행할 권한이 없습니다.');
    }

    return true;
  }
}
```

**주요 특징:**
- 역할 계층 구조 지원: 상위 권한은 하위 권한의 모든 기능에 접근 가능
- `@Roles()` 데코레이터로 엔드포인트에 권한 제한 설정
- `JwtAuthGuard`와 함께 사용하여 인증 및 권한을 동시에 검증

### 4. JWT 토큰에 Role 포함

JWT Payload에 사용자 역할 정보를 포함하도록 수정했습니다.

**`src/auth/strategies/jwt.strategy.ts`**

```typescript
export interface JwtPayload {
  sub: string; // user id
  email: string;
  role?: string; // 역할 추가
  iat?: number;
  exp?: number;
}
```

**`src/auth/auth.service.ts`**

```typescript
private async generateTokens(user: User) {
  const payload: JwtPayload = {
    sub: user.id,
    email: user.email,
    role: user.role, // 역할 정보 포함
  };
  // ... 토큰 생성 로직
}
```

### 5. 관리자용 유저 관리 API 구현

관리자 권한으로 사용자 정보를 조회하고 수정할 수 있는 API를 추가했습니다.

**`src/auth/dto/update-user.dto.ts`**

```typescript
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
```

**`src/auth/auth.service.ts`에 추가된 메서드:**

```typescript
// 모든 사용자 조회
async findAllUsers() {
  const users = await this.userRepository.find({
    select: ['id', 'email', 'role', 'createdAt', 'updatedAt'],
    order: { createdAt: 'DESC' },
  });

  return {
    success: true,
    users,
  };
}

// 특정 사용자 조회
async findUserById(userId: string) {
  const user = await this.userRepository.findOne({
    where: { id: userId },
    select: ['id', 'email', 'role', 'createdAt', 'updatedAt'],
  });

  if (!user) {
    throw new UnauthorizedException('사용자를 찾을 수 없습니다.');
  }

  return {
    success: true,
    user,
  };
}

// 사용자 정보 수정
async updateUser(userId: string, updateUserDto: UpdateUserDto) {
  const user = await this.userRepository.findOne({
    where: { id: userId },
  });

  if (!user) {
    throw new UnauthorizedException('사용자를 찾을 수 없습니다.');
  }

  // 이메일 변경 시 중복 확인
  if (updateUserDto.email && updateUserDto.email !== user.email) {
    const existingUser = await this.userRepository.findOne({
      where: { email: updateUserDto.email },
    });

    if (existingUser) {
      throw new ConflictException('이미 사용 중인 이메일입니다.');
    }
  }

  // 비밀번호 변경 시 해싱
  if (updateUserDto.password) {
    const saltRounds = 12;
    updateUserDto.password = await bcrypt.hash(
      updateUserDto.password,
      saltRounds,
    );
  }

  await this.userRepository.update(userId, updateUserDto);

  const updatedUser = await this.userRepository.findOne({
    where: { id: userId },
    select: ['id', 'email', 'role', 'createdAt', 'updatedAt'],
  });

  return {
    success: true,
    message: '사용자 정보가 업데이트되었습니다.',
    user: updatedUser,
  };
}
```

**`src/auth/auth.controller.ts`에 추가된 엔드포인트:**

```typescript
// 모든 사용자 조회 (관리자 전용)
@Get('users')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(Role.ADMIN)
@ApiBearerAuth('JWT-auth')
@ApiOperation({ summary: '모든 사용자 조회 (관리자 전용)' })
async getAllUsers() {
  return this.authService.findAllUsers();
}

// 특정 사용자 조회 (관리자 전용)
@Get('users/:id')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(Role.ADMIN)
@ApiBearerAuth('JWT-auth')
@ApiOperation({ summary: '특정 사용자 조회 (관리자 전용)' })
async getUserById(@Param('id') id: string) {
  return this.authService.findUserById(id);
}

// 사용자 정보 수정 (관리자 전용)
@Patch('users/:id')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(Role.ADMIN)
@ApiBearerAuth('JWT-auth')
@ApiOperation({ summary: '사용자 정보 수정 (관리자 전용)' })
async updateUser(
  @Param('id') id: string,
  @Body() updateUserDto: UpdateUserDto,
) {
  return this.authService.updateUser(id, updateUserDto);
}
```

### 6. 데이터베이스 마이그레이션 생성

User 테이블에 `role` 컬럼을 추가하는 마이그레이션을 생성했습니다.

**`src/database/migrations/1763996237000-AddRoleToUser.ts`**

```typescript
import { MigrationInterface, QueryRunner, TableColumn } from 'typeorm';

export class AddRoleToUser1763996237000 implements MigrationInterface {
  name = 'AddRoleToUser1763996237000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    // 컬럼이 이미 존재하는지 확인
    const table = await queryRunner.getTable('users');
    const roleColumn = table?.findColumnByName('role');

    if (!roleColumn) {
      await queryRunner.addColumn(
        'users',
        new TableColumn({
          name: 'role',
          type: 'enum',
          enum: ['user', 'project_manager', 'sub_admin', 'admin'],
          default: "'user'",
          isNullable: false,
        }),
      );
    }
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    const table = await queryRunner.getTable('users');
    const roleColumn = table?.findColumnByName('role');

    if (roleColumn) {
      await queryRunner.dropColumn('users', 'role');
    }
  }
}
```

**마이그레이션 실행:**

```bash
npm run migration:run
```

## 사용 방법

### 1. 역할 기반 접근 제어 적용

컨트롤러나 엔드포인트에 `@Roles()` 데코레이터를 사용하여 권한을 제한할 수 있습니다.

```typescript
import { Roles } from '../auth/decorators/roles.decorator';
import { RolesGuard } from '../auth/guards/roles.guard';
import { Role } from '../auth/enums/role.enum';

@Controller('example')
@UseGuards(JwtAuthGuard, RolesGuard) // 인증 및 권한 가드 적용
export class ExampleController {
  // 관리자만 접근 가능
  @Get('admin-only')
  @Roles(Role.ADMIN)
  adminOnly() {
    return { message: '관리자 전용 기능' };
  }

  // 관리자 또는 부관리자 접근 가능
  @Get('admin-or-sub-admin')
  @Roles(Role.ADMIN, Role.SUB_ADMIN)
  adminOrSubAdmin() {
    return { message: '관리자 또는 부관리자 전용 기능' };
  }

  // 프로젝트 관리자 이상 접근 가능
  @Get('project-manager-up')
  @Roles(Role.PROJECT_MANAGER)
  projectManagerUp() {
    // PROJECT_MANAGER, SUB_ADMIN, ADMIN 모두 접근 가능 (계층 구조)
    return { message: '프로젝트 관리자 이상 전용 기능' };
  }
}
```

### 2. 관리자용 유저 관리 API 사용

#### 모든 사용자 조회

```bash
curl -X GET http://localhost:3001/auth/users \
  -H "Authorization: Bearer {admin_access_token}"
```

**응답 예시:**

```json
{
  "success": true,
  "users": [
    {
      "id": "uuid-1",
      "email": "admin@example.com",
      "role": "admin",
      "createdAt": "2024-01-01T00:00:00.000Z",
      "updatedAt": "2024-01-01T00:00:00.000Z"
    },
    {
      "id": "uuid-2",
      "email": "user@example.com",
      "role": "user",
      "createdAt": "2024-01-02T00:00:00.000Z",
      "updatedAt": "2024-01-02T00:00:00.000Z"
    }
  ]
}
```

#### 특정 사용자 조회

```bash
curl -X GET http://localhost:3001/auth/users/{userId} \
  -H "Authorization: Bearer {admin_access_token}"
```

**응답 예시:**

```json
{
  "success": true,
  "user": {
    "id": "uuid",
    "email": "user@example.com",
    "role": "user",
    "createdAt": "2024-01-01T00:00:00.000Z",
    "updatedAt": "2024-01-01T00:00:00.000Z"
  }
}
```

#### 사용자 정보 수정

```bash
curl -X PATCH http://localhost:3001/auth/users/{userId} \
  -H "Authorization: Bearer {admin_access_token}" \
  -H "Content-Type: application/json" \
  -d '{
    "email": "newemail@example.com",
    "role": "project_manager",
    "password": "newpassword123"
  }'
```

**부분 업데이트도 가능:**

```bash
# 역할만 변경
curl -X PATCH http://localhost:3001/auth/users/{userId} \
  -H "Authorization: Bearer {admin_access_token}" \
  -H "Content-Type: application/json" \
  -d '{
    "role": "sub_admin"
  }'
```

**응답 예시:**

```json
{
  "success": true,
  "message": "사용자 정보가 업데이트되었습니다.",
  "user": {
    "id": "uuid",
    "email": "newemail@example.com",
    "role": "project_manager",
    "createdAt": "2024-01-01T00:00:00.000Z",
    "updatedAt": "2024-01-03T00:00:00.000Z"
  }
}
```

### 3. 권한 오류 처리

권한이 없는 사용자가 접근하면 `403 Forbidden` 오류가 반환됩니다.

```json
{
  "statusCode": 403,
  "message": "이 작업을 수행할 권한이 없습니다.",
  "error": "Forbidden"
}
```

## 파일 구조

```
rag-chat/
├── src/
│   ├── auth/
│   │   ├── enums/
│   │   │   └── role.enum.ts              <-- Role enum 정의
│   │   ├── decorators/
│   │   │   └── roles.decorator.ts         <-- @Roles() 데코레이터
│   │   ├── guards/
│   │   │   └── roles.guard.ts             <-- 역할 기반 가드
│   │   ├── entities/
│   │   │   └── user.entity.ts              <-- role 필드 추가
│   │   ├── dto/
│   │   │   └── update-user.dto.ts         <-- 사용자 수정 DTO
│   │   ├── strategies/
│   │   │   └── jwt.strategy.ts            <-- JWT Payload에 role 추가
│   │   ├── auth.controller.ts             <-- 관리자용 유저 관리 API
│   │   └── auth.service.ts                <-- 유저 관리 서비스 메서드
│   ├── database/
│   │   └── migrations/
│   │       └── 1763996237000-AddRoleToUser.ts  <-- role 컬럼 추가 마이그레이션
│   └── ...
└── ...
```

## 주요 기능

### 1. 역할 계층 구조

상위 권한은 하위 권한의 모든 기능에 접근할 수 있습니다.

- `ADMIN` → 모든 권한 접근 가능
- `SUB_ADMIN` → `PROJECT_MANAGER`, `USER` 권한 접근 가능
- `PROJECT_MANAGER` → `USER` 권한 접근 가능
- `USER` → 자신의 권한만 접근 가능

**예시:**

```typescript
@Roles(Role.PROJECT_MANAGER) // 프로젝트 관리자 이상 접근 가능
```

이 경우 `PROJECT_MANAGER`, `SUB_ADMIN`, `ADMIN` 모두 접근 가능합니다.

### 2. JWT 토큰에 역할 정보 포함

로그인 시 발급되는 JWT 토큰에 사용자의 역할 정보가 포함되어, 클라이언트에서도 역할 정보를 확인할 수 있습니다.

### 3. 관리자용 유저 관리

- **조회**: 모든 사용자 목록 및 특정 사용자 정보 조회
- **수정**: 이메일, 비밀번호, 역할 변경
- **보안**: 비밀번호는 자동으로 해싱되어 저장

### 4. 안전한 마이그레이션

마이그레이션 파일에 컬럼 존재 여부 확인 로직을 포함하여, 중복 실행 시 오류가 발생하지 않도록 구현했습니다.

## API 엔드포인트 요약

### 인증 필요 (일반 사용자)

| 메서드 | 엔드포인트 | 설명 | 권한 |
|--------|-----------|------|------|
| POST | `/auth/me` | 현재 사용자 정보 조회 | 모든 인증된 사용자 |

### 관리자 전용

| 메서드 | 엔드포인트 | 설명 | 권한 |
|--------|-----------|------|------|
| GET | `/auth/users` | 모든 사용자 조회 | ADMIN |
| GET | `/auth/users/:id` | 특정 사용자 조회 | ADMIN |
| PATCH | `/auth/users/:id` | 사용자 정보 수정 | ADMIN |

## 역할별 권한 가이드

### ADMIN (관리자)
- 모든 사용자 정보 조회 및 수정
- 모든 API 엔드포인트 접근 가능
- 시스템 전체 관리 권한

### SUB_ADMIN (부관리자)
- 프로젝트 관리자 및 일반 유저 권한의 모든 기능 접근 가능
- 관리자 전용 기능은 제한됨

### PROJECT_MANAGER (프로젝트 관리자)
- 프로젝트 관련 기능 관리
- 일반 유저 권한의 모든 기능 접근 가능

### USER (일반 유저)
- 기본 기능 사용
- 자신의 정보만 조회 가능

## 주의사항

1. **초기 관리자 계정 생성**:
   - 데이터베이스에 직접 관리자 권한을 부여하거나
   - 마이그레이션에서 초기 관리자 계정을 생성하는 스크립트를 추가하는 것을 권장합니다

2. **권한 변경 시 주의**:
   - 사용자의 권한을 변경할 때는 신중하게 결정해야 합니다
   - 권한 변경 이력을 추적하는 것을 권장합니다

3. **토큰 갱신**:
   - 역할이 변경된 경우, 사용자는 다시 로그인하여 새로운 토큰을 받아야 변경된 역할이 적용됩니다

4. **보안 고려사항**:
   - 관리자 API는 민감한 정보를 다루므로, 추가적인 보안 조치(IP 화이트리스트, 2FA 등)를 고려할 수 있습니다

## 다음 단계

- [ ] 초기 관리자 계정 생성 스크립트 추가
- [ ] 권한 변경 이력 추적 기능 추가
- [ ] 역할별 세부 권한 설정 (예: 특정 리소스에 대한 CRUD 권한)
- [ ] 사용자 그룹 기능 추가
- [ ] 권한 기반 API 접근 로깅 및 모니터링
- [ ] 역할별 대시보드 및 UI 분기 처리

