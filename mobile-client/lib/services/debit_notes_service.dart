import '../services/api_service.dart';
import 'credit_notes_service.dart' show CreditDebitItem;

class DebitNote {
  final int id;
  final String? debitNoteNumber;
  final String? date;
  final String clientName;
  final String? clientEmail;
  final int invoiceId;
  final String reason;
  final List<CreditDebitItem> items;
  final double total;
  final String currency;
  final DateTime createdAt;

  DebitNote({
    required this.id, this.debitNoteNumber, this.date, required this.clientName, this.clientEmail,
    required this.invoiceId, required this.reason, required this.items, required this.total,
    required this.currency, required this.createdAt,
  });

  factory DebitNote.fromJson(Map<String, dynamic> j) => DebitNote(
        id: j['id'],
        debitNoteNumber: j['debitNoteNumber'],
        date: j['date'],
        clientName: j['clientName'] ?? '',
        clientEmail: j['clientEmail'],
        invoiceId: j['invoiceId'] ?? 0,
        reason: j['reason'] ?? '',
        items: (j['items'] as List<dynamic>? ?? []).map((e) => CreditDebitItem.fromJson(e)).toList(),
        total: (j['total'] as num?)?.toDouble() ?? 0,
        currency: j['currency'] ?? 'ILS',
        createdAt: DateTime.tryParse(j['createdAt'] ?? '') ?? DateTime.now(),
      );
}

/// Creating a debit note needs an invoice to correct — see
/// DebitCreditFormScreen (shared with credit notes).
class DebitNotesService {
  DebitNotesService(this._api);
  final ApiService _api;

  Future<List<DebitNote>> list() async {
    final res = await _api.get('/debit-notes');
    return (res as List<dynamic>).map((e) => DebitNote.fromJson(e)).toList();
  }

  Future<DebitNote> create({
    required int invoiceId,
    required String clientName,
    String? clientEmail,
    String? date,
    required String reason,
    required List<CreditDebitItem> items,
  }) async {
    final res = await _api.post('/debit-notes', {
      'invoiceId': invoiceId,
      'clientName': clientName,
      if (clientEmail != null && clientEmail.isNotEmpty) 'clientEmail': clientEmail,
      if (date != null && date.isNotEmpty) 'date': date,
      'reason': reason,
      'items': items.map((i) => {'description': i.description, 'quantity': i.quantity, 'unitPrice': i.unitPrice}).toList(),
    });
    return DebitNote.fromJson(res);
  }
}
