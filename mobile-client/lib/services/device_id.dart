import 'dart:math';
import 'package:shared_preferences/shared_preferences.dart';

const _kDeviceIdKey = 'vixor_device_id';

/// Returns this install's stable device ID, generating one on first
/// call and persisting it in SharedPreferences. Reinstalling the app
/// (or clearing app data) creates a NEW device ID — that's expected:
/// from the license's point of view, a fresh install is a "new"
/// device until an admin frees up the old slot.
Future<String> getOrCreateDeviceId() async {
  final prefs = await SharedPreferences.getInstance();
  final existing = prefs.getString(_kDeviceIdKey);
  if (existing != null && existing.isNotEmpty) return existing;

  final rand = Random.secure();
  final bytes = List<int>.generate(16, (_) => rand.nextInt(256));
  final id = bytes.map((b) => b.toRadixString(16).padLeft(2, '0')).join();
  await prefs.setString(_kDeviceIdKey, id);
  return id;
}
