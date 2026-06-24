import 'dart:convert';
import 'dart:typed_data';

/// Decodes a base64 logo (data:image/...;base64,... or raw base64).
/// Returns null if input is null, empty, or decoding fails.
Uint8List? decodeLogoBytes(String? logoBase64) {
  if (logoBase64 == null || logoBase64.isEmpty) return null;
  try {
    final comma = logoBase64.indexOf(',');
    final raw = comma >= 0 ? logoBase64.substring(comma + 1) : logoBase64;
    final clean = raw.replaceAll(RegExp(r'\s'), '');
    return base64Decode(clean);
  } catch (_) {
    return null;
  }
}
