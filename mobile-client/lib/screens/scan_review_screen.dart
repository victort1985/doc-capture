import 'dart:async';
import 'dart:io';
import 'dart:typed_data';
import 'dart:ui' as ui;
import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:provider/provider.dart';
import '../app/theme.dart';
import '../l10n/app_localizations.dart';
import '../services/scan_session_service.dart';

/// Which of the three ways this screen's "confirm" action ends:
/// commits straight to the document/photo library (the normal single-
/// page flow), returns the finished file's bytes without committing
/// anywhere (used when the caller wants to attach the result somewhere
/// else, e.g. a calendar event), or just hands back this page's chosen
/// settings without finalizing at all (batch capture — see
/// scan_batch_flow.dart, which combines several of these into one
/// multi-page document at the end).
enum ScanReviewMode { finalizeToStorage, returnBytes, collectForBatch }

/// The capture -> auto-detect -> review -> confirm-or-cancel flow for one
/// captured photo: server auto-detects the document's corners on entry,
/// the user can drag them, pick Original/B&W, adjust brightness and
/// contrast, and toggle shadow removal, previewing each change before
/// committing. Nothing reaches real storage until "Подтвердить" — see
/// ScanSessionService and the server's ScanSession for the buffer this
/// backs.
///
/// Pops with a result whose type depends on [mode]: a
/// `Map<String, dynamic>` upload result (finalizeToStorage), raw
/// `Uint8List` bytes (returnBytes), or a `ScanPageResult` (collectForBatch)
/// — or null on cancel/back in any mode.
class ScanReviewScreen extends StatefulWidget {
  const ScanReviewScreen({
    super.key,
    required this.imageFile,
    required this.place,
    required this.docType,
    this.mode = ScanReviewMode.finalizeToStorage,
    this.pageLabel,
  });

  final File imageFile;
  final String place;
  final String docType; // 'document' | 'photo'
  final ScanReviewMode mode;
  // e.g. "Page 2" — shown in the app bar during batch capture so it's
  // clear which page is being edited.
  final String? pageLabel;

  @override
  State<ScanReviewScreen> createState() => _ScanReviewScreenState();
}

class _ScanReviewScreenState extends State<ScanReviewScreen> {
  int? _sessionId;
  int _imageWidth = 0;
  int _imageHeight = 0;
  List<ScanPoint>? _detectedCorners; // the exact corners auto-detection returned, for the curved-warp match check
  List<Offset> _corners = [];
  ui.Image? _displayImage;

  bool _loading = true;
  String? _startError;
  bool _finalizing = false;

  String _filter = 'bw'; // 'original' | 'bw'
  double _brightness = 0;
  double _contrast = 0;
  bool _removeShadows = false;

  bool _showingPreview = false;
  Uint8List? _previewBytes;
  bool _previewLoading = false;
  String? _previewError;
  Timer? _debounce;

  @override
  void initState() {
    super.initState();
    // A plain FocusScope.unfocus() on the previous screen isn't always
    // enough to actually close the OS keyboard before this screen
    // finishes transitioning in (a known iOS timing quirk) — hide it
    // directly as a more reliable safety net. Nothing on this screen
    // ever needs a keyboard.
    SystemChannels.textInput.invokeMethod('TextInput.hide');
    _filter = widget.docType == 'document' ? 'bw' : 'original';
    _start();
  }

  @override
  void dispose() {
    _debounce?.cancel();
    super.dispose();
  }

  Future<void> _start() async {
    try {
      final scanService = context.read<ScanSessionService>();
      final result = await scanService.start(
        file: widget.imageFile,
        place: widget.place,
        docType: widget.docType,
      );
      final bytes = await widget.imageFile.readAsBytes();
      final codec = await ui.instantiateImageCodec(bytes);
      final frame = await codec.getNextFrame();
      if (!mounted) return;
      setState(() {
        _sessionId = result.sessionId;
        _imageWidth = result.imageWidth;
        _imageHeight = result.imageHeight;
        _detectedCorners = result.autoDetected ? result.corners : null;
        _corners = result.corners.map((p) => Offset(p.x, p.y)).toList();
        _displayImage = frame.image;
        _loading = false;
      });
    } catch (e) {
      if (!mounted) return;
      setState(() {
        _startError = e.toString();
        _loading = false;
      });
    }
  }

  ScanRenderSettings get _currentSettings => ScanRenderSettings(
        corners: _corners.map((c) => ScanPoint(c.dx, c.dy)).toList(),
        filter: _filter,
        brightness: _brightness,
        contrast: _contrast,
        removeShadows: _removeShadows,
      );

  void _resetToAutoDetected() {
    if (_detectedCorners == null) return;
    setState(() {
      _corners = _detectedCorners!.map((p) => Offset(p.x, p.y)).toList();
    });
    if (_showingPreview) _schedulePreviewRefresh();
  }

  void _schedulePreviewRefresh() {
    _debounce?.cancel();
    _debounce = Timer(const Duration(milliseconds: 350), _fetchPreview);
  }

  Future<void> _fetchPreview() async {
    if (_sessionId == null) return;
    setState(() {
      _previewLoading = true;
      _previewError = null;
    });
    try {
      final scanService = context.read<ScanSessionService>();
      final bytes = await scanService.preview(_sessionId!, _currentSettings);
      if (!mounted) return;
      setState(() {
        _previewBytes = bytes;
        _previewLoading = false;
      });
    } catch (e) {
      if (!mounted) return;
      setState(() {
        _previewError = e.toString();
        _previewLoading = false;
      });
    }
  }

  void _togglePreview() {
    setState(() => _showingPreview = !_showingPreview);
    if (_showingPreview) _fetchPreview();
  }

  Future<void> _confirm() async {
    if (_sessionId == null) return;

    if (widget.mode == ScanReviewMode.collectForBatch) {
      // Nothing to render/commit yet — the session stays alive
      // server-side until the whole batch is combined (or the batch
      // flow cancels it) at the end.
      Navigator.of(context).pop(ScanPageResult(_sessionId!, _currentSettings));
      return;
    }

    setState(() => _finalizing = true);
    try {
      final scanService = context.read<ScanSessionService>();
      if (widget.mode == ScanReviewMode.returnBytes) {
        final bytes = await scanService.renderFinal(_sessionId!, _currentSettings);
        if (!mounted) return;
        Navigator.of(context).pop(bytes);
      } else {
        final result = await scanService.finalize(_sessionId!, _currentSettings);
        if (!mounted) return;
        Navigator.of(context).pop(result);
      }
    } catch (e) {
      if (!mounted) return;
      setState(() => _finalizing = false);
      final l10n = AppLocalizations.of(context)!;
      ScaffoldMessenger.of(context).showSnackBar(SnackBar(content: Text(l10n.scanFinalizeError)));
    }
  }

  Future<void> _cancel() async {
    final sessionId = _sessionId;
    if (sessionId != null) {
      try {
        await context.read<ScanSessionService>().cancel(sessionId);
      } catch (_) {
        // Best-effort — the hourly server-side sweep cleans up anything
        // left behind regardless.
      }
    }
    if (mounted) Navigator.of(context).pop(null);
  }

  @override
  Widget build(BuildContext context) {
    final l10n = AppLocalizations.of(context)!;
    return PopScope(
      canPop: false,
      onPopInvokedWithResult: (didPop, _) {
        if (!didPop) _cancel();
      },
      child: Scaffold(
        backgroundColor: Colors.black,
        appBar: AppBar(
          backgroundColor: Colors.black,
          foregroundColor: Colors.white,
          toolbarHeight: 44,
          title: Text(
            widget.pageLabel != null ? '${l10n.scanReviewTitle} · ${widget.pageLabel}' : l10n.scanReviewTitle,
            style: const TextStyle(fontSize: 17),
          ),
          leading: IconButton(icon: const Icon(Icons.close), onPressed: _finalizing ? null : _cancel),
        ),
        body: GestureDetector(
          behavior: HitTestBehavior.translucent,
          onTap: () {
            FocusScope.of(context).unfocus();
            SystemChannels.textInput.invokeMethod('TextInput.hide');
          },
          child: SafeArea(child: _buildBody(l10n)),
        ),
      ),
    );
  }

  Widget _buildBody(AppLocalizations l10n) {
    if (_loading) {
      return const Center(child: CircularProgressIndicator(color: Colors.white));
    }
    if (_startError != null) {
      return Center(
        child: Padding(
          padding: const EdgeInsets.all(24),
          child: Column(
            mainAxisSize: MainAxisSize.min,
            children: [
              const Icon(Icons.error_outline, color: Colors.white70, size: 40),
              const SizedBox(height: 12),
              Text(l10n.scanStartError, style: const TextStyle(color: Colors.white), textAlign: TextAlign.center),
              const SizedBox(height: 16),
              OutlinedButton(
                style: OutlinedButton.styleFrom(foregroundColor: Colors.white, side: const BorderSide(color: Colors.white54)),
                onPressed: () {
                  setState(() { _loading = true; _startError = null; });
                  _start();
                },
                child: Text(l10n.retry),
              ),
            ],
          ),
        ),
      );
    }

    return Column(
      children: [
        Expanded(child: _showingPreview ? _buildPreviewArea() : _buildCornerEditor()),
        _buildControls(l10n),
      ],
    );
  }

  Widget _buildCornerEditor() {
    if (_displayImage == null || _imageWidth == 0 || _imageHeight == 0) return const SizedBox();
    return LayoutBuilder(builder: (context, constraints) {
      final maxW = constraints.maxWidth;
      final maxH = constraints.maxHeight;
      final imageAspect = _imageWidth / _imageHeight;
      final boxAspect = maxW / maxH;
      double displayW, displayH;
      if (imageAspect > boxAspect) {
        displayW = maxW;
        displayH = maxW / imageAspect;
      } else {
        displayH = maxH;
        displayW = maxH * imageAspect;
      }
      final scale = displayW / _imageWidth;

      return Center(
        child: SizedBox(
          width: displayW,
          height: displayH,
          child: Stack(
            clipBehavior: Clip.none,
            children: [
              Positioned.fill(child: RawImage(image: _displayImage, fit: BoxFit.fill)),
              Positioned.fill(
                child: CustomPaint(
                  painter: _QuadPainter(corners: _corners.map((c) => Offset(c.dx * scale, c.dy * scale)).toList()),
                ),
              ),
              for (int i = 0; i < _corners.length; i++)
                Positioned(
                  left: _corners[i].dx * scale - 16,
                  top: _corners[i].dy * scale - 16,
                  child: GestureDetector(
                    onPanUpdate: (details) {
                      setState(() {
                        final newX = (_corners[i].dx + details.delta.dx / scale).clamp(0.0, _imageWidth.toDouble());
                        final newY = (_corners[i].dy + details.delta.dy / scale).clamp(0.0, _imageHeight.toDouble());
                        _corners[i] = Offset(newX, newY);
                      });
                    },
                    child: Container(
                      width: 32,
                      height: 32,
                      decoration: BoxDecoration(
                        shape: BoxShape.circle,
                        color: AppColors.primary.withOpacity(0.9),
                        border: Border.all(color: Colors.white, width: 2.5),
                        boxShadow: const [BoxShadow(color: Colors.black45, blurRadius: 4)],
                      ),
                    ),
                  ),
                ),
            ],
          ),
        ),
      );
    });
  }

  Widget _buildPreviewArea() {
    if (_previewLoading && _previewBytes == null) {
      return const Center(child: CircularProgressIndicator(color: Colors.white));
    }
    if (_previewError != null && _previewBytes == null) {
      final l10n = AppLocalizations.of(context)!;
      return Center(child: Text(l10n.scanPreviewError, style: const TextStyle(color: Colors.white70)));
    }
    if (_previewBytes == null) return const SizedBox();
    return Stack(
      alignment: Alignment.center,
      children: [
        InteractiveViewer(
          minScale: 1,
          maxScale: 4,
          child: Image.memory(_previewBytes!, fit: BoxFit.contain),
        ),
        if (_previewLoading)
          Container(
            color: Colors.black26,
            child: const Center(child: CircularProgressIndicator(color: Colors.white)),
          ),
      ],
    );
  }

  Widget _buildControls(AppLocalizations l10n) {
    return Container(
      color: const Color(0xFF161616),
      padding: const EdgeInsets.fromLTRB(14, 8, 14, 10),
      child: SingleChildScrollView(
        child: Column(
          mainAxisSize: MainAxisSize.min,
          children: [
            Row(
              children: [
                Expanded(
                  child: SegmentedButton<bool>(
                    segments: [
                      ButtonSegment(value: true, label: Text(l10n.scanModeEditCorners), icon: const Icon(Icons.crop_free, size: 16)),
                      ButtonSegment(value: false, label: Text(l10n.scanModePreview), icon: const Icon(Icons.visibility_outlined, size: 16)),
                    ],
                    selected: {_showingPreview},
                    onSelectionChanged: (s) {
                      if (s.first != _showingPreview) _togglePreview();
                    },
                    style: const ButtonStyle(
                      visualDensity: VisualDensity.compact,
                    ),
                  ),
                ),
                if (!_showingPreview && _detectedCorners != null) ...[
                  const SizedBox(width: 6),
                  IconButton(
                    tooltip: l10n.scanResetCorners,
                    onPressed: _resetToAutoDetected,
                    visualDensity: VisualDensity.compact,
                    icon: const Icon(Icons.replay, color: Colors.white70, size: 20),
                  ),
                ],
              ],
            ),
            const SizedBox(height: 8),
            SegmentedButton<String>(
              segments: [
                ButtonSegment(value: 'original', label: Text(l10n.scanFilterOriginal)),
                ButtonSegment(value: 'bw', label: Text(l10n.scanFilterBw)),
              ],
              selected: {_filter},
              onSelectionChanged: (s) {
                setState(() => _filter = s.first);
                if (_showingPreview) _schedulePreviewRefresh();
              },
              style: const ButtonStyle(visualDensity: VisualDensity.compact),
            ),
            SliderTheme(
              data: SliderTheme.of(context).copyWith(
                trackHeight: 2.5,
                thumbShape: const RoundSliderThumbShape(enabledThumbRadius: 7),
                overlayShape: const RoundSliderOverlayShape(overlayRadius: 14),
              ),
              child: Column(
                children: [
                  _buildSlider(
                    label: l10n.scanBrightness,
                    value: _brightness,
                    onChanged: (v) {
                      setState(() => _brightness = v);
                      if (_showingPreview) _schedulePreviewRefresh();
                    },
                  ),
                  _buildSlider(
                    label: l10n.scanContrast,
                    value: _contrast,
                    onChanged: (v) {
                      setState(() => _contrast = v);
                      if (_showingPreview) _schedulePreviewRefresh();
                    },
                  ),
                ],
              ),
            ),
            Row(
              children: [
                Expanded(
                  child: Text(l10n.scanRemoveShadows, style: const TextStyle(color: Colors.white70, fontSize: 13)),
                ),
                Transform.scale(
                  scale: 0.85,
                  child: Switch(
                    value: _removeShadows,
                    activeColor: AppColors.primary,
                    onChanged: (v) {
                      setState(() => _removeShadows = v);
                      if (_showingPreview) _schedulePreviewRefresh();
                    },
                  ),
                ),
              ],
            ),
            const SizedBox(height: 6),
            SizedBox(
              width: double.infinity,
              height: 42,
              child: FilledButton.icon(
                icon: _finalizing
                    ? const SizedBox(height: 16, width: 16, child: CircularProgressIndicator(strokeWidth: 2, color: Colors.white))
                    : const Icon(Icons.check, size: 18),
                label: Text(_finalizing ? l10n.scanFinalizing : (widget.mode == ScanReviewMode.collectForBatch ? l10n.scanPageDone : l10n.scanConfirm)),
                onPressed: _finalizing ? null : _confirm,
              ),
            ),
          ],
        ),
      ),
    );
  }

  Widget _buildSlider({required String label, required double value, required ValueChanged<double> onChanged}) {
    return Row(
      children: [
        SizedBox(
          width: 92,
          child: Text(label, style: const TextStyle(color: Colors.white70, fontSize: 12.5)),
        ),
        Expanded(
          child: Slider(
            value: value,
            min: -100,
            max: 100,
            activeColor: AppColors.primary,
            onChanged: onChanged,
          ),
        ),
        SizedBox(
          width: 32,
          child: Text(value.round().toString(), style: const TextStyle(color: Colors.white54, fontSize: 12)),
        ),
      ],
    );
  }
}

class _QuadPainter extends CustomPainter {
  _QuadPainter({required this.corners});

  final List<Offset> corners;

  @override
  void paint(Canvas canvas, Size size) {
    if (corners.length != 4) return;

    final quadPath = Path()..moveTo(corners[0].dx, corners[0].dy);
    for (int i = 1; i < 4; i++) {
      quadPath.lineTo(corners[i].dx, corners[i].dy);
    }
    quadPath.close();

    final fullRect = Path()..addRect(Rect.fromLTWH(0, 0, size.width, size.height));
    final dimOutside = Path.combine(PathOperation.difference, fullRect, quadPath);
    canvas.drawPath(dimOutside, Paint()..color = Colors.black.withOpacity(0.45));

    canvas.drawPath(
      quadPath,
      Paint()
        ..color = AppColors.primary
        ..strokeWidth = 2.5
        ..style = PaintingStyle.stroke,
    );
  }

  @override
  bool shouldRepaint(covariant _QuadPainter oldDelegate) => oldDelegate.corners != corners;
}
