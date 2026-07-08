import 'dart:typed_data';
import 'package:flutter/material.dart';
import 'package:printing/printing.dart';
import 'package:provider/provider.dart';
import '../app/theme.dart';
import '../services/api_service.dart';

/// A medium-sized preview tile — large enough to actually recognize what
/// the photo/document is at a glance, small enough not to dominate the
/// list (spec: "не очень маленький... но и не сильно большим"), and for
/// both photos AND PDFs a real rendered preview rather than a generic
/// icon — spec: "что бы еще до открытия было понятно что находится
/// внутри" (so it's clear what's inside before even opening it).
class MediaThumbnail extends StatelessWidget {
  const MediaThumbnail.photo({super.key, required String url})
      : _url = url, _isPdf = false;
  const MediaThumbnail.pdf({super.key, required String url})
      : _url = url, _isPdf = true;

  final String? _url;
  final bool _isPdf;

  static const double _size = 56;

  @override
  Widget build(BuildContext context) {
    return ClipRRect(
      borderRadius: BorderRadius.circular(10),
      child: SizedBox(
        width: _size,
        height: _size,
        child: FutureBuilder<Uint8List>(
          future: _isPdf ? _renderPdfFirstPage(context) : context.read<ApiService>().getBytes(_url!),
          builder: (context, snap) {
            if (snap.hasError || (snap.connectionState == ConnectionState.done && !snap.hasData)) {
              return _fallbackIcon();
            }
            if (!snap.hasData) {
              return Container(
                color: AppColors.inkSoft.withOpacity(0.08),
                child: const Center(
                  child: SizedBox(width: 16, height: 16, child: CircularProgressIndicator(strokeWidth: 2)),
                ),
              );
            }
            return Image.memory(
              snap.data!,
              width: _size,
              height: _size,
              fit: BoxFit.cover,
              // Decode at roughly tile resolution instead of full photo
              // size — much cheaper for a list of these, no visual loss
              // at this display size. Doesn't apply to the PDF path,
              // which is already rasterized at a small size below.
              cacheWidth: _isPdf ? null : (_size * MediaQuery.of(context).devicePixelRatio).round(),
            );
          },
        ),
      ),
    );
  }

  /// Downloads the PDF and rasterizes just its first page at a low DPI —
  /// plenty for a 56x56 tile, and much cheaper than rendering at full
  /// print resolution. Falls through to the generic icon (via the
  /// FutureBuilder's error branch) if the file turns out not to be a
  /// real PDF at all.
  Future<Uint8List> _renderPdfFirstPage(BuildContext context) async {
    final pdfBytes = await context.read<ApiService>().getBytes(_url!);
    final page = await Printing.raster(pdfBytes, pages: [0], dpi: 72).first;
    return page.toPng();
  }

  Widget _fallbackIcon() {
    return Container(
      color: _isPdf ? AppColors.stamp.withOpacity(0.10) : AppColors.inkSoft.withOpacity(0.08),
      child: Icon(
        _isPdf ? Icons.picture_as_pdf_outlined : Icons.broken_image_outlined,
        color: _isPdf ? AppColors.stamp : AppColors.inkSoft,
        size: 26,
      ),
    );
  }
}
