import { Injectable } from '@nestjs/common';
import { Client } from 'minio';
import configFactory from '../config/configuration';

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
  private readonly configuration = configFactory();
  readonly bucket = this.configuration.storage.bucket;
  readonly publicEndpoint = this.configuration.storage.publicEndpoint;
  private readonly credentials = {
    accessKey: this.configuration.storage.accessKey,
    secretKey: this.configuration.storage.secretKey,
  };
  readonly client = new Client({
    ...endpoint(this.configuration.storage.endpoint),
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
