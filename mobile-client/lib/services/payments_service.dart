import 'dart:typed_data';
import '../services/api_service.dart';

enum PaymentMethod { card, cash, transfer }

PaymentMethod _parsePaymentMethod(String? s) => switch (s) {
      'cash' => PaymentMethod.cash,
      'transfer' => PaymentMethod.transfer,
      _ => PaymentMethod.card,
    };

String paymentMethodValue(PaymentMethod m) => switch (m) {
      PaymentMethod.cash => 'cash',
      PaymentMethod.transfer => 'transfer',
      PaymentMethod.card => 'card',
    };

class Payment {
  final int id;
  final String? paymentNumber;
  final String clientName;
  final String? clientEmail;
  final double amount;
  final PaymentMethod method;
  final int? invoiceId;
  final DateTime createdAt;

  Payment({
    required this.id, this.paymentNumber, required this.clientName, this.clientEmail,
    required this.amount, required this.method, this.invoiceId, required this.createdAt,
  });

  factory Payment.fromJson(Map<String, dynamic> j) => Payment(
        id: j['id'],
        paymentNumber: j['paymentNumber'],
        clientName: j['clientName'] ?? '',
        clientEmail: j['clientEmail'],
        amount: (j['amount'] as num?)?.toDouble() ?? 0,
        method: _parsePaymentMethod(j['method']),
        invoiceId: j['invoiceId'],
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

  Future<Uint8List> getPdf(int id) => _api.getBytes('/payments/$id/pdf');

  Future<Payment> create({
    required String clientName,
    String? clientEmail,
    required double amount,
    PaymentMethod method = PaymentMethod.card,
    String? notes,
    int? invoiceId,
    String? chainId,
  }) async {
    final res = await _api.post('/payments', {
      'clientName': clientName,
      if (clientEmail != null && clientEmail.isNotEmpty) 'clientEmail': clientEmail,
      'amount': amount,
      'method': paymentMethodValue(method),
      if (notes != null && notes.isNotEmpty) 'notes': notes,
      if (invoiceId != null) 'invoiceId': invoiceId,
      if (chainId != null) 'chainId': chainId,
    });
    return Payment.fromJson(res);
  }

  Future<void> delete(int id) => _api.delete('/payments/$id');
}
