import 'dart:io';
import 'package:dio/dio.dart';
import '../models/contact.dart';
import 'api_service.dart';

class PhoneBookService {
  PhoneBookService(this._api);
  final ApiService _api;

  Future<List<Contact>> search({
    ContactCategory? category,
    String? q,
    int? organizationId,
  }) async {
    final data = await _api.get('/phonebook', query: {
      if (category != null) 'category': categoryToJson(category),
      if (q != null && q.isNotEmpty) 'q': q,
      if (organizationId != null) 'organizationId': organizationId,
    }) as List;
    return data.map((j) => Contact.fromJson(j as Map<String, dynamic>)).toList();
  }

  Future<Contact> getOne(int id) async {
    final json = await _api.get('/phonebook/$id') as Map<String, dynamic>;
    return Contact.fromJson(json);
  }

  Future<Contact> create({
    required ContactCategory category,
    required String firstName,
    required String lastName,
    int? cityId,
    int? organizationId,
    String? position,
    required String phone,
    String? email,
    String? notes,
    File? photo,
  }) async {
    final formData = FormData.fromMap({
      'category': categoryToJson(category),
      'firstName': firstName,
      'lastName': lastName,
      if (cityId != null) 'cityId': cityId.toString(),
      if (organizationId != null) 'organizationId': organizationId.toString(),
      if (position != null) 'position': position,
      'phone': phone,
      if (email != null) 'email': email,
      if (notes != null) 'notes': notes,
      if (photo != null) 'photo': await MultipartFile.fromFile(photo.path, filename: photo.uri.pathSegments.last),
    });
    final json = await _api.postFormData('/phonebook', formData) as Map<String, dynamic>;
    return Contact.fromJson(json);
  }

  Future<Contact> update(
    int id, {
    ContactCategory? category,
    String? firstName,
    String? lastName,
    int? cityId,
    int? organizationId,
    String? position,
    String? phone,
    String? email,
    String? notes,
    File? photo,
  }) async {
    final formData = FormData.fromMap({
      if (category != null) 'category': categoryToJson(category),
      if (firstName != null) 'firstName': firstName,
      if (lastName != null) 'lastName': lastName,
      if (cityId != null) 'cityId': cityId.toString(),
      if (organizationId != null) 'organizationId': organizationId.toString(),
      if (position != null) 'position': position,
      if (phone != null) 'phone': phone,
      if (email != null) 'email': email,
      if (notes != null) 'notes': notes,
      if (photo != null) 'photo': await MultipartFile.fromFile(photo.path, filename: photo.uri.pathSegments.last),
    });
    final json = await _api.patchFormData('/phonebook/$id', formData) as Map<String, dynamic>;
    return Contact.fromJson(json);
  }

  Future<void> remove(int id) => _api.delete('/phonebook/$id');
}
