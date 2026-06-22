import 'dart:io';
import 'package:dio/dio.dart';
import '../models/service_call.dart';
import 'api_service.dart';

class CallDetail {
  final ServiceCall call;
  final List<CallNote> notes;
  final List<CallAttachment> attachments;
  CallDetail(this.call, this.notes, this.attachments);
}

class CallsService {
  CallsService(this._api);
  final ApiService _api;

  // ETag-based cache: we cache the last known list and its server-
  // provided ETag. On every poll we send If-None-Match; if the server
  // responds 304 the list hasn't changed and we return the cached copy
  // instead of parsing a fresh response — saves both bandwidth and the
  // setState/rebuild cycle that would otherwise flash the UI with an
  // identical list every 15 seconds for no reason.
  List<ServiceCall>? _cachedCalls;
  String? _callsEtag;

  Future<List<ServiceCall>> list() async {
    return (await listIfChanged()).$2;
  }

  /// Returns (changed, calls).  changed=false means the server confirmed
  /// nothing has changed since the last successful fetch (304 Not Modified
  /// with a matching ETag) — the caller can skip re-rendering in that case.
  Future<(bool, List<ServiceCall>)> listIfChanged() async {
    try {
      final res = await _api.getRaw(
        '/calls',
        headers: _callsEtag != null ? {'If-None-Match': _callsEtag!} : null,
      );
      if (res.statusCode == 304 && _cachedCalls != null) {
        return (false, _cachedCalls!);
      }
      final etag = res.headers.value('etag');
      if (etag != null) _callsEtag = etag;
      final calls = (res.data as List)
          .map((j) => ServiceCall.fromJson(j as Map<String, dynamic>))
          .toList();
      _cachedCalls = calls;
      return (true, calls);
    } catch (_) {
      // Network error — return cached data if available so the UI doesn't
      // blank out, or re-throw to let the caller show an error if there's
      // nothing cached at all.
      if (_cachedCalls != null) return (false, _cachedCalls!);
      rethrow;
    }
  }

  void clearCache() {
    _cachedCalls = null;
    _callsEtag = null;
  }

  Future<CallDetail> getOne(int id) async {
    final json = await _api.get('/calls/$id') as Map<String, dynamic>;
    final notes = (json['notes'] as List).map((j) => CallNote.fromJson(j)).toList();
    final attachments = (json['attachments'] as List).map((j) => CallAttachment.fromJson(j)).toList();
    return CallDetail(ServiceCall.fromJson(json), notes, attachments);
  }

  Future<ServiceCall> create({
    required String place,
    int? locationId,
    double? latitude,
    double? longitude,
    required CallUrgency urgency,
    required String contactName,
    required String contactPosition,
    required String contactPhone,
    required String description,
    required bool unusualDamage,
  }) async {
    final json = await _api.post('/calls', {
      'place': place,
      if (locationId != null) 'locationId': locationId,
      if (latitude != null) 'latitude': latitude,
      if (longitude != null) 'longitude': longitude,
      'urgency': urgencyToJson(urgency),
      'contactName': contactName,
      'contactPosition': contactPosition,
      'contactPhone': contactPhone,
      'description': description,
      'unusualDamage': unusualDamage,
    });
    return ServiceCall.fromJson(json);
  }

  Future<void> updateStatus(int id, CallStatus status) async {
    await _api.post('/calls/$id/status', {'status': statusToJson(status)});
  }

  Future<void> addNote(int id, {String? text, File? photo}) async {
    final formData = FormData.fromMap({
      if (text != null) 'text': text,
      if (photo != null) 'photo': await MultipartFile.fromFile(photo.path, filename: photo.uri.pathSegments.last),
    });
    await _api.postFormData('/calls/$id/notes', formData);
  }

  Future<void> addAttachment(int id, File file) async {
    final formData = FormData.fromMap({
      'file': await MultipartFile.fromFile(file.path, filename: file.uri.pathSegments.last),
    });
    await _api.postFormData('/calls/$id/attachments', formData);
  }
}
