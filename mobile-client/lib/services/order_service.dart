import 'dart:io';
import 'dart:typed_data';
import 'package:dio/dio.dart';
import 'api_service.dart';

class OrderListItem {
  OrderListItem({
    required this.id,
    required this.orderDate,
    required this.organization,
    required this.poNumberLast4,
    required this.invoiceNumber,
    required this.completed,
    required this.generatedName,
  });

  final int id;
  final String orderDate;
  final String organization;
  final String poNumberLast4;
  final String? invoiceNumber;
  final bool completed;
  final String generatedName;

  factory OrderListItem.fromJson(Map<String, dynamic> json) => OrderListItem(
        id: json['id'] as int,
        orderDate: json['orderDate'] as String,
        organization: json['organization'] as String,
        poNumberLast4: json['poNumberLast4'] as String,
        invoiceNumber: json['invoiceNumber'] as String?,
        completed: json['completed'] as bool,
        generatedName: json['generatedName'] as String,
      );
}

/// The capture -> auto-extract (order date / ordering organization / PO
/// number, via server-side OCR — see the server's
/// OrderPdfParserService) -> list -> add-delivery-note-and-complete
/// flow for supplier purchase orders, whether they arrived by email or
/// were uploaded manually here.
class OrderService {
  OrderService(this._api);

  final ApiService _api;

  Future<List<OrderListItem>> list() async {
    final response = await _api.get('/orders');
    return (response as List).map((j) => OrderListItem.fromJson(j as Map<String, dynamic>)).toList();
  }

  Future<Uint8List> downloadPdf(int orderId) => _api.getBytes('/orders/$orderId/pdf');

  /// Uploads an already-produced single-page PDF (from the same scan
  /// review flow used elsewhere in the app) as a new manually-captured
  /// order. Field extraction happens server-side the same way an
  /// emailed order's does.
  Future<OrderListItem> createManual(File pdfFile) async {
    final formData = FormData.fromMap({
      'file': await MultipartFile.fromFile(pdfFile.path, filename: 'order.pdf'),
    });
    final response = await _api.postFormData('/orders', formData);
    return OrderListItem.fromJson(response as Map<String, dynamic>);
  }

  /// Appends the scanned delivery note as page 2+ of the order PDF and
  /// sets the real invoice number in place of the "0000" placeholder.
  Future<OrderListItem> addInvoice(int orderId, String invoiceNumber, Uint8List invoicePdfBytes, {String? description}) async {
    final formData = FormData.fromMap({
      'invoiceNumber': invoiceNumber,
      if (description != null && description.trim().isNotEmpty) 'description': description.trim(),
      'file': MultipartFile.fromBytes(invoicePdfBytes, filename: 'invoice.pdf'),
    });
    final response = await _api.postFormData('/orders/$orderId/invoice', formData);
    return OrderListItem.fromJson(response as Map<String, dynamic>);
  }

  Future<void> delete(int orderId) => _api.delete('/orders/$orderId');
}
