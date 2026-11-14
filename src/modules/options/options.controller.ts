import {
  Body,
  Controller,
  Get,
  Param,
  Patch,
  Post,
  UseGuards,
} from '@nestjs/common';
import { ApiCookieAuth } from '@nestjs/swagger';
import { Roles } from '../auth/decorators/auth.decorators';
import { RoleGuard } from '../auth/guards/role.guard';
import { SessionAuthGuard } from '../auth/guards/session-auth.guard';
import { UserRole } from '../auth/enums/user-role.enum';
import {
  BranchOptionParams,
  CreateOptionDto,
  OptionIdParams,
  UpdateOptionDto,
} from './dto/options.dto';
import { OptionsService } from './options.service';

@Controller()
export class OptionsController {
  constructor(private readonly options: OptionsService) {}

  @Get('branches/:branchId/options')
  publicOptions(@Param() { branchId }: BranchOptionParams) {
    return this.options.publicForBranch(branchId);
  }

  @Get('admin/options/branches')
  @ApiCookieAuth()
  @UseGuards(SessionAuthGuard, RoleGuard)
  @Roles(UserRole.ADMIN)
  branches() {
    return this.options.branches();
  }

  @Get('admin/options/branches/:branchId')
  @ApiCookieAuth()
  @UseGuards(SessionAuthGuard, RoleGuard)
  @Roles(UserRole.ADMIN)
  adminOptions(@Param() { branchId }: BranchOptionParams) {
    return this.options.adminForBranch(branchId);
  }

  @Post('admin/options')
  @ApiCookieAuth()
  @UseGuards(SessionAuthGuard, RoleGuard)
  @Roles(UserRole.ADMIN)
  create(@Body() input: CreateOptionDto) {
    return this.options.create(input);
  }

  @Patch('admin/options/:optionId')
  @ApiCookieAuth()
  @UseGuards(SessionAuthGuard, RoleGuard)
  @Roles(UserRole.ADMIN)
  update(
    @Param() { optionId }: OptionIdParams,
    @Body() input: UpdateOptionDto,
  ) {
    return this.options.update(optionId, input);
  }
}
