import { NestFactory } from '@nestjs/core';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import helmet from 'helmet';
import { AppModule } from './app.module';
import { SESSION_COOKIE } from './modules/auth/constants/session.constants';
import configFactory from './platform/config/configuration';

async function bootstrap() {
  const configuration = configFactory();
  const app = await NestFactory.create(AppModule);
  app.use(helmet());
  app.setGlobalPrefix('api');
  app.enableCors({
    origin: configuration.app.frontendOrigin,
    credentials: true,
  });
  app.enableShutdownHooks();

  const swaggerConfig = new DocumentBuilder()
    .setTitle('FUNCH API')
    .setDescription('Customer and admin endpoints for FUNCH car rental.')
    .setVersion('1.0')
    .addCookieAuth(SESSION_COOKIE)
    .build();
  const document = SwaggerModule.createDocument(app, swaggerConfig);
  SwaggerModule.setup('docs', app, document, {
    jsonDocumentUrl: 'docs/json',
  });

  await app.listen(configuration.app.port);
}
void bootstrap();
