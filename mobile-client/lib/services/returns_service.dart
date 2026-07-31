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

/// Creating a return picks a delivery note to return against — see
/// ReturnFormScreen. warehouseItemId (per line, for restocking the
/// right warehouse item) isn't set from mobile yet — that mapping
/// needs its own UI design, so items created here land unmapped and
/// can be matched to a warehouse item later from the admin panel.
class ReturnsService {
  ReturnsService(this._api);
  final ApiService _api;

  Future<List<ReturnNote>> list() async {
    final res = await _api.get('/returns');
    return (res as List<dynamic>).map((e) => ReturnNote.fromJson(e)).toList();
  }

  Future<ReturnNote> create({
    required int deliveryNoteId,
    required String clientName,
    String? clientEmail,
    String? date,
    required String reason,
    required List<ReturnItem> items,
  }) async {
    final res = await _api.post('/returns', {
      'deliveryNoteId': deliveryNoteId,
      'clientName': clientName,
      if (clientEmail != null && clientEmail.isNotEmpty) 'clientEmail': clientEmail,
      if (date != null && date.isNotEmpty) 'date': date,
      'reason': reason,
      'items': items.map((i) => {'name': i.name, 'quantity': i.quantity, if (i.notes != null && i.notes!.isNotEmpty) 'notes': i.notes}).toList(),
    });
    return ReturnNote.fromJson(res);
  }
}
