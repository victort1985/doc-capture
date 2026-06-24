import 'dart:typed_data';
import 'package:dio/dio.dart';
import 'package:http_parser/http_parser.dart';
import '../services/api_service.dart';

// ── Vehicle ───────────────────────────────────────────────────────────────────

class Vehicle {
  final int id;
  final String make;
  final String model;
  final int? year;
  final String licensePlate;
  final String? color;
  final String? notes;
  final String? lastInspectionDate;
  final String? lastTestDate;
  final bool isActive;
  final int currentMileage;
  final String? assignedUserName;

  Vehicle({
    required this.id, required this.make, required this.model,
    this.year, required this.licensePlate, this.color, this.notes,
    this.lastInspectionDate, this.lastTestDate, required this.isActive,
    this.currentMileage = 0, this.assignedUserName,
  });

  factory Vehicle.fromJson(Map<String, dynamic> j) => Vehicle(
    id: j['id'], make: j['make'] ?? '', model: j['model'] ?? '',
    year: j['year'], licensePlate: j['licensePlate'] ?? '',
    color: j['color'], notes: j['notes'],
    lastInspectionDate: j['lastInspectionDate'], lastTestDate: j['lastTestDate'],
    isActive: j['isActive'] ?? true,
    currentMileage: j['currentMileage'] ?? 0,
    assignedUserName: j['assignedUser']?['username'],
  );
}

class VehicleDocument {
  final int id;
  final String originalName;
  final String? description;
  final String? mimetype;
  final String createdAt;

  VehicleDocument({required this.id, required this.originalName, this.description, this.mimetype, required this.createdAt});

  bool get isImage => mimetype?.startsWith('image/') == true;
  bool get isPdf => mimetype == 'application/pdf';

  factory VehicleDocument.fromJson(Map<String, dynamic> j) => VehicleDocument(
    id: j['id'], originalName: j['originalName'] ?? '',
    description: j['description'], mimetype: j['mimetype'],
    createdAt: j['createdAt'] ?? '',
  );
}

class FuelRefuel {
  final int id;
  final String date;
  final double liters;
  final double? cost;
  final int? odometer;
  final String? station;
  final String? notes;

  FuelRefuel({required this.id, required this.date, required this.liters, this.cost, this.odometer, this.station, this.notes});

  factory FuelRefuel.fromJson(Map<String, dynamic> j) => FuelRefuel(
    id: j['id'], date: j['date'] ?? '',
    liters: double.tryParse(j['liters'].toString()) ?? 0,
    cost: j['cost'] != null ? double.tryParse(j['cost'].toString()) : null,
    odometer: j['odometer'],
    station: j['station'], notes: j['notes'],
  );
}

class FleetService {
  FleetService(this._api);
  final ApiService _api;

  Future<List<Vehicle>> listVehicles() async {
    final data = await _api.get('/fleet/vehicles') as List? ?? [];
    return data.map((j) => Vehicle.fromJson(j as Map<String, dynamic>)).toList();
  }

  Future<List<Map<String, dynamic>>> listReminders() async {
    final data = await _api.get('/fleet/reminders') as List? ?? [];
    return data.cast<Map<String, dynamic>>();
  }

  Future<List<FuelRefuel>> listRefuels(int vehicleId) async {
    final data = await _api.get('/fleet/vehicles/$vehicleId/refuels') as List? ?? [];
    return data.map((j) => FuelRefuel.fromJson(j as Map<String, dynamic>)).toList();
  }

  Future<void> addRefuel(int vehicleId, Map<String, dynamic> fields) =>
      _api.post('/fleet/vehicles/$vehicleId/refuels', fields);

  Future<void> updateMileage(int vehicleId, int mileage) =>
      _api.patch('/fleet/vehicles/$vehicleId', {'currentMileage': mileage});

  Future<List<VehicleDocument>> listDocuments(int vehicleId) async {
    final data = await _api.get('/fleet/vehicles/$vehicleId/documents') as List? ?? [];
    return data.map((j) => VehicleDocument.fromJson(j as Map<String, dynamic>)).toList();
  }

  Future<void> uploadDocument(int vehicleId, String filePath, String filename, String mimetype, {String? description}) async {
    final formData = FormData.fromMap({
      'file': await MultipartFile.fromFile(filePath, filename: filename, contentType: MediaType.parse(mimetype)),
      if (description != null) 'description': description,
    });
    await _api.postFormData('/fleet/vehicles/$vehicleId/documents', formData);
  }

  Future<Uint8List> downloadDocument(int docId) =>
      _api.getBytes('/fleet/documents/$docId/download');

  Future<void> deleteDocument(int docId) =>
      _api.delete('/fleet/documents/$docId');
}

// ── Warehouse ─────────────────────────────────────────────────────────────────

class WarehouseCategory {
  final int id;
  final String name;
  WarehouseCategory({required this.id, required this.name});
  factory WarehouseCategory.fromJson(Map<String, dynamic> j) => WarehouseCategory(id: j['id'], name: j['name'] ?? '');
}

class WarehouseItem {
  final int id;
  final String name;
  final String barcode;
  final String? description;
  final WarehouseCategory? category;
  final int quantity;
  final String? unit;
  final String? location;
  final String? notes;

  WarehouseItem({required this.id, required this.name, required this.barcode, this.description, this.category, required this.quantity, this.unit, this.location, this.notes});

  factory WarehouseItem.fromJson(Map<String, dynamic> j) => WarehouseItem(
    id: j['id'], name: j['name'] ?? '', barcode: j['barcode'] ?? '',
    description: j['description'],
    category: j['category'] != null ? WarehouseCategory.fromJson(j['category']) : null,
    quantity: j['quantity'] ?? 0,
    unit: j['unit'], location: j['location'], notes: j['notes'],
  );
}

class WarehouseTransaction {
  final int id;
  final String type;
  final int quantity;
  final String? reason;
  final String createdAt;
  final String? byUsername;

  WarehouseTransaction({required this.id, required this.type, required this.quantity, this.reason, required this.createdAt, this.byUsername});

  factory WarehouseTransaction.fromJson(Map<String, dynamic> j) => WarehouseTransaction(
    id: j['id'], type: j['type'] ?? '',
    quantity: j['quantity'] ?? 0, reason: j['reason'],
    createdAt: j['createdAt'] ?? '',
    byUsername: j['registeredBy']?['username'],
  );
}

class WarehouseService {
  WarehouseService(this._api);
  final ApiService _api;

  Future<List<WarehouseCategory>> listCategories() async {
    final data = await _api.get('/warehouse/categories') as List? ?? [];
    return data.map((j) => WarehouseCategory.fromJson(j as Map<String, dynamic>)).toList();
  }

  Future<List<WarehouseItem>> listItems({int? categoryId, String? q}) async {
    final params = <String, dynamic>{};
    if (categoryId != null) params['categoryId'] = categoryId;
    if (q?.isNotEmpty == true) params['q'] = q;
    final data = await _api.get('/warehouse/items', query: params) as List? ?? [];
    return data.map((j) => WarehouseItem.fromJson(j as Map<String, dynamic>)).toList();
  }

  Future<WarehouseItem?> findByBarcode(String barcode) async {
    try {
      final j = await _api.get('/warehouse/items/by-barcode/$barcode');
      if (j == null) return null;
      return WarehouseItem.fromJson(j as Map<String, dynamic>);
    } catch (_) {
      return null;
    }
  }

  Future<String> generateBarcode() async {
    return await _api.get('/warehouse/generate-barcode') as String;
  }

  Future<WarehouseItem> createItem(Map<String, dynamic> fields) async {
    final j = await _api.post('/warehouse/items', fields);
    return WarehouseItem.fromJson(j as Map<String, dynamic>);
  }

  Future<void> addTransaction(int itemId, String type, int quantity, {String? reason}) async {
    await _api.post('/warehouse/items/$itemId/transactions', {
      'type': type,
      'quantity': quantity,
      if (reason != null) 'reason': reason,
    });
  }

  Future<List<WarehouseTransaction>> listTransactions(int itemId) async {
    final data = await _api.get('/warehouse/items/$itemId/transactions') as List? ?? [];
    return data.map((j) => WarehouseTransaction.fromJson(j as Map<String, dynamic>)).toList();
  }

  Future<Map<String, dynamic>> getOrgSettings() async {
    try {
      final j = await _api.get('/delivery-note-settings');
      return (j as Map<String, dynamic>?) ?? {};
    } catch (_) { return {}; }
  }
}
