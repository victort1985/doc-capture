// Detector process. Runs in a separate OS process (child_process.fork), NOT a
// worker thread: onnxruntime-node's native addon cannot be loaded again in a
// second thread of the same process ("Module did not self-register"), and
// OpenCV.js/WASM has hung before — a separate process can simply be killed.
// The parent (index.ts) keeps one of these alive between scans (so the WASM
// and the AI model are loaded once) and restarts it on timeout/crash.
import { detectDocument } from './doc-detector';

process.on('message', async (msg: { id: number; rgb: Uint8Array; width: number; height: number }) => {
  try {
    const result = await detectDocument(Buffer.from(msg.rgb), msg.width, msg.height);
    process.send?.({ id: msg.id, ok: true, result });
  } catch (err: any) {
    process.send?.({ id: msg.id, ok: false, error: err?.message ?? String(err) });
  }
});
process.send?.({ ready: true });
