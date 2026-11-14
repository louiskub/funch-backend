import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';
import configFactory from './platform/config/configuration';

async function bootstrap() {
  const configuration = configFactory();
  const app = await NestFactory.create(AppModule);
  app.setGlobalPrefix('api');
  app.enableCors({
    origin: configuration.app.frontendOrigin,
    credentials: true,
  });
  await app.listen(configuration.app.port);
}
void bootstrap();
