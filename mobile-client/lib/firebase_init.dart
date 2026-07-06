// Isolated into its own file (rather than living directly in main.dart)
// so desktop CI builds can swap this for a firebase-free stub —
// firebase_core/firebase_messaging aren't stripped from pubspec.yaml
// for every desktop target (see desktop-flutter-build.yml's "Patch
// pubspec & stubs" steps), and any file that unconditionally imports a
// stripped package fails to compile.
import 'dart:io' show Platform;
import 'package:firebase_core/firebase_core.dart';
import 'firebase_options.dart';

/// Firebase Cloud Messaging (push notifications) only has a real native
/// SDK on Android/iOS — desktop builds have no GoogleService config at
/// all. try/catch as a second safety net: an unconfigured/misconfigured
/// project shouldn't be able to crash the whole app before it even
/// starts, since real OS push is a bonus on top of the in-app WebSocket
/// notifications, not a requirement to use the app at all.
///
/// That safety net doesn't cover everything, though — if the API
/// key/app ID are malformed (not just "wrong", but not shaped like real
/// Firebase credentials at all), the native iOS Firebase SDK can crash
/// the process directly (an Objective-C-level assertion/fatalError),
/// which Dart's try/catch cannot intercept. That's exactly what
/// happened with the iosApiKey/iosAppId placeholders in
/// firebase_options.dart — every signed iOS build crashed on launch.
/// Explicitly checking for the placeholder text and skipping
/// initialization entirely avoids ever making that native call with
/// garbage input.
Future<void> initFirebaseIfMobile() async {
  if (!(Platform.isAndroid || Platform.isIOS)) return;
  if (Platform.isIOS && !DefaultFirebaseOptions.iosConfigIsReal) {
    // ignore: avoid_print
    print('Skipping Firebase init: iOS config in firebase_options.dart is still a placeholder.');
    return;
  }
  try {
    await Firebase.initializeApp(options: DefaultFirebaseOptions.currentPlatform);
  } catch (e) {
    // ignore: avoid_print
    print('Firebase.initializeApp() failed (push notifications will be unavailable): $e');
  }
}
