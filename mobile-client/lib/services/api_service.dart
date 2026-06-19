import 'dart:io';

import 'package:dio/dio.dart';
import 'package:dio/io.dart';

/// Thin wrapper around Dio carrying the JWT and a configurable base URL.
/// The base URL (and, for Cloudflare-Access-gated servers, a Service
/// Token) can be changed at runtime via [configureServer] — see the
/// connection settings screen — not just baked in at build time.
class ApiService {
  ApiService({String baseUrl = 'http://localhost:3000/api'})
      : _baseUrl = baseUrl,
        _dio = Dio(BaseOptions(baseUrl: baseUrl)) {
    // Prefer IPv4 when a host resolves to both IPv4 and IPv6 addresses
    // (Cloudflare's edge does, e.g. app.doc-capture.app). Found via real
    // device testing: a phone's system browser reached the Cloudflare
    // Access login page for this exact host fine, but the app's own login
    // request failed with DioExceptionType.connectionError — a
    // socket-level failure, not an HTTP error, ruling out a bad
    // Service Token. dart:io's HttpClient doesn't implement Happy
    // Eyeballs (RFC 8305): it tries addresses in the order DNS returned
    // them without interleaving families, so on a network where IPv6 is
    // advertised but not actually routable (common on mobile/home
    // networks), it can fail outright instead of falling back to IPv4
    // the way browsers do (this is a known dart-lang/sdk class of issue,
    // e.g. dart-lang/sdk#41451 and flutter/flutter#116537). Resolving the
    // host ourselves and connecting to an IPv4 address directly sidesteps
    // it; falls back to whatever's available if a host is IPv6-only.
    _dio.httpClientAdapter = IOHttpClientAdapter(
      createHttpClient: () {
        final client = HttpClient();
        client.connectionFactory = (uri, proxyHost, proxyPort) async {
          final addresses = await InternetAddress.lookup(uri.host);
          final ipv4 = addresses.where((a) => a.type == InternetAddressType.IPv4);
          final target = ipv4.isNotEmpty ? ipv4.first : addresses.first;
          return Socket.startConnect(target, uri.port);
        };
        return client;
      },
    );
  }

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
