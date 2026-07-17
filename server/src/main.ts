import * as fs from 'fs';
import * as dns from 'dns';
// This server has no working IPv6 route; without this, outbound connections
// (e.g. the Gmail IMAP poller) can pick an AAAA record and fail with
// "Сеть недоступна" / EAI_AGAIN instead of falling back to IPv4.
dns.setDefaultResultOrder('ipv4first');
import { DeliveryNotesService } from './modules/delivery-notes/delivery-notes.service';
import * as path from 'path';
import { loadEnvFile, ensureJwtSecret, ensureEncryptionKey } from './config/bootstrap-env';


async function handleSignPage(req: any, res: any, app: any, signPageFile: string, SvcClass: any) {
  try {
    const token: string = req.params.token || req.params[0];
    const svc = app.get(SvcClass);
    let noteData: any = null;
    try { noteData = await svc.getNoteForSigning(token); } catch (_) {}

    let html = require('fs').readFileSync(signPageFile, 'utf-8');
    // JSON-encode safely: escape </script> to prevent HTML injection
    const payload = JSON.stringify(noteData).replace(/<\/script>/gi, '<\\/script>');
    const script = '<script>window.__NOTE_DATA__=' + payload + ';window.__TOKEN__=' + JSON.stringify(token) + ';</script>';
    html = html.includes('</head>') ? html.replace('</head>', script + '</head>') : script + html;
    res.setHeader('Content-Type', 'text/html; charset=utf-8');
    res.setHeader('Cache-Control', 'no-store');
    return res.send(html);
  } catch (e) {
    console.error('[sign] error:', e);
    return res.status(500).send('<h2>Error: ' + String(e) + '</h2>');
  }
}

// Must run before AppModule is loaded — see bootstrap-env.ts for why.
const ENV_PATH = path.join(process.cwd(), '.env');
loadEnvFile(ENV_PATH);
ensureJwtSecret(ENV_PATH);
ensureEncryptionKey(ENV_PATH);

async function bootstrap() {
  // Dynamic imports: AppModule (and everything it transitively imports,
  // e.g. AuthModule reading process.env.JWT_SECRET in a decorator) must
  // not be loaded until after the env setup above has already run.
  const { NestFactory } = await import('@nestjs/core');
  const { ValidationPipe } = await import('@nestjs/common');
  const { AppModule } = await import('./app.module');
  const { HttpExceptionFilter } = await import('./common/filters/http-exception.filter');
  const helmetModule = await import('helmet');
  const helmet = helmetModule.default;

  // TLS: if a cert+key are configured, terminate HTTPS directly in this
  // process. Otherwise fall back to plain HTTP with a clear warning — see
  // docs/installation-guide.md for how to generate a certificate for LAN use.
  const certPath = process.env.TLS_CERT_PATH;
  const keyPath = process.env.TLS_KEY_PATH;
  let httpsOptions: { cert: Buffer; key: Buffer } | undefined;
  if (certPath && keyPath) {
    try {
      httpsOptions = { cert: fs.readFileSync(certPath), key: fs.readFileSync(keyPath) };
    } catch (err) {
      // eslint-disable-next-line no-console
      console.warn(
        `[Setup] Could not read TLS_CERT_PATH/TLS_KEY_PATH (${(err as Error).message}) — falling back to plain HTTP.`,
      );
    }
  } else {
    // eslint-disable-next-line no-console
    console.warn(
      '[Setup] TLS_CERT_PATH/TLS_KEY_PATH not set — serving plain HTTP. ' +
        'Anyone on the same network can read traffic (logins, tokens, uploaded documents) in cleartext. ' +
        'See the installation guide for generating a certificate.',
    );
  }

  const app = await NestFactory.create(AppModule, httpsOptions ? { httpsOptions } : undefined);

  // ── Signing page — all under /sign/* which is Cloudflare-bypassed ──────────
  const express  = await import('express');
  const nodePath = await import('path');
  const signPageDir  = nodePath.resolve(process.cwd(), 'public-sign');
  const signPageFile = nodePath.join(signPageDir, 'index.html');
  const xApp = app.getHttpAdapter().getInstance();

  // ── Intercept ALL requests to sign.doc-capture.app BEFORE static files ──
  // Must be registered early so it runs before admin panel static middleware.
  xApp.use((req: any, res: any, next: any) => {
    const host: string = (req.headers.host || '').toLowerCase();
    if (host.startsWith('sign.')) {
      // Extract token from path: /TOKEN or /TOKEN/submit
      const parts = req.path.replace(/^\//, '').split('/');
      req.params = req.params || {};
      req.params.token = parts[0];

      // Handle both /TOKEN/submit and /sign/TOKEN/submit
      let actualToken = parts[0];
      let isSubmit = parts[1] === 'submit';
      if (parts[0] === 'sign' && parts.length >= 3) {
        actualToken = parts[1];
        isSubmit = parts[2] === 'submit';
      }

      if (req.method === 'POST' && isSubmit) {
        let body = '';
        req.on('data', (chunk: any) => { body += chunk.toString(); });
        req.on('end', async () => {
          try {
            const parsed = JSON.parse(body);
            const svc = app.get(DeliveryNotesService);
            const result = await svc.submitRemoteSignature(
              actualToken, parsed.signerName, parsed.signerRole, parsed.signature
            );
            res.setHeader('Content-Type', 'application/json');
            return res.end(JSON.stringify(result));
          } catch(e) {
            console.error('[sign submit]', e);
            res.statusCode = 400;
            res.setHeader('Content-Type', 'application/json');
            return res.end(JSON.stringify({ error: String(e) }));
          }
        });
        return;
      }

      // GET — serve signing page
      return handleSignPage(req, res, app, signPageFile, DeliveryNotesService);
    }
    next();
  });

  // GET /sign/:token — same for app.doc-capture.app/sign/TOKEN
  xApp.get('/sign/:token', async (req: any, res: any) => {
    return handleSignPage(req, res, app, signPageFile, DeliveryNotesService);
  });

  // Rate limit map for signing submissions (prevent brute-force)
  const _signRateLimit = new Map<string, { count: number; resetAt: number }>();

  // POST /sign/:token/submit — signature submission, also under /sign/* bypass
  xApp.post('/sign/:token/submit', express.json({ limit: '5mb' }), async (req: any, res: any) => {
    try {
      // Rate limit: 10 attempts per IP per 15 minutes
      const ip: string = req.ip || req.socket?.remoteAddress || 'unknown';
      const now = Date.now();
      const rl = _signRateLimit.get(ip);
      if (rl && now < rl.resetAt) {
        if (rl.count >= 10) return res.status(429).json({ error: 'Too many attempts. Try again later.' });
        rl.count++;
      } else {
        _signRateLimit.set(ip, { count: 1, resetAt: now + 15 * 60 * 1000 });
      }

      const token: string = req.params.token;

      // Input validation
      const { signerName, signerRole, signature } = req.body;
      if (!signerName || typeof signerName !== 'string' || signerName.trim().length < 2) {
        return res.status(400).json({ error: 'Invalid signer name' });
      }
      if (!signature || typeof signature !== 'string' || signature.length < 100) {
        return res.status(400).json({ error: 'Invalid signature data' });
      }
      // Token must be hex string
      if (!/^[a-f0-9]{40,}$/.test(token)) {
        return res.status(400).json({ error: 'Invalid token' });
      }

      const svc = app.get(DeliveryNotesService);
      const result = await svc.submitRemoteSignature(token, signerName.trim(), signerRole?.trim(), signature);
      return res.json(result);
    } catch (e) {
      return res.status(400).json({ error: String(e) });
    }
  });

  // Increase body size limit to 5 MB for base64 logos and signatures
  app.use(express.json({ limit: '5mb' }));
  app.use(express.urlencoded({ limit: '5mb', extended: true }));

  app.getHttpAdapter().getInstance().disable('x-powered-by');

  app.use(
    helmet({
      contentSecurityPolicy: {
        directives: {
          ...helmet.contentSecurityPolicy.getDefaultDirectives(),
          // Admin panel pulls Fraunces/Inter/IBM Plex Mono from Google Fonts,
          // and uses inline `style={{...}}` throughout (needs style-src
          // 'unsafe-inline' — script-src stays locked down).
          'style-src': ["'self'", "'unsafe-inline'", 'https://fonts.googleapis.com'],
          'font-src': ["'self'", 'https://fonts.gstatic.com'],
          // apiFetchBlob() (org logos, contact photos, etc.) renders fetched
          // bytes via URL.createObjectURL() -> <img src="blob:...">. The
          // default img-src ('self' data:) doesn't include blob:, so the
          // browser silently blocks those images — no console error, just
          // a broken-image icon, since the fetch itself already succeeded.
          'img-src': ["'self'", 'data:', 'blob:'],
          // script-src: unsafe-inline needed for signing page (server-injected data script)
          'script-src': ["'self'", "'unsafe-inline'"],
          // Prevent clickjacking attacks
          'frame-ancestors': ["'none'"],
        },
      },
    }),
  );

  const corsOrigin = process.env.CORS_ORIGIN;
  if (corsOrigin) {
    app.enableCors({ origin: corsOrigin.split(',').map((o) => o.trim()) });
  } else {
    // The packaged admin panel is always same-origin with the API (both
    // served from this same process/port), so CORS is never actually
    // exercised by the real product — only by `vite dev` during local
    // development. Defaulting to those origins instead of '*' means we're
    // not wide open to the entire internet for no reason.
    app.enableCors({
      origin: ['http://localhost:5173', 'http://127.0.0.1:5173', 'http://localhost:4173', 'http://127.0.0.1:4173'],
    });
    // eslint-disable-next-line no-console
    console.warn(
      '[Setup] CORS_ORIGIN not set — only allowing the local Vite dev-server origins by default. ' +
        'Set CORS_ORIGIN in .env (comma-separated) if you need the API reachable from other origins.',
    );
  }

  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      transform: true,
      forbidNonWhitelisted: true,
    }),
  );
  app.useGlobalFilters(new HttpExceptionFilter());
  app.setGlobalPrefix('api');

  const port = process.env.PORT || 3000;
  await app.listen(port);
  // eslint-disable-next-line no-console
  console.log(`Server listening on port ${port} (${httpsOptions ? 'HTTPS' : 'HTTP'})`);
}

bootstrap();
