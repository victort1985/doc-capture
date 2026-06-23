import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:mobile_scanner/mobile_scanner.dart';
import '../app/theme.dart';
import '../l10n/app_localizations.dart';

/// Unified barcode scanner screen supporting three input modes:
///
/// 1. **Camera** — `mobile_scanner` (ML Kit on Android, AVFoundation/Vision
///    on iOS). Works on any phone, no extra hardware.
///
/// 2. **Built-in laser scanner** (Zebra, Honeywell, Unitech, etc.) —
///    these run in HID Keyboard Emulation mode by default and behave
///    exactly like a keyboard. We keep a hidden, auto-focused TextField
///    visible so the OS routes HID events to it; a debounce timer
///    distinguishes a fast scanner burst (all chars arrive within ~100ms)
///    from a human typing slowly. No extra package needed — the platform's
///    own HID layer handles the decoding.
///
/// 3. **USB scanner connected via OTG** — same HID path as (2). The Android
///    OS registers it as a keyboard device; our hidden TextField captures it
///    automatically. If the scanner has been reconfigured to Serial/VCP mode,
///    that requires a separate usb_serial integration (not in scope here).
///
/// The mode toggle in the AppBar lets the user switch between Camera and
/// HID modes. In HID mode the camera preview is hidden; in Camera mode the
/// TextField is still present but invisible (so a connected scanner still
/// works even in Camera mode — belt-and-suspenders).
class BarcodeScannerScreen extends StatefulWidget {
  const BarcodeScannerScreen({super.key});

  @override
  State<BarcodeScannerScreen> createState() => _BarcodeScannerScreenState();
}

enum _ScanMode { camera, hid }

class _BarcodeScannerScreenState extends State<BarcodeScannerScreen> {
  _ScanMode _mode = _ScanMode.camera;
  String? _result;
  bool _scanning = true;

  // ── Camera scanner ──────────────────────────────────────────────────────
  final _cameraCtrl = MobileScannerController(
    detectionSpeed: DetectionSpeed.noDuplicates,
  );

  // ── HID / hardware scanner ──────────────────────────────────────────────
  // The hidden TextField that collects keyboard-emulation input from any
  // connected HID barcode scanner (USB-OTG, Bluetooth, or built-in laser).
  final _hidCtrl  = TextEditingController();
  final _hidFocus = FocusNode();
  DateTime? _lastHidChar;

  void _onHidChanged(String v) {
    // Hardware scanners burst all characters at once, each separated by
    // only ~1–5ms. We consider the barcode complete once no new character
    // arrives for 80ms (well above the inter-char gap for scanners, well
    // below any human typing speed). Most scanners also append \n or \r
    // — onSubmitted handles those.
    _lastHidChar = DateTime.now();
    Future.delayed(const Duration(milliseconds: 80), () {
      if (_lastHidChar != null && DateTime.now().difference(_lastHidChar!).inMilliseconds >= 80) {
        final code = _hidCtrl.text.trim();
        if (code.isNotEmpty) _handleResult(code);
      }
    });
  }

  void _handleResult(String code) {
    if (!_scanning || !mounted) return;
    setState(() { _result = code; _scanning = false; });
    _hidCtrl.clear();
    _cameraCtrl.stop();
  }

  void _reset() {
    setState(() { _result = null; _scanning = true; });
    if (_mode == _ScanMode.camera) _cameraCtrl.start();
    if (_mode == _ScanMode.hid) _hidFocus.requestFocus();
  }

  @override
  void initState() {
    super.initState();
    // Auto-focus the hidden TextField so HID input is captured immediately
    WidgetsBinding.instance.addPostFrameCallback((_) => _hidFocus.requestFocus());
  }

  @override
  void dispose() {
    _cameraCtrl.dispose();
    _hidCtrl.dispose();
    _hidFocus.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    final l10n = AppLocalizations.of(context)!;
    return Scaffold(
      appBar: AppBar(
        title: Text(l10n.warehouseScan),
        actions: [
          // Mode toggle
          SegmentedButton<_ScanMode>(
            showSelectedIcon: false,
            style: SegmentedButton.styleFrom(
              textStyle: const TextStyle(fontSize: 11),
              padding: const EdgeInsets.symmetric(horizontal: 8),
            ),
            segments: [
              ButtonSegment(value: _ScanMode.camera, label: Text(l10n.scannerCamera), icon: const Icon(Icons.camera_alt_outlined, size: 15)),
              ButtonSegment(value: _ScanMode.hid, label: Text(l10n.scannerHid), icon: const Icon(Icons.barcode_reader, size: 15)),
            ],
            selected: {_mode},
            onSelectionChanged: (s) {
              setState(() { _mode = s.first; _result = null; _scanning = true; });
              if (_mode == _ScanMode.camera) {
                _cameraCtrl.start();
              } else {
                _cameraCtrl.stop();
                _hidFocus.requestFocus();
              }
            },
          ),
          const SizedBox(width: 8),
        ],
      ),
      body: Stack(children: [
        // ── Camera preview ──────────────────────────────────────────────
        if (_mode == _ScanMode.camera && _scanning)
          MobileScanner(
            controller: _cameraCtrl,
            onDetect: (capture) {
              final code = capture.barcodes.firstOrNull?.rawValue;
              if (code != null) _handleResult(code);
            },
            overlay: Container(
              decoration: BoxDecoration(
                border: Border.all(color: Colors.white30, width: 0.5),
              ),
              child: Stack(children: [
                // Scan line animation hint
                Align(
                  alignment: Alignment.center,
                  child: Container(
                    margin: const EdgeInsets.symmetric(horizontal: 40),
                    height: 2,
                    color: AppColors.primary.withOpacity(0.7),
                  ),
                ),
                // Scan window indicator
                Align(
                  alignment: Alignment.center,
                  child: Container(
                    width: 260, height: 120,
                    decoration: BoxDecoration(
                      border: Border.all(color: Colors.white, width: 2),
                      borderRadius: BorderRadius.circular(8),
                    ),
                  ),
                ),
              ]),
            ),
          ),

        // ── HID mode UI ─────────────────────────────────────────────────
        if (_mode == _ScanMode.hid && _scanning)
          Center(
            child: Column(mainAxisAlignment: MainAxisAlignment.center, children: [
              const Icon(Icons.barcode_reader, size: 80, color: AppColors.inkSoft),
              const SizedBox(height: 20),
              Text(l10n.scannerHidWaiting, style: const TextStyle(fontSize: 16, color: AppColors.inkSoft), textAlign: TextAlign.center),
              const SizedBox(height: 8),
              Text(l10n.scannerHidHint, style: const TextStyle(fontSize: 12, color: AppColors.inkSoft), textAlign: TextAlign.center),
            ]),
          ),

        // ── Hidden TextField for HID input (always present) ─────────────
        // Offscreen but focusable — captures keyboard events from any
        // connected HID scanner regardless of which visual mode is active.
        Positioned(
          left: -400, top: 0,
          child: SizedBox(
            width: 1, height: 1,
            child: TextField(
              controller: _hidCtrl,
              focusNode: _hidFocus,
              autofocus: _mode == _ScanMode.hid,
              enableSuggestions: false,
              autocorrect: false,
              // Prevent the software keyboard from appearing when a HID
              // scanner is connected — hardware keyboard suppress this.
              keyboardType: TextInputType.none,
              onChanged: _onHidChanged,
              onSubmitted: (v) {
                // Many scanners append Enter/CR after the barcode
                final code = v.trim();
                if (code.isNotEmpty) _handleResult(code);
                _hidCtrl.clear();
                _hidFocus.requestFocus();
              },
            ),
          ),
        ),

        // ── Result overlay ───────────────────────────────────────────────
        if (_result != null)
          Container(
            color: Colors.black87,
            child: Center(
              child: Column(mainAxisAlignment: MainAxisAlignment.center, children: [
                const Icon(Icons.check_circle_outline, color: Colors.green, size: 64),
                const SizedBox(height: 16),
                Text(_result!, style: const TextStyle(color: Colors.white, fontSize: 22, fontWeight: FontWeight.w700, letterSpacing: 2)),
                const SizedBox(height: 24),
                Row(mainAxisAlignment: MainAxisAlignment.center, children: [
                  OutlinedButton.icon(
                    style: OutlinedButton.styleFrom(foregroundColor: Colors.white70, side: const BorderSide(color: Colors.white38)),
                    onPressed: _reset,
                    icon: const Icon(Icons.refresh),
                    label: Text(l10n.scannerScanAgain),
                  ),
                  const SizedBox(width: 12),
                  FilledButton.icon(
                    onPressed: () => Navigator.of(context).pop(_result),
                    icon: const Icon(Icons.check),
                    label: Text(l10n.scannerUse),
                  ),
                ]),
              ]),
            ),
          ),
      ]),
    );
  }
}
