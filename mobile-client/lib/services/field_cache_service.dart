import 'package:shared_preferences/shared_preferences.dart';

/// Remembers recently-used values per named field.
/// Usage:
///   final cache = FieldCacheService.instance;
///   await cache.save('deliveryNote.clientName', 'John');
///   final recent = await cache.recent('deliveryNote.clientName');
class FieldCacheService {
  FieldCacheService._();
  static final FieldCacheService instance = FieldCacheService._();

  static const int _maxRecent = 10;
  static const String _prefix = 'fieldcache:';

  SharedPreferences? _prefs;
  Future<SharedPreferences> get _store async =>
      _prefs ??= await SharedPreferences.getInstance();

  String _key(String fieldKey) => '$_prefix$fieldKey';

  /// Returns list of recent values (most recent first) for the given field key.
  Future<List<String>> recent(String fieldKey) async {
    final prefs = await _store;
    return prefs.getStringList(_key(fieldKey)) ?? [];
  }

  /// Saves a value to the top of the recent list.
  Future<void> save(String fieldKey, String value) async {
    if (value.trim().isEmpty) return;
    final prefs = await _store;
    final key = _key(fieldKey);
    final list = (prefs.getStringList(key) ?? []).toList();
    list.remove(value); // remove if already present
    list.insert(0, value); // add to top
    if (list.length > _maxRecent) list.removeRange(_maxRecent, list.length);
    await prefs.setStringList(key, list);
  }

  /// Clears cache for a specific field key.
  Future<void> clear(String fieldKey) async {
    final prefs = await _store;
    await prefs.remove(_key(fieldKey));
  }
}
