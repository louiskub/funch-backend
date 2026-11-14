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
  UsePipes,
  ValidationPipe,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { memoryStorage } from 'multer';
import type { Response } from 'express';
import { Roles } from '../auth/auth.decorators';
import { RolesGuard, SessionGuard } from '../auth/auth.guards';
import { UserRole } from '../auth/enums/user-role.enum';
import type { AuthenticatedRequest } from '../auth/auth.types';
import { StateChangeOriginGuard } from '../../common/guards/state-change-origin.guard';
import { FilesService, maxFileBytes } from './files.service';
import { FileIdParams, GalleryDto } from './dto/files.dto';

@Controller('admin')
@UseGuards(SessionGuard, RolesGuard, StateChangeOriginGuard)
@Roles(UserRole.ADMIN)
@UsePipes(
  new ValidationPipe({
    transform: true,
    whitelist: true,
    forbidNonWhitelisted: true,
  }),
)
export class FilesController {
  constructor(private readonly files: FilesService) {}

  @Get('files') list() {
    return this.files.listPublic();
  }

  @Post('files')
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
