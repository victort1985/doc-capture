import 'package:shared_preferences/shared_preferences.dart';

/// Persists the user's language choice. Defaults to Hebrew per spec —
/// callers should treat a missing value as 'he', not assume device locale.
class SettingsService {
  static const _languageKey = 'app_language';
  static const defaultLanguage = 'he';

  Future<String> getLanguage() async {
    final prefs = await SharedPreferences.getInstance();
    return prefs.getString(_languageKey) ?? defaultLanguage;
  }

  Future<void> setLanguage(String languageCode) async {
    final prefs = await SharedPreferences.getInstance();
    await prefs.setString(_languageKey, languageCode);
  }

  // --- Server connection -----------------------------------------------
  // Two ways to reach the server:
  //   direct: a plain address (LAN IP, or any reachable URL) — talked to
  //           as-is, no extra layer beyond the app's own JWT login.
  //   cloud:  an address sitting behind Cloudflare Access. A real
  //           interactive email+OTP login (like a browser would do)
  //           isn't reliable for a native API client: Cloudflare's
  //           CF_Authorization cookie is HttpOnly by default (invisible
  //           to in-app WebView JavaScript) and can additionally be tied
  //           to a CF_Binding cookie that blocks reuse outside the
  //           browser session that earned it. The mechanism Cloudflare
  //           documents for exactly this case — non-browser clients —
  //           is a Service Token: a static Client ID/Secret pair issued
  //           once in the Cloudflare dashboard (Zero Trust → Access →
  //           Service Auth) and entered here. Per-person email policies
  //           still fully apply to the admin panel (browser); this token
  //           is what lets the *app* through the same perimeter.
  // Stored separately from the JWT (which is server-issued, in
  // FlutterSecureStorage via AuthService) since this is about *finding*
  // the server, not about being logged into it.

  static const _connectionModeKey = 'connection_mode';
  static const _connectionAddressKey = 'connection_address';
  static const _cfClientIdKey = 'cf_access_client_id';
  static const _cfClientSecretKey = 'cf_access_client_secret';

  Future<ConnectionConfig> getConnectionConfig() async {
    final prefs = await SharedPreferences.getInstance();
    final modeStr = prefs.getString(_connectionModeKey);
    final mode = modeStr == ConnectionMode.cloud.name
        ? ConnectionMode.cloud
        : ConnectionMode.direct;
    final address = prefs.getString(_connectionAddressKey) ?? '';
    return ConnectionConfig(mode: mode, address: address);
  }

  Future<void> setConnectionConfig(ConnectionConfig config) async {
    final prefs = await SharedPreferences.getInstance();
    await prefs.setString(_connectionModeKey, config.mode.name);
    await prefs.setString(_connectionAddressKey, config.address);
  }

  Future<(String?, String?)> getCfServiceToken() async {
    final prefs = await SharedPreferences.getInstance();
    return (prefs.getString(_cfClientIdKey), prefs.getString(_cfClientSecretKey));
  }

  Future<void> setCfServiceToken(String? clientId, String? clientSecret) async {
    final prefs = await SharedPreferences.getInstance();
    if (clientId == null || clientId.isEmpty) {
      await prefs.remove(_cfClientIdKey);
    } else {
      await prefs.setString(_cfClientIdKey, clientId);
    }
    if (clientSecret == null || clientSecret.isEmpty) {
      await prefs.remove(_cfClientSecretKey);
    } else {
      await prefs.setString(_cfClientSecretKey, clientSecret);
    }
  }
}

enum ConnectionMode { direct, cloud }

class ConnectionConfig {
  const ConnectionConfig({required this.mode, required this.address});

  final ConnectionMode mode;
  final String address; // raw user input — host[:port] or full URL

  /// Normalizes whatever the user typed into a full API base URL:
  /// adds a scheme if missing (http:// for bare IPs, https:// for
  /// anything that looks like a domain) and ensures it ends with /api.
  String toApiBaseUrl() {
    var value = address.trim();
    if (value.isEmpty) return '';
    if (!value.contains('://')) {
      // Bare IP[:port] (typical for direct/LAN) defaults to http;
      // a bare domain name (typical for cloud/Cloudflare) defaults to https.
      final looksLikeIp = RegExp(r'^\d{1,3}(\.\d{1,3}){3}').hasMatch(value);
      value = (looksLikeIp ? 'http://' : 'https://') + value;
    }
    value = value.replaceAll(RegExp(r'/+$'), '');
    if (!value.endsWith('/api')) value = '$value/api';
    return value;
  }
}
