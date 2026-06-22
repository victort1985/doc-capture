import 'package:flutter/services.dart';
import 'package:local_auth/local_auth.dart';
import 'package:flutter_secure_storage/flutter_secure_storage.dart';

/// Biometric "quick unlock" — lets the user skip typing username/password
/// on subsequent logins once they've authenticated normally at least once.
///
/// The actual credentials are still stored in FlutterSecureStorage (the
/// same place "remember me" stores them); biometrics just gate access to
/// them — the user proves "it's really me" via Face ID / Touch ID /
/// fingerprint, then we read the saved credentials and log in silently.
/// This means the server still gets real credentials, not a biometric
/// assertion — no server-side changes needed.
///
/// Falls back gracefully: if the device has no biometric hardware, or if
/// the user hasn't saved credentials (never tapped "remember me"), or if
/// biometrics fail/are cancelled, the normal login form stays fully
/// functional and nothing breaks.
class BiometricService {
  static const _bioEnabledKey = 'biometric_enabled';
  final _auth = LocalAuthentication();
  final _storage = const FlutterSecureStorage();

  Future<bool> isAvailable() async {
    try {
      if (!await _auth.isDeviceSupported()) return false;
      final available = await _auth.getAvailableBiometrics();
      return available.isNotEmpty;
    } catch (_) {
      return false;
    }
  }

  Future<bool> isEnabled() async {
    final v = await _storage.read(key: _bioEnabledKey);
    return v == 'true';
  }

  Future<void> setEnabled(bool enabled) async {
    await _storage.write(key: _bioEnabledKey, value: enabled ? 'true' : 'false');
  }

  /// Returns true if the user successfully authenticated with biometrics.
  /// false covers both "user cancelled" and "failed" — caller should show
  /// the normal form without an error message in either case.
  Future<bool> authenticate() async {
    try {
      return await _auth.authenticate(
        localizedReason: 'Unlock Doc Capture',
        options: const AuthenticationOptions(
          biometricOnly: false, // allow PIN/pattern as fallback if biometrics fail
          stickyAuth: true,     // don't cancel when app goes to background
        ),
      );
    } on PlatformException {
      return false;
    }
  }
}
