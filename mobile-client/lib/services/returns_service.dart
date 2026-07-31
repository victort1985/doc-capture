import '../services/api_service.dart';

class ReturnItem {
  final String name;
  final double quantity;
  final String? notes;
  ReturnItem({required this.name, required this.quantity, this.notes});

  factory ReturnItem.fromJson(Map<String, dynamic> j) => ReturnItem(
        name: j['name'] ?? '',
        quantity: (j['quantity'] as num?)?.toDouble() ?? 0,
        notes: j['notes'],
      );
}

class ReturnNote {
  final int id;
  final String? returnNumber;
  final String? date;
  final String clientName;
  final String? clientEmail;
  final int deliveryNoteId;
  final String reason;
  final List<ReturnItem> items;
  final DateTime createdAt;

  ReturnNote({
    required this.id, this.returnNumber, this.date, required this.clientName, this.clientEmail,
    required this.deliveryNoteId, required this.reason, required this.items, required this.createdAt,
  });

  factory ReturnNote.fromJson(Map<String, dynamic> j) => ReturnNote(
        id: j['id'],
        returnNumber: j['returnNumber'],
        date: j['date'],
        clientName: j['clientName'] ?? '',
        clientEmail: j['clientEmail'],
        deliveryNoteId: j['deliveryNoteId'] ?? 0,
        reason: j['reason'] ?? '',
        items: (j['items'] as List<dynamic>? ?? []).map((e) => ReturnItem.fromJson(e)).toList(),
        createdAt: DateTime.tryParse(j['createdAt'] ?? '') ?? DateTime.now(),
      );
}

/// Read-only for now — this app didn't have any UI for returns before
/// (admin panel only). Creating a return still requires picking a
/// warehouse item mapping per line, which needs more design work to
/// do safely on a phone; listing what already exists is the lower-
/// risk first step.
class ReturnsService {
  ReturnsService(this._api);
  final ApiService _api;

  Future<List<ReturnNote>> list() async {
    final res = await _api.get('/returns');
    return (res as List<dynamic>).map((e) => ReturnNote.fromJson(e)).toList();
  }
}
