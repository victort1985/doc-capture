import 'dart:convert';
import 'dart:io';

/// Resolves [host], first via the OS resolver (retrying a few times for
/// ordinary transient hiccups), then — if that's still failing — via
/// Cloudflare's DNS-over-HTTPS service queried directly by IP.
///
/// Real-device evidence behind this two-stage design:
/// - On cellular data, InternetAddress.lookup() failed for this exact
///   host (SocketException, 'No address associated with hostname',
///   errno=7) while the same phone's browser resolved the identical
///   hostname on the identical connection without issue.
/// - Retrying the OS resolver a few times did NOT help — same error,
///   every attempt — proving this is a PERSISTENT failure on that
///   network for raw socket-level lookups, not a one-off blip a retry
///   would paper over. Matches a known class of issue for CNAME-based
///   tunnel hostnames on Android (e.g. immich-app/immich#15547).
///
/// Since retries alone don't fix a persistent resolver failure, this
/// falls back to asking Cloudflare's own DoH service directly when the
/// OS resolver is exhausted — see [lookupViaDoH] for why that query
/// itself doesn't depend on DNS at all (avoiding the obvious
/// chicken-and-egg problem).
Future<List<InternetAddress>> lookupWithRetry(
  String host, {
  int attempts = 3,
  Duration delay = const Duration(milliseconds: 700),
}) async {
  Object? lastError;
  for (var i = 0; i < attempts; i++) {
    try {
      final result = await InternetAddress.lookup(host);
      if (result.isNotEmpty) return result;
      lastError = StateError('DNS lookup returned no addresses for $host');
    } catch (e) {
      lastError = e;
    }
    if (i < attempts - 1) await Future.delayed(delay);
  }

  // OS resolver exhausted its retries. Fall back to DoH rather than
  // giving up — confirmed via real-device testing that this can be a
  // persistent, not transient, failure on some networks.
  try {
    final dohResult = await lookupViaDoH(host);
    if (dohResult.isNotEmpty) return dohResult;
  } catch (_) {
    // fall through to the original OS-resolver error below — more
    // familiar/actionable for whoever's debugging next than a DoH-
    // specific error would be.
  }
  throw lastError ?? StateError('DNS lookup failed for $host');
}

/// Builds a `connectionFactory` for `dart:io`'s `HttpClient` that:
/// 1. Resolves the target host via [lookupWithRetry] (OS resolver with
///    retries, falling back to DoH), preferring an IPv4 address.
/// 2. For `https://` requests, manually performs the TLS handshake on
///    top of the raw TCP connection before handing it back.
///
/// Step 2 is not optional, and its absence was a real, shipped bug in
/// this app for several releases: `connectionFactory` does NOT
/// automatically upgrade the `Socket` it returns to TLS for https
/// requests — `HttpClient` sends the HTTP request directly over
/// whatever socket comes back. Every earlier version of this code
/// returned a plain `Socket.startConnect(...)` regardless of scheme,
/// which meant every https request made through it was sending
/// plaintext HTTP bytes at a TLS port the entire time. Confirmed via
/// real-device testing surfacing Cloudflare's own literal error page
/// for exactly this condition: "400 The plain HTTP request was sent to
/// HTTPS port." Also matches another developer hitting the identical
/// API gap (dart-lang/sdk#55562); the fix here follows the pattern
/// documented on `ConnectionTask.fromSocket`'s own API reference.
Future<ConnectionTask<Socket>> Function(Uri uri, String? proxyHost, int? proxyPort)
    buildSecureConnectionFactory() {
  return (uri, proxyHost, proxyPort) async {
    final addresses = await lookupWithRetry(uri.host);
    final ipv4 = addresses.where((a) => a.type == InternetAddressType.IPv4);
    final target = ipv4.isNotEmpty ? ipv4.first : addresses.first;

    if (uri.scheme == 'https') {
      final secureFuture = Socket.connect(target, uri.port)
          .then((socket) => SecureSocket.secure(socket, host: uri.host));
      return ConnectionTask.fromSocket(secureFuture, () {});
    }
    return Socket.startConnect(target, uri.port);
  };
}

/// Queries Cloudflare's DNS-over-HTTPS JSON API for [host]'s A records.
///
/// Connects to Cloudflare's DoH service (cloudflare-dns.com) by its
/// literal IP address (1.1.1.1) instead of letting the HTTP client
/// resolve that hostname itself — if it had to, a broken OS resolver
/// would block this fallback exactly the same way it blocks the
/// original lookup, defeating the whole point. The request URI still
/// uses the real hostname 'cloudflare-dns.com' (only the TCP connection
/// is redirected to the literal IP), so TLS SNI and certificate
/// hostname validation both still check out correctly against
/// Cloudflare's real certificate for that name — but only because the
/// connection is now actually wrapped in TLS (see the comment on
/// buildSecureConnectionFactory above for why that's a manual step).
Future<List<InternetAddress>> lookupViaDoH(String host) async {
  final client = HttpClient();
  client.connectionFactory = (uri, proxyHost, proxyPort) async {
    final socket = await Socket.connect(InternetAddress('1.1.1.1'), uri.port);
    final secure = await SecureSocket.secure(socket, host: uri.host);
    return ConnectionTask.fromSocket(Future.value(secure), () {});
  };
  try {
    final request = await client
        .getUrl(Uri.https('cloudflare-dns.com', '/dns-query', {'name': host, 'type': 'A'}))
        .timeout(const Duration(seconds: 8));
    request.headers.set('Accept', 'application/dns-json');
    final response = await request.close().timeout(const Duration(seconds: 8));
    final body = await response.transform(utf8.decoder).join();
    final data = jsonDecode(body) as Map<String, dynamic>;
    final answers = (data['Answer'] as List?) ?? const [];
    final addresses = answers
        .where((a) => a is Map && a['type'] == 1) // type 1 = A record
        .map((a) => InternetAddress((a as Map)['data'] as String))
        .toList();
    if (addresses.isEmpty) {
      throw StateError('DoH returned no A records for $host');
    }
    return addresses;
  } finally {
    client.close(force: true);
  }
}
