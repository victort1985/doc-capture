import 'dart:typed_data';
import 'package:flutter/material.dart';
import 'package:provider/provider.dart';
import '../services/api_service.dart';

/// Full-size, pinch-to-zoom view of an already-uploaded photo — pushed
/// when tapping a photo thumbnail (calendar attachments, etc.) rather
/// than only ever seeing the small preview tile.
class PhotoViewerScreen extends StatelessWidget {
  const PhotoViewerScreen({super.key, required this.url, this.title});

  final String url;
  final String? title;

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      backgroundColor: Colors.black,
      appBar: AppBar(
        backgroundColor: Colors.black,
        foregroundColor: Colors.white,
        title: title != null ? Text(title!, overflow: TextOverflow.ellipsis) : null,
      ),
      body: FutureBuilder<Uint8List>(
        future: context.read<ApiService>().getBytes(url),
        builder: (context, snap) {
          if (snap.hasError) {
            return const Center(
              child: Icon(Icons.broken_image_outlined, color: Colors.white54, size: 48),
            );
          }
          if (!snap.hasData) {
            return const Center(child: CircularProgressIndicator(color: Colors.white));
          }
          return Center(
            child: InteractiveViewer(
              minScale: 1,
              maxScale: 5,
              child: Image.memory(snap.data!),
            ),
          );
        },
      ),
    );
  }
}
