import 'dart:typed_data';
import '../services/api_service.dart';

enum PaymentMethod { cash, creditCard, bankTransfer, check, bit, standingOrder }

PaymentMethod _parsePaymentMethod(String? s) => switch (s) {
      'credit_card' => PaymentMethod.creditCard,
      'bank_transfer' => PaymentMethod.bankTransfer,
      'check' => PaymentMethod.check,
      'bit' => PaymentMethod.bit,
      'standing_order' => PaymentMethod.standingOrder,
      _ => PaymentMethod.cash,
    };

String paymentMethodValue(PaymentMethod m) => switch (m) {
      PaymentMethod.cash => 'cash',
      PaymentMethod.creditCard => 'credit_card',
      PaymentMethod.bankTransfer => 'bank_transfer',
      PaymentMethod.check => 'check',
      PaymentMethod.bit => 'bit',
      PaymentMethod.standingOrder => 'standing_order',
    };

class Payment {
  final int id;
  final String? paymentNumber;
  final String clientName;
  final String? clientEmail;
  final double amount;
  final PaymentMethod method;
  final int? invoiceId;
  final bool hasChainSummary;
  final DateTime createdAt;

  Payment({
    required this.id, this.paymentNumber, required this.clientName, this.clientEmail,
    required this.amount, required this.method, this.invoiceId, this.hasChainSummary = false,
    required this.createdAt,
  });

  factory Payment.fromJson(Map<String, dynamic> j) => Payment(
        id: j['id'],
        paymentNumber: j['paymentNumber'],
        clientName: j['clientName'] ?? '',
        clientEmail: j['clientEmail'],
        amount: (j['amount'] as num?)?.toDouble() ?? 0,
        method: _parsePaymentMethod(j['method']),
        invoiceId: j['invoiceId'],
        hasChainSummary: j['chainSummaryPath'] != null,
        createdAt: DateTime.tryParse(j['createdAt'] ?? '') ?? DateTime.now(),
      );
}

/// Payment is a SIMULATOR — recording one here does not move real
/// money or talk to any payment gateway. It exists so the document
/// chain (quote -> order -> delivery note -> invoice -> payment) has
/// a concrete "fully closed out" signal, matching the server-side
/// Payment entity's own doc comment.
class PaymentsService {
  PaymentsService(this._api);
  final ApiService _api;

  Future<List<Payment>> list() async {
    final res = await _api.get('/payments');
    return (res as List<dynamic>).map((e) => Payment.fromJson(e)).toList();
  }

  /// [asCopy] renders a fresh "נאמן למקור" (certified true copy) stamped
  /// version instead of the stored original — an explicit, opt-in
  /// reprint action; the very first PDF (at creation) is always the
  /// plain, unstamped original.
  Future<Uint8List> getPdf(int id, {bool asCopy = false}) =>
      _api.getBytes('/payments/$id/pdf${asCopy ? '?copy=true' : ''}');

  Future<Uint8List> getChainSummaryPdf(int id) => _api.getBytes('/payments/$id/chain-summary-pdf');

  Future<Payment> create({
    required String clientName,
    String? clientEmail,
    required double amount,
    PaymentMethod method = PaymentMethod.cash,
    String? notes,
    int? invoiceId,
    String? chainId,
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
    final res = await _api.post('/payments', {
      'clientName': clientName,
      if (clientEmail != null && clientEmail.isNotEmpty) 'clientEmail': clientEmail,
      'amount': amount,
      'method': paymentMethodValue(method),
      if (notes != null && notes.isNotEmpty) 'notes': notes,
      if (invoiceId != null) 'invoiceId': invoiceId,
      if (chainId != null) 'chainId': chainId,
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
    return Payment.fromJson(res);
  }

  Future<void> delete(int id) => _api.delete('/payments/$id');
}
