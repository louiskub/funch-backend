import { Module } from '@nestjs/common';
import { CommonModule } from '../../common/common.module';
import { PlatformModule } from '../../platform/platform.module';
import { AuthController } from './auth.controller';
import { SessionGuard, RolesGuard } from './auth.guards';
import { AuthService } from './auth.service';
import { PasswordService } from './password.service';

@Module({
  imports: [CommonModule, PlatformModule],
  controllers: [AuthController],
  providers: [AuthService, PasswordService, SessionGuard, RolesGuard],
  exports: [SessionGuard, RolesGuard],
})
export class AuthModule {}
