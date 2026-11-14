import { Module } from '@nestjs/common';
import { CommonModule } from '../../common/common.module';
import { PlatformModule } from '../../platform/platform.module';
import { AuthModule } from '../auth/auth.module';
import { FilesController } from './files.controller';
import { FilesService } from './files.service';

@Module({
  imports: [AuthModule, CommonModule, PlatformModule],
  controllers: [FilesController],
  providers: [FilesService],
})
export class FilesModule {}
