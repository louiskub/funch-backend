import { Injectable, Module, OnApplicationShutdown } from '@nestjs/common';
import { DataSource } from 'typeorm';
import { createAppDataSource } from './database/typeorm-data-source';
import { StorageModule } from './storage/storage.module';

@Injectable()
class DataSourceShutdown implements OnApplicationShutdown {
  constructor(private readonly dataSource: DataSource) {}

  async onApplicationShutdown() {
    if (this.dataSource.isInitialized) await this.dataSource.destroy();
  }
}

@Module({
  providers: [
    {
      provide: DataSource,
      useFactory: () => createAppDataSource().initialize(),
    },
    DataSourceShutdown,
  ],
  imports: [StorageModule],
  exports: [DataSource, StorageModule],
})
export class PlatformModule {}
