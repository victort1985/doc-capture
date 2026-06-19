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

/// Queries Cloudflare's DNS-over-HTTPS JSON API for [host]'s A records.
///
/// Connects to Cloudflare's DoH service (cloudflare-dns.com) by its
/// literal IP address (1.1.1.1) instead of letting the HTTP client
/// resolve that hostname itself — if it had to, a broken OS resolver
/// would block this fallback exactly the same way it blocks the
/// original lookup, defeating the whole point. The request URI still
/// uses the real hostname 'cloudflare-dns.com' (only the TCP connection
/// is redirected to the literal IP via connectionFactory), so TLS SNI
/// and certificate hostname validation both still check out correctly
/// against Cloudflare's real certificate for that name.
Future<List<InternetAddress>> lookupViaDoH(String host) async {
  final client = HttpClient();
  client.connectionFactory = (uri, proxyHost, proxyPort) {
    return Socket.startConnect(InternetAddress('1.1.1.1'), uri.port);
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
