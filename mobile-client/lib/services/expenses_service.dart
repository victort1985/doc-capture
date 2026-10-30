import 'dart:convert';
import 'dart:io';
import 'dart:typed_data';
import 'package:dio/dio.dart';
import '../services/api_service.dart';
import 'payments_service.dart' show PaymentMethod, paymentMethodValue;

/// payments_service.dart's own parser is private to that file — this
/// is a local equivalent for the same 6 string values the backend
/// sends, not a duplicate of any public symbol.
PaymentMethod _parseExpenseMethod(String? s) => switch (s) {
      'credit_card' => PaymentMethod.creditCard,
      'bank_transfer' => PaymentMethod.bankTransfer,
      'check' => PaymentMethod.check,
      'bit' => PaymentMethod.bit,
      'standing_order' => PaymentMethod.standingOrder,
      _ => PaymentMethod.cash,
    };

class Expense {
  final int id;
  final String date;
  final String description;
  final String? category;
  final double amount;
  final PaymentMethod method;
  final DateTime createdAt;
  /// The full server record — the detail/edit screens read every field from here.
  final Map<String, dynamic> raw;
  bool get hasReceipt => (raw['receiptStoragePath'] ?? '').toString().isNotEmpty;

  Expense({
    required this.id, required this.date, required this.description, this.category,
    required this.amount, required this.method, required this.createdAt, this.raw = const {},
  });

  factory Expense.fromJson(Map<String, dynamic> j) => Expense(
        id: j['id'],
        date: j['date'] ?? '',
        description: j['description'] ?? '',
        category: j['category'],
        amount: (j['amount'] as num?)?.toDouble() ?? 0,
        method: _parseExpenseMethod(j['method']),
        createdAt: DateTime.tryParse(j['createdAt'] ?? '') ?? DateTime.now(),
        raw: Map<String, dynamic>.from(j),
      );
}

/// Result of POST /expenses/scan.
class ReceiptScan {
  ReceiptScan({
    required this.fields, required this.confidence, required this.language, required this.cropped,
    required this.warnings, required this.rawText, this.image,
  });
  final Map<String, dynamic> fields;
  /// field name -> 'high' | 'low'
  final Map<String, String> confidence;
  final String language;
  final bool cropped;
  final List<String> warnings;
  final String rawText;
  /// The cleaned, straightened scan (JPEG), null if the server couldn't produce one.
  final Uint8List? image;

  factory ReceiptScan.fromJson(Map<String, dynamic> j) {
    final f = (j['fields'] as Map<String, dynamic>?) ?? <String, dynamic>{};
    final conf = <String, String>{};
    final rawConf = f['confidence'];
    if (rawConf is Map) {
      rawConf.forEach((k, v) => conf[k.toString()] = v.toString());
    }
    Uint8List? img;
    final dataUrl = j['scanImage'];
    if (dataUrl is String && dataUrl.contains(',')) {
      img = base64Decode(dataUrl.substring(dataUrl.indexOf(',') + 1));
    }
    return ReceiptScan(
      fields: f,
      confidence: conf,
      language: (f['language'] as String?) ?? 'en',
      cropped: j['cropped'] == true,
      warnings: ((j['warnings'] as List?) ?? const []).map((e) => e.toString()).toList(),
      rawText: (j['rawText'] as String?) ?? '',
      image: img,
    );
  }
}

/// A field worker logging a receipt on the spot still doesn't have a
/// camera/photo-upload flow here — that's its own bit of design work.
/// Creating an expense with amount/description/category/method (+
/// the same method-specific detail fields PaymentsService already
/// supports) is covered though.
class ExpensesService {
  ExpensesService(this._api);
  final ApiService _api;

  Future<List<Expense>> list() async {
    final res = await _api.get('/expenses');
    return (res as List<dynamic>).map((e) => Expense.fromJson(e)).toList();
  }

  Future<Expense> create({
    String? date,
    required String description,
    String? category,
    required double amount,
    PaymentMethod method = PaymentMethod.cash,
    String? cardLast4,
    String? cardType,
    String? approvalNumber,
    int? installments,
    String? checkNumber,
    String? bankName,
    String? branchNumber,
    String? accountNumber,
    String? checkDate,
    String? referenceNumber,
    String? transactionDate,
    String? vendorName,
    String? vendorTaxId,
    String? documentType,
    String? documentNumber,
    String? allocationNumber,
    double? vatAmount,
    double? vatRate,
    double? vatDeductiblePercent,
    String? currency,
    double? foreignAmount,
    double? exchangeRate,
    String? scanLanguage,
    /// when set, the expense is edited (PATCH) instead of created and cleared fields are sent as null
    int? updateId,
  }) async {
    final upd = updateId != null;
    final body = <String, dynamic>{
      if (transactionDate != null && transactionDate.isNotEmpty) 'transactionDate': transactionDate else if (upd) 'transactionDate': null,
      if (vendorName != null && vendorName.isNotEmpty) 'vendorName': vendorName else if (upd) 'vendorName': null,
      if (vendorTaxId != null && vendorTaxId.isNotEmpty) 'vendorTaxId': vendorTaxId else if (upd) 'vendorTaxId': null,
      if (documentType != null && documentType.isNotEmpty) 'documentType': documentType else if (upd) 'documentType': null,
      if (documentNumber != null && documentNumber.isNotEmpty) 'documentNumber': documentNumber else if (upd) 'documentNumber': null,
      if (allocationNumber != null && allocationNumber.isNotEmpty) 'allocationNumber': allocationNumber else if (upd) 'allocationNumber': null,
      if (vatAmount != null) 'vatAmount': vatAmount else if (upd) 'vatAmount': null,
      if (vatRate != null) 'vatRate': vatRate else if (upd) 'vatRate': null,
      if (vatDeductiblePercent != null) 'vatDeductiblePercent': vatDeductiblePercent else if (upd) 'vatDeductiblePercent': null,
      if (currency != null && currency.isNotEmpty) 'currency': currency else if (upd) 'currency': null,
      if (foreignAmount != null) 'foreignAmount': foreignAmount else if (upd) 'foreignAmount': null,
      if (exchangeRate != null) 'exchangeRate': exchangeRate else if (upd) 'exchangeRate': null,
      if (scanLanguage != null && scanLanguage.isNotEmpty) 'scanLanguage': scanLanguage,
      if (date != null && date.isNotEmpty) 'date': date,
      'description': description,
      if (category != null && category.isNotEmpty) 'category': category else if (upd) 'category': null,
      'amount': amount,
      'method': paymentMethodValue(method),
      if (cardLast4 != null && cardLast4.isNotEmpty) 'cardLast4': cardLast4 else if (upd) 'cardLast4': null,
      if (cardType != null && cardType.isNotEmpty) 'cardType': cardType else if (upd) 'cardType': null,
      if (approvalNumber != null && approvalNumber.isNotEmpty) 'approvalNumber': approvalNumber else if (upd) 'approvalNumber': null,
      if (installments != null) 'installments': installments else if (upd) 'installments': null,
      if (checkNumber != null && checkNumber.isNotEmpty) 'checkNumber': checkNumber else if (upd) 'checkNumber': null,
      if (bankName != null && bankName.isNotEmpty) 'bankName': bankName else if (upd) 'bankName': null,
      if (branchNumber != null && branchNumber.isNotEmpty) 'branchNumber': branchNumber else if (upd) 'branchNumber': null,
      if (accountNumber != null && accountNumber.isNotEmpty) 'accountNumber': accountNumber else if (upd) 'accountNumber': null,
      if (checkDate != null && checkDate.isNotEmpty) 'checkDate': checkDate else if (upd) 'checkDate': null,
      if (referenceNumber != null && referenceNumber.isNotEmpty) 'referenceNumber': referenceNumber else if (upd) 'referenceNumber': null,
    };
    final res = upd ? await _api.patch('/expenses/$updateId', body) : await _api.post('/expenses', body);
    return Expense.fromJson(Map<String, dynamic>.from(res as Map));
  }

  Future<Expense> get(int id) async {
    final res = await _api.get('/expenses/$id');
    return Expense.fromJson(Map<String, dynamic>.from(res as Map));
  }

  /// The stored receipt image (bytes), or throws if none/unreachable.
  Future<Uint8List> fetchReceipt(int id) => _api.getBytes('/expenses/$id/receipt');

  /// Extracts amount/date/vendor from a receipt photo BEFORE the
  /// expense is created, to pre-fill the form — separate from
  /// attachReceipt() above, which needs an existing expense id.
  /// Every field can come back null if OCR couldn't confidently find
  /// it; the form treats these as a starting point to review/edit,
  /// never as final.
  Future<({double? amount, String? date, String? vendor})> parseReceipt(File photo) async {
    final formData = FormData.fromMap({
      'file': await MultipartFile.fromFile(photo.path, filename: 'receipt.jpg'),
    });
    final res = await _api.postFormData('/expenses/parse-receipt', formData);
    final map = res as Map<String, dynamic>;
    return (
      amount: (map['amount'] as num?)?.toDouble(),
      date: map['date'] as String?,
      vendor: map['vendor'] as String?,
    );
  }

  /// Uploads a receipt photo for an already-created expense — a
  /// separate call rather than part of create(), matching the
  /// backend's own POST /expenses/:id/receipt (attach-after-create),
  /// which the admin panel's file upload already used the same way.
  Future<void> attachReceipt(int expenseId, File photo) async {
    final formData = FormData.fromMap({
      'file': await MultipartFile.fromFile(photo.path, filename: 'receipt.jpg'),
    });
    await _api.postFormData('/expenses/$expenseId/receipt', formData);
  }

  /// Full receipt scanner (POST /expenses/scan): the server crops,
  /// straightens and cleans the photo, detects its language, reads it
  /// and returns every field it could extract with a per-field
  /// confidence, plus the cleaned scan. Nothing is saved by this call.
  Future<ReceiptScan> scanReceipt(File photo) async {
    final formData = FormData.fromMap({
      'file': await MultipartFile.fromFile(photo.path, filename: 'receipt.jpg'),
    });
    final res = await _api.postFormData('/expenses/scan', formData);
    return ReceiptScan.fromJson(res as Map<String, dynamic>);
  }

  /// Stores the cleaned scan (JPEG bytes returned by [scanReceipt]).
  Future<void> attachReceiptBytes(int expenseId, Uint8List bytes) async {
    final formData = FormData.fromMap({
      'file': MultipartFile.fromBytes(bytes, filename: 'receipt.jpg'),
    });
    await _api.postFormData('/expenses/$expenseId/receipt', formData);
  }
}
