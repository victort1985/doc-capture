import 'dart:io';
import 'package:dio/dio.dart';
import 'package:file_picker/file_picker.dart';
import 'package:image_picker/image_picker.dart';
import 'api_service.dart';

/// Picking and upload only — heavy processing (crop/enhance/PDF/compress)
/// happens server-side per spec section 3.4.
class FileService {
  FileService(this._api);

  final ApiService _api;
  final ImagePicker _imagePicker = ImagePicker();

  Future<List<File>> pickFromGallery() async {
    final picked = await _imagePicker.pickMultiImage();
    return picked.map((x) => File(x.path)).toList();
  }

  Future<List<File>> pickFromFileManager() async {
    final result = await FilePicker.platform.pickFiles(
      allowMultiple: true,
      type: FileType.custom,
      allowedExtensions: ['jpg', 'jpeg', 'png', 'pdf'],
    );
    if (result == null) return [];
    return result.paths.whereType<String>().map((p) => File(p)).toList();
  }

  Future<List<dynamic>> uploadBatch({
    required String place,
    required String docType, // 'document' | 'photo'
    required List<File> files,
  }) async {
    final formData = FormData.fromMap({
      'place': place,
      'docType': docType,
      'files': [
        for (final f in files)
          await MultipartFile.fromFile(f.path, filename: f.uri.pathSegments.last),
      ],
    });
    final response = await _api.postFormData('/files/upload', formData);
    return response as List<dynamic>;
  }
}
