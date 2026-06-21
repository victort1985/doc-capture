import 'dart:typed_data';
import 'package:flutter/material.dart';
import 'package:provider/provider.dart';
import '../app/theme.dart';
import '../services/api_service.dart';

/// A medium-sized preview tile — large enough to actually recognize what
/// the photo/document is at a glance, small enough not to dominate the
/// list (spec: "не очень маленький... но и не сильно большим").
///
/// For photos, fetches and decodes a real downsampled thumbnail. For PDF
/// attachments, there's no in-app PDF rendering (no PDF library is
/// bundled), so this renders a clearly-styled document tile instead of
/// trying to fake a page preview.
class MediaThumbnail extends StatelessWidget {
  const MediaThumbnail.photo({super.key, required String url})
      : _url = url, _isPdf = false;
  const MediaThumbnail.pdf({super.key})
      : _url = null, _isPdf = true;

  final String? _url;
  final bool _isPdf;

  static const double _size = 56;

  @override
  Widget build(BuildContext context) {
    if (_isPdf) {
      return Container(
        width: _size, height: _size,
        decoration: BoxDecoration(
          color: AppColors.stamp.withOpacity(0.10),
          borderRadius: BorderRadius.circular(10),
        ),
        child: const Icon(Icons.picture_as_pdf_outlined, color: AppColors.stamp, size: 26),
      );
    }
    return ClipRRect(
      borderRadius: BorderRadius.circular(10),
      child: SizedBox(
        width: _size, height: _size,
        child: FutureBuilder<Uint8List>(
          future: context.read<ApiService>().getBytes(_url!),
          builder: (context, snap) {
            if (snap.hasError) {
              return Container(
                color: AppColors.inkSoft.withOpacity(0.08),
                child: const Icon(Icons.broken_image_outlined, size: 22, color: AppColors.inkSoft),
              );
            }
            if (!snap.hasData) {
              return Container(
                color: AppColors.inkSoft.withOpacity(0.08),
                child: const Center(child: SizedBox(width: 16, height: 16, child: CircularProgressIndicator(strokeWidth: 2))),
              );
            }
            return Image.memory(
              snap.data!,
              width: _size, height: _size,
              fit: BoxFit.cover,
              // Decode at roughly tile resolution instead of full photo
              // size — much cheaper for a list of these, no visual loss
              // at this display size.
              cacheWidth: (_size * MediaQuery.of(context).devicePixelRatio).round(),
            );
          },
        ),
      ),
    );
  }
}
