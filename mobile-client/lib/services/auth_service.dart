import 'dart:io' show Platform;
import 'package:dio/dio.dart';
import 'package:flutter_secure_storage/flutter_secure_storage.dart';
import 'api_service.dart';
import 'device_id.dart';

class AuthUser {
  final int id;
  final String username;
  final String language;
  final String role;
  final int? organizationId;
  final bool isDemoMode;
  final bool tosAccepted;
  final bool totpEnabled;
  final List<int> allowedOrganizationIds;
  final Map<String, bool> permissions;
  final String? firstName;
  final String? lastName;

  AuthUser({
    required this.id,
    required this.username,
    required this.language,
    required this.role,
    this.organizationId,
    this.isDemoMode = false,
    this.tosAccepted = false,
    this.totpEnabled = false,
    this.allowedOrganizationIds = const [],
    this.permissions = const {},
    this.firstName,
    this.lastName,
  });

  bool hasPermission(String key) => permissions[key] ?? false;

  /// Full name for auto-filling lessor signature etc.
  String get fullName {
    final parts = [firstName, lastName].where((s) => s != null && s.isNotEmpty).toList();
    return parts.isNotEmpty ? parts.join(' ') : username;
  }

  factory AuthUser.fromJson(Map<String, dynamic> json) => AuthUser(
        id: json['id'] as int,
        username: json['username'] as String,
        language: json['language'] as String? ?? 'he',
        role: json['role'] as String? ?? 'user',
        organizationId: json['organizationId'] as int?,
        isDemoMode: json['isDemoMode'] as bool? ?? false,
        tosAccepted: json['tosAccepted'] as bool? ?? false,
        totpEnabled: json['totpEnabled'] as bool? ?? false,
        allowedOrganizationIds: (json['allowedOrganizationIds'] as List<dynamic>?)
            ?.map((e) => e as int)
            .toList() ?? [],
        permissions: (json['permissions'] as Map<String, dynamic>?)
            ?.map((k, v) => MapEntry(k, v as bool)) ?? {},
        firstName: json['firstName'] as String?,
        lastName: json['lastName'] as String?,
      );
}

class AuthService {
  AuthService(this._api);

  final ApiService _api;
  final _storage = const FlutterSecureStorage();
  static const _tokenKey = 'auth_token';
  static const _savedUsernameKey = 'saved_username';
  static const _savedPasswordKey = 'saved_password';

  Future<AuthUser> login(String username, String password, {String? totpCode}) async {
    final deviceId = await getOrCreateDeviceId();
    final response = await _api.post('/auth/login', {
      'username': username,
      'password': password,
      'deviceId': deviceId,
      'platform': Platform.operatingSystem,
      if (totpCode != null) 'totpCode': totpCode,
    });
    final token = response['token'] as String;
    // Deliberately NOT persisted to secure storage — kept only in
    // ApiService's in-memory field for the lifetime of this app
    // process. Closing the app (the OS actually killing the process,
    // not just backgrounding it — a brief app-switch keeps this same
    // AppState instance alive in memory, so the session survives
    // that just fine) means there's nothing left to silently resume
    // from, so every fresh app start goes through this login screen
    // again rather than jumping straight to RootScreen. That's what
    // actually makes the multi-org picker (OrganizationPickerGateScreen)
    // reliable: it only lives in this login flow, and a silently
    // resumed session used to skip it entirely (see main.dart's own
    // `loggedIn ? RootScreen() : LoginScreen()` check, which used to
    // go straight to RootScreen whenever a persisted token restored
    // successfully — "works once every N times" was every time a
    // session silently resumed instead of going through a real login).
    // saveCredentials below still keeps username/password prefilled
    // for a fast tap-to-log-in, so this doesn't mean retyping a
    // password every time — just one real login flow per app launch.
    _api.setToken(token);
    return AuthUser.fromJson(response['user'] as Map<String, dynamic>);
  }

  /// "Remember me" — same secure storage as the JWT token used to be
  /// kept in (the token itself no longer persists across app
  /// restarts — see login()'s own doc comment). This is what makes
  /// re-entering the login screen after closing the app still fast:
  /// username/password are prefilled (and biometric unlock, if
  /// enabled, submits them automatically) rather than the person
  /// retyping a password every time — just without silently skipping
  /// the login screen itself the way the old token-resume did.
  Future<void> saveCredentials(String username, String password) async {
    await _storage.write(key: _savedUsernameKey, value: username);
    await _storage.write(key: _savedPasswordKey, value: password);
  }

  Future<(String, String)?> loadSavedCredentials() async {
    final username = await _storage.read(key: _savedUsernameKey);
    final password = await _storage.read(key: _savedPasswordKey);
    if (username == null || password == null) return null;
    return (username, password);
  }

  Future<void> clearSavedCredentials() async {
    await _storage.delete(key: _savedUsernameKey);
    await _storage.delete(key: _savedPasswordKey);
  }

  /// Asks the server who the currently-set token belongs to. Used to
  /// resume a session started earlier THIS SAME app process — never
  /// across a real app restart, since login() above deliberately
  /// doesn't persist the token to survive one (see that method's own
  /// doc comment for why). Returns null if there's no token set, or
  /// if the server says it's invalid/expired.
  Future<AuthUser?> fetchCurrentUser() async {
    if (_api.token == null) return null;
    try {
      final response = await _api.get('/auth/me');
      return AuthUser.fromJson(response as Map<String, dynamic>);
    } on DioException catch (e) {
      // Only a genuine 401 means the token itself is invalid/expired —
      // clear it so the user gets a clean login screen. Anything else
      // (timeout, DNS failure, server down, wrong address) is a
      // *connectivity* problem, not an auth problem: keep the token so a
      // later retry (once the server's reachable again) can still resume
      // the session without forcing a fresh password entry.
      if (e.response?.statusCode == 401) {
        await logout();
      }
      return null;
    } catch (_) {
      return null;
    }
  }

  Future<void> logout() async {
    await _storage.delete(key: _tokenKey);
    _api.setToken(null);
  }
}
