import 'dart:io';
import 'package:firebase_core/firebase_core.dart';
import 'package:firebase_messaging/firebase_messaging.dart';
import 'package:permission_handler/permission_handler.dart';
import 'api_service.dart';

/// Real OS-level push notifications (home screen, locked phone) —
/// separate from NotificationsService's in-app WebSocket popups, which
/// only fire while the app is actually open and connected.
///
/// Android only, for now: iOS push requires an Apple Developer Program
/// membership for APNs credentials, which doesn't exist yet (confirmed
/// directly, not assumed) — without it there's no valid
/// GoogleService-Info.plist to register an iOS Firebase app, and
/// Firebase.initializeApp() would either throw or silently no-op on
/// that platform. Every call in here checks Platform.isAndroid first so
/// iOS just skips push entirely rather than risk crashing or hanging on
/// missing iOS Firebase config — once an Apple Developer account exists,
/// enabling iOS is mostly a Firebase-console + Xcode-project step, not
/// an app-architecture change.
class PushNotificationsService {
  PushNotificationsService(this._api);
  final ApiService _api;

  bool get _supported => Platform.isAndroid;

  Future<void> initAndRegister() async {
    if (!_supported) return;
    try {
      await Firebase.initializeApp();
      // permission_handler specifically for POST_NOTIFICATIONS — see the
      // pubspec.yaml comment on why FirebaseMessaging's own
      // requestPermission() isn't relied on alone for this on Android.
      await Permission.notification.request();
      final messaging = FirebaseMessaging.instance;
      await messaging.requestPermission();
      final token = await messaging.getToken();
      if (token != null) {
        await _registerToken(token);
      }
      // Token can rotate (app reinstall, Firebase-side refresh, etc.) —
      // keep the server's copy current whenever that happens.
      messaging.onTokenRefresh.listen(_registerToken);
    } catch (_) {
      // Push is a nice-to-have layered on top of the in-app popups that
      // already work regardless — a Firebase hiccup here should never
      // block login or any other part of the app from working normally.
    }
  }

  Future<void> _registerToken(String token) async {
    try {
      await _api.post('/users/me/push-token', {'token': token, 'platform': 'android'});
    } catch (_) {
      // Will retry next app start / next token refresh — not worth
      // surfacing a failure to the user for a background registration call.
    }
  }

  /// Called on logout — stop notifying a device once nobody's signed in
  /// on it, and let another account that later logs in on this same
  /// device get a clean registration of its own.
  Future<void> unregister() async {
    if (!_supported) return;
    try {
      await _api.delete('/users/me/push-token');
    } catch (_) {}
  }
}
