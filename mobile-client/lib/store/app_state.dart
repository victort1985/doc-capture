import 'package:flutter/foundation.dart';
import '../services/api_service.dart';
import '../services/auth_service.dart';
import '../services/settings_service.dart';

/// Root app state: current locale + current user session.
/// Kept deliberately small — feature screens own their own local state.
class AppState extends ChangeNotifier {
  AppState(this._settingsService, this._authService, this._apiService);

  final SettingsService _settingsService;
  final AuthService _authService;
  final ApiService _apiService;

  String languageCode = SettingsService.defaultLanguage; // 'he' by default
  AuthUser? currentUser;
  bool initialized = false;

  ConnectionConfig connectionConfig =
      const ConnectionConfig(mode: ConnectionMode.direct, address: '');

  Future<(String?, String?)> getCfServiceToken() => _settingsService.getCfServiceToken();

  Future<void> bootstrap() async {
    languageCode = await _settingsService.getLanguage();

    // Apply the saved server address *before* doing anything else that
    // talks to the network — otherwise restoreToken()/fetchCurrentUser()
    // below would hit whatever default baseUrl ApiService was built with.
    connectionConfig = await _settingsService.getConnectionConfig();
    await _applyConnectionConfig();

    await _authService.restoreToken();
    currentUser = await _authService.fetchCurrentUser();

    initialized = true;
    notifyListeners();
  }

  Future<void> _applyConnectionConfig() async {
    final url = connectionConfig.toApiBaseUrl();
    if (url.isEmpty) return; // nothing saved yet — keep the built-in default
    String? clientId;
    String? clientSecret;
    if (connectionConfig.mode == ConnectionMode.cloud) {
      final (id, secret) = await _settingsService.getCfServiceToken();
      clientId = id;
      clientSecret = secret;
    }
    _apiService.configureServer(
      baseUrl: url,
      cfAccessClientId: clientId,
      cfAccessClientSecret: clientSecret,
    );
  }

  /// Called from the connection settings screen after the user saves a
  /// new address (and, for cloud mode, a Service Token). Changing server
  /// invalidates whatever session was active — a JWT from one server has
  /// no meaning on another — so this logs the user out too; the caller is
  /// expected to navigate back to the login screen afterwards.
  Future<void> updateConnectionConfig(
    ConnectionConfig config, {
    String? cfAccessClientId,
    String? cfAccessClientSecret,
  }) async {
    await _settingsService.setConnectionConfig(config);
    if (config.mode == ConnectionMode.cloud) {
      await _settingsService.setCfServiceToken(cfAccessClientId, cfAccessClientSecret);
    } else {
      await _settingsService.setCfServiceToken(null, null);
    }
    connectionConfig = config;
    await _applyConnectionConfig();
    await _authService.logout();
    currentUser = null;
    notifyListeners();
  }

  Future<void> setLanguage(String code) async {
    languageCode = code;
    await _settingsService.setLanguage(code);
    notifyListeners();
  }

  Future<void> login(String username, String password) async {
    currentUser = await _authService.login(username, password);
    // Respect the user's saved per-account language if present.
    await setLanguage(currentUser!.language);
  }

  Future<void> logout() async {
    await _authService.logout();
    currentUser = null;
    notifyListeners();
  }
}
