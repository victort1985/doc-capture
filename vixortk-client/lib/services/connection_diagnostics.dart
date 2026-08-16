import 'dart:io';

import 'package:dio/dio.dart';
import 'package:dio/io.dart';
import 'package:flutter/foundation.dart';

import 'settings_service.dart';
import 'dns_lookup.dart';

/// One logged HTTP attempt made by the app's shared Dio client. Kept in
/// memory only — never persisted to disk, never sent anywhere — purely a
/// same-session aid for diagnosing connection problems that are otherwise
/// invisible without a laptop and a USB cable. This whole file is a
/// TEMPORARY diagnostic feature, added specifically while tracking down a
/// connectionError that a curl test from a desktop couldn't reproduce
/// (see ApiService's IPv4-preference comment for the background) — safe
/// to remove once the cloud-mode connection path is confirmed solid
/// across real devices and networks.
class ConnectionLogEntry {
  ConnectionLogEntry({
    required this.time,
    required this.method,
    required this.url,
    this.statusCode,
    this.errorType,
    this.errorMessage,
    this.bodySnippet,
  });

  final DateTime time;
  final String method;
  final String url;
  final int? statusCode;
  final String? errorType;
  final String? errorMessage;
  final String? bodySnippet;

  String get summary {
    if (statusCode != null) return 'HTTP $statusCode';
    if (errorType != null) return errorType!;
    return 'unknown';
  }
}

/// In-memory log of every request, newest first, capped so a long session
/// doesn't grow this unboundedly.
class ConnectionDiagnostics {
  ConnectionDiagnostics._();
  static final ConnectionDiagnostics instance = ConnectionDiagnostics._();

  static const _maxEntries = 50;

  final ValueNotifier<List<ConnectionLogEntry>> log = ValueNotifier([]);

  void add(ConnectionLogEntry entry) {
    final next = [entry, ...log.value];
    if (next.length > _maxEntries) next.removeRange(_maxEntries, next.length);
    log.value = next;
  }

  void clear() => log.value = [];
}

/// Dio interceptor that records every request/response/error into
/// [ConnectionDiagnostics]. Attach once to the shared Dio client; never
/// modifies the request/response itself, purely observes.
class DiagnosticsInterceptor extends Interceptor {
  @override
  void onResponse(Response response, ResponseInterceptorHandler handler) {
    final isError = (response.statusCode ?? 200) >= 400;
    ConnectionDiagnostics.instance.add(ConnectionLogEntry(
      time: DateTime.now(),
      method: response.requestOptions.method,
      url: response.requestOptions.uri.toString(),
      statusCode: response.statusCode,
      bodySnippet: isError ? _snippet(response.data) : null,
    ));
    handler.next(response);
  }

  @override
  void onError(DioException err, ErrorInterceptorHandler handler) {
    ConnectionDiagnostics.instance.add(ConnectionLogEntry(
      time: DateTime.now(),
      method: err.requestOptions.method,
      url: err.requestOptions.uri.toString(),
      statusCode: err.response?.statusCode,
      errorType: err.type.name,
      errorMessage: err.message,
      bodySnippet: _snippet(err.response?.data),
    ));
    handler.next(err);
  }

  /// First 300 chars of a response body — enough to tell a Cloudflare
  /// HTML error page apart from our own server's JSON error, without
  /// keeping a potentially large response in memory indefinitely.
  static String? _snippet(dynamic data) {
    if (data == null) return null;
    final text = data is String ? data : data.toString();
    return text.length > 300 ? '${text.substring(0, 300)}…' : text;
  }
}

/// Result of a single step in [runConnectionTest].
class DiagnosticStepResult {
  DiagnosticStepResult(this.label, this.passed, this.detail);
  final String label;
  final bool passed;
  final String detail;
}

/// Runs the same sequence of checks that were done by hand via curl
/// throughout this project's Cloudflare setup (DNS lookup, raw TCP
/// reachability per address family, then an actual HTTP request through
/// the app's real connection path) against whatever's currently typed in
/// the connection settings screen — not necessarily saved yet.
Future<List<DiagnosticStepResult>> runConnectionTest(
  ConnectionConfig config, {
  String? clientId,
  String? clientSecret,
}) async {
  final results = <DiagnosticStepResult>[];
  final baseUrl = config.toApiBaseUrl();
  if (baseUrl.isEmpty) {
    results.add(DiagnosticStepResult('Address', false, 'Address field is empty'));
    return results;
  }

  final uri = Uri.parse(baseUrl);
  final port = uri.hasPort ? uri.port : (uri.scheme == 'https' ? 443 : 80);

  // Single, no-retry attempt first — shown separately from the
  // retry-wrapped version below so it's visible whether this network is
  // currently hitting the transient carrier-DNS failure at all, or
  // whether it's resolved cleanly and the retry logic is just a safety
  // net for occasional, not constant in our case.
  try {
    final single = await InternetAddress.lookup(uri.host).timeout(const Duration(seconds: 6));
    results.add(DiagnosticStepResult(
      'DNS lookup (single attempt)',
      true,
      '${single.length} address(es) on the first try',
    ));
  } catch (e) {
    results.add(DiagnosticStepResult('DNS lookup (single attempt)', false, e.toString()));
  }

  // Tested directly (not just as a silent fallback inside lookupWithRetry)
  // so it's visible on its own whether DoH actually works on this network
  // independent of whatever the OS resolver is doing.
  try {
    final doh = await lookupViaDoH(uri.host).timeout(const Duration(seconds: 10));
    results.add(DiagnosticStepResult(
      'DNS-over-HTTPS fallback',
      true,
      '${doh.length} address(es) via Cloudflare DoH',
    ));
  } catch (e) {
    results.add(DiagnosticStepResult('DNS-over-HTTPS fallback', false, e.toString()));
  }

  List<InternetAddress> addresses = [];
  try {
    addresses = await lookupWithRetry(uri.host).timeout(const Duration(seconds: 12));
    final ipv4Count = addresses.where((a) => a.type == InternetAddressType.IPv4).length;
    final ipv6Count = addresses.where((a) => a.type == InternetAddressType.IPv6).length;
    results.add(DiagnosticStepResult(
      'DNS lookup (retry + DoH fallback)',
      true,
      '$ipv4Count IPv4, $ipv6Count IPv6 address(es) found',
    ));
  } catch (e) {
    results.add(DiagnosticStepResult('DNS lookup (retry + DoH fallback)', false, e.toString()));
    return results; // nothing past this point can work without DNS
  }

  final ipv4 = addresses.where((a) => a.type == InternetAddressType.IPv4).toList();
  final ipv6 = addresses.where((a) => a.type == InternetAddressType.IPv6).toList();

  if (ipv4.isNotEmpty) {
    results.add(await _testSocket('IPv4 reachability (${ipv4.first.address})', ipv4.first, port));
  }
  if (ipv6.isNotEmpty) {
    results.add(await _testSocket('IPv6 reachability (${ipv6.first.address})', ipv6.first, port));
  }

  // Mirrors ApiService's own connection setup exactly (same shared
  // helper), so this test reflects exactly what the real app does.
  final dio = Dio(BaseOptions(
    baseUrl: baseUrl,
    connectTimeout: const Duration(seconds: 10),
    receiveTimeout: const Duration(seconds: 10),
  ));
  dio.httpClientAdapter = IOHttpClientAdapter(
    createHttpClient: () {
      final client = HttpClient();
      client.connectionFactory = buildSecureConnectionFactory();
      return client;
    },
  );
  if (clientId != null && clientId.isNotEmpty && clientSecret != null && clientSecret.isNotEmpty) {
    dio.options.headers['CF-Access-Client-Id'] = clientId;
    dio.options.headers['CF-Access-Client-Secret'] = clientSecret;
  }

  try {
    final res = await dio.get('/users');
    results.add(DiagnosticStepResult(
      'Server request',
      true,
      'HTTP ${res.statusCode} — reached the server',
    ));
  } on DioException catch (e) {
    final status = e.response?.statusCode;
    final body = DiagnosticsInterceptor._snippet(e.response?.data);
    if (status == 401) {
      // Reached the real server and got its normal "no JWT" response —
      // this is what success looks like for this test, since we're not
      // sending real login credentials.
      results.add(DiagnosticStepResult('Server request', true, 'HTTP 401 — reached the server'));
    } else if (status == 403) {
      results.add(DiagnosticStepResult(
        'Server request',
        false,
        'HTTP 403 — Cloudflare Access rejected the request (check Client ID/Secret)',
      ));
    } else if (status != null && status >= 400) {
      results.add(DiagnosticStepResult(
        'Server request',
        false,
        'HTTP $status${body != null ? ' — $body' : ''}',
      ));
    } else if (status != null) {
      results.add(DiagnosticStepResult('Server request', true, 'HTTP $status'));
    } else {
      results.add(DiagnosticStepResult('Server request', false, e.type.name));
    }
  }

  return results;
}

Future<DiagnosticStepResult> _testSocket(String label, InternetAddress address, int port) async {
  final stopwatch = Stopwatch()..start();
  try {
    final socket = await Socket.connect(address, port, timeout: const Duration(seconds: 6));
    socket.destroy();
    return DiagnosticStepResult(label, true, 'Connected in ${stopwatch.elapsedMilliseconds}ms');
  } catch (e) {
    return DiagnosticStepResult(label, false, e.toString());
  }
}
