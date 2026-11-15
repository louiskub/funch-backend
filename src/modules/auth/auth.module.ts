import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { PlatformModule } from '../../platform/platform.module';
import { AppUser } from './entities/app-user.entity';
import { UserSession } from './entities/user-session.entity';
import { AuthController } from './auth.controller';
import { RoleGuard } from './guards/role.guard';
import { SessionAuthGuard } from './guards/session-auth.guard';
import { AuthService } from './auth.service';
import { PasswordService } from './services/password.service';

@Module({
  imports: [PlatformModule, TypeOrmModule.forFeature([AppUser, UserSession])],
  controllers: [AuthController],
  providers: [AuthService, PasswordService, SessionAuthGuard, RoleGuard],
  exports: [SessionAuthGuard, RoleGuard, PasswordService, TypeOrmModule],
})
export class AuthModule {}
