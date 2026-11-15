import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { PlatformModule } from '../../platform/platform.module';
import { AuthModule } from '../auth/auth.module';
import { CarType } from '../admin-fleet/entities/car-type.entity';
import { FileAsset } from './entities/file-asset.entity';
import { FilesController } from './files.controller';
import { FilesService } from './files.service';

@Module({
  imports: [
    AuthModule,
    PlatformModule,
    TypeOrmModule.forFeature([FileAsset, CarType]),
  ],
  controllers: [FilesController],
  providers: [FilesService],
})
export class FilesModule {}
