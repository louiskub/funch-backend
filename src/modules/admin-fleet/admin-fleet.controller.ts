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
  CarDto,
  CarTypeDto,
  FleetTimelineQueryDto,
  IdParams,
  OfferDto,
  UpdateCarDto,
  UpdateCarTypeDto,
  UpdateOfferDto,
} from './dto/admin-fleet.dto';
import { AdminFleetService } from './admin-fleet.service';

@Controller('admin/fleet')
@UseGuards(SessionAuthGuard, RoleGuard)
@Roles(UserRole.ADMIN)
export class AdminFleetController {
  constructor(private readonly fleet: AdminFleetService) {}

  @Get('branches') branches() {
    return this.fleet.branches();
  }
  @Get('timeline') fleetTimeline(@Query() query: FleetTimelineQueryDto) {
    return this.fleet.fleetTimeline(query);
  }
  @Get('car-types') carTypes() {
    return this.fleet.carTypes();
  }
  @Post('car-types') createCarType(@Body() body: CarTypeDto) {
    return this.fleet.createCarType(body);
  }
  @Patch('car-types/:id') updateCarType(
    @Param() { id }: IdParams,
    @Body() body: UpdateCarTypeDto,
  ) {
    return this.fleet.updateCarType(id, body);
  }
  @Get('offers') offers() {
    return this.fleet.offers();
  }
  @Post('offers') createOffer(@Body() body: OfferDto) {
    return this.fleet.createOffer(body);
  }
  @Patch('offers/:id') updateOffer(
    @Param() { id }: IdParams,
    @Body() body: UpdateOfferDto,
  ) {
    return this.fleet.updateOffer(id, body);
  }
  @Get('cars') cars() {
    return this.fleet.cars();
  }
  @Get('cars/:id/history') carHistory(@Param() { id }: IdParams) {
    return this.fleet.carHistory(id);
  }
  @Post('cars') createCar(@Body() body: CarDto) {
    return this.fleet.createCar(body);
  }
  @Patch('cars/:id') updateCar(
    @Param() { id }: IdParams,
    @Body() body: UpdateCarDto,
  ) {
    return this.fleet.updateCar(id, body);
  }
  @Delete('cars/:id') deleteCar(@Param() { id }: IdParams) {
    return this.fleet.deleteCar(id);
  }
}
