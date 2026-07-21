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

  Future<AuthUser> login(String username, String password) async {
    final deviceId = await getOrCreateDeviceId();
    final response = await _api.post('/auth/login', {
      'username': username,
      'password': password,
      'deviceId': deviceId,
      'platform': Platform.operatingSystem,
    });
    final token = response['token'] as String;
    await _storage.write(key: _tokenKey, value: token);
    _api.setToken(token);
    return AuthUser.fromJson(response['user'] as Map<String, dynamic>);
  }

  /// "Remember me" — same secure storage as the JWT token itself (not
  /// SharedPreferences, which isn't encrypted at rest). This is a
  /// convenience separate from the token-based auto-login that already
  /// exists (restoreToken + fetchCurrentUser): that one silently resumes
  /// a still-valid session, while this one is for when there's no valid
  /// session to resume — the fields are just pre-filled instead of
  /// re-typing a password from scratch.
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

  Future<String?> restoreToken() async {
    final token = await _storage.read(key: _tokenKey);
    if (token != null) _api.setToken(token);
    return token;
  }

  /// Asks the server who the currently-set token belongs to. Used right
  /// after [restoreToken] to actually resume a session — restoring the
  /// token alone only sets the Authorization header, it doesn't tell the
  /// app who's logged in, which is why auto-login wasn't working before.
  /// Returns null (and clears the stored token) if it's missing, expired,
  /// or the server is unreachable, so the user just sees the login screen.
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
