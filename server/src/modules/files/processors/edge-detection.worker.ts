// Runs entirely inside a worker_thread (see runEdgeDetectionInWorker in
// document-edge-detection.ts). If OpenCV.js's WASM runtime hangs here —
// exactly the failure mode that took the whole server down previously —
// only this disposable worker is affected. The caller enforces a hard
// timeout and calls worker.terminate() if this file doesn't respond in
// time, which actually reclaims the CPU (unlike a Promise.race timeout
// in the main process, which stops waiting but leaves the runaway work
// still running).
import { parentPort, workerData } from 'worker_threads';
import { detectAndCropDocument } from './document-edge-detection';

(async () => {
  try {
    const { rgba, width, height } = workerData as { rgba: Buffer; width: number; height: number };
    const result = await detectAndCropDocument(Buffer.from(rgba), width, height);
    parentPort?.postMessage({ ok: true, result });
  } catch (err: any) {
    parentPort?.postMessage({ ok: false, error: err?.message ?? String(err) });
  }
})();
