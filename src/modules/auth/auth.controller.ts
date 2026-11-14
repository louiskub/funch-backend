import {
  Body,
  Controller,
  Get,
  Patch,
  Post,
  Req,
  Res,
  UseGuards,
  UsePipes,
  ValidationPipe,
} from '@nestjs/common';
import type { Request, Response } from 'express';
import { AuthService } from './auth.service';
import { LoginDto, RegisterDto, UpdateProfileDto } from './dto/auth.dto';
import type { AuthenticatedRequest } from './auth.types';
import { SESSION_COOKIE, SessionGuard } from './auth.guards';
import { StateChangeOriginGuard } from '../../common/guards/state-change-origin.guard';
import configFactory from '../../platform/config/configuration';

const cookieOptions = () => ({
  httpOnly: true,
  sameSite: 'lax' as const,
  secure: configFactory().app.env === 'production',
  path: '/',
});

function cookieToken(request: Request): string | undefined {
  const entry = request.headers.cookie
    ?.split(';')
    .map((part) => part.trim())
    .find((part) => part.startsWith(`${SESSION_COOKIE}=`));
  const token = entry?.slice(SESSION_COOKIE.length + 1);
  return token && /^[A-Za-z0-9_-]{43}$/.test(token) ? token : undefined;
}

@Controller('auth')
@UsePipes(
  new ValidationPipe({
    transform: true,
    whitelist: true,
    forbidNonWhitelisted: true,
  }),
)
@UseGuards(StateChangeOriginGuard)
export class AuthController {
  constructor(private readonly auth: AuthService) {}

  @Post('register')
  async register(
    @Body() input: RegisterDto,
    @Res({ passthrough: true }) response: Response,
  ) {
    const session = await this.auth.register(input);
    response.cookie(SESSION_COOKIE, session.token, {
      ...cookieOptions(),
      expires: session.expiresAt,
    });
    return { user: session.user };
  }

  @Post('login')
  async login(
    @Body() input: LoginDto,
    @Res({ passthrough: true }) response: Response,
  ) {
    const session = await this.auth.login(input);
    response.cookie(SESSION_COOKIE, session.token, {
      ...cookieOptions(),
      expires: session.expiresAt,
    });
    return { user: session.user };
  }

  @Post('logout')
  async logout(
    @Req() request: Request,
    @Res({ passthrough: true }) response: Response,
  ) {
    await this.auth.logout(cookieToken(request));
    response.clearCookie(SESSION_COOKIE, cookieOptions());
    return { ok: true };
  }

  @Get('me')
  @UseGuards(SessionGuard)
  me(@Req() request: AuthenticatedRequest) {
    return { user: request.authUser };
  }

  @Patch('me')
  @UseGuards(SessionGuard)
  async updateProfile(
    @Req() request: AuthenticatedRequest,
    @Body() input: UpdateProfileDto,
  ) {
    if (!request.authUser)
      throw new Error('Session guard did not attach an account');
    return { user: await this.auth.updateProfile(request.authUser.id, input) };
  }
}
