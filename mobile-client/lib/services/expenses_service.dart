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

/// A field worker logging a receipt on the spot still doesn't have a
/// camera/photo-upload flow here — that's its own bit of design work.
/// Creating an expense with just amount/description/category/method
/// (no receipt attachment) is covered though.
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
    String method = 'cash',
  }) async {
    final res = await _api.post('/expenses', {
      if (date != null && date.isNotEmpty) 'date': date,
      'description': description,
      if (category != null && category.isNotEmpty) 'category': category,
      'amount': amount,
      'method': method,
    });
    return Expense.fromJson(res);
  }
}
