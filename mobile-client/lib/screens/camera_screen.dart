import 'dart:io';
import 'package:camera/camera.dart';
import 'package:flutter/material.dart';
import '../app/theme.dart';
import '../l10n/app_localizations.dart';

/// Live camera capture, supporting multiple shots in one session (mirrors
/// the existing batch-upload flow). Returns the captured files via
/// `Navigator.pop(context, List<File>)` — null/empty if the user backs out
/// without capturing anything.
class CameraScreen extends StatefulWidget {
  const CameraScreen({super.key});

  @override
  State<CameraScreen> createState() => _CameraScreenState();
}

class _CameraScreenState extends State<CameraScreen> with WidgetsBindingObserver {
  CameraController? _controller;
  Future<void>? _initFuture;
  final List<File> _captured = [];
  String? _error;
  bool _capturing = false;

  @override
  void initState() {
    super.initState();
    WidgetsBinding.instance.addObserver(this);
    _initFuture = _init();
  }

  Future<void> _init() async {
    try {
      final cameras = await availableCameras();
      if (cameras.isEmpty) {
        setState(() => _error = 'no_camera');
        return;
      }
      final back = cameras.firstWhere(
        (c) => c.lensDirection == CameraLensDirection.back,
        orElse: () => cameras.first,
      );
      final controller = CameraController(back, ResolutionPreset.high, enableAudio: false);
      await controller.initialize();
      if (!mounted) return;
      setState(() => _controller = controller);
    } catch (_) {
      if (mounted) setState(() => _error = 'init_failed');
    }
  }

  @override
  void didChangeAppLifecycleState(AppLifecycleState state) {
    final controller = _controller;
    if (controller == null || !controller.value.isInitialized) return;
    if (state == AppLifecycleState.inactive || state == AppLifecycleState.paused) {
      controller.dispose();
      setState(() => _controller = null);
    } else if (state == AppLifecycleState.resumed) {
      _initFuture = _init();
    }
  }

  @override
  void dispose() {
    WidgetsBinding.instance.removeObserver(this);
    _controller?.dispose();
    super.dispose();
  }

  Future<void> _shoot() async {
    final controller = _controller;
    if (controller == null || _capturing) return;
    setState(() => _capturing = true);
    try {
      final shot = await controller.takePicture();
      setState(() => _captured.add(File(shot.path)));
    } catch (_) {
      // Transient capture failure — leave the preview running so the
      // person can simply try the shutter again.
    } finally {
      if (mounted) setState(() => _capturing = false);
    }
  }

  void _done() => Navigator.of(context).pop(_captured);

  @override
  Widget build(BuildContext context) {
    final l10n = AppLocalizations.of(context)!;

    return Scaffold(
      backgroundColor: Colors.black,
      body: SafeArea(
        child: FutureBuilder(
          future: _initFuture,
          builder: (context, snapshot) {
            if (_error == 'no_camera') {
              return _fallback(l10n.cameraUnavailable);
            }
            if (_error == 'init_failed') {
              return _fallback(l10n.cameraInitFailed);
            }
            final controller = _controller;
            if (controller == null || !controller.value.isInitialized) {
              return const Center(child: CircularProgressIndicator(color: Colors.white));
            }
            return Stack(
              fit: StackFit.expand,
              children: [
                CameraPreview(controller),
                Positioned(
                  top: 8,
                  left: 8,
                  child: IconButton(
                    icon: const Icon(Icons.close, color: Colors.white, size: 28),
                    onPressed: () => Navigator.of(context).pop(_captured),
                  ),
                ),
                if (_captured.isNotEmpty)
                  Positioned(
                    top: 14,
                    right: 18,
                    child: Container(
                      padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 5),
                      decoration: BoxDecoration(
                        color: AppColors.stamp,
                        borderRadius: BorderRadius.circular(999),
                      ),
                      child: Text('${_captured.length}',
                          style: const TextStyle(color: Colors.white, fontWeight: FontWeight.w700)),
                    ),
                  ),
                Positioned(
                  bottom: 28,
                  left: 0,
                  right: 0,
                  child: Row(
                    mainAxisAlignment: MainAxisAlignment.center,
                    children: [
                      GestureDetector(
                        onTap: _shoot,
                        child: Container(
                          width: 72, height: 72,
                          decoration: BoxDecoration(
                            shape: BoxShape.circle,
                            border: Border.all(color: Colors.white, width: 4),
                            color: _capturing ? Colors.white24 : Colors.transparent,
                          ),
                          child: _capturing
                              ? const Padding(
                                  padding: EdgeInsets.all(20),
                                  child: CircularProgressIndicator(color: Colors.white, strokeWidth: 2),
                                )
                              : null,
                        ),
                      ),
                      if (_captured.isNotEmpty)
                        Positioned(
                          right: -90,
                          child: FilledButton(
                            onPressed: _done,
                            style: FilledButton.styleFrom(backgroundColor: AppColors.stamp),
                            child: Text(l10n.cameraDone),
                          ),
                        ),
                    ],
                  ),
                ),
              ],
            );
          },
        ),
      ),
    );
  }

  Widget _fallback(String message) {
    final l10n = AppLocalizations.of(context)!;
    return Center(
      child: Padding(
        padding: const EdgeInsets.all(24),
        child: Column(
          mainAxisSize: MainAxisSize.min,
          children: [
            const Icon(Icons.no_photography_outlined, color: Colors.white54, size: 40),
            const SizedBox(height: 14),
            Text(message, style: const TextStyle(color: Colors.white), textAlign: TextAlign.center),
            const SizedBox(height: 18),
            OutlinedButton(
              style: OutlinedButton.styleFrom(foregroundColor: Colors.white, side: const BorderSide(color: Colors.white38)),
              onPressed: () => Navigator.of(context).pop(_captured),
              child: Text(l10n.cameraGoBack),
            ),
          ],
        ),
      ),
    );
  }
}
