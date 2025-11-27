import { NestFactory } from '@nestjs/core';
import { SwaggerModule, DocumentBuilder } from '@nestjs/swagger';
import { ValidationPipe } from '@nestjs/common';
import helmet from 'helmet';
import { AppModule } from './app.module';

async function bootstrap() {
  const app = await NestFactory.create(AppModule);

  // 타임아웃 설정 (파일 업로드 등 긴 작업을 위해 5분으로 설정)
  app.getHttpAdapter().getInstance().timeout = 300000; // 5분 (300초)

  // 보안 헤더 설정 (Helmet)
  app.use(helmet());

  // CORS 설정
  app.enableCors({
    origin: ['http://localhost:3008', 'http://localhost:3000'], // 허용할 오리진 목록
    methods: ['GET', 'POST', 'PUT', 'DELETE', 'PATCH', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization'],
    credentials: true,
  });

  // 전역 Validation Pipe 설정
  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true, // DTO에 정의되지 않은 속성 제거
      forbidNonWhitelisted: true, // DTO에 정의되지 않은 속성이 있으면 요청 거부
      transform: true, // 자동 타입 변환
    }),
  );

  const config = new DocumentBuilder()
    .setTitle('RAG Chat API')
    .setDescription('The RAG Chat API description')
    .setVersion('1.0')
    .addServer('http://localhost:3001', '로컬 개발 서버')
    .addServer('https://api.example.com', '프로덕션 서버')
    .addBearerAuth(
      {
        type: 'http',
        scheme: 'bearer',
        bearerFormat: 'JWT',
        name: 'JWT',
        description: 'JWT 토큰을 입력하세요',
        in: 'header',
      },
      'JWT-auth', // 이 이름을 컨트롤러에서 사용
    )
    .build();
  const document = SwaggerModule.createDocument(app, config);

  // Swagger UI 설정
  SwaggerModule.setup('api', app, document);

  // OpenAPI Generator를 위한 JSON 스펙 엔드포인트
  app.getHttpAdapter().get('/api-json', (req, res) => {
    res.setHeader('Content-Type', 'application/json');
    res.send(document);
  });

  // OpenAPI Generator를 위한 YAML 스펙 엔드포인트 (선택사항)
  // YAML을 사용하려면 js-yaml 패키지가 필요합니다

  await app.listen(process.env.PORT ?? 3001);
}
void bootstrap();
