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

  Future<void> logout() async {
    await _storage.delete(key: _tokenKey);
    _api.setToken(null);
  }
}
