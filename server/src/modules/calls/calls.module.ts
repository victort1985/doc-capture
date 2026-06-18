import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ServiceCall } from './entities/service-call.entity';
import { CallNote } from './entities/call-note.entity';
import { CallAttachment } from './entities/call-attachment.entity';
import { CallsService } from './calls.service';
import { CallsController } from './calls.controller';
import { StorageModule } from '../storage/storage.module';
import { UsersModule } from '../users/users.module';
import { NotificationsModule } from '../notifications/notifications.module';

@Module({
  imports: [
    TypeOrmModule.forFeature([ServiceCall, CallNote, CallAttachment]),
    StorageModule,
    UsersModule,
    NotificationsModule,
  ],
  controllers: [CallsController],
  providers: [CallsService],
})
export class CallsModule {}
