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
}
