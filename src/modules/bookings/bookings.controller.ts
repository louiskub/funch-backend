import {
  Body,
  Controller,
  Get,
  Param,
  Patch,
  ParseUUIDPipe,
  Post,
  Query,
  Req,
  Res,
  UseGuards,
} from '@nestjs/common';
import type { Response } from 'express';
import type { AuthenticatedRequest } from '../auth/types/auth.types';
import { RoleGuard } from '../auth/guards/role.guard';
import { SessionAuthGuard } from '../auth/guards/session-auth.guard';
import { Roles } from '../auth/decorators/auth.decorators';
import { UserRole } from '../auth/enums/user-role.enum';
import { SESSION_COOKIE } from '../auth/constants/session.constants';
import {
  CheckoutInput,
  QuoteInput,
  BookingEditQuoteInput,
  ConfirmBookingEditInput,
  ReasonInput,
  PickupInput,
  AddChargeInput,
  ReportFilterInput,
  SuspensionInput,
  ReturnInput,
} from './dto/booking.dto';
import { BookingsService } from './bookings.service';

@Controller()
export class BookingsController {
  constructor(private readonly bookings: BookingsService) {}

  @Post('bookings/quote') quote(@Body() input: QuoteInput) {
    return this.bookings.quote(input);
  }

  @Post('bookings')
  @UseGuards(SessionAuthGuard)
  checkout(@Req() request: AuthenticatedRequest, @Body() input: CheckoutInput) {
    return this.bookings.checkout(input, request.authUser);
  }

  @Post('bookings/register-checkout')
  async registerCheckout(
    @Body() input: CheckoutInput,
    @Res({ passthrough: true }) response: Response,
  ) {
    const result = await this.bookings.checkout(input);
    if (result.sessionToken) {
      response.cookie(SESSION_COOKIE, result.sessionToken, {
        httpOnly: true,
        sameSite: 'lax',
        secure: process.env.NODE_ENV === 'production',
        path: '/',
        maxAge: 14 * 24 * 60 * 60 * 1000,
      });
      const { sessionToken, ...booking } = result;
      void sessionToken;
      return booking;
    }
    return result;
  }

  @Get('bookings/me')
  @UseGuards(SessionAuthGuard)
  mine(
    @Req() request: AuthenticatedRequest,
    @Query('page') page?: string,
    @Query('pageSize') pageSize?: string,
  ) {
    return this.bookings.mine(request.authUser!.id, page, pageSize);
  }

  @Get('bookings/:id')
  @UseGuards(SessionAuthGuard)
  get(
    @Param('id', new ParseUUIDPipe()) id: string,
    @Req() request: AuthenticatedRequest,
  ) {
    return this.bookings.get(id, request.authUser!);
  }

  @Post('bookings/:id/edit-quote')
  @UseGuards(SessionAuthGuard)
  editQuote(
    @Param('id', new ParseUUIDPipe()) id: string,
    @Body() input: BookingEditQuoteInput,
    @Req() request: AuthenticatedRequest,
  ) {
    return this.bookings.previewEdit(id, input, request.authUser!);
  }

  @Post('bookings/:id/edit')
  @UseGuards(SessionAuthGuard)
  edit(
    @Param('id', new ParseUUIDPipe()) id: string,
    @Body() input: ConfirmBookingEditInput,
    @Req() request: AuthenticatedRequest,
  ) {
    return this.bookings.confirmEdit(id, input, request.authUser!);
  }

  @Post('bookings/:id/cancel')
  @UseGuards(SessionAuthGuard)
  cancel(
    @Param('id', new ParseUUIDPipe()) id: string,
    @Req() request: AuthenticatedRequest,
  ) {
    return this.bookings.cancel(id, request.authUser!);
  }

  @Get('admin/bookings')
  @UseGuards(SessionAuthGuard, RoleGuard)
  @Roles(UserRole.ADMIN)
  queue(
    @Query('status') status?: string,
    @Query('branchId') branchId?: string,
    @Query('query') query?: string,
    @Query('page') page?: string,
    @Query('pageSize') pageSize?: string,
  ) {
    return this.bookings.queue({
      status,
      branchId,
      query,
      ...(page !== undefined ? { page: Number(page) } : {}),
      ...(pageSize !== undefined ? { pageSize: Number(pageSize) } : {}),
    });
  }

  @Post('admin/bookings/:id/approve')
  @UseGuards(SessionAuthGuard, RoleGuard)
  @Roles(UserRole.ADMIN)
  approve(
    @Param('id', new ParseUUIDPipe()) id: string,
    @Req() request: AuthenticatedRequest,
  ) {
    return this.bookings.approve(id, request.authUser!);
  }

  @Post('admin/bookings/:id/reject')
  @UseGuards(SessionAuthGuard, RoleGuard)
  @Roles(UserRole.ADMIN)
  reject(
    @Param('id', new ParseUUIDPipe()) id: string,
    @Body() input: ReasonInput,
  ) {
    return this.bookings.reject(id, input.reason);
  }

  @Post('admin/bookings/:id/cancel')
  @UseGuards(SessionAuthGuard, RoleGuard)
  @Roles(UserRole.ADMIN)
  adminCancel(
    @Param('id', new ParseUUIDPipe()) id: string,
    @Body() input: ReasonInput,
    @Req() request: AuthenticatedRequest,
  ) {
    return this.bookings.cancel(id, request.authUser!, input.reason);
  }

  @Post('admin/bookings/:id/pickup')
  @UseGuards(SessionAuthGuard, RoleGuard)
  @Roles(UserRole.ADMIN)
  pickup(
    @Param('id', new ParseUUIDPipe()) id: string,
    @Body() input: PickupInput,
  ) {
    return this.bookings.pickup(id, input.carId);
  }

  @Get('admin/bookings/:id/cars')
  @UseGuards(SessionAuthGuard, RoleGuard)
  @Roles(UserRole.ADMIN)
  pickupCars(@Param('id', new ParseUUIDPipe()) id: string) {
    return this.bookings.pickupCars(id);
  }

  @Get('admin/bookings/:id/return-preview')
  @UseGuards(SessionAuthGuard, RoleGuard)
  @Roles(UserRole.ADMIN)
  returnPreview(@Param('id', new ParseUUIDPipe()) id: string) {
    return this.bookings.returnPreview(id);
  }

  @Post('admin/bookings/:id/return')
  @UseGuards(SessionAuthGuard, RoleGuard)
  @Roles(UserRole.ADMIN)
  returnCar(
    @Param('id', new ParseUUIDPipe()) id: string,
    @Req() request: AuthenticatedRequest,
    @Body() input: ReturnInput,
  ) {
    return this.bookings.completeReturn(
      id,
      request.authUser!,
      input.charges ?? [],
    );
  }

  @Post('admin/bookings/:id/confirm-return')
  @UseGuards(SessionAuthGuard, RoleGuard)
  @Roles(UserRole.ADMIN)
  confirmReturn(@Param('id', new ParseUUIDPipe()) id: string) {
    return this.bookings.confirmReturn(id);
  }

  @Post('admin/bookings/:id/ready')
  @UseGuards(SessionAuthGuard, RoleGuard)
  @Roles(UserRole.ADMIN)
  markReady(
    @Param('id', new ParseUUIDPipe()) id: string,
    @Req() request: AuthenticatedRequest,
  ) {
    return this.bookings.markReady(id, request.authUser!);
  }

  @Post('admin/bookings/:id/charges')
  @UseGuards(SessionAuthGuard, RoleGuard)
  @Roles(UserRole.ADMIN)
  addCharge(
    @Param('id', new ParseUUIDPipe()) id: string,
    @Req() request: AuthenticatedRequest,
    @Body() input: AddChargeInput,
  ) {
    return this.bookings.addCharge(id, request.authUser!, input);
  }

  @Post('admin/bookings/:id/charges/:chargeId/:status')
  @UseGuards(SessionAuthGuard, RoleGuard)
  @Roles(UserRole.ADMIN)
  chargeStatus(
    @Param('id', new ParseUUIDPipe()) id: string,
    @Param('chargeId', new ParseUUIDPipe()) chargeId: string,
    @Param('status') status: string,
  ) {
    return this.bookings.chargeStatus(
      id,
      chargeId,
      status === 'confirm'
        ? 'CONFIRMED'
        : status === 'waive'
          ? 'WAIVED'
          : status,
    );
  }

  @Get('admin/reports/bookings')
  @UseGuards(SessionAuthGuard, RoleGuard)
  @Roles(UserRole.ADMIN)
  reports(@Query() input: ReportFilterInput) {
    return this.bookings.reports(input);
  }

  @Get('admin/members')
  @UseGuards(SessionAuthGuard, RoleGuard)
  @Roles(UserRole.ADMIN)
  members(
    @Query('query') query?: string,
    @Query('status') status?: string,
    @Query('page') page?: string,
    @Query('pageSize') pageSize?: string,
  ) {
    return this.bookings.members(query, status, page, pageSize);
  }

  @Get('admin/members/:id')
  @UseGuards(SessionAuthGuard, RoleGuard)
  @Roles(UserRole.ADMIN)
  member(@Param('id', new ParseUUIDPipe()) id: string) {
    return this.bookings.member(id);
  }

  @Patch('admin/members/:id/suspension')
  @UseGuards(SessionAuthGuard, RoleGuard)
  @Roles(UserRole.ADMIN)
  suspension(
    @Param('id', new ParseUUIDPipe()) id: string,
    @Body() input: SuspensionInput,
  ) {
    return this.bookings.suspend(id, input.isSuspended);
  }
}
