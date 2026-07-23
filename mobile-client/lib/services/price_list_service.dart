import '../services/api_service.dart';

class PriceListItem {
  final int id;
  final String name;
  final String type; // 'device' | 'service'
  final double price;

  PriceListItem({required this.id, required this.name, required this.type, required this.price});

  factory PriceListItem.fromJson(Map<String, dynamic> json) => PriceListItem(
        id: json['id'] as int,
        name: json['name'] as String,
        type: json['type'] as String? ?? 'device',
        price: (json['price'] as num?)?.toDouble() ?? 0,
      );
}

class PriceListService {
  PriceListService(this._api);
  final ApiService _api;

  Future<List<PriceListItem>> list() async {
    final res = await _api.get('/price-list');
    return (res as List<dynamic>).map((e) => PriceListItem.fromJson(e)).toList();
  }
}
