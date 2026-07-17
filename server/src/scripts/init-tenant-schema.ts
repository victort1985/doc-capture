// Usage: node dist/scripts/init-tenant-schema.js /opt/doc-capture/tenants/<slug>/.env
//
// Creates every table for a brand-new, EMPTY tenant database by
// booting the real AppModule with TypeORM's synchronize:true (same
// mechanism dev environments already use — see typeorm.config.ts:
// `synchronize: process.env.NODE_ENV !== 'production'`). This
// deliberately reuses the actual @Entity() classes instead of a
// hand-maintained migration script, so it can never drift out of sync
// with the app's real schema as new entities get added — which they
// have, constantly, throughout this project's history.
//
// Safe only against an EMPTY database — running it against a database
// that already has data risks TypeORM's synchronize altering existing
// tables. This script refuses to run if it detects any existing
// tables, as a guardrail.
import * as path from 'path';
import { Client } from 'pg';
import { loadEnvFile, ensureJwtSecret, ensureEncryptionKey } from '../config/bootstrap-env';

async function main() {
  const envArg = process.argv[2];
  if (!envArg) {
    console.error('Usage: node dist/scripts/init-tenant-schema.js /path/to/tenant/.env');
    process.exit(1);
  }
  const envPath = path.resolve(envArg);
  loadEnvFile(envPath);
  ensureJwtSecret(envPath);
  ensureEncryptionKey(envPath);
  // Forces typeOrmConfig()'s synchronize:true for this one-off run
  // only — the tenant's real systemd service always runs with
  // NODE_ENV=production (synchronize:false), this process exits
  // immediately after.
  process.env.NODE_ENV = 'development';

  const client = new Client({
    host: process.env.DB_HOST || 'localhost',
    port: parseInt(process.env.DB_PORT || '5432', 10),
    user: process.env.DB_USERNAME || 'postgres',
    password: process.env.DB_PASSWORD || 'postgres',
    database: process.env.DB_DATABASE,
    ssl: process.env.DB_SSL === 'true' ? { rejectUnauthorized: process.env.DB_SSL_REJECT_UNAUTHORIZED !== 'false' } : undefined,
  });
  await client.connect();
  const { rows } = await client.query(`SELECT count(*)::int AS n FROM information_schema.tables WHERE table_schema = 'public'`);
  await client.end();
  if (rows[0].n > 0) {
    console.error(`Refusing to run: database "${process.env.DB_DATABASE}" already has ${rows[0].n} table(s). This script is only for a brand-new empty database.`);
    process.exit(1);
  }

  // Dynamic imports so AppModule (and everything it transitively
  // imports) only evaluates AFTER the env vars above are in place —
  // same reasoning as main.ts.
  const { NestFactory } = await import('@nestjs/core');
  const { AppModule } = await import('../app.module');
  const app = await NestFactory.createApplicationContext(AppModule, { logger: ['error', 'warn'] });
  console.log(`Schema synchronized for database "${process.env.DB_DATABASE}".`);
  await app.close();
  process.exit(0);
}

main().catch((err) => {
  console.error('Schema init failed:', err);
  process.exit(1);
});
