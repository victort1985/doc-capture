// Real OS-level push (home screen / locked phone), complementing
// NotificationsService's WebSocket popups (which only fire while the
// app is open). Android and iOS both go through Firebase Cloud
// Messaging — on iOS, firebase_messaging internally handles APNs
// registration and vends an FCM token derived from the APNs token, as
// long as the app was signed with the push-notifications entitlement
// and Firebase's iOS app config has a matching APNs credential
// uploaded (Project Settings -> Cloud Messaging). No-op on desktop,
// where there's no native Firebase SDK at all.
import 'dart:io' show Platform;
import 'package:firebase_messaging/firebase_messaging.dart';
import 'package:permission_handler/permission_handler.dart';
import 'api_service.dart';

class PushNotificationsService {
  PushNotificationsService(this._api);
  final ApiService _api;

  bool get _supported => Platform.isAndroid || Platform.isIOS;

  Future<void> initAndRegister() async {
    if (!_supported) return;
    try {
      if (Platform.isAndroid) {
        // firebase_messaging's own requestPermission() historically
        // didn't reliably trigger Android 13+'s POST_NOTIFICATIONS
        // system dialog (flutterfire#8720) — permission_handler is the
        // well-established reliable path for that specific ask.
        await Permission.notification.request();
      } else {
        await FirebaseMessaging.instance.requestPermission(alert: true, badge: true, sound: true);
      }

      final token = await FirebaseMessaging.instance.getToken();
      if (token != null) {
        await _registerToken(token);
      }

      // Tokens can rotate (app reinstall, OS-level refresh, etc.) — keep
      // the backend's copy in sync whenever that happens.
      FirebaseMessaging.instance.onTokenRefresh.listen((newToken) {
        _registerToken(newToken);
      });
    } catch (e) {
      // A push-registration hiccup should never block login/app startup —
      // the in-app WebSocket popups still work regardless.
    }
  }

  Future<void> _registerToken(String token) async {
    try {
      await _api.post('/users/me/push-token', {
        'token': token,
        'platform': Platform.isAndroid ? 'android' : 'ios',
      });
    } catch (_) {}
  }

  Future<void> unregister() async {
    if (!_supported) return;
    try {
      await _api.delete('/users/me/push-token');
    } catch (_) {}
  }
}
