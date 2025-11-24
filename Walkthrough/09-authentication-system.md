# JWT 기반 인증 시스템 구현

## 개요

보안을 고려한 JWT(JSON Web Token) 기반 인증 시스템을 구현했습니다. 회원가입, 로그인, 토큰 갱신, 로그아웃 기능을 제공하며, 모든 API 엔드포인트에 인증 가드를 적용했습니다.

## 작업 내용

### 1. 패키지 설치

인증 시스템에 필요한 패키지들을 설치했습니다.

```bash
npm install @nestjs/passport @nestjs/jwt passport passport-jwt passport-local bcrypt @nestjs/throttler helmet
npm install --save-dev @types/passport-jwt @types/passport-local @types/bcrypt
```

- `@nestjs/passport`: NestJS용 Passport 모듈
- `@nestjs/jwt`: NestJS용 JWT 모듈
- `passport-jwt`: JWT 전략
- `passport-local`: 로컬 인증 전략
- `bcrypt`: 비밀번호 해싱
- `@nestjs/throttler`: Rate Limiting (무차별 대입 공격 방지)
- `helmet`: 보안 헤더 설정

### 2. User Entity 생성

사용자 정보를 저장할 엔티티를 생성했습니다.

**`src/auth/entities/user.entity.ts`**

```typescript
import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  UpdateDateColumn,
} from 'typeorm';

@Entity('users')
export class User {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ unique: true })
  email: string;

  @Column()
  password: string; // bcrypt로 해시된 비밀번호

  @Column({ nullable: true })
  refreshToken: string; // Refresh Token 저장

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;
}
```

### 3. DTO 및 Validation 추가

입력 검증을 위한 DTO를 생성했습니다.

**`src/auth/dto/register.dto.ts`**

```typescript
import { IsEmail, IsString, MinLength, MaxLength } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

export class RegisterDto {
  @ApiProperty({
    description: '사용자 이메일',
    example: 'user@example.com',
  })
  @IsEmail({}, { message: '유효한 이메일 주소를 입력해주세요.' })
  email: string;

  @ApiProperty({
    description: '비밀번호 (최소 8자, 최대 50자)',
    example: 'SecurePassword123!',
    minLength: 8,
    maxLength: 50,
  })
  @IsString()
  @MinLength(8, { message: '비밀번호는 최소 8자 이상이어야 합니다.' })
  @MaxLength(50, { message: '비밀번호는 최대 50자까지 가능합니다.' })
  password: string;
}
```

**`src/auth/dto/login.dto.ts`**

```typescript
import { IsEmail, IsString } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

export class LoginDto {
  @ApiProperty({
    description: '사용자 이메일',
    example: 'user@example.com',
  })
  @IsEmail({}, { message: '유효한 이메일 주소를 입력해주세요.' })
  email: string;

  @ApiProperty({
    description: '비밀번호',
    example: 'SecurePassword123!',
  })
  @IsString()
  password: string;
}
```

### 4. Passport Strategy 구현

JWT 및 Local 인증 전략을 구현했습니다.

**`src/auth/strategies/jwt.strategy.ts`**

```typescript
import { Injectable, UnauthorizedException } from '@nestjs/common';
import { PassportStrategy } from '@nestjs/passport';
import { ExtractJwt, Strategy } from 'passport-jwt';
import { ConfigService } from '@nestjs/config';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { User } from '../entities/user.entity';

export interface JwtPayload {
  sub: string; // user id
  email: string;
  iat?: number;
  exp?: number;
}

@Injectable()
export class JwtStrategy extends PassportStrategy(Strategy) {
  constructor(
    private configService: ConfigService,
    @InjectRepository(User)
    private userRepository: Repository<User>,
  ) {
    super({
      jwtFromRequest: ExtractJwt.fromAuthHeaderAsBearerToken(),
      ignoreExpiration: false,
      secretOrKey: configService.get<string>('JWT_SECRET') || 'your-secret-key',
    });
  }

  async validate(payload: JwtPayload): Promise<User> {
    const user = await this.userRepository.findOne({
      where: { id: payload.sub },
    });

    if (!user) {
      throw new UnauthorizedException('사용자를 찾을 수 없습니다.');
    }

    return user;
  }
}
```

**`src/auth/strategies/local.strategy.ts`**

```typescript
import { Injectable, UnauthorizedException } from '@nestjs/common';
import { PassportStrategy } from '@nestjs/passport';
import { Strategy } from 'passport-local';
import { AuthService } from '../auth.service';

@Injectable()
export class LocalStrategy extends PassportStrategy(Strategy) {
  constructor(private authService: AuthService) {
    super({
      usernameField: 'email', // 기본값은 'username'이지만 이메일을 사용
    });
  }

  async validate(email: string, password: string): Promise<any> {
    const user = await this.authService.validateUser(email, password);
    if (!user) {
      throw new UnauthorizedException('이메일 또는 비밀번호가 올바르지 않습니다.');
    }
    return user;
  }
}
```

### 5. Guard 구현

인증 가드를 구현했습니다.

**`src/auth/guards/jwt-auth.guard.ts`**

```typescript
import { Injectable } from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';

@Injectable()
export class JwtAuthGuard extends AuthGuard('jwt') {}
```

**`src/auth/guards/local-auth.guard.ts`**

```typescript
import { Injectable } from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';

@Injectable()
export class LocalAuthGuard extends AuthGuard('local') {}
```

### 6. Auth Service 구현

인증 비즈니스 로직을 구현했습니다.

**주요 기능:**

- **회원가입**: 이메일 중복 확인, 비밀번호 해싱(bcrypt, salt rounds: 12), 토큰 생성
- **로그인**: 사용자 검증, 토큰 생성
- **토큰 갱신**: Refresh Token 검증 후 새 토큰 발급
- **로그아웃**: Refresh Token 제거
- **비밀번호 해싱**: bcrypt를 사용한 안전한 비밀번호 저장

### 7. Auth Controller 구현

인증 API 엔드포인트를 구현했습니다.

**엔드포인트:**

- `POST /auth/register` - 회원가입 (인증 불필요)
- `POST /auth/login` - 로그인 (인증 불필요)
- `POST /auth/refresh` - 토큰 갱신 (인증 불필요)
- `POST /auth/logout` - 로그아웃 (인증 필요)
- `POST /auth/me` - 현재 사용자 정보 조회 (인증 필요)

### 8. Auth Module 구성

인증 모듈을 구성했습니다.

**`src/auth/auth.module.ts`**

```typescript
import { Module } from '@nestjs/common';
import { JwtModule, JwtModuleOptions } from '@nestjs/jwt';
import { PassportModule } from '@nestjs/passport';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { AuthService } from './auth.service';
import { AuthController } from './auth.controller';
import { User } from './entities/user.entity';
import { JwtStrategy } from './strategies/jwt.strategy';
import { LocalStrategy } from './strategies/local.strategy';

@Module({
  imports: [
    TypeOrmModule.forFeature([User]),
    PassportModule,
    JwtModule.registerAsync({
      imports: [ConfigModule],
      useFactory: (configService: ConfigService): JwtModuleOptions => {
        const expiresIn = configService.get<string>('JWT_EXPIRES_IN') || '15m';
        return {
          secret: configService.get<string>('JWT_SECRET') || 'your-secret-key',
          signOptions: {
            expiresIn,
          },
        } as JwtModuleOptions;
      },
      inject: [ConfigService],
    }),
  ],
  controllers: [AuthController],
  providers: [AuthService, JwtStrategy, LocalStrategy],
  exports: [AuthService],
})
export class AuthModule {}
```

### 9. 보안 미들웨어 설정

**`src/main.ts`에 추가:**

```typescript
import helmet from 'helmet';

// 보안 헤더 설정 (Helmet)
app.use(helmet());

// 전역 Validation Pipe 설정
app.useGlobalPipes(
  new ValidationPipe({
    whitelist: true, // DTO에 정의되지 않은 속성 제거
    forbidNonWhitelisted: true, // DTO에 정의되지 않은 속성이 있으면 요청 거부
    transform: true, // 자동 타입 변환
  }),
);
```

### 10. Rate Limiting 설정

**`src/app.module.ts`에 추가:**

```typescript
import { ThrottlerModule, ThrottlerGuard } from '@nestjs/throttler';
import { APP_GUARD } from '@nestjs/core';

@Module({
  imports: [
    // ...
    ThrottlerModule.forRoot([
      {
        ttl: 60000, // 1분
        limit: 10, // 최대 10회 요청
      },
    ]),
  ],
  providers: [
    // ...
    {
      provide: APP_GUARD,
      useClass: ThrottlerGuard,
    },
  ],
})
export class AppModule {}
```

### 11. 모든 컨트롤러에 인증 가드 적용

인증이 필요 없는 엔드포인트(register, login, refresh)를 제외하고 모든 엔드포인트에 인증 가드를 적용했습니다.

**적용된 컨트롤러:**

- `RagController` - 모든 엔드포인트
- `NotionController` - 모든 엔드포인트
- `OpenAIController` - 모든 엔드포인트
- `AppController` - 모든 엔드포인트

**예시:**

```typescript
@ApiTags('RAG')
@Controller('rag')
@UseGuards(JwtAuthGuard)
@ApiBearerAuth('JWT-auth')
export class RagController {
  // ...
}
```

### 12. 데이터베이스 마이그레이션 생성

User 테이블을 생성하는 마이그레이션을 작성했습니다.

**`src/database/migrations/1763992905925-CreateUserTable.ts`**

TypeORM의 `createTable`, `createIndex` 메서드를 사용하여 타입 안전한 마이그레이션을 작성했습니다.

```bash
npm run migration:run
```

## 환경 변수 설정

`.env` 파일에 다음 변수들을 추가해야 합니다:

```env
# JWT Authentication
JWT_SECRET=your-super-secret-jwt-key-change-this-in-production
JWT_REFRESH_SECRET=your-super-secret-refresh-key-change-this-in-production
JWT_EXPIRES_IN=15m
JWT_REFRESH_EXPIRES_IN=7d
```

**보안 권장사항:**

- `JWT_SECRET`과 `JWT_REFRESH_SECRET`은 강력한 랜덤 문자열로 생성해야 합니다
- 프로덕션 환경에서는 환경 변수로 관리하고, 코드에 하드코딩하지 않아야 합니다
- 다음 명령어로 안전한 시크릿 키를 생성할 수 있습니다:

```bash
node -e "const crypto = require('crypto'); console.log('JWT_SECRET=' + crypto.randomBytes(64).toString('hex')); console.log('JWT_REFRESH_SECRET=' + crypto.randomBytes(64).toString('hex'));"
```

## 검증 결과

### 1. 회원가입 테스트

```bash
curl -X POST http://localhost:3001/auth/register \
  -H "Content-Type: application/json" \
  -d '{
    "email": "user@example.com",
    "password": "SecurePassword123!"
  }'
```

**응답 예시:**

```json
{
  "success": true,
  "message": "회원가입이 완료되었습니다.",
  "user": {
    "id": "uuid",
    "email": "user@example.com"
  },
  "accessToken": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...",
  "refreshToken": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9..."
}
```

### 2. 로그인 테스트

```bash
curl -X POST http://localhost:3001/auth/login \
  -H "Content-Type: application/json" \
  -d '{
    "email": "user@example.com",
    "password": "SecurePassword123!"
  }'
```

### 3. 인증이 필요한 엔드포인트 테스트

```bash
curl -X POST http://localhost:3001/rag/query \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer {accessToken}" \
  -d '{
    "question": "질문 내용"
  }'
```

인증 토큰 없이 요청하면 `401 Unauthorized` 오류가 반환됩니다.

### 4. Swagger UI에서 테스트

1. `http://localhost:3001/api` 접속
2. 상단의 "Authorize" 버튼 클릭
3. JWT 토큰 입력 (로그인 후 받은 `accessToken`)
4. 인증이 필요한 모든 엔드포인트 사용 가능

## 파일 구조

```
rag-chat/
├── src/
│   ├── auth/
│   │   ├── entities/
│   │   │   └── user.entity.ts          <-- User 엔티티
│   │   ├── dto/
│   │   │   ├── register.dto.ts         <-- 회원가입 DTO
│   │   │   ├── login.dto.ts            <-- 로그인 DTO
│   │   │   └── refresh-token.dto.ts     <-- 토큰 갱신 DTO
│   │   ├── guards/
│   │   │   ├── jwt-auth.guard.ts        <-- JWT 인증 가드
│   │   │   └── local-auth.guard.ts      <-- 로컬 인증 가드
│   │   ├── strategies/
│   │   │   ├── jwt.strategy.ts          <-- JWT 전략
│   │   │   └── local.strategy.ts        <-- 로컬 전략
│   │   ├── auth.controller.ts           <-- 인증 컨트롤러
│   │   ├── auth.service.ts              <-- 인증 서비스
│   │   └── auth.module.ts               <-- 인증 모듈
│   ├── database/
│   │   └── migrations/
│   │       └── 1763992905925-CreateUserTable.ts  <-- User 테이블 마이그레이션
│   ├── app.module.ts                    <-- Throttler 모듈 추가
│   └── main.ts                           <-- Helmet, ValidationPipe 추가
└── ...
```

## 주요 보안 기능

### 1. 비밀번호 해싱

- **bcrypt** 사용 (salt rounds: 12)
- 평문 비밀번호는 절대 저장하지 않음
- 해시된 비밀번호와 비교하여 검증

### 2. JWT 토큰

- **Access Token**: 15분 만료 (짧은 수명으로 보안 강화)
- **Refresh Token**: 7일 만료 (장기 인증 유지)
- 별도의 시크릿 키로 서명하여 분리 관리

### 3. Rate Limiting

- 1분당 최대 10회 요청 제한
- 무차별 대입 공격(Brute Force) 방지

### 4. 보안 헤더 (Helmet)

- XSS 공격 방지
- Clickjacking 방지
- 기타 보안 헤더 자동 설정

### 5. Input Validation

- `class-validator`를 사용한 입력 검증
- DTO에 정의되지 않은 속성 자동 제거
- 타입 변환 및 검증 자동 수행

## API 엔드포인트 요약

### 인증 불필요 (Public)

| 메서드 | 엔드포인트 | 설명 |
|--------|-----------|------|
| POST | `/auth/register` | 회원가입 |
| POST | `/auth/login` | 로그인 |
| POST | `/auth/refresh` | 토큰 갱신 |

### 인증 필요 (Protected)

| 메서드 | 엔드포인트 | 설명 |
|--------|-----------|------|
| POST | `/auth/logout` | 로그아웃 |
| POST | `/auth/me` | 현재 사용자 정보 조회 |
| POST | `/rag/ingest` | Notion 데이터 임베딩 |
| POST | `/rag/query` | 질문 및 답변 생성 |
| GET | `/rag/collection-info` | 컬렉션 정보 조회 |
| GET | `/rag/sample-data` | 샘플 데이터 조회 |
| GET | `/rag/stats` | 통계 정보 조회 |
| GET | `/notion/database` | Notion 데이터베이스 조회 |
| GET | `/notion/page/:pageId` | Notion 페이지 조회 |
| GET | `/openai/embedding` | 임베딩 생성 |
| GET | `/` | Hello World |
| POST | `/qdrant/test` | Qdrant 테스트 |
| GET | `/qdrant/search` | Qdrant 검색 |

## 주의사항

1. **JWT 시크릿 키 보안**:
   - 프로덕션 환경에서는 반드시 강력한 랜덤 문자열 사용
   - 환경 변수로 관리하고 코드에 하드코딩하지 않음
   - Access Token과 Refresh Token은 서로 다른 시크릿 키 사용

2. **비밀번호 정책**:
   - 최소 8자 이상 권장
   - 복잡한 비밀번호 정책 적용 고려 (대소문자, 숫자, 특수문자)

3. **토큰 관리**:
   - Access Token은 짧은 수명으로 설정 (기본 15분)
   - Refresh Token은 안전하게 저장 (HTTP-only 쿠키 권장)
   - 로그아웃 시 Refresh Token 무효화

4. **HTTPS 사용**:
   - 프로덕션 환경에서는 반드시 HTTPS 사용
   - JWT 토큰이 평문으로 전송되지 않도록 보장

5. **Rate Limiting 조정**:
   - 서비스 특성에 맞게 Rate Limiting 값 조정 가능
   - 특정 엔드포인트에만 다른 제한 적용 가능

## 다음 단계

- [ ] 비밀번호 재설정 기능 추가
- [ ] 이메일 인증 기능 추가
- [ ] 소셜 로그인 (OAuth) 연동
- [ ] 역할 기반 접근 제어 (RBAC) 구현
- [ ] 2단계 인증 (2FA) 추가
- [ ] 세션 관리 및 토큰 블랙리스트 구현
- [ ] 로그인 이력 추적 및 보안 모니터링

