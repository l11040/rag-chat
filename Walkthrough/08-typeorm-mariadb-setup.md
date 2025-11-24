# TypeORM 및 MariaDB 설정

## 개요

TypeORM을 사용하여 MariaDB 데이터베이스를 NestJS 애플리케이션에 연동하고, 마이그레이션 시스템을 구성했습니다.

## 작업 내용

### 1. 패키지 설치

TypeORM과 MariaDB 관련 패키지를 설치했습니다.

```bash
npm install @nestjs/typeorm typeorm mysql2
npm install dotenv
```

- `@nestjs/typeorm`: NestJS용 TypeORM 모듈
- `typeorm`: TypeORM 코어 라이브러리
- `mysql2`: MariaDB/MySQL 드라이버
- `dotenv`: 환경 변수 로딩 (마이그레이션 CLI용)

### 2. Docker Compose에 MariaDB 추가

`docker-compose.yml`에 MariaDB 서비스를 추가하고 환경 변수를 사용하도록 구성했습니다.

```yaml
services:
  mariadb:
    image: mariadb:latest
    container_name: rag-chat-mariadb
    ports:
      - "${DB_PORT:-3306}:3306"
    environment:
      MYSQL_ROOT_PASSWORD: ${DB_PASSWORD:-rootpassword}
      MYSQL_DATABASE: ${DB_DATABASE:-rag_chat}
      MYSQL_USER: ${DB_USERNAME:-root}
      MYSQL_PASSWORD: ${DB_PASSWORD:-rootpassword}
    volumes:
      - mariadb_data:/var/lib/mysql
    healthcheck:
      test: ["CMD", "healthcheck.sh", "--connect", "--innodb_initialized"]
      interval: 10s
      timeout: 5s
      retries: 5

volumes:
  mariadb_data:
```

### 3. 환경 변수 설정

`.env` 파일에 다음 변수들을 추가했습니다.

```env
# MariaDB
DB_HOST=localhost
DB_PORT=3306
DB_USERNAME=root
DB_PASSWORD=rootpassword
DB_DATABASE=rag_chat
DB_SYNCHRONIZE=false
```

### 4. TypeORM 설정 파일 분리

TypeORM 설정을 별도 파일로 분리하여 관리하도록 구성했습니다.

**`src/database/typeorm.config.ts`**

```typescript
import { TypeOrmModuleOptions } from '@nestjs/typeorm';
import { ConfigService } from '@nestjs/config';

export const getTypeOrmConfig = (
  configService: ConfigService,
): TypeOrmModuleOptions => ({
  type: 'mariadb',
  host: configService.get<string>('DB_HOST', 'localhost'),
  port: configService.get<number>('DB_PORT', 3306),
  username: configService.get<string>('DB_USERNAME', 'root'),
  password: configService.get<string>('DB_PASSWORD', 'rootpassword'),
  database: configService.get<string>('DB_DATABASE', 'rag_chat'),
  synchronize: configService.get<boolean>('DB_SYNCHRONIZE', false),
  autoLoadEntities: true,
  entities: [__dirname + '/../**/*.entity{.ts,.js}'],
  migrations: [__dirname + '/migrations/*{.ts,.js}'],
  migrationsRun: false,
  logging: configService.get<string>('NODE_ENV') === 'development',
});
```

**`src/database/data-source.ts`** (마이그레이션 CLI용)

```typescript
import { DataSource, DataSourceOptions } from 'typeorm';
import { config } from 'dotenv';

config();

const dataSourceOptions: DataSourceOptions = {
  type: 'mariadb',
  host: process.env.DB_HOST || 'localhost',
  port: parseInt(process.env.DB_PORT || '3306', 10),
  username: process.env.DB_USERNAME || 'root',
  password: process.env.DB_PASSWORD || 'rootpassword',
  database: process.env.DB_DATABASE || 'rag_chat',
  entities: [__dirname + '/../**/*.entity{.ts,.js}'],
  migrations: [__dirname + '/migrations/*{.ts,.js}'],
  synchronize: false,
  logging: process.env.NODE_ENV === 'development',
};

export const AppDataSource = new DataSource(dataSourceOptions);
```

### 5. AppModule에 TypeORM 모듈 추가

`src/app.module.ts`에 TypeORM 모듈을 추가했습니다.

```typescript
import { TypeOrmModule } from '@nestjs/typeorm';
import { getTypeOrmConfig } from './database/typeorm.config';

@Module({
  imports: [
    // ... 기타 모듈들
    TypeOrmModule.forRootAsync({
      imports: [ConfigModule],
      useFactory: getTypeOrmConfig,
      inject: [ConfigService],
    }),
  ],
})
export class AppModule {}
```

### 6. 마이그레이션 시스템 구성

`package.json`에 마이그레이션 관련 스크립트를 추가했습니다.

```json
{
  "scripts": {
    "typeorm": "ts-node -r tsconfig-paths/register ./node_modules/typeorm/cli.js",
    "migration:generate": "npm run typeorm -- migration:generate -d src/database/data-source.ts",
    "migration:create": "npm run typeorm -- migration:create",
    "migration:run": "npm run typeorm -- migration:run -d src/database/data-source.ts",
    "migration:revert": "npm run typeorm -- migration:revert -d src/database/data-source.ts",
    "migration:show": "npm run typeorm -- migration:show -d src/database/data-source.ts"
  }
}
```

## 사용 방법

### 1. MariaDB 컨테이너 실행

```bash
docker-compose up -d mariadb
```

### 2. 마이그레이션 생성

엔티티 변경사항으로 자동 생성:

```bash
npm run migration:generate src/database/migrations/MigrationName
```

빈 마이그레이션 파일 생성:

```bash
npm run migration:create src/database/migrations/MigrationName
```

### 3. 마이그레이션 실행

```bash
npm run migration:run
```

### 4. 마이그레이션 롤백

```bash
npm run migration:revert
```

### 5. 마이그레이션 상태 확인

```bash
npm run migration:show
```

## 파일 구조

```
rag-chat/
├── docker-compose.yml          <-- MariaDB 서비스 추가
├── .env                        <-- DB 환경 변수 추가
├── package.json                <-- 마이그레이션 스크립트 추가
├── src/
│   ├── app.module.ts           <-- TypeORM 모듈 추가
│   └── database/
│       ├── typeorm.config.ts   <-- TypeORM 설정 (NestJS용)
│       ├── data-source.ts      <-- TypeORM 설정 (CLI용)
│       └── migrations/          <-- 마이그레이션 파일 저장소
│           └── ...
└── ...
```

## 주요 설정 옵션

- **`synchronize: false`**: 프로덕션 환경에서는 마이그레이션을 통해서만 스키마 변경
- **`autoLoadEntities: true`**: 엔티티 파일을 자동으로 로드
- **`migrationsRun: false`**: 애플리케이션 시작 시 자동 마이그레이션 비활성화 (수동 실행)
- **`logging: development`**: 개발 환경에서만 SQL 쿼리 로깅

## 주의사항

1. **환경 변수 일치**: `docker-compose.yml`의 `MYSQL_USER`와 `MYSQL_PASSWORD`가 `.env` 파일의 `DB_USERNAME`과 `DB_PASSWORD`와 일치해야 합니다.

2. **마이그레이션 파일 관리**: 마이그레이션 파일은 버전 관리에 포함되어야 하며, 팀원 간 공유되어야 합니다.

3. **프로덕션 환경**: 프로덕션에서는 `synchronize: false`를 유지하고, 모든 스키마 변경은 마이그레이션을 통해 수행해야 합니다.

## 다음 단계

- 엔티티 생성 및 마이그레이션을 통해 실제 데이터 모델 구성
- Repository 패턴을 사용한 데이터 접근 계층 구현
- 트랜잭션 관리 및 관계 설정

