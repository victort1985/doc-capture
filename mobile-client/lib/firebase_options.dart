// Firebase project configuration, in the same style `flutterfire configure`
// would generate. Deliberately committed as plain Dart rather than native
// google-services.json/GoogleService-Info.plist files — those would need
// to be re-injected into the freshly-generated android/ and ios/ folders
// on every CI run (neither is committed — see mobile-build.yml), and for
// iOS specifically, a plist dropped into ios/Runner/ isn't actually
// bundled into the app unless it's also wired into the Xcode project file
// itself. A plain Dart file needs none of that — it's just imported like
// any other source file, identically on every platform.
//
// Android's values below match .github/config/google-services.json
// (used for the Gradle-side wiring, which Android still needs in
// addition to this). iOS's values are placeholders — replace them with
// the real config after registering an iOS app in the same Firebase
// project (console.firebase.google.com -> doc-capture project -> Add
// app -> iOS -> bundle ID `com.doccapture.doc_capture`). The values you
// need are shown directly on that page, or inside the
// GoogleService-Info.plist it offers to download:
//   iosApiKey        <- API_KEY
//   iosAppId         <- GOOGLE_APP_ID
// (projectId, messagingSenderId, and storageBucket are shared across
// every app in the same Firebase project, so those three are already
// correct below.)
import 'dart:io' show Platform;
import 'package:firebase_core/firebase_core.dart';

class DefaultFirebaseOptions {
  static FirebaseOptions get currentPlatform {
    if (Platform.isIOS) return ios;
    return android;
  }

  /// False while ios.apiKey/ios.appId are still the placeholder text
  /// below — used to skip calling Firebase.initializeApp() on iOS
  /// entirely until real values are filled in, since passing malformed
  /// credentials to the native SDK crashes the process (not a Dart
  /// exception, so try/catch can't stop it).
  static bool get iosConfigIsReal =>
      !ios.apiKey.startsWith('REPLACE_WITH_') && !ios.appId.startsWith('REPLACE_WITH_');

  static const android = FirebaseOptions(
    apiKey: 'AIzaSyD7_qdN01h7KF_IcxfAaw2K1bQBWNc9juc',
    appId: '1:1054062631953:android:cb6c4b6ee24171879525b0',
    messagingSenderId: '1054062631953',
    projectId: 'doc-capture',
    storageBucket: 'doc-capture.firebasestorage.app',
  );

  // TODO(victor): replace with the real values after registering an iOS
  // app in the Firebase console (see comment above) — push notifications
  // on iOS won't work until this is done. Everything else in the app
  // works fine regardless (Firebase.initializeApp() in main.dart is
  // wrapped in try/catch specifically so a placeholder/invalid iOS
  // config can't break anything else).
  static const ios = FirebaseOptions(
    apiKey: 'REPLACE_WITH_IOS_API_KEY',
    appId: 'REPLACE_WITH_IOS_GOOGLE_APP_ID',
    messagingSenderId: '1054062631953',
    projectId: 'doc-capture',
    storageBucket: 'doc-capture.firebasestorage.app',
    iosBundleId: 'com.doccapture.doc_capture',
  );
}
