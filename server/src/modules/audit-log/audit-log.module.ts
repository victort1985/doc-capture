import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { AuditLogEntry } from './entities/audit-log-entry.entity';
import { AuditLogController } from './audit-log.controller';
import { AuditLogInterceptor } from './audit-log.interceptor';

@Module({
  imports: [TypeOrmModule.forFeature([AuditLogEntry])],
  controllers: [AuditLogController],
  providers: [AuditLogInterceptor],
  exports: [AuditLogInterceptor],
})
export class AuditLogModule {}
