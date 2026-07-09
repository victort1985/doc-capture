import 'dart:io';
import 'dart:typed_data';
import 'package:dio/dio.dart';
import 'api_service.dart';

/// A point in the ORIGINAL photo's pixel coordinates (not the on-screen
/// display coordinates — the review screen converts between the two).
class ScanPoint {
  const ScanPoint(this.x, this.y);

  factory ScanPoint.fromJson(Map<String, dynamic> json) =>
      ScanPoint((json['x'] as num).toDouble(), (json['y'] as num).toDouble());

  final double x;
  final double y;

  Map<String, dynamic> toJson() => {'x': x, 'y': y};
}

class ScanStartResult {
  ScanStartResult({
    required this.sessionId,
    required this.corners,
    required this.imageWidth,
    required this.imageHeight,
    required this.autoDetected,
  });

  factory ScanStartResult.fromJson(Map<String, dynamic> json) => ScanStartResult(
        sessionId: json['sessionId'] as int,
        corners: (json['corners'] as List)
            .map((p) => ScanPoint.fromJson(p as Map<String, dynamic>))
            .toList(),
        imageWidth: json['imageWidth'] as int,
        imageHeight: json['imageHeight'] as int,
        autoDetected: json['autoDetected'] as bool,
      );

  final int sessionId;
  final List<ScanPoint> corners;
  final int imageWidth;
  final int imageHeight;
  final bool autoDetected;
}

/// Everything needed to render one preview/finalize call — the server
/// re-renders from scratch every time rather than incrementally
/// adjusting a previous render, so exactly the same settings always
/// produce exactly the same result regardless of what was previewed
/// before.
class ScanRenderSettings {
  const ScanRenderSettings({
    required this.corners,
    required this.filter, // 'original' | 'bw'
    this.brightness = 0,
    this.contrast = 0,
    this.removeShadows = false,
    this.customName,
  });

  final List<ScanPoint> corners;
  final String filter;
  final double brightness;
  final double contrast;
  final bool removeShadows;
  // Only meaningful for finalize/renderFinal/combine — ignored by preview.
  final String? customName;

  Map<String, dynamic> toJson() => {
        'corners': corners.map((p) => p.toJson()).toList(),
        'filter': filter,
        'brightness': brightness,
        'contrast': contrast,
        'removeShadows': removeShadows,
        if (customName != null && customName!.trim().isNotEmpty) 'customName': customName!.trim(),
      };
}

/// One reviewed page waiting to be combined with others into a single
/// multi-page document — see [ScanSessionService.combine]. The session
/// stays alive server-side (not committed, not deleted) between when a
/// page is reviewed and when the whole batch is combined or abandoned.
class ScanPageResult {
  const ScanPageResult(this.sessionId, this.settings);
  final int sessionId;
  final ScanRenderSettings settings;
}

/// The capture -> auto-detect -> review (drag corners, pick a filter,
/// adjust brightness/contrast, toggle shadow removal, preview each
/// change) -> confirm-or-cancel flow. Nothing reaches real storage/the
/// File log until [finalize]/[combine] — see ScanReviewScreen for the UI
/// this backs.
class ScanSessionService {
  ScanSessionService(this._api);

  final ApiService _api;

  Future<ScanStartResult> start({
    required File file,
    required String place,
    required String docType,
  }) async {
    final formData = FormData.fromMap({
      'place': place,
      'docType': docType,
      'file': await MultipartFile.fromFile(file.path, filename: file.uri.pathSegments.last),
    });
    final response = await _api.postFormData('/scan/start', formData);
    return ScanStartResult.fromJson(response as Map<String, dynamic>);
  }

  Future<Uint8List> preview(int sessionId, ScanRenderSettings settings) {
    return _api.postBytes('/scan/$sessionId/preview', settings.toJson());
  }

  Future<Map<String, dynamic>> finalize(int sessionId, ScanRenderSettings settings) async {
    final response = await _api.post('/scan/$sessionId/finalize', settings.toJson());
    return response;
  }

  /// Same rendering as [finalize], but returns the finished file's bytes
  /// directly instead of committing it to the document/photo library —
  /// for callers that want the result somewhere else (e.g. attaching it
  /// to a calendar event instead).
  Future<Uint8List> renderFinal(int sessionId, ScanRenderSettings settings) {
    return _api.postBytes('/scan/$sessionId/render-final', settings.toJson());
  }

  /// Batch capture: merges multiple already-reviewed pages into one
  /// multi-page document and commits it.
  Future<Map<String, dynamic>> combine({
    required List<ScanPageResult> pages,
    required String place,
    required String docType,
    String? customName,
  }) async {
    final response = await _api.post('/scan/combine', {
      'pages': pages
          .map((p) => {'sessionId': p.sessionId, ...p.settings.toJson()})
          .toList(),
      'place': place,
      'docType': docType,
      if (customName != null && customName.trim().isNotEmpty) 'customName': customName.trim(),
    });
    return response;
  }

  Future<void> cancel(int sessionId) => _api.delete('/scan/$sessionId');
}
