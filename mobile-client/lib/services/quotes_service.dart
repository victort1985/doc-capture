import 'dart:typed_data';
import '../services/api_service.dart';

/// Shared with invoices_service.dart's own copy of the same 3
/// categories — kept as plain strings (matching exactly what the
/// backend's vatCategory field expects) rather than importing across
/// service files for such a small, self-contained concept.
enum VatCategory { standard, zero, exempt }

String vatCategoryValue(VatCategory c) => switch (c) {
      VatCategory.standard => 'standard',
      VatCategory.zero => 'zero',
      VatCategory.exempt => 'exempt',
    };

VatCategory parseVatCategory(String? s) => switch (s) {
      'zero' => VatCategory.zero,
      'exempt' => VatCategory.exempt,
      _ => VatCategory.standard,
    };

/// The 4 currencies the backend's own CurrencyModule supports (see
/// server's ExchangeRateService.SUPPORTED_CURRENCIES) — not a
/// general-purpose ISO 4217 list.
const kSupportedCurrencies = ['ILS', 'USD', 'EUR', 'GBP'];

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
  final String currency;
  final VatCategory vatCategory;
  final bool isTemplate;
  final int? templateNumber;
  final String? templateName;
  final DateTime createdAt;

  Quote({
    required this.id, this.quoteNumber, required this.clientName, this.clientEmail,
    required this.items, required this.total, required this.status,
    required this.currency, required this.vatCategory,
    this.isTemplate = false, this.templateNumber, this.templateName,
    required this.createdAt,
  });

  factory Quote.fromJson(Map<String, dynamic> j) => Quote(
        id: j['id'],
        quoteNumber: j['quoteNumber'],
        clientName: j['clientName'] ?? '',
        clientEmail: j['clientEmail'],
        items: (j['items'] as List<dynamic>? ?? []).map((e) => QuoteItem.fromJson(e)).toList(),
        total: (j['total'] as num?)?.toDouble() ?? 0,
        status: _parseQuoteStatus(j['status']),
        currency: j['currency'] ?? 'ILS',
        vatCategory: parseVatCategory(j['vatCategory']),
        isTemplate: j['isTemplate'] ?? false,
        templateNumber: j['templateNumber'],
        templateName: j['templateName'],
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
    String currency = 'ILS',
    VatCategory vatCategory = VatCategory.standard,
  }) async {
    final res = await _api.post('/quotes', {
      'clientName': clientName,
      if (clientEmail != null && clientEmail.isNotEmpty) 'clientEmail': clientEmail,
      'items': items.map((i) => i.toJson()).toList(),
      if (notes != null && notes.isNotEmpty) 'notes': notes,
      if (currency != 'ILS') 'currency': currency,
      'vatCategory': vatCategoryValue(vatCategory),
    });
    return Quote.fromJson(res);
  }

  Future<void> markSent(int id) => _api.post('/quotes/$id/send', {});
  Future<void> delete(int id) => _api.delete('/quotes/$id');

  /// The separate "reusable starting points" list — excluded from
  /// list() above, same as the admin panel's own Quotes/Templates
  /// toggle.
  Future<List<Quote>> listTemplates() async {
    final res = await _api.get('/quotes/templates');
    return (res as List<dynamic>).map((e) => Quote.fromJson(e)).toList();
  }

  Future<Quote> saveAsTemplate(int id, String templateName) async {
    final res = await _api.post('/quotes/$id/save-as-template', {'templateName': templateName});
    return Quote.fromJson(res);
  }

  Future<void> unmarkTemplate(int id) => _api.post('/quotes/$id/unmark-template', {});

  /// Creates a genuine new draft quote from a template — every
  /// parameter here is an OVERRIDE of the template's own value
  /// (matches CreateFromTemplateDto on the backend being a full
  /// Partial<CreateQuoteDto>); anything left null keeps whatever the
  /// template already had. This is what makes "replace or add only
  /// part of the information" (the whole point of this feature) just
  /// a matter of only passing the fields that actually changed.
  Future<Quote> createFromTemplate(
    int templateId, {
    String? clientName,
    String? clientEmail,
    List<QuoteItem>? items,
    String? notes,
    String? currency,
    VatCategory? vatCategory,
  }) async {
    final res = await _api.post('/quotes/from-template/$templateId', {
      if (clientName != null) 'clientName': clientName,
      if (clientEmail != null) 'clientEmail': clientEmail,
      if (items != null) 'items': items.map((i) => i.toJson()).toList(),
      if (notes != null) 'notes': notes,
      if (currency != null) 'currency': currency,
      if (vatCategory != null) 'vatCategory': vatCategoryValue(vatCategory),
    });
    return Quote.fromJson(res);
  }
}
