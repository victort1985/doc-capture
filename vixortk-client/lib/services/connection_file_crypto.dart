import 'dart:convert';
import 'dart:typed_data';
import 'package:crypto/crypto.dart' as crypto;
import 'package:encrypt/encrypt.dart' as enc;

/// Must match CONNECTION_FILE_KEY in the license server's .env exactly
/// — this is what lets a .vxconn file generated there be decrypted
/// here. Not a secret in the "protects money" sense, just a shared
/// baseline so a connection file isn't a plain-text address a curious
/// user could open in a text editor and repoint at another org's
/// server by hand.
const String _sharedSecret = 'b34db7b6e27631671c682a91e86b6dbbd62f1bc196957036204018a4f5b6cb6e';

class ConnectionFileException implements Exception {
  final String message;
  ConnectionFileException(this.message);
  @override
  String toString() => message;
}

Uint8List _sha256(List<int> data) => Uint8List.fromList(crypto.sha256.convert(data).bytes);

Uint8List _hmacSha256(Uint8List key, List<int> data) =>
    Uint8List.fromList(crypto.Hmac(crypto.sha256, key).convert(data).bytes);

bool _constantTimeEquals(List<int> a, List<int> b) {
  if (a.length != b.length) return false;
  var diff = 0;
  for (var i = 0; i < a.length; i++) {
    diff |= a[i] ^ b[i];
  }
  return diff == 0;
}

/// Parses and decrypts a .vxconn file's raw bytes into the connection
/// payload: {mode: 'direct'|'cloud', address, clientId?, clientSecret?}.
/// Throws [ConnectionFileException] with a message safe to show the
/// user (never leaks crypto internals) if the file is corrupt, was
/// tampered with, or isn't a Vixor connection file at all.
Map<String, dynamic> decryptConnectionFile(Uint8List fileBytes) {
  if (fileBytes.length < 16 + 32 + 1) {
    throw ConnectionFileException('This doesn\'t look like a valid connection file.');
  }

  final iv = fileBytes.sublist(0, 16);
  final hmac = fileBytes.sublist(16, 48);
  final ciphertext = fileBytes.sublist(48);

  final encKey = _sha256(utf8.encode('$_sharedSecret:enc'));
  final macKey = _sha256(utf8.encode('$_sharedSecret:mac'));

  final expectedHmac = _hmacSha256(macKey, [...iv, ...ciphertext]);
  if (!_constantTimeEquals(hmac, expectedHmac)) {
    throw ConnectionFileException('This connection file is corrupted or invalid.');
  }

  try {
    final encrypter = enc.Encrypter(enc.AES(enc.Key(encKey), mode: enc.AESMode.cbc));
    final decryptedBytes = encrypter.decryptBytes(enc.Encrypted(ciphertext), iv: enc.IV(iv));
    final jsonStr = utf8.decode(decryptedBytes);
    final data = jsonDecode(jsonStr);
    if (data is! Map<String, dynamic>) throw const FormatException('not an object');
    if ((data['address'] as String?)?.trim().isEmpty ?? true) {
      throw const FormatException('missing address');
    }
    return data;
  } catch (e) {
    if (e is ConnectionFileException) rethrow;
    throw ConnectionFileException('This connection file is corrupted or invalid.');
  }
}
