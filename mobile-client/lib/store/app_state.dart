import 'package:flutter/foundation.dart';
import '../services/api_service.dart';
import '../services/auth_service.dart';
import '../services/settings_service.dart';
import '../services/push_notifications_service.dart';

/// Root app state: current locale + current user session.
/// Kept deliberately small — feature screens own their own local state.
class AppState extends ChangeNotifier {
  AppState(this._settingsService, this._authService, this._apiService, this._pushNotificationsService);

  final SettingsService _settingsService;
  final AuthService _authService;
  final ApiService _apiService;
  final PushNotificationsService _pushNotificationsService;

  /// Exposed read-only for LoginScreen's "remember me" (saved-credentials
  /// prefill) — everything else about auth stays routed through this
  /// class's own methods (login/logout/bootstrap) rather than callers
  /// reaching into AuthService directly for those.
  AuthService get authService => _authService;

  String languageCode = SettingsService.defaultLanguage; // 'he' by default
  String navStyle = SettingsService.defaultNavStyle; // 'classic' by default
  AuthUser? currentUser;
  bool initialized = false;

  /// The organization the user is currently working in.
  /// Starts as the user's home org, can be switched if they have orgs.switch permission.
  int? activeOrganizationId;
  String? activeOrganizationName;

  /// List of orgs this user may switch into (fetched after login).
  List<Map<String, dynamic>> switchableOrgs = [];

  ConnectionConfig connectionConfig =
      const ConnectionConfig(mode: ConnectionMode.direct, address: '');

  Future<(String?, String?)> getCfServiceToken() => _settingsService.getCfServiceToken();

  /// Re-fetches the current user from the server and updates in-memory
  /// state — used after an action that changes something on the user
  /// record itself (accepting the ToS, finishing the setup wizard)
  /// so the rest of the app reflects it immediately, without waiting
  /// for the next full login.
  Future<void> refreshCurrentUser() async {
    final updated = await _authService.fetchCurrentUser();
    if (updated != null) {
      currentUser = updated;
      notifyListeners();
    }
  }

  Future<void> bootstrap() async {
    languageCode = await _settingsService.getLanguage();
    navStyle = await _settingsService.getNavStyle();

    // Apply the saved server address *before* doing anything else that
    // talks to the network.
    connectionConfig = await _settingsService.getConnectionConfig();
    await _applyConnectionConfig();

    // Deliberately no token-restore/silent-resume here — see
    // AuthService.login()'s own doc comment for why: every fresh app
    // start (the process actually being relaunched, not just resumed
    // from the background) goes through the real login screen, which
    // is the only place the multi-org picker
    // (OrganizationPickerGateScreen) gets shown. currentUser stays
    // null here, so main.dart's `loggedIn ? RootScreen() :
    // LoginScreen()` check correctly sends every cold start to the
    // login screen — login_screen.dart's own saved-credentials
    // prefill (a separate, still-persisted convenience — see
    // AuthService.saveCredentials) keeps this fast in practice.

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

  Future<void> setNavStyle(String style) async {
    navStyle = style;
    await _settingsService.setNavStyle(style);
    notifyListeners();
  }

  Future<void> login(String username, String password, {String? totpCode}) async {
    currentUser = await _authService.login(username, password, totpCode: totpCode);
    await setLanguage(currentUser!.language);
    await _pushNotificationsService.initAndRegister();
    await _loadSwitchableOrgs();
  }

  Future<void> _loadSwitchableOrgs() async {
    if (currentUser == null) return;
    try {
      final orgs = await _apiService.get('/organizations/allowed');
      switchableOrgs = (orgs as List<dynamic>)
          .map((o) => o as Map<String, dynamic>)
          .toList();
      // Set active org to current user's home org
      activeOrganizationId ??= currentUser!.organizationId;
      if (activeOrganizationId != null) {
        final match = switchableOrgs.firstWhere(
          (o) => o['id'] == activeOrganizationId,
          orElse: () => switchableOrgs.isNotEmpty ? switchableOrgs.first : {},
        );
        activeOrganizationName = match['name'] as String?;
      }
      notifyListeners();
    } catch (_) {}
  }

  /// Switch active organization (mobile org-switcher).
  /// Updates API header so all subsequent requests are scoped to new org.
  Future<void> switchOrganization(int orgId, String orgName) async {
    activeOrganizationId = orgId;
    activeOrganizationName = orgName;
    _apiService.setActiveOrganizationId(orgId);
    notifyListeners();
  }

  Future<void> logout() async {
    await _pushNotificationsService.unregister();
    await _authService.logout();
    currentUser = null;
    activeOrganizationId = null;
    activeOrganizationName = null;
    switchableOrgs = [];
    notifyListeners();
  }
}
