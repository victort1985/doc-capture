import { Injectable } from '@nestjs/common';
import { randomUUID } from 'crypto';

export type JobStatus = 'running' | 'done' | 'failed';

export interface JobState {
  id: string;
  status: JobStatus;
  totalRows: number;
  processedRows: number;
  log: string[];
  result?: unknown;
  error?: string;
  /** Only set for export jobs — the generated file, held in memory
   * until downloaded. Not persisted to disk: these are admin-
   * triggered, infrequent, and this avoids needing any cleanup-on-
   * disk story for a feature this size. */
  fileBuffer?: Buffer;
  fileName?: string;
  fileMimeType?: string;
  createdAt: number;
}

/** Backs the live log + percentage progress bar the wizard shows
 * during import/export — the frontend polls GET .../:jobId/status
 * every second or two rather than needing a WebSocket/SSE connection,
 * which is simpler to deploy correctly (no extra infra, works behind
 * any reverse proxy) at the cost of ~1s of latency on log updates,
 * an acceptable trade for what is fundamentally an admin-only,
 * occasional-use tool.
 *
 * In-memory only (a plain Map, not a DB table or Redis) — jobs are
 * short-lived (seconds to low minutes) and admin-triggered; losing
 * job state on a server restart mid-import is an acceptable trade
 * for not needing a whole persistence layer for this. Old jobs are
 * swept out after JOB_TTL_MS so this map can't grow unbounded across
 * a long-running server process.
 */
@Injectable()
export class MigrationJobsService {
  private readonly jobs = new Map<string, JobState>();
  private readonly JOB_TTL_MS = 30 * 60 * 1000; // 30 minutes

  create(): JobState {
    this.sweepOld();
    const job: JobState = {
      id: randomUUID(),
      status: 'running',
      totalRows: 0,
      processedRows: 0,
      log: [],
      createdAt: Date.now(),
    };
    this.jobs.set(job.id, job);
    return job;
  }

  get(id: string): JobState | undefined {
    return this.jobs.get(id);
  }

  appendLog(id: string, line: string): void {
    const job = this.jobs.get(id);
    if (job) job.log.push(line);
  }

  setTotal(id: string, total: number): void {
    const job = this.jobs.get(id);
    if (job) job.totalRows = total;
  }

  incrementProcessed(id: string): void {
    const job = this.jobs.get(id);
    if (job) job.processedRows++;
  }

  complete(id: string, result: unknown): void {
    const job = this.jobs.get(id);
    if (job) { job.status = 'done'; job.result = result; }
  }

  fail(id: string, error: string): void {
    const job = this.jobs.get(id);
    if (job) { job.status = 'failed'; job.error = error; }
  }

  attachFile(id: string, buffer: Buffer, fileName: string, mimeType: string): void {
    const job = this.jobs.get(id);
    if (job) { job.fileBuffer = buffer; job.fileName = fileName; job.fileMimeType = mimeType; }
  }

  private sweepOld(): void {
    const cutoff = Date.now() - this.JOB_TTL_MS;
    for (const [id, job] of this.jobs) {
      if (job.createdAt < cutoff) this.jobs.delete(id);
    }
  }
}
