import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Patch,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import { Roles } from '../auth/decorators/auth.decorators';
import { RoleGuard } from '../auth/guards/role.guard';
import { SessionAuthGuard } from '../auth/guards/session-auth.guard';
import { UserRole } from '../auth/enums/user-role.enum';
import {
  BranchOptionParams,
  CreateOptionDto,
  OptionTimelineDetailQueryDto,
  OptionTimelineQueryDto,
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
  @UseGuards(SessionAuthGuard, RoleGuard)
  @Roles(UserRole.ADMIN)
  branches() {
    return this.options.branches();
  }

  @Get('admin/options/branches/:branchId')
  @UseGuards(SessionAuthGuard, RoleGuard)
  @Roles(UserRole.ADMIN)
  adminOptions(@Param() { branchId }: BranchOptionParams) {
    return this.options.adminForBranch(branchId);
  }

  @Get('admin/options/timeline')
  @UseGuards(SessionAuthGuard, RoleGuard)
  @Roles(UserRole.ADMIN)
  timeline(@Query() query: OptionTimelineQueryDto) {
    return this.options.timeline(query);
  }

  @Get('admin/options/timeline/details')
  @UseGuards(SessionAuthGuard, RoleGuard)
  @Roles(UserRole.ADMIN)
  timelineDetails(@Query() query: OptionTimelineDetailQueryDto) {
    return this.options.timelineDetails(query);
  }

  @Post('admin/options')
  @UseGuards(SessionAuthGuard, RoleGuard)
  @Roles(UserRole.ADMIN)
  create(@Body() input: CreateOptionDto) {
    return this.options.create(input);
  }

  @Patch('admin/options/:optionId')
  @UseGuards(SessionAuthGuard, RoleGuard)
  @Roles(UserRole.ADMIN)
  update(
    @Param() { optionId }: OptionIdParams,
    @Body() input: UpdateOptionDto,
  ) {
    return this.options.update(optionId, input);
  }

  @Delete('admin/options/:optionId')
  @UseGuards(SessionAuthGuard, RoleGuard)
  @Roles(UserRole.ADMIN)
  delete(@Param() { optionId }: OptionIdParams) {
    return this.options.delete(optionId);
  }
}
