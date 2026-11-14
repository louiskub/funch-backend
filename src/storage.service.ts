import { Injectable } from '@nestjs/common';
import { Client } from 'minio';

function config(name: string, fallback?: string): string {
  const value = process.env[name] ?? fallback;
  if (!value) throw new Error(`${name} is required`);
  return value;
}

function endpoint(value: string) {
  const url = new URL(value);
  if (
    !['http:', 'https:'].includes(url.protocol) ||
    url.username ||
    url.password ||
    url.pathname !== '/' ||
    url.search ||
    url.hash
  )
    throw new Error('MinIO endpoints must be HTTP(S) origins without paths');
  return {
    endPoint: url.hostname,
    port: Number(url.port || (url.protocol === 'https:' ? 443 : 80)),
    useSSL: url.protocol === 'https:',
  };
}

@Injectable()
export class StorageService {
  readonly bucket = config('MINIO_BUCKET', 'funch-assets');
  readonly publicEndpoint = config(
    'MINIO_PUBLIC_ENDPOINT',
    'http://localhost:19000',
  );
  private readonly credentials = {
    accessKey: config('MINIO_ACCESS_KEY', 'funch-app'),
    secretKey: config('MINIO_SECRET_KEY', 'funch-local-secret-change-this'),
  };
  readonly client = new Client({
    ...endpoint(config('MINIO_ENDPOINT', 'http://localhost:19000')),
    ...this.credentials,
  });
  private readonly signingClient = new Client({
    ...endpoint(this.publicEndpoint),
    ...this.credentials,
  });

  put(key: string, bytes: Buffer, mimeType: string) {
    return this.client.putObject(this.bucket, key, bytes, bytes.length, {
      'Content-Type': mimeType,
    });
  }

  remove(key: string) {
    return this.client.removeObject(this.bucket, key);
  }
  presignedGet(key: string) {
    return this.signingClient.presignedGetObject(this.bucket, key, 300);
  }

  publicUrl(key: string) {
    const base = this.publicEndpoint.replace(/\/$/, '');
    return `${base}/${encodeURIComponent(this.bucket)}/${key.split('/').map(encodeURIComponent).join('/')}`;
  }
}
