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

  Future<List<ServiceCall>> list() async {
    final data = await _api.get('/calls') as List;
    return data.map((j) => ServiceCall.fromJson(j as Map<String, dynamic>)).toList();
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
