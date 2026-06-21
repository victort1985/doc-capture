import { Injectable, Logger } from '@nestjs/common';
import * as fs from 'fs';
import { initializeApp, cert, App } from 'firebase-admin/app';
import { getMessaging } from 'firebase-admin/messaging';

/**
 * Real OS-level push (home screen / locked phone), complementing
 * NotificationsGateway's WebSocket popups (which only fire while the
 * app is open). Android-only in practice today — see
 * push_notifications_service.dart on the client for why iOS isn't
 * registering tokens yet (no Apple Developer Program account for APNs).
 *
 * Needs a Firebase service account key — a SERVER-side credential,
 * deliberately distinct from and more sensitive than the client-side
 * google-services.json committed to the repo (that one only identifies
 * the app to Firebase; this one can send messages AS the project and
 * must never be committed). Loaded from a file path via
 * FIREBASE_SERVICE_ACCOUNT_PATH in .env — generate it in the Firebase
 * console under Project Settings → Service Accounts → Generate new
 * private key.
 *
 * Designed to degrade gracefully with that file absent (e.g. before
 * it's been provisioned, or a deploy that doesn't need push) — logs a
 * warning once at startup and every send becomes a silent no-op,
 * rather than crashing the whole server over a missing optional
 * credential.
 */
@Injectable()
export class PushService {
  private readonly logger = new Logger(PushService.name);
  private app: App | null = null;

  constructor() {
    const path = process.env.FIREBASE_SERVICE_ACCOUNT_PATH;
    if (!path || !fs.existsSync(path)) {
      this.logger.warn(
        'FIREBASE_SERVICE_ACCOUNT_PATH not set or file not found — push notifications are disabled (in-app WebSocket popups still work normally).',
      );
      return;
    }
    try {
      const serviceAccount = JSON.parse(fs.readFileSync(path, 'utf-8'));
      this.app = initializeApp({ credential: cert(serviceAccount) });
      this.logger.log('Firebase Admin initialized — push notifications enabled.');
    } catch (err) {
      this.logger.error(`Failed to initialize Firebase Admin: ${(err as Error).message}`);
    }
  }

  /** Best-effort — a push failure (expired token, FCM outage, etc.) should never block whatever triggered it (e.g. creating a call). */
  async send(token: string, title: string, body: string, data?: Record<string, string>): Promise<void> {
    if (!this.app) return;
    try {
      await getMessaging(this.app).send({
        token,
        notification: { title, body },
        data,
        android: { priority: 'high' },
      });
    } catch (err) {
      this.logger.warn(`Push send failed (token likely stale/invalid): ${(err as Error).message}`);
    }
  }

  /** Same as send(), for many recipients at once — used for the region/global notification fan-out so one slow/failed send can't block the others. */
  async sendToMany(
    recipients: { token: string }[],
    title: string,
    body: string,
    data?: Record<string, string>,
  ): Promise<void> {
    await Promise.all(recipients.map((r) => this.send(r.token, title, body, data)));
  }
}
