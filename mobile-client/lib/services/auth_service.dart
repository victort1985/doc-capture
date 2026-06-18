import 'package:dio/dio.dart';
import 'package:flutter_secure_storage/flutter_secure_storage.dart';
import 'api_service.dart';

class AuthUser {
  final int id;
  final String username;
  final String language;
  final String role;

  AuthUser({
    required this.id,
    required this.username,
    required this.language,
    required this.role,
  });

  factory AuthUser.fromJson(Map<String, dynamic> json) => AuthUser(
        id: json['id'] as int,
        username: json['username'] as String,
        language: json['language'] as String? ?? 'he',
        role: json['role'] as String? ?? 'user',
      );
}

class AuthService {
  AuthService(this._api);

  final ApiService _api;
  final _storage = const FlutterSecureStorage();
  static const _tokenKey = 'auth_token';

  Future<AuthUser> login(String username, String password) async {
    final response = await _api.post('/auth/login', {
      'username': username,
      'password': password,
    });
    final token = response['token'] as String;
    await _storage.write(key: _tokenKey, value: token);
    _api.setToken(token);
    return AuthUser.fromJson(response['user'] as Map<String, dynamic>);
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
