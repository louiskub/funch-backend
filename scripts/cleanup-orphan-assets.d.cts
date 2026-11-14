import type { Client as MinioClient } from 'minio';

export function cleanOrphans(args: {
  db: { query: () => Promise<{ rows: { object_key: string }[] }> };
  client: MinioClient;
  bucketName: string;
  cutoff: number;
}): Promise<string[]>;
