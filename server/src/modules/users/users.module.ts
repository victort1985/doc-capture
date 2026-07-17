import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { User } from './entities/user.entity';
import { UserGroup } from './entities/user-group.entity';
import { UsersService } from './users.service';
import { UsersController } from './users.controller';
import { GroupsService } from './groups.service';
import { GroupsController } from './groups.controller';
import { LocationsModule } from '../locations/locations.module';
import { OrganizationsModule } from '../organizations/organizations.module';

@Module({
  imports: [TypeOrmModule.forFeature([User, UserGroup]), LocationsModule, OrganizationsModule],
  controllers: [UsersController, GroupsController],
  providers: [UsersService, GroupsService],
  exports: [UsersService],
})
export class UsersModule {}
