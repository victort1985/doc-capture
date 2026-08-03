import {
  WebSocketGateway,
  WebSocketServer,
  OnGatewayConnection,
  OnGatewayDisconnect,
} from '@nestjs/websockets';
import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { JwtService } from '@nestjs/jwt';
import { Repository } from 'typeorm';
import { Server, Socket } from 'socket.io';
import { ServiceCall, CallStatus } from '../calls/entities/service-call.entity';
import { CallNote } from '../calls/entities/call-note.entity';
import { CallAttachment } from '../calls/entities/call-attachment.entity';
import { User } from '../users/entities/user.entity';

const SUPER_ADMIN_ROOM = 'super-admins';
const orgRoom = (organizationId: number) => `org:${organizationId}`;

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

  constructor(
    private readonly jwtService: JwtService,
    @InjectRepository(User) private readonly usersRepo: Repository<User>,
  ) {}

  async handleConnection(client: Socket) {
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
      // Per-user room so call-created notifications can be targeted to
      // specific technicians (by region) instead of broadcast to everyone.
      client.join(`user:${payload.sub}`);

      // The JWT itself never carries organizationId (see
      // AuthService.login's own payload) — look up the user's CURRENT
      // organization fresh, same reasoning as JwtStrategy re-fetching
      // state for HTTP requests rather than trusting a token claim
      // that could go stale if org membership changes. Join an
      // org-scoped room so status/note/attachment broadcasts (see
      // below) reach only this organization's own connected users —
      // a genuine super-admin additionally joins a dedicated room so
      // they keep seeing every organization's activity, matching the
      // same "sees everything" visibility they have everywhere else
      // in the app.
      const user = await this.usersRepo.findOne({ where: { id: payload.sub }, relations: ['organization'] });
      if (user?.organization?.id != null) {
        client.join(orgRoom(user.organization.id));
      } else {
        client.join(SUPER_ADMIN_ROOM);
      }
    } catch {
      client.disconnect(true);
    }
  }

  handleDisconnect(_client: Socket): void {
    // Nothing to clean up — no per-connection server-side state is kept
    // (Socket.IO removes room membership automatically on disconnect).
  }

  /**
   * Only technicians covering the call's region, plus anyone marked
   * "Глобальный", are notified of a brand-new call — everyone else only
   * finds out once they open the Calls list. Status changes, notes, and
   * attachments on a call already in progress stay broadcast to
   * everyone WITHIN THE SAME ORGANIZATION (not literally everyone —
   * see this class's own handleConnection comment for why that was a
   * real cross-org leak in a multi-organization tenant), since by
   * that point someone outside the call's region may well have picked
   * it up or be watching it (e.g. an admin).
   */
  broadcastCallCreated(call: ServiceCall, targetUserIds: number[]): void {
    const payload = {
      id: call.id,
      place: call.place,
      urgency: call.urgency,
      unusualDamage: call.unusualDamage,
      createdBy: call.createdBy?.username,
    };
    if (!this.server) {
      this.logger.warn('Tried to emit "call:created" before the WS server was ready');
      return;
    }
    for (const userId of targetUserIds) {
      this.server.to(`user:${userId}`).emit('call:created', payload);
    }
  }

  broadcastStatusChanged(call: ServiceCall, previousStatus: CallStatus): void {
    this.emitToCallOrg(call, 'call:status_changed', {
      id: call.id,
      place: call.place,
      previousStatus,
      status: call.status,
      changedBy: call.statusChangedBy?.username,
    });
  }

  broadcastNoteAdded(call: ServiceCall, note: CallNote): void {
    this.emitToCallOrg(call, 'call:note_added', {
      callId: call.id,
      place: call.place,
      author: note.author?.username,
      hasPhoto: Boolean(note.photoRelativePath),
    });
  }

  broadcastAttachmentAdded(call: ServiceCall, attachment: CallAttachment): void {
    this.emitToCallOrg(call, 'call:attachment_added', {
      callId: call.id,
      place: call.place,
      uploadedBy: attachment.uploadedBy?.username,
      originalName: attachment.originalName,
    });
  }

  /** Reaches only the call's own organization's connected users, plus
   * genuine super-admins — never every connected socket regardless of
   * tenant, which server.emit() used to do. */
  private emitToCallOrg(call: ServiceCall, event: string, payload: unknown): void {
    if (!this.server) {
      this.logger.warn(`Tried to emit "${event}" before the WS server was ready`);
      return;
    }
    const orgId = call.organization?.id;
    if (orgId != null) {
      this.server.to(orgRoom(orgId)).to(SUPER_ADMIN_ROOM).emit(event, payload);
    } else {
      // A call with no organization at all (legacy/unassigned) — fall
      // back to super-admins only rather than guessing who else
      // should see it.
      this.server.to(SUPER_ADMIN_ROOM).emit(event, payload);
    }
  }
}
