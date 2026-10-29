import * as path from 'path';
import { fork, ChildProcess } from 'child_process';
// eslint-disable-next-line @typescript-eslint/no-var-requires
const sharp: any = require('sharp'); // same typing workaround as document.processor.ts
import type { DocScanResult } from './doc-detector';

export { rectifiedSize, estimateAspect } from './doc-detector';
export type { DocScanResult, Quad, P } from './doc-detector';

const TIMEOUT_MS = Number(process.env.SCANNER_TIMEOUT_MS) || 30000;
const IDLE_MS = Number(process.env.SCANNER_IDLE_MS) || 60000;

type Pending = { resolve: (v: DocScanResult | null) => void; timer: NodeJS.Timeout };

let child: ChildProcess | null = null;
let idleTimer: NodeJS.Timeout | null = null;
let nextId = 1;
const pending = new Map<number, Pending>();
let chain: Promise<unknown> = Promise.resolve(); // the child is single-threaded: one scan at a time

function killChild() {
  if (idleTimer) { clearTimeout(idleTimer); idleTimer = null; }
  const c = child;
  child = null;
  if (c) { c.removeAllListeners(); c.kill('SIGKILL'); }
  for (const [, p] of pending) { clearTimeout(p.timer); p.resolve(null); }
  pending.clear();
}

function ensureChild(): ChildProcess {
  if (child && child.connected) return child;
  const c = fork(path.join(__dirname, 'docscan.child.js'), [], { serialization: 'advanced', stdio: ['ignore', 'inherit', 'inherit', 'ipc'] });
  c.on('message', (m: any) => {
    if (!m || m.ready) return;
    const p = pending.get(m.id);
    if (!p) return;
    pending.delete(m.id);
    clearTimeout(p.timer);
    if (!m.ok) { console.warn(`[docscan] detector error: ${m.error}`); p.resolve(null); return; }
    if (m.result) console.log(`[docscan] ${m.result.method} score=${m.result.score.toFixed(2)} refined=${m.result.refined}`);
    p.resolve(m.result ?? null);
  });
  c.on('error', (e) => { console.warn(`[docscan] detector process error: ${e?.message ?? e}`); if (child === c) killChild(); });
  c.on('exit', () => { if (child === c) { child = null; for (const [, p] of pending) { clearTimeout(p.timer); p.resolve(null); } pending.clear(); } });
  c.unref();
  (c as any).channel?.unref?.(); // an idle detector must never keep the server process alive
  child = c;
  return c;
}

function runOnce(data: Buffer, width: number, height: number): Promise<DocScanResult | null> {
  return new Promise((resolve) => {
    let c: ChildProcess;
    try { c = ensureChild(); } catch (e: any) { console.warn(`[docscan] cannot start detector: ${e?.message ?? e}`); return resolve(null); }
    if (idleTimer) { clearTimeout(idleTimer); idleTimer = null; }
    const id = nextId++;
    const timer = setTimeout(() => {
      console.warn(`[docscan] timed out after ${TIMEOUT_MS}ms — detector process killed`);
      killChild();
    }, TIMEOUT_MS);
    pending.set(id, {
      timer,
      resolve: (v) => {
        resolve(v);
        if (child && !idleTimer) { idleTimer = setTimeout(killChild, IDLE_MS); idleTimer.unref(); }
      },
    });
    try { c.send({ id, rgb: data, width, height }); } catch (e: any) { console.warn(`[docscan] send failed: ${e?.message ?? e}`); killChild(); }
  });
}

/**
 * Finds the document in an (already EXIF-rotated) photo. Returns null when no
 * confident document was found, or if the detector failed or timed out.
 */
export async function scanDocument(imageBuffer: Buffer): Promise<DocScanResult | null> {
  const { data, info } = await sharp(imageBuffer).removeAlpha().raw().toBuffer({ resolveWithObject: true });
  const job = chain.then(() => runOnce(data, info.width, info.height));
  chain = job.catch(() => null);
  return job;
}
