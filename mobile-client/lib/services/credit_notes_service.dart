import '../services/api_service.dart';

class CreditDebitItem {
  final String description;
  final double quantity;
  final double unitPrice;
  CreditDebitItem({required this.description, required this.quantity, required this.unitPrice});

  factory CreditDebitItem.fromJson(Map<String, dynamic> j) => CreditDebitItem(
        description: j['description'] ?? '',
        quantity: (j['quantity'] as num?)?.toDouble() ?? 0,
        unitPrice: (j['unitPrice'] as num?)?.toDouble() ?? 0,
      );
}

class CreditNote {
  final int id;
  final String? creditNoteNumber;
  final String? date;
  final String clientName;
  final String? clientEmail;
  final int invoiceId;
  final String reason;
  final List<CreditDebitItem> items;
  final double total;
  final String currency;
  final DateTime createdAt;

  CreditNote({
    required this.id, this.creditNoteNumber, this.date, required this.clientName, this.clientEmail,
    required this.invoiceId, required this.reason, required this.items, required this.total,
    required this.currency, required this.createdAt,
  });

  factory CreditNote.fromJson(Map<String, dynamic> j) => CreditNote(
        id: j['id'],
        creditNoteNumber: j['creditNoteNumber'],
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

/// Read-only — see the same note on ReturnsService. Creating a credit
/// note needs an invoice picker plus its own VAT/reason handling;
/// listing what already exists (created from the admin panel) is the
/// lower-risk first step for mobile.
class CreditNotesService {
  CreditNotesService(this._api);
  final ApiService _api;

  Future<List<CreditNote>> list() async {
    final res = await _api.get('/credit-notes');
    return (res as List<dynamic>).map((e) => CreditNote.fromJson(e)).toList();
  }
}
