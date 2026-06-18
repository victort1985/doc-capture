import 'package:dio/dio.dart';

/// Thin wrapper around Dio carrying the JWT and a configurable base URL.
/// The base URL (and, for Cloudflare-Access-gated servers, a Service
/// Token) can be changed at runtime via [configureServer] — see the
/// connection settings screen — not just baked in at build time.
class ApiService {
  ApiService({String baseUrl = 'http://localhost:3000/api'})
      : _baseUrl = baseUrl,
        _dio = Dio(BaseOptions(baseUrl: baseUrl));

  String _baseUrl;
  String get baseUrl => _baseUrl;
  final Dio _dio;

  /// The server's root origin (scheme+host+port, no /api suffix) — used to
  /// derive the WebSocket notifications URL, which lives outside /api.
  String get serverOrigin => _baseUrl.replaceAll(RegExp(r'/api/?$'), '');

  /// Repoints this client at a different server, optionally attaching a
  /// Cloudflare Access Service Token (see ConnectionMode.cloud in
  /// settings_service.dart) so requests can pass through an Access-gated
  /// perimeter. Pass null/empty client id+secret to clear a previous one.
  void configureServer({
    required String baseUrl,
    String? cfAccessClientId,
    String? cfAccessClientSecret,
  }) {
    _baseUrl = baseUrl;
    _dio.options.baseUrl = baseUrl;
    if (cfAccessClientId != null &&
        cfAccessClientId.isNotEmpty &&
        cfAccessClientSecret != null &&
        cfAccessClientSecret.isNotEmpty) {
      _dio.options.headers['CF-Access-Client-Id'] = cfAccessClientId;
      _dio.options.headers['CF-Access-Client-Secret'] = cfAccessClientSecret;
    } else {
      _dio.options.headers.remove('CF-Access-Client-Id');
      _dio.options.headers.remove('CF-Access-Client-Secret');
    }
  }

  String? _token;
  String? get token => _token;

  void setToken(String? token) {
    _token = token;
    if (token == null) {
      _dio.options.headers.remove('Authorization');
    } else {
      _dio.options.headers['Authorization'] = 'Bearer $token';
    }
  }

  Future<Map<String, dynamic>> post(
    String path,
    Map<String, dynamic> body,
  ) async {
    final res = await _dio.post(path, data: body);
    return res.data as Map<String, dynamic>;
  }

  Future<dynamic> postFormData(String path, FormData data) async {
    final res = await _dio.post(path, data: data);
    return res.data;
  }

  Future<dynamic> get(String path, {Map<String, dynamic>? query}) async {
    final res = await _dio.get(path, queryParameters: query);
    return res.data;
  }
}
