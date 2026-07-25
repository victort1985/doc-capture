import { Module } from '@nestjs/common';
import { APP_INTERCEPTOR } from '@nestjs/core';
import { TypeOrmModule } from '@nestjs/typeorm';
import { AuditLogEntry } from './entities/audit-log-entry.entity';
import { AuditLogController } from './audit-log.controller';
import { AuditLogInterceptor } from './audit-log.interceptor';

@Module({
  imports: [TypeOrmModule.forFeature([AuditLogEntry])],
  controllers: [AuditLogController],
  providers: [
    AuditLogInterceptor,
    // Registered here, not in AppModule — a global interceptor
    // provider needs to be declared in a module that actually has
    // access to its dependencies (AuditLogEntryRepository lives in
    // THIS module's TypeOrmModule.forFeature). NestJS collects
    // APP_INTERCEPTOR tokens from anywhere in the imported module
    // tree, so this alone is enough to apply it globally — no need
    // for AppModule to redeclare it.
    { provide: APP_INTERCEPTOR, useClass: AuditLogInterceptor },
  ],
})
export class AuditLogModule {}
