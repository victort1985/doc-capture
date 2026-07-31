import '../services/api_service.dart';

enum RentalStatus { active, returned }

RentalStatus parseRentalStatus(String? s) => s == 'returned' ? RentalStatus.returned : RentalStatus.active;
String rentalStatusValue(RentalStatus s) => s == RentalStatus.returned ? 'returned' : 'active';

class RentalWarehouseItem {
  final int id;
  final String name;
  final String barcode;
  RentalWarehouseItem({required this.id, required this.name, required this.barcode});

  factory RentalWarehouseItem.fromJson(Map<String, dynamic> j) => RentalWarehouseItem(
        id: j['id'], name: j['name'] ?? '', barcode: j['barcode'] ?? '',
      );
}

class Rental {
  final int id;
  final String? rentalNumber;
  final RentalWarehouseItem? warehouseItem;
  final int quantity;
  final String clientName;
  final String? clientPhone;
  final String? description;
  final String startDate;
  final String dueDate;
  final RentalStatus status;
  final DateTime createdAt;

  Rental({
    required this.id, this.rentalNumber, this.warehouseItem, required this.quantity,
    required this.clientName, this.clientPhone, this.description,
    required this.startDate, required this.dueDate, required this.status, required this.createdAt,
  });

  factory Rental.fromJson(Map<String, dynamic> j) => Rental(
        id: j['id'],
        rentalNumber: j['rentalNumber'],
        warehouseItem: j['warehouseItem'] != null ? RentalWarehouseItem.fromJson(j['warehouseItem']) : null,
        quantity: j['quantity'] ?? 1,
        clientName: j['clientName'] ?? '',
        clientPhone: j['clientPhone'],
        description: j['description'],
        startDate: j['startDate'] ?? '',
        dueDate: j['dueDate'] ?? '',
        status: parseRentalStatus(j['status']),
        createdAt: DateTime.tryParse(j['createdAt'] ?? '') ?? DateTime.now(),
      );

  /// Whole-days remaining until dueDate (negative = overdue) — the
  /// same "compare calendar days, not raw hour math" approach used
  /// everywhere else in this app that colors by days-until-due, so a
  /// rental due "today" always reads as 0 regardless of what time of
  /// day it currently is.
  int get daysUntilDue {
    final due = DateTime.parse(dueDate);
    final dueDay = DateTime(due.year, due.month, due.day);
    final now = DateTime.now();
    final today = DateTime(now.year, now.month, now.day);
    return dueDay.difference(today).inDays;
  }
}

class RentalsService {
  RentalsService(this._api);
  final ApiService _api;

  Future<List<Rental>> list({RentalStatus? status}) async {
    final res = await _api.get('/rentals', query: status != null ? {'status': rentalStatusValue(status)} : null);
    return (res as List<dynamic>).map((e) => Rental.fromJson(e)).toList();
  }

  Future<List<Rental>> listActive() async {
    final res = await _api.get('/rentals/active');
    return (res as List<dynamic>).map((e) => Rental.fromJson(e)).toList();
  }

  Future<Rental> create({
    required int warehouseItemId,
    int quantity = 1,
    int? contactId,
    required String clientName,
    String? clientPhone,
    String? description,
    String? startDate,
    required String dueDate,
  }) async {
    final res = await _api.post('/rentals', {
      'warehouseItemId': warehouseItemId,
      'quantity': quantity,
      if (contactId != null) 'contactId': contactId,
      'clientName': clientName,
      if (clientPhone != null && clientPhone.isNotEmpty) 'clientPhone': clientPhone,
      if (description != null && description.isNotEmpty) 'description': description,
      if (startDate != null && startDate.isNotEmpty) 'startDate': startDate,
      'dueDate': dueDate,
    });
    return Rental.fromJson(res);
  }

  Future<void> markReturned(int id) => _api.post('/rentals/$id/return', {});
}
