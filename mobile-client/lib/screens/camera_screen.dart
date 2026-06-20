import 'dart:io';
import 'package:flutter/material.dart';
import 'package:image_picker/image_picker.dart';
import '../app/theme.dart';
import '../l10n/app_localizations.dart';

/// Multi-shot document capture. Delegates each individual photo to the
/// device's own system camera app via image_picker rather than a custom
/// in-app live preview (the previous implementation used the `camera`
/// plugin's CameraController/CameraPreview directly).
///
/// Switched after a real-device freeze: the live-preview screen would
/// hang completely after taking a shot — the close button stopped
/// responding to taps, while the OS back button still worked, confirming
/// this wasn't a true system-level ANR but specifically the in-app
/// camera preview/texture surface getting into a bad state and blocking
/// Flutter's own hit-testing for sibling widgets. The `camera` plugin's
/// custom Camera2 API binding is a known weak spot for compatibility
/// across the wide variety of real Android camera HALs, especially on
/// Xiaomi/MIUI. Delegating to the system camera app sidesteps that whole
/// class of bug — it's the same camera implementation the phone's own
/// Camera app and every other app on the device already use reliably.
///
/// Returns the captured files via `Navigator.pop(context, List<File>)` —
/// null/empty if the user backs out without capturing anything, matching
/// the previous screen's contract exactly so callers don't need changes.
class CameraScreen extends StatefulWidget {
  const CameraScreen({super.key});

  @override
  State<CameraScreen> createState() => _CameraScreenState();
}

class _CameraScreenState extends State<CameraScreen> {
  final ImagePicker _picker = ImagePicker();
  final List<File> _captured = [];
  bool _capturing = false;
  bool _startedFirstShot = false;

  @override
  void didChangeDependencies() {
    super.didChangeDependencies();
    // Launch the system camera immediately on first entry, mirroring the
    // old screen's "camera is already up, just tap the shutter" feel.
    if (!_startedFirstShot) {
      _startedFirstShot = true;
      WidgetsBinding.instance.addPostFrameCallback((_) => _shoot());
    }
  }

  Future<void> _shoot() async {
    if (_capturing) return;
    setState(() => _capturing = true);
    try {
      final shot = await _picker.pickImage(source: ImageSource.camera, imageQuality: 90);
      if (shot != null) {
        setState(() => _captured.add(File(shot.path)));
      }
    } catch (_) {
      // System camera cancelled, or a transient platform error — just
      // let the person try again from the review screen.
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
        child: _capturing
            ? const Center(child: CircularProgressIndicator(color: Colors.white))
            : _captured.isEmpty
                ? _emptyState(l10n)
                : _reviewGrid(l10n),
      ),
    );
  }

  Widget _emptyState(AppLocalizations l10n) {
    // Only reachable if the very first camera launch was cancelled —
    // otherwise _captured already has a photo and the grid shows instead.
    return Center(
      child: Padding(
        padding: const EdgeInsets.all(24),
        child: Column(
          mainAxisSize: MainAxisSize.min,
          children: [
            const Icon(Icons.camera_alt_outlined, color: Colors.white54, size: 40),
            const SizedBox(height: 18),
            FilledButton(
              style: FilledButton.styleFrom(backgroundColor: AppColors.stamp),
              onPressed: _shoot,
              child: Text(l10n.cameraAddAnother),
            ),
            const SizedBox(height: 10),
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

  Widget _reviewGrid(AppLocalizations l10n) {
    return Column(
      children: [
        Padding(
          padding: const EdgeInsets.fromLTRB(8, 4, 16, 4),
          child: Row(
            children: [
              IconButton(
                icon: const Icon(Icons.close, color: Colors.white, size: 28),
                onPressed: _done,
              ),
              const Spacer(),
              Container(
                padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 5),
                decoration: BoxDecoration(color: AppColors.stamp, borderRadius: BorderRadius.circular(999)),
                child: Text('${_captured.length}',
                    style: const TextStyle(color: Colors.white, fontWeight: FontWeight.w700)),
              ),
            ],
          ),
        ),
        Expanded(
          child: GridView.builder(
            padding: const EdgeInsets.all(12),
            gridDelegate: const SliverGridDelegateWithFixedCrossAxisCount(
              crossAxisCount: 3, crossAxisSpacing: 6, mainAxisSpacing: 6,
            ),
            itemCount: _captured.length,
            itemBuilder: (context, i) => ClipRRect(
              borderRadius: BorderRadius.circular(8),
              child: Image.file(_captured[i], fit: BoxFit.cover),
            ),
          ),
        ),
        Padding(
          padding: const EdgeInsets.fromLTRB(16, 8, 16, 20),
          child: Row(
            children: [
              Expanded(
                child: OutlinedButton.icon(
                  style: OutlinedButton.styleFrom(foregroundColor: Colors.white, side: const BorderSide(color: Colors.white38)),
                  onPressed: _shoot,
                  icon: const Icon(Icons.add_a_photo_outlined, size: 18),
                  label: Text(l10n.cameraAddAnother),
                ),
              ),
              const SizedBox(width: 12),
              Expanded(
                child: FilledButton(
                  style: FilledButton.styleFrom(backgroundColor: AppColors.stamp),
                  onPressed: _done,
                  child: Text(l10n.cameraDone),
                ),
              ),
            ],
          ),
        ),
      ],
    );
  }
}
