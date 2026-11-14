import { Module } from '@nestjs/common';
import { PlatformModule } from '../../platform/platform.module';
import { AuthModule } from '../auth/auth.module';
import { FilesController } from './files.controller';
import { FilesService } from './files.service';

@Module({
  imports: [AuthModule, PlatformModule],
  controllers: [FilesController],
  providers: [FilesService],
})
export class FilesModule {}
