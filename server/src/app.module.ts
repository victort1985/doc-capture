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
  ],
  providers: [{ provide: APP_GUARD, useClass: ThrottlerGuard }],
})
export class AppModule {}
