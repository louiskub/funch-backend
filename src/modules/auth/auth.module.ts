import { Module } from '@nestjs/common';
import { PlatformModule } from '../../platform/platform.module';
import { AuthController } from './auth.controller';
import { RoleGuard } from './guards/role.guard';
import { SessionAuthGuard } from './guards/session-auth.guard';
import { AuthService } from './auth.service';
import { PasswordService } from './services/password.service';

@Module({
  imports: [PlatformModule],
  controllers: [AuthController],
  providers: [AuthService, PasswordService, SessionAuthGuard, RoleGuard],
  exports: [SessionAuthGuard, RoleGuard, PasswordService],
})
export class AuthModule {}
