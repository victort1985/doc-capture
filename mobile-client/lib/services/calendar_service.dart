import 'dart:io';
import 'dart:typed_data';
import 'package:dio/dio.dart';
import '../models/calendar_event.dart';
import 'api_service.dart';

class CalendarService {
  CalendarService(this._api);
  final ApiService _api;

  Future<List<CalendarEvent>> listEvents(DateTime from, DateTime to) async {
    final data = await _api.get('/calendar/events', query: {
      'from': from.toIso8601String(),
      'to': to.toIso8601String(),
    }) as List? ?? [];
    return data.map((j) => CalendarEvent.fromJson(j as Map<String, dynamic>)).toList();
  }

  Future<CalendarEvent> createEvent({
    required String title,
    String? description,
    required DateTime startAt,
    DateTime? endAt,
    bool allDay = false,
    CalendarEventType type = CalendarEventType.event,
    String? location,
    String? color,
    CalendarEventRepeat repeat = CalendarEventRepeat.none,
  }) async {
    final json = await _api.post('/calendar/events', {
      'title': title,
      if (description != null) 'description': description,
      'startAt': startAt.toIso8601String(),
      if (endAt != null) 'endAt': endAt.toIso8601String(),
      'allDay': allDay,
      'type': type == CalendarEventType.task ? 'task' : 'event',
      if (location != null) 'location': location,
      if (color != null) 'color': color,
      'repeat': repeatToJson(repeat),
    });
    return CalendarEvent.fromJson(json as Map<String, dynamic>);
  }

  Future<CalendarEvent> updateEvent(int id, Map<String, dynamic> fields) async {
    final json = await _api.patch('/calendar/events/$id', fields);
    return CalendarEvent.fromJson(json as Map<String, dynamic>);
  }

  Future<void> removeEvent(int id) => _api.delete('/calendar/events/$id');

  Future<void> addAttachment(int eventId, File file) async {
    final formData = FormData.fromMap({
      'file': await MultipartFile.fromFile(file.path, filename: file.uri.pathSegments.last),
    });
    await _api.postFormData('/calendar/events/$eventId/attachments', formData);
  }

  Future<Uint8List> downloadAttachment(int attachmentId) =>
      _api.getBytes('/calendar/attachments/$attachmentId/download');

  Future<void> removeAttachment(int id) => _api.delete('/calendar/attachments/$id');
}
