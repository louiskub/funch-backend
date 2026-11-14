import { IsArray, IsUUID } from 'class-validator';

export class GalleryDto {
  @IsArray()
  @IsUUID('all', { each: true })
  imageFileIds!: string[];
}

export class FileIdParams {
  @IsUUID()
  id!: string;
}
