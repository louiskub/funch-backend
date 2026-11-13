import {
  Body,
  Controller,
  Get,
  Param,
  Patch,
  Post,
  UseGuards,
  UsePipes,
  ValidationPipe,
} from '@nestjs/common';
import { StateChangeOriginGuard } from './auth-origin.guard';
import { Roles } from './auth.decorators';
import { RolesGuard, SessionGuard } from './auth.guards';
import { UserRole } from './auth.types';
import {
  BranchOptionParams,
  CreateOptionDto,
  OptionIdParams,
  UpdateOptionDto,
} from './options.dto';
import { OptionsService } from './options.service';

@Controller()
@UsePipes(
  new ValidationPipe({
    transform: true,
    whitelist: true,
    forbidNonWhitelisted: true,
  }),
)
export class OptionsController {
  constructor(private readonly options: OptionsService) {}

  @Get('branches/:branchId/options')
  publicOptions(@Param() { branchId }: BranchOptionParams) {
    return this.options.publicForBranch(branchId);
  }

  @Get('admin/options/branches')
  @UseGuards(SessionGuard, RolesGuard)
  @Roles(UserRole.ADMIN)
  branches() {
    return this.options.branches();
  }

  @Get('admin/options/branches/:branchId')
  @UseGuards(SessionGuard, RolesGuard)
  @Roles(UserRole.ADMIN)
  adminOptions(@Param() { branchId }: BranchOptionParams) {
    return this.options.adminForBranch(branchId);
  }

  @Post('admin/options')
  @UseGuards(SessionGuard, RolesGuard, StateChangeOriginGuard)
  @Roles(UserRole.ADMIN)
  create(@Body() input: CreateOptionDto) {
    return this.options.create(input);
  }

  @Patch('admin/options/:optionId')
  @UseGuards(SessionGuard, RolesGuard, StateChangeOriginGuard)
  @Roles(UserRole.ADMIN)
  update(
    @Param() { optionId }: OptionIdParams,
    @Body() input: UpdateOptionDto,
  ) {
    return this.options.update(optionId, input);
  }
}
