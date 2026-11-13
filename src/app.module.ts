import { Module } from '@nestjs/common';
import { AppController } from './app.controller';
import { AppService } from './app.service';
import { DatabaseService } from './database.service';
import { CatalogController } from './catalog.controller';
import { CatalogService } from './catalog.service';

@Module({
  imports: [],
  controllers: [AppController, CatalogController],
  providers: [AppService, DatabaseService, CatalogService],
})
export class AppModule {}
