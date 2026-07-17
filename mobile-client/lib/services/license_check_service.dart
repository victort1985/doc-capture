import 'api_service.dart';

class LicenseStatus {
  final String state; // NOT_ACTIVATED | OK | WARNING | ADMIN_LOCKED | FULL_LOCKED
  final double? hoursSinceCheck;
  LicenseStatus({required this.state, this.hoursSinceCheck});

  factory LicenseStatus.fromJson(Map<String, dynamic> j) => LicenseStatus(
        state: j['state'] ?? 'OK',
        hoursSinceCheck: (j['hoursSinceCheck'] as num?)?.toDouble(),
      );

  bool get isFullLocked => state == 'FULL_LOCKED';
  bool get isAdminLocked => state == 'ADMIN_LOCKED';
}

class LicenseCheckService {
  LicenseCheckService(this._api);
  final ApiService _api;

  Future<LicenseStatus> getStatus() async {
    final res = await _api.get('/license/status');
    return LicenseStatus.fromJson(res as Map<String, dynamic>);
  }
}
