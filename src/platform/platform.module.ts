import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { createAppDataSource } from './database/typeorm-data-source';
import { StorageModule } from './storage/storage.module';

@Module({
  imports: [
    TypeOrmModule.forRootAsync({
      useFactory: () => createAppDataSource().options,
    }),
    StorageModule,
  ],
  exports: [TypeOrmModule, StorageModule],
})
export class PlatformModule {}
