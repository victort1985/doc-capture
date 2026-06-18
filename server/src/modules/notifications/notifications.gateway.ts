import {
  WebSocketGateway,
  WebSocketServer,
  OnGatewayConnection,
  OnGatewayDisconnect,
} from '@nestjs/websockets';
import { Injectable, Logger } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { Server, Socket } from 'socket.io';
import { ServiceCall, CallStatus } from '../calls/entities/service-call.entity';
import { CallNote } from '../calls/entities/call-note.entity';
import { CallAttachment } from '../calls/entities/call-attachment.entity';

/**
 * Real-time in-app notifications for the Calls feature ("Вызов" tab —
 * spec item 7: "all changes are sent as popup notifications to users").
 *
 * This delivers popups while a client (mobile app or admin panel) is open
 * and connected — it does NOT wake up a closed mobile app the way a real
 * OS-level push notification (Firebase Cloud Messaging / APNs) would.
 * True push needs its own Firebase project with the customer's own
 * credentials (a Google Cloud project + google-services.json/APNs cert) —
 * nothing free or pre-existing covers that, so it's deliberately out of
 * scope here and documented as a follow-up rather than half-built.
 */
@Injectable()
@WebSocketGateway({ cors: { origin: true, credentials: true }, path: '/ws/notifications' })
export class NotificationsGateway implements OnGatewayConnection, OnGatewayDisconnect {
  @WebSocketServer()
  server: Server;

  private readonly logger = new Logger(NotificationsGateway.name);

  constructor(private readonly jwtService: JwtService) {}

  handleConnection(client: Socket) {
    const token =
      (client.handshake.auth?.token as string) ||
      (client.handshake.query?.token as string) ||
      client.handshake.headers.authorization?.replace(/^Bearer /, '');

    if (!token) {
      client.disconnect(true);
      return;
    }
    try {
      const payload = this.jwtService.verify(token);
      (client.data as any).userId = payload.sub;
      (client.data as any).username = payload.username;
    } catch {
      client.disconnect(true);
    }
  }

  handleDisconnect(_client: Socket): void {
    // Nothing to clean up — no per-connection server-side state is kept.
  }

  broadcastCallCreated(call: ServiceCall): void {
    this.emit('call:created', {
      id: call.id,
      place: call.place,
      urgency: call.urgency,
      unusualDamage: call.unusualDamage,
      createdBy: call.createdBy?.username,
    });
  }

  broadcastStatusChanged(call: ServiceCall, previousStatus: CallStatus): void {
    this.emit('call:status_changed', {
      id: call.id,
      place: call.place,
      previousStatus,
      status: call.status,
      changedBy: call.statusChangedBy?.username,
    });
  }

  broadcastNoteAdded(call: ServiceCall, note: CallNote): void {
    this.emit('call:note_added', {
      callId: call.id,
      place: call.place,
      author: note.author?.username,
      hasPhoto: Boolean(note.photoRelativePath),
    });
  }

  broadcastAttachmentAdded(call: ServiceCall, attachment: CallAttachment): void {
    this.emit('call:attachment_added', {
      callId: call.id,
      place: call.place,
      uploadedBy: attachment.uploadedBy?.username,
      originalName: attachment.originalName,
    });
  }

  private emit(event: string, payload: unknown): void {
    if (!this.server) {
      this.logger.warn(`Tried to emit "${event}" before the WS server was ready`);
      return;
    }
    this.server.emit(event, payload);
  }
}
