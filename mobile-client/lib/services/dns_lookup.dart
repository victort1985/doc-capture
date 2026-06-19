import 'dart:io';

/// Resolves [host] via the OS resolver, retrying a few times with a short
/// delay before giving up.
///
/// Added after real-device testing on cellular data showed
/// InternetAddress.lookup() failing intermittently for this app
/// specifically (SocketException: Failed host lookup ... errno = 7) on a
/// network where, at the same moment, the phone's own browser resolved
/// the exact same hostname with no problem at all. This is a known class
/// of issue on Android: some mobile carrier DNS resolvers behave
/// differently (or just flake out) for raw socket-level lookups versus
/// the system browser's resolution path — see e.g.
/// immich-app/immich#15547 for an almost identical real-world report on
/// a similarly CNAME-based tunnel setup (our app.doc-capture.app is a
/// CNAME to a *.cfargotunnel.com target, not a plain A record, which
/// several of these reports specifically implicate). A handful of quick
/// retries resolves the large majority of this class of transient
/// failure without the complexity of a full DNS-over-HTTPS fallback.
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
  throw lastError ?? StateError('DNS lookup failed for $host');
}
