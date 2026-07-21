import 'dart:typed_data';
import '../services/api_service.dart';

class QuoteItem {
  final String description;
  final double quantity;
  final double unitPrice;
  QuoteItem({required this.description, required this.quantity, required this.unitPrice});

  factory QuoteItem.fromJson(Map<String, dynamic> j) => QuoteItem(
        description: j['description'] ?? '',
        quantity: (j['quantity'] as num?)?.toDouble() ?? 0,
        unitPrice: (j['unitPrice'] as num?)?.toDouble() ?? 0,
      );

  Map<String, dynamic> toJson() => {'description': description, 'quantity': quantity, 'unitPrice': unitPrice};
}

enum QuoteStatus { draft, sent, approved, declined }

QuoteStatus _parseQuoteStatus(String? s) => switch (s) {
      'sent' => QuoteStatus.sent,
      'approved' => QuoteStatus.approved,
      'declined' => QuoteStatus.declined,
      _ => QuoteStatus.draft,
    };

class Quote {
  final int id;
  final String? quoteNumber;
  final String clientName;
  final String? clientEmail;
  final List<QuoteItem> items;
  final double total;
  final QuoteStatus status;
  final DateTime createdAt;

  Quote({
    required this.id, this.quoteNumber, required this.clientName, this.clientEmail,
    required this.items, required this.total, required this.status, required this.createdAt,
  });

  factory Quote.fromJson(Map<String, dynamic> j) => Quote(
        id: j['id'],
        quoteNumber: j['quoteNumber'],
        clientName: j['clientName'] ?? '',
        clientEmail: j['clientEmail'],
        items: (j['items'] as List<dynamic>? ?? []).map((e) => QuoteItem.fromJson(e)).toList(),
        total: (j['total'] as num?)?.toDouble() ?? 0,
        status: _parseQuoteStatus(j['status']),
        createdAt: DateTime.tryParse(j['createdAt'] ?? '') ?? DateTime.now(),
      );
}

class QuotesService {
  QuotesService(this._api);
  final ApiService _api;

  Future<List<Quote>> list() async {
    final res = await _api.get('/quotes');
    return (res as List<dynamic>).map((e) => Quote.fromJson(e)).toList();
  }

  Future<Uint8List> getPdf(int id) => _api.getBytes('/quotes/$id/pdf');

  Future<Quote> create({
    required String clientName,
    String? clientEmail,
    required List<QuoteItem> items,
    String? notes,
  }) async {
    final res = await _api.post('/quotes', {
      'clientName': clientName,
      if (clientEmail != null && clientEmail.isNotEmpty) 'clientEmail': clientEmail,
      'items': items.map((i) => i.toJson()).toList(),
      if (notes != null && notes.isNotEmpty) 'notes': notes,
    });
    return Quote.fromJson(res);
  }

  Future<void> markSent(int id) => _api.post('/quotes/$id/send', {});
  Future<void> delete(int id) => _api.delete('/quotes/$id');
}
