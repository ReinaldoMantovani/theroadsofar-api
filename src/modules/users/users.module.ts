import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { User } from './entities/user.entity';
import { UserProfile } from './entities/user-profile.entity';
import { UsersService } from './users.service';
import { UsersController } from './users.controller';
import { AvatarService } from './avatar.service';

@Module({
  imports: [TypeOrmModule.forFeature([User, UserProfile])],
  controllers: [UsersController],
  providers: [UsersService, AvatarService],
  exports: [UsersService, TypeOrmModule],
})
export class UsersModule {}
