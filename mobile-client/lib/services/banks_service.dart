import 'api_service.dart';

class BankReference {
  BankReference({required this.code, required this.name, this.nameEn, required this.status});

  final String code;
  final String name;
  final String? nameEn;
  final String status; // 'active' | 'historical' | 'special'

  factory BankReference.fromJson(Map<String, dynamic> j) => BankReference(
    code: j['code'] as String,
    name: j['name'] as String,
    nameEn: j['nameEn'] as String?,
    status: j['status'] as String,
  );

  /// What gets written into the field once picked, and what the
  /// picker's own search re-matches against if the person edits it
  /// further — just the bank's name, matching the flat bankName
  /// string Payment already stores (see BankBranchPicker.tsx's own
  /// admin-panel equivalent for the same reasoning).
  String get displayName => name;
}

class BankBranch {
  BankBranch({required this.bankCode, required this.branchNumber, this.branchName, this.city});

  final String bankCode;
  final String branchNumber;
  final String? branchName;
  final String? city;

  factory BankBranch.fromJson(Map<String, dynamic> j) => BankBranch(
    bankCode: j['bankCode'] as String,
    branchNumber: j['branchNumber'] as String,
    branchName: j['branchName'] as String?,
    city: j['city'] as String?,
  );
}

class BanksService {
  BanksService(this._api);
  final ApiService _api;

  Future<List<BankReference>> search(String q) async {
    final data = await _api.get('/banks', query: {'q': q}) as List? ?? [];
    return data.map((j) => BankReference.fromJson(j as Map<String, dynamic>)).toList();
  }

  Future<List<BankBranch>> searchBranches(String bankCode, String q) async {
    final data = await _api.get('/banks/branches', query: {'bankCode': bankCode, 'q': q}) as List? ?? [];
    return data.map((j) => BankBranch.fromJson(j as Map<String, dynamic>)).toList();
  }
}
