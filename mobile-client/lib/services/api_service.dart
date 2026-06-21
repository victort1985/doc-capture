import 'dart:io';
import 'dart:typed_data';

import 'package:dio/dio.dart';
import 'package:dio/io.dart';

import 'connection_diagnostics.dart';
import 'dns_lookup.dart';

/// Thin wrapper around Dio carrying the JWT and a configurable base URL.
/// The base URL (and, for Cloudflare-Access-gated servers, a Service
/// Token) can be changed at runtime via [configureServer] — see the
/// connection settings screen — not just baked in at build time.
class ApiService {
  ApiService({String baseUrl = 'https://app.doc-capture.app/api'})
      : _baseUrl = baseUrl,
        _dio = Dio(BaseOptions(baseUrl: baseUrl)) {
    // Resolves via lookupWithRetry (IPv4-preferring, with DNS-over-HTTPS
    // fallback) AND — critically — manually upgrades the connection to
    // TLS for https:// requests. That second part isn't optional: a
    // custom connectionFactory's returned Socket is NOT automatically
    // wrapped in TLS by HttpClient, something this project shipped
    // without realizing for several releases (confirmed via real-device
    // testing surfacing Cloudflare's own "400 The plain HTTP request was
    // sent to HTTPS port" error). See buildSecureConnectionFactory's own
    // doc comment in dns_lookup.dart for the full evidence trail and the
    // earlier IPv4/retry/DoH reasoning, which all remain valid — they
    // just couldn't have worked while this gap existed underneath them.
    _dio.httpClientAdapter = IOHttpClientAdapter(
      createHttpClient: () {
        final client = HttpClient();
        client.connectionFactory = buildSecureConnectionFactory();
        return client;
      },
    );
    // TEMPORARY: logs every request this client makes into an in-memory,
    // never-persisted diagnostics log — see connection_diagnostics.dart
    // for why and the plan to remove it once cloud-mode connectivity is
    // confirmed solid across real devices/networks.
    _dio.interceptors.add(DiagnosticsInterceptor());
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

  /// Current Cloudflare Access Service Token headers, if a cloud
  /// connection is configured — needed by NotificationsService, since its
  /// raw Socket.IO connection doesn't go through this Dio instance at all
  /// and so doesn't automatically pick up headers set via configureServer.
  Map<String, dynamic>? get cfAccessHeaders {
    final id = _dio.options.headers['CF-Access-Client-Id'];
    final secret = _dio.options.headers['CF-Access-Client-Secret'];
    if (id == null || secret == null) return null;
    return {'CF-Access-Client-Id': id, 'CF-Access-Client-Secret': secret};
  }

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

  Future<dynamic> patch(String path, Map<String, dynamic> body) async {
    final res = await _dio.patch(path, data: body);
    return res.data;
  }

  Future<dynamic> patchFormData(String path, FormData data) async {
    final res = await _dio.patch(path, data: data);
    return res.data;
  }

  Future<void> delete(String path) async {
    await _dio.delete(path);
  }

  Future<dynamic> get(String path, {Map<String, dynamic>? query}) async {
    final res = await _dio.get(path, queryParameters: query);
    return res.data;
  }

  /// Authenticated binary fetch — used to view already-uploaded photos and
  /// documents in-app (spec: viewing existing attachments needs the same
  /// auth/CF-Access headers as everything else, so a plain Image.network
  /// URL won't work).
  Future<Uint8List> getBytes(String path) async {
    final res = await _dio.get<List<int>>(
      path,
      options: Options(responseType: ResponseType.bytes),
    );
    return Uint8List.fromList(res.data!);
  }
}
