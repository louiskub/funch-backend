import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { PlatformModule } from '../../platform/platform.module';
import { AuthModule } from '../auth/auth.module';
import { Branch } from '../catalog/entities/branch.entity';
import { CarOption } from './entities/car-option.entity';
import { OptionsController } from './options.controller';
import { OptionsService } from './options.service';

@Module({
  imports: [
    AuthModule,
    PlatformModule,
    TypeOrmModule.forFeature([CarOption, Branch]),
  ],
  controllers: [OptionsController],
  providers: [OptionsService],
})
export class OptionsModule {}
