import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ScanSession } from './entities/scan-session.entity';
import { ScanSessionsService } from './scan-sessions.service';
import { ScanSessionsController } from './scan-sessions.controller';
import { FilesModule } from '../files/files.module';
import { TemplatesModule } from '../templates/templates.module';

@Module({
  imports: [TypeOrmModule.forFeature([ScanSession]), FilesModule, TemplatesModule],
  controllers: [ScanSessionsController],
  providers: [ScanSessionsService],
})
export class ScanSessionsModule {}
