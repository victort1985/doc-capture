import 'package:flutter/foundation.dart';
import '../services/api_service.dart';
import '../services/auth_service.dart';
import '../services/settings_service.dart';

/// Root app state: current locale + current user session.
///
/// Deliberately much simpler than the main Vixor ERP app's own
/// AppState — VixorTK is a self-service companion app (every screen
/// shows "my own" data: my hours, my payslip, my clock-in status),
/// so none of the main app's multi-org switching, push notifications,
/// setup wizard, or Terms-of-Service gating apply here. Those all
/// live in main-app-specific onboarding/admin flows this app has no
/// need to duplicate.
class AppState extends ChangeNotifier {
  AppState(this._settingsService, this._authService, this._apiService);

  final SettingsService _settingsService;
  final AuthService _authService;
  final ApiService _apiService;

  AuthService get authService => _authService;
  ApiService get apiService => _apiService;

  String languageCode = SettingsService.defaultLanguage; // 'he' by default
  AuthUser? currentUser;
  bool initialized = false;

  ConnectionConfig connectionConfig =
      const ConnectionConfig(mode: ConnectionMode.direct, address: '');

  Future<(String?, String?)> getCfServiceToken() => _settingsService.getCfServiceToken();

  Future<void> refreshCurrentUser() async {
    final updated = await _authService.fetchCurrentUser();
    if (updated != null) {
      currentUser = updated;
      notifyListeners();
    }
  }

  Future<void> bootstrap() async {
    languageCode = await _settingsService.getLanguage();
    connectionConfig = await _settingsService.getConnectionConfig();
    await _applyConnectionConfig();
    // Deliberately no token-restore/silent-resume — every fresh app
    // start goes through the real login screen, same reasoning as the
    // main app's own AuthService.login() doc comment: a persisted
    // token silently resuming would skip past this app's own steps
    // in the future if any get added, and there's no meaningful
    // "session cost" to re-logging in given saved-credentials
    // prefill (see LoginScreen).
    initialized = true;
    notifyListeners();
  }

  Future<void> _applyConnectionConfig() async {
    final baseUrl = connectionConfig.toApiBaseUrl();
    if (baseUrl.isEmpty) return;
    final (cfId, cfSecret) = await getCfServiceToken();
    _apiService.configureServer(
      baseUrl: baseUrl,
      cfAccessClientId: connectionConfig.mode == ConnectionMode.cloud ? cfId : null,
      cfAccessClientSecret: connectionConfig.mode == ConnectionMode.cloud ? cfSecret : null,
    );
  }

  Future<void> updateConnectionConfig(
    ConnectionConfig config, {
    String? cfAccessClientId,
    String? cfAccessClientSecret,
  }) async {
    connectionConfig = config;
    await _settingsService.setConnectionConfig(config);
    if (config.mode == ConnectionMode.cloud) {
      await _settingsService.setCfServiceToken(cfAccessClientId, cfAccessClientSecret);
    }
    await _applyConnectionConfig();
    // Connection target changed -> any existing session is no longer
    // valid for wherever we're now pointed -> force a fresh login.
    currentUser = null;
    notifyListeners();
  }

  Future<AuthUser> login(String username, String password, {String? totpCode}) async {
    final user = await _authService.login(username, password, totpCode: totpCode);
    currentUser = user;
    notifyListeners();
    return user;
  }

  Future<void> logout() async {
    await _authService.logout();
    currentUser = null;
    notifyListeners();
  }

  Future<void> setLanguage(String code) async {
    languageCode = code;
    await _settingsService.setLanguage(code);
    notifyListeners();
  }
}
