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

    _socket = IO.io(
      _api.serverOrigin,
      IO.OptionBuilder()
          .setTransports(['websocket'])
          .setPath('/ws/notifications')
          .setAuth({'token': token})
          .build(),
    );

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
