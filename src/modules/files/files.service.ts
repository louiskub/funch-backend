import {
  BadRequestException,
  ConflictException,
  Injectable,
  InternalServerErrorException,
  NotFoundException,
} from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import { DataSource } from 'typeorm';
import { StorageService } from '../../platform/storage/storage.service';
import sharp from 'sharp';

export const maxFileBytes = 10 * 1024 * 1024;
const raster = [
  { mime: 'image/jpeg', ext: 'jpg', starts: [0xff, 0xd8, 0xff] },
  {
    mime: 'image/png',
    ext: 'png',
    starts: [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a],
  },
  { mime: 'image/gif', ext: 'gif', starts: [0x47, 0x49, 0x46, 0x38] },
] as const;

export function imageType(bytes: Buffer): { mime: string; ext: string } {
  const match = raster.find(({ starts }) =>
    starts.every((byte, index) => bytes[index] === byte),
  );
  if (match) return match;
  if (
    bytes.length >= 12 &&
    bytes.toString('ascii', 0, 4) === 'RIFF' &&
    bytes.toString('ascii', 8, 12) === 'WEBP'
  )
    return { mime: 'image/webp', ext: 'webp' };
  throw new BadRequestException(
    'Upload must contain a JPEG, PNG, GIF, or WebP image',
  );
}

type FileAssetRow = {
  id: string;
  originalName: string;
  mimeType: string;
  sizeBytes: string | number;
  visibility: string;
  objectKey: string;
};

function asset(row: FileAssetRow, storage: StorageService) {
  return {
    id: row.id,
    originalName: row.originalName,
    mimeType: row.mimeType,
    sizeBytes: Number(row.sizeBytes),
    visibility: row.visibility,
    ...(row.visibility === 'PUBLIC'
      ? { url: storage.publicUrl(row.objectKey) }
      : {}),
  };
}

@Injectable()
export class FilesService {
  constructor(
    private readonly dataSource: DataSource,
    private readonly storage: StorageService,
  ) {}

  async upload(
    file: Express.Multer.File | undefined,
    userId: string,
    visibility: 'PUBLIC' | 'PRIVATE',
  ) {
    if (!file?.buffer?.length || file.buffer.length > maxFileBytes)
      throw new BadRequestException('Image must be between 1 byte and 10 MB');
    const type = imageType(file.buffer);
    try {
      const image = sharp(file.buffer, { limitInputPixels: 40_000_000 });
      const metadata = await image.metadata();
      if (metadata.format !== (type.ext === 'jpg' ? 'jpeg' : type.ext))
        throw new BadRequestException(
          'Image content does not match its file signature',
        );
      await image.stats();
    } catch (error) {
      if (error instanceof BadRequestException) throw error;
      throw new BadRequestException(
        'Upload is not a complete, decodable image',
      );
    }
    const id = randomUUID();
    const key = `${visibility === 'PUBLIC' ? 'public' : 'private'}/${id}.${type.ext}`;
    try {
      await this.storage.put(key, file.buffer, type.mime);
    } catch (error) {
      try {
        await this.storage.remove(key);
      } catch (cleanupError) {
        throw new InternalServerErrorException(
          'Object upload and immediate cleanup failed; run orphan cleanup',
          { cause: new AggregateError([error, cleanupError]) },
        );
      }
      throw error;
    }
    try {
      const result = await this.dataSource
        .createQueryBuilder()
        .insert()
        .into('file_asset')
        .values({
          id,
          object_key: key,
          original_name:
            file.originalname.replace(/^.*[\\/]/, '').slice(0, 255) || 'image',
          mime_type: type.mime,
          size_bytes: file.buffer.length,
          visibility,
          uploaded_by: userId,
        })
        .returning(
          'id, original_name AS "originalName", mime_type AS "mimeType", size_bytes AS "sizeBytes", visibility, object_key AS "objectKey"',
        )
        .execute();
      return asset(result.raw[0] as FileAssetRow, this.storage);
    } catch (error) {
      try {
        await this.storage.remove(key);
      } catch (cleanupError) {
        throw new InternalServerErrorException(
          'Upload metadata and immediate cleanup failed; run orphan cleanup',
          { cause: new AggregateError([error, cleanupError]) },
        );
      }
      throw error;
    }
  }

  async listPublic() {
    const rows = await this.dataSource
      .createQueryBuilder()
      .select([
        'f.id AS id',
        'f.original_name AS "originalName"',
        'f.mime_type AS "mimeType"',
        'f.size_bytes AS "sizeBytes"',
        'f.visibility AS visibility',
        'f.object_key AS "objectKey"',
      ])
      .from('file_asset', 'f')
      .where('f.visibility = :visibility', { visibility: 'PUBLIC' })
      .orderBy('f.created_at', 'DESC')
      .getRawMany<FileAssetRow>();
    return rows.map((row) => asset(row, this.storage));
  }

  async signedGet(id: string) {
    const file = await this.dataSource
      .createQueryBuilder()
      .select(['f.object_key AS "objectKey"', 'f.visibility AS visibility'])
      .from('file_asset', 'f')
      .where('f.id = :id', { id })
      .getRawOne<{ objectKey: string; visibility: string }>();
    if (!file) throw new NotFoundException('File not found');
    if (file.visibility !== 'PRIVATE')
      throw new BadRequestException('Only private files use signed downloads');
    return {
      url: await this.storage.presignedGet(file.objectKey),
      expiresAt: new Date(Date.now() + 300_000).toISOString(),
    };
  }

  async delete(id: string) {
    const file = await this.dataSource.transaction(async (manager) => {
      const file = await manager
        .createQueryBuilder()
        .select('f.object_key', 'objectKey')
        .from('file_asset', 'f')
        .where('f.id = :id', { id })
        .setLock('pessimistic_write')
        .getRawOne<{ objectKey: string }>();
      if (!file) throw new NotFoundException('File not found');
      const references = await manager
        .createQueryBuilder()
        .select('t.id')
        .from('car_type', 't')
        .where('t.image_file_ids @> ARRAY[:id]::uuid[]', { id })
        .limit(1)
        .getRawMany();
      if (references.length)
        throw new ConflictException(
          'Remove this image from every gallery before deleting it',
        );
      await manager
        .createQueryBuilder()
        .delete()
        .from('file_asset')
        .where('id = :id', { id })
        .execute();
      return file;
    });
    try {
      await this.storage.remove(file.objectKey);
    } catch (error) {
      throw new InternalServerErrorException(
        'File metadata was deleted; run orphan cleanup to retry',
        { cause: error },
      );
    }
    return { deleted: true };
  }

  async setGallery(carTypeId: string, ids: string[]) {
    if (new Set(ids).size !== ids.length)
      throw new BadRequestException('Gallery image IDs must be unique');
    return this.dataSource.transaction(async (manager) => {
      const type = await manager
        .createQueryBuilder()
        .select('t.image_file_ids', 'imageFileIds')
        .from('car_type', 't')
        .where('t.id = :carTypeId', { carTypeId })
        .setLock('pessimistic_write')
        .getRawOne<{ imageFileIds: string[] }>();
      if (!type) throw new NotFoundException('Car type not found');
      const lockedIds = [...new Set([...type.imageFileIds, ...ids])].sort();
      if (lockedIds.length) {
        const files = await manager
          .createQueryBuilder()
          .select([
            'f.id AS id',
            'f.visibility AS visibility',
            'f.mime_type AS "mimeType"',
          ])
          .from('file_asset', 'f')
          .where('f.id IN (:...lockedIds)', { lockedIds })
          .orderBy('f.id')
          .setLock('pessimistic_write')
          .getRawMany<{ id: string; visibility: string; mimeType: string }>();
        if (files.length !== lockedIds.length)
          throw new BadRequestException('Gallery contains an unknown image');
        if (
          files.some(
            (file) =>
              file.visibility !== 'PUBLIC' ||
              !file.mimeType.startsWith('image/'),
          )
        )
          throw new BadRequestException(
            'Only public images can be added to a gallery',
          );
      }
      const result = await manager
        .createQueryBuilder()
        .update('car_type')
        .set({ image_file_ids: ids, updated_at: () => 'now()' })
        .where('id = :carTypeId', { carTypeId })
        .returning('id, image_file_ids AS "imageFileIds"')
        .execute();
      return result.raw[0] as { id: string; imageFileIds: string[] };
    });
  }
}
