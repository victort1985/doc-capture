import 'package:dio/dio.dart';

/// Thin wrapper around Dio carrying the JWT and a configurable base URL.
/// TODO: load baseUrl from build config / a server-discovery step instead
/// of hardcoding, once the server's real address/domain is known.
class ApiService {
  ApiService({this.baseUrl = 'http://localhost:3000/api'})
      : _dio = Dio(BaseOptions(baseUrl: baseUrl));

  final String baseUrl;
  final Dio _dio;

  /// The server's root origin (scheme+host+port, no /api suffix) — used to
  /// derive the WebSocket notifications URL, which lives outside /api.
  String get serverOrigin => baseUrl.replaceAll(RegExp(r'/api/?$'), '');

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
