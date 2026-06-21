import 'package:socket_io_client/socket_io_client.dart' as IO;
import 'api_service.dart';

/// Wraps the Calls feature's real-time notifications (server-side:
/// NotificationsGateway). Delivers in-app popups while connected — this is
/// NOT an OS-level push notification, so a fully closed app won't show
/// anything until it's reopened. True push needs Firebase Cloud Messaging
/// with the business's own Firebase project; intentionally not built here,
/// see the note in the server's notifications.gateway.ts.
class NotificationsService {
  NotificationsService(this._api);
  final ApiService _api;
  IO.Socket? _socket;

  void connect({
    required void Function(int id, String place, String createdBy) onCallCreated,
    required void Function(String place, String status, String changedBy) onStatusChanged,
    required void Function(String place, String author) onNoteAdded,
    required void Function(String place, String uploadedBy) onAttachmentAdded,
  }) {
    final token = _api.token;
    if (token == null) return;

    final optionBuilder = IO.OptionBuilder()
        .setTransports(['websocket'])
        .setPath('/ws/notifications')
        .setAuth({'token': token});

    // Cloud connections sit behind Cloudflare Access (Service Token
    // required on every request to this host) — this socket is its own
    // separate connection, not routed through the shared Dio instance,
    // so it doesn't inherit those headers automatically the way normal
    // API calls do. Without them, Access blocks the handshake before it
    // ever reaches our server, and the socket just silently never
    // connects — no popup ever fires, with no obvious error on screen,
    // which is exactly what this looked like before being traced here.
    final cfHeaders = _api.cfAccessHeaders;
    if (cfHeaders != null) {
      optionBuilder.setExtraHeaders(cfHeaders);
    }

    _socket = IO.io(_api.serverOrigin, optionBuilder.build());

    _socket!.on('call:created', (data) => onCallCreated(data['id'], data['place'], data['createdBy']));
    _socket!.on('call:status_changed', (data) => onStatusChanged(data['place'], data['status'], data['changedBy']));
    _socket!.on('call:note_added', (data) => onNoteAdded(data['place'], data['author']));
    _socket!.on('call:attachment_added', (data) => onAttachmentAdded(data['place'], data['uploadedBy']));
  }

  void disconnect() {
    _socket?.dispose();
    _socket = null;
  }
}
