import {
  BadRequestException,
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Post,
  Query,
  Req,
  Res,
  UploadedFile,
  UseGuards,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { ApiBody, ApiConsumes, ApiQuery } from '@nestjs/swagger';
import { memoryStorage } from 'multer';
import type { Response } from 'express';
import { Roles } from '../auth/decorators/auth.decorators';
import { RoleGuard } from '../auth/guards/role.guard';
import { SessionAuthGuard } from '../auth/guards/session-auth.guard';
import { UserRole } from '../auth/enums/user-role.enum';
import type { AuthenticatedRequest } from '../auth/types/auth.types';
import { FilesService, maxFileBytes } from './files.service';
import { FileIdParams, GalleryDto } from './dto/files.dto';

@Controller('admin')
@UseGuards(SessionAuthGuard, RoleGuard)
@Roles(UserRole.ADMIN)
export class FilesController {
  constructor(private readonly files: FilesService) {}

  @Get('files') list() {
    return this.files.listPublic();
  }

  @Post('files')
  @ApiConsumes('multipart/form-data')
  @ApiQuery({ name: 'visibility', enum: ['PUBLIC', 'PRIVATE'] })
  @ApiBody({
    schema: {
      type: 'object',
      required: ['file'],
      properties: { file: { type: 'string', format: 'binary' } },
    },
  })
  @UseInterceptors(
    FileInterceptor('file', {
      storage: memoryStorage(),
      limits: { fileSize: maxFileBytes, files: 1 },
    }),
  )
  upload(
    @UploadedFile() file: Express.Multer.File | undefined,
    @Query('visibility') visibility: string,
    @Req() request: AuthenticatedRequest,
  ) {
    if (visibility !== 'PUBLIC' && visibility !== 'PRIVATE')
      throw new BadRequestException('Visibility must be PUBLIC or PRIVATE');
    return this.files.upload(file, request.authUser!.id, visibility);
  }

  @Get('files/:id/signed-get')
  async signed(
    @Param() { id }: FileIdParams,
    @Res({ passthrough: true }) response: Response,
  ) {
    response.setHeader('Cache-Control', 'no-store');
    return this.files.signedGet(id);
  }

  @Delete('files/:id') delete(@Param() { id }: FileIdParams) {
    return this.files.delete(id);
  }

  @Post('fleet/car-types/:id/images')
  gallery(@Param() { id }: FileIdParams, @Body() body: GalleryDto) {
    return this.files.setGallery(id, body.imageFileIds);
  }
}
