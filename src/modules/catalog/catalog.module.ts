import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { PlatformModule } from '../../platform/platform.module';
import { CarTypeBranch } from '../admin-fleet/entities/car-type-branch.entity';
import { Branch } from './entities/branch.entity';
import { Country } from './entities/country.entity';
import { CatalogController } from './catalog.controller';
import { CatalogService } from './catalog.service';

@Module({
  imports: [
    PlatformModule,
    TypeOrmModule.forFeature([CarTypeBranch, Branch, Country]),
  ],
  controllers: [CatalogController],
  providers: [CatalogService],
})
export class CatalogModule {}
