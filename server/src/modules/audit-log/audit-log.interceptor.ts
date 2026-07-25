import { CallHandler, ExecutionContext, Injectable, NestInterceptor } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Observable, tap } from 'rxjs';
import { AuditLogEntry } from './entities/audit-log-entry.entity';

const MUTATING_METHODS = new Set(['POST', 'PATCH', 'PUT', 'DELETE']);

const REDACTED_KEYS = new Set([
  'password', 'currentPassword', 'newPassword', 'appPassword', 'token',
  'signature', 'logoBase64', 'pdfBase64', 'originalPdfBase64',
]);

/** Global interceptor rather than manual audit calls sprinkled through
 * every controller/service — this app has dozens of mutating
 * endpoints across ~20 modules, and instrumenting each individually
 * would take far longer and inevitably miss some as endpoints get
 * added later. Firing centrally on every POST/PATCH/PUT/DELETE trades
 * a little precision (no business-meaningful "what happened"
 * description, just the HTTP shape) for covering the whole app
 * automatically, including future endpoints nobody remembers to wire
 * logging into individually. */
@Injectable()
export class AuditLogInterceptor implements NestInterceptor {
  constructor(@InjectRepository(AuditLogEntry) private readonly repo: Repository<AuditLogEntry>) {}

  intercept(context: ExecutionContext, next: CallHandler): Observable<unknown> {
    const req = context.switchToHttp().getRequest();
    const res = context.switchToHttp().getResponse();
    const method = req.method as string;

    if (!MUTATING_METHODS.has(method) || req.path?.startsWith('/api/auth/login')) {
      return next.handle();
    }

    return next.handle().pipe(
      tap({
        next: () => this.record(req, res.statusCode),
        error: (err) => this.record(req, err?.status ?? 500),
      }),
    );
  }

  private record(req: any, statusCode: number): void {
    // Fire-and-forget — logging must never be able to slow down or
    // fail the actual request it's observing.
    this.writeEntry(req, statusCode).catch(() => {});
  }

  private async writeEntry(req: any, statusCode: number): Promise<void> {
    const user = req.user as { id?: number; username?: string; organizationId?: number | null } | undefined;
    const path: string = req.path ?? req.url ?? '';
    const [, , resourceType, resourceId] = path.split('/'); // '', 'api', 'invoices', '42'

    const entry = this.repo.create({
      user: user?.id ? ({ id: user.id } as any) : undefined,
      username: user?.username,
      organization: user?.organizationId != null ? ({ id: user.organizationId } as any) : undefined,
      method: req.method,
      path,
      resourceType: resourceType || null,
      resourceId: /^\d+$/.test(resourceId) ? resourceId : null,
      statusCode,
      requestBody: this.sanitizeBody(req.body),
      ipAddress: req.ip ?? req.headers?.['x-forwarded-for'] ?? null,
    });
    await this.repo.save(entry);
  }

  private sanitizeBody(body: unknown): unknown {
    if (!body || typeof body !== 'object') return body;
    const clone: Record<string, unknown> = { ...(body as Record<string, unknown>) };
    for (const key of Object.keys(clone)) {
      if (REDACTED_KEYS.has(key)) {
        clone[key] = '[redacted]';
      } else if (typeof clone[key] === 'string' && (clone[key] as string).length > 2000) {
        clone[key] = `[truncated, ${(clone[key] as string).length} chars]`;
      }
    }
    return clone;
  }
}
