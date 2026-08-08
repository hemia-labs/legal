import { NestFactory } from '@nestjs/core';
import { ValidationPipe } from '@nestjs/common';
import { SsoExceptionFilter } from '@hemia/auth/nestjs';
import cookieParser from 'cookie-parser';
import { AppModule } from './app.module';
import { LegalErrorFilter } from './common/filters/legal-error.filter';

async function bootstrap() {
  const app = await NestFactory.create(AppModule);
  app.useGlobalPipes(new ValidationPipe({ whitelist: true, transform: true }));
  app.use(cookieParser());
  app.useGlobalFilters(new LegalErrorFilter(), new SsoExceptionFilter());
  app.enableCors({
    origin: (process.env.SSO_FRONTEND_URL ?? 'http://localhost:5180').split(
      ',',
    ),
    credentials: true,
  });
  await app.listen(process.env.PORT ?? 3017);
}
void bootstrap();
