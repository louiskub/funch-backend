import { Module } from '@nestjs/common';
import { PlatformModule } from '../../platform/platform.module';
import { CatalogController } from './catalog.controller';
import { CatalogService } from './catalog.service';

@Module({
  imports: [PlatformModule],
  controllers: [CatalogController],
  providers: [CatalogService],
})
export class CatalogModule {}
