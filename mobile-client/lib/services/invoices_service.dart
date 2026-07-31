import 'dart:typed_data';
import '../services/api_service.dart';
import 'quotes_service.dart' show VatCategory, vatCategoryValue, parseVatCategory, kSupportedCurrencies;

export 'quotes_service.dart' show VatCategory, vatCategoryValue, parseVatCategory, kSupportedCurrencies;

class InvoiceItem {
  final String description;
  final double quantity;
  final double unitPrice;
  InvoiceItem({required this.description, required this.quantity, required this.unitPrice});

  factory InvoiceItem.fromJson(Map<String, dynamic> j) => InvoiceItem(
        description: j['description'] ?? '',
        quantity: (j['quantity'] as num?)?.toDouble() ?? 0,
        unitPrice: (j['unitPrice'] as num?)?.toDouble() ?? 0,
      );

  Map<String, dynamic> toJson() => {'description': description, 'quantity': quantity, 'unitPrice': unitPrice};
}

enum InvoiceStatus { draft, sent, paid, cancelled }

InvoiceStatus _parseInvoiceStatus(String? s) => switch (s) {
      'sent' => InvoiceStatus.sent,
      'paid' => InvoiceStatus.paid,
      'cancelled' => InvoiceStatus.cancelled,
      _ => InvoiceStatus.draft,
    };

class Invoice {
  final int id;
  final String? invoiceNumber;
  final String clientName;
  final String? clientEmail;
  final String? clientTaxId;
  final List<InvoiceItem> items;
  final double total;
  final InvoiceStatus status;
  final String currency;
  final VatCategory vatCategory;
  final DateTime createdAt;

  Invoice({
    required this.id, this.invoiceNumber, required this.clientName, this.clientEmail, this.clientTaxId,
    required this.items, required this.total, required this.status,
    required this.currency, required this.vatCategory, required this.createdAt,
  });

  factory Invoice.fromJson(Map<String, dynamic> j) => Invoice(
        id: j['id'],
        invoiceNumber: j['invoiceNumber'],
        clientName: j['clientName'] ?? '',
        clientEmail: j['clientEmail'],
        clientTaxId: j['clientTaxId'],
        items: (j['items'] as List<dynamic>? ?? []).map((e) => InvoiceItem.fromJson(e)).toList(),
        total: (j['total'] as num?)?.toDouble() ?? 0,
        status: _parseInvoiceStatus(j['status']),
        currency: j['currency'] ?? 'ILS',
        vatCategory: parseVatCategory(j['vatCategory']),
        createdAt: DateTime.tryParse(j['createdAt'] ?? '') ?? DateTime.now(),
      );
}

class InvoicesService {
  InvoicesService(this._api);
  final ApiService _api;

  Future<List<Invoice>> list() async {
    final res = await _api.get('/invoices');
    return (res as List<dynamic>).map((e) => Invoice.fromJson(e)).toList();
  }

  Future<Uint8List> getPdf(int id) => _api.getBytes('/invoices/$id/pdf');

  Future<Invoice> create({
    required String clientName,
    String? clientEmail,
    String? clientTaxId,
    required List<InvoiceItem> items,
    String? notes,
    int? quoteId,
    int? deliveryNoteId,
    String? chainId,
    String currency = 'ILS',
    VatCategory vatCategory = VatCategory.standard,
  }) async {
    final res = await _api.post('/invoices', {
      'clientName': clientName,
      if (clientEmail != null && clientEmail.isNotEmpty) 'clientEmail': clientEmail,
      if (clientTaxId != null && clientTaxId.isNotEmpty) 'clientTaxId': clientTaxId,
      'items': items.map((i) => i.toJson()).toList(),
      if (notes != null && notes.isNotEmpty) 'notes': notes,
      if (quoteId != null) 'quoteId': quoteId,
      if (deliveryNoteId != null) 'deliveryNoteId': deliveryNoteId,
      if (chainId != null) 'chainId': chainId,
      if (currency != 'ILS') 'currency': currency,
      'vatCategory': vatCategoryValue(vatCategory),
    });
    return Invoice.fromJson(res);
  }

  Future<void> markSent(int id) => _api.post('/invoices/$id/send', {});
  Future<void> markPaid(int id) => _api.post('/invoices/$id/mark-paid', {});
  Future<void> delete(int id) => _api.delete('/invoices/$id');
}
