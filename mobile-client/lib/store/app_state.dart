import 'package:flutter/foundation.dart';
import '../services/auth_service.dart';
import '../services/settings_service.dart';

/// Root app state: current locale + current user session.
/// Kept deliberately small — feature screens own their own local state.
class AppState extends ChangeNotifier {
  AppState(this._settingsService, this._authService);

  final SettingsService _settingsService;
  final AuthService _authService;

  String languageCode = SettingsService.defaultLanguage; // 'he' by default
  AuthUser? currentUser;
  bool initialized = false;

  Future<void> bootstrap() async {
    languageCode = await _settingsService.getLanguage();
    final token = await _authService.restoreToken();
    // TODO: once restored, optionally call GET /api/users/me to refresh
    // currentUser instead of leaving it null until next login.
    initialized = true;
    notifyListeners();
    // ignore: unnecessary_statements
    token;
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
