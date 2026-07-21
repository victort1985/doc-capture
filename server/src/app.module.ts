import { Module } from '@nestjs/common';
import { APP_GUARD } from '@nestjs/core';
import { ConfigModule } from '@nestjs/config';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ServeStaticModule } from '@nestjs/serve-static';
import { ThrottlerModule, ThrottlerGuard } from '@nestjs/throttler';
import { join } from 'path';
import { existsSync } from 'fs';
import { typeOrmConfig } from './config/typeorm.config';
import { AuthModule } from './modules/auth/auth.module';
import { UsersModule } from './modules/users/users.module';
import { StorageModule } from './modules/storage/storage.module';
import { TemplatesModule } from './modules/templates/templates.module';
import { FilesModule } from './modules/files/files.module';
import { CallsModule } from './modules/calls/calls.module';
import { LocationsModule } from './modules/locations/locations.module';
import { PhoneBookModule } from './modules/phonebook/phonebook.module';
import { OrganizationsModule } from './modules/organizations/organizations.module';
import { PushModule } from './modules/push/push.module';
import { CalendarModule } from './modules/calendar/calendar.module';
import { StatsModule } from './modules/stats/stats.module';
import { FleetModule } from './modules/fleet/fleet.module';
import { WarehouseModule } from './modules/warehouse/warehouse.module';
import { OrdersModule } from './modules/orders/orders.module';
import { QuotesModule } from './modules/quotes/quotes.module';
import { InvoicesModule } from './modules/invoices/invoices.module';
import { PortalModule } from './modules/portal/portal.module';
import { MaintenanceModule } from './modules/maintenance/maintenance.module';
import { LicenseModule } from './modules/license/license.module';
import { DocumentStorageSettingsModule } from './modules/document-storage-settings/document-storage-settings.module';
import { ScheduleModule } from '@nestjs/schedule';
import { ReportsModule } from './modules/reports/reports.module';
import { DeliveryNotesModule } from './modules/delivery-notes/delivery-notes.module';
import { ScanSessionsModule } from './modules/scan-sessions/scan-sessions.module';
import { DemoModule } from './modules/demo/demo.module';
import { DocumentEmailModule } from './modules/document-email/document-email.module';

const publicDir = join(__dirname, '..', 'public');
const hasAdminBuild = existsSync(join(publicDir, 'index.html'));

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true }),
    // Generous global default (this isn't a public internet-facing API,
    // mostly one mobile app + one admin panel) — the login endpoint gets
    // its own much stricter limit via @Throttle(), see auth.controller.ts.
    ThrottlerModule.forRoot([{ name: 'default', ttl: 60000, limit: 100 }]),
    TypeOrmModule.forRootAsync({ useFactory: typeOrmConfig }),
    ScheduleModule.forRoot(),
    // Serves the admin-panel production build when it's been copied into
    // ./public (see scripts/package-windows.sh). Only registered when that
    // build is actually present — otherwise its SPA fallback would try to
    // stat a non-existent index.html on every unmatched route and 500.
    ...(hasAdminBuild
      ? [
          ServeStaticModule.forRoot({
            rootPath: publicDir,
            exclude: ['/api*'],
          }),
        ]
      : []),
    AuthModule,
    UsersModule,
    StorageModule,
    TemplatesModule,
    FilesModule,
    CallsModule,
    LocationsModule,
    PhoneBookModule,
    OrganizationsModule,
    PushModule,
    CalendarModule,
    StatsModule,
    FleetModule,
    WarehouseModule,
    OrdersModule,
    QuotesModule,
    InvoicesModule,
    PortalModule,
    MaintenanceModule,
    LicenseModule,
    DocumentStorageSettingsModule,
    ReportsModule,
    DeliveryNotesModule,
    ScanSessionsModule,
    DemoModule,
    DocumentEmailModule,
  ],
  providers: [{ provide: APP_GUARD, useClass: ThrottlerGuard }],
})
export class AppModule {}
