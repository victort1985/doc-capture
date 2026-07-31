import '../services/api_service.dart';

class Expense {
  final int id;
  final String date;
  final String description;
  final String? category;
  final double amount;
  final String method; // 'cash' | 'bank'
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
        method: j['method'] ?? 'cash',
        createdAt: DateTime.tryParse(j['createdAt'] ?? '') ?? DateTime.now(),
      );
}

/// Read-only for now — see the same note on ReturnsService. A field
/// worker logging a receipt on the spot (photo + amount) is exactly
/// the kind of thing this screen should eventually support creating,
/// but that needs its own camera/upload flow design, not a quick
/// addition alongside three other new read-only screens at once.
class ExpensesService {
  ExpensesService(this._api);
  final ApiService _api;

  Future<List<Expense>> list() async {
    final res = await _api.get('/expenses');
    return (res as List<dynamic>).map((e) => Expense.fromJson(e)).toList();
  }
}
