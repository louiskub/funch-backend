import { Check, Column, Entity, Index } from 'typeorm';
import { BaseEntity } from '../../../common/entities/base.entity';
import { FileVisibility } from '../enums/file-visibility.enum';

@Entity({ name: 'file_asset' })
@Index('file_asset_uploaded_by_idx', ['uploadedBy'])
@Check('file_asset_size_check', 'size_bytes > 0')
export class FileAsset extends BaseEntity {
  @Column({ name: 'object_key', type: 'text', unique: true })
  objectKey!: string;
  @Column({ name: 'original_name', type: 'text' }) originalName!: string;
  @Column({ name: 'mime_type', type: 'text' }) mimeType!: string;
  @Column({
    name: 'size_bytes',
    type: 'bigint',
    transformer: {
      to: (value: number) => value,
      from: (value: string) => Number(value),
    },
  })
  sizeBytes!: number;
  @Column({
    type: 'enum',
    enum: FileVisibility,
    default: FileVisibility.PUBLIC,
  })
  visibility!: FileVisibility;
  @Column({ name: 'uploaded_by', type: 'uuid' }) uploadedBy!: string;
}
