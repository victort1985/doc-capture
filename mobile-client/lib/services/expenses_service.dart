import 'dart:io';
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

  Expense({
    required this.id, required this.date, required this.description, this.category,
    required this.amount, required this.method, required this.createdAt,
  });

  factory Expense.fromJson(Map<String, dynamic> j) => Expense(
        id: j['id'],
        date: j['date'] ?? '',
        description: j['description'] ?? '',
        category: j['category'],
        amount: (j['amount'] as num?)?.toDouble() ?? 0,
        method: _parseExpenseMethod(j['method']),
        createdAt: DateTime.tryParse(j['createdAt'] ?? '') ?? DateTime.now(),
      );
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
  }) async {
    final res = await _api.post('/expenses', {
      if (date != null && date.isNotEmpty) 'date': date,
      'description': description,
      if (category != null && category.isNotEmpty) 'category': category,
      'amount': amount,
      'method': paymentMethodValue(method),
      if (cardLast4 != null && cardLast4.isNotEmpty) 'cardLast4': cardLast4,
      if (cardType != null && cardType.isNotEmpty) 'cardType': cardType,
      if (approvalNumber != null && approvalNumber.isNotEmpty) 'approvalNumber': approvalNumber,
      if (installments != null) 'installments': installments,
      if (checkNumber != null && checkNumber.isNotEmpty) 'checkNumber': checkNumber,
      if (bankName != null && bankName.isNotEmpty) 'bankName': bankName,
      if (branchNumber != null && branchNumber.isNotEmpty) 'branchNumber': branchNumber,
      if (accountNumber != null && accountNumber.isNotEmpty) 'accountNumber': accountNumber,
      if (checkDate != null && checkDate.isNotEmpty) 'checkDate': checkDate,
      if (referenceNumber != null && referenceNumber.isNotEmpty) 'referenceNumber': referenceNumber,
    });
    return Expense.fromJson(res);
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
}
