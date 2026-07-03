import 'package:flutter/material.dart';
import '../app/theme.dart';

/// Vixor ERP brand mark — navy rounded square with white V + orange bar.
/// Shown in navigation and login screen.
class StampMark extends StatelessWidget {
  const StampMark({super.key, this.size = 40, this.color = AppColors.primary});

  final double size;
  final Color color;  // kept for API compat, not used (uses fixed brand colors)

  @override
  Widget build(BuildContext context) {
    return SizedBox(
      width: size,
      height: size,
      child: CustomPaint(painter: _VixorPainter(size)),
    );
  }
}

class _VixorPainter extends CustomPainter {
  _VixorPainter(this.size);
  final double size;

  @override
  void paint(Canvas canvas, Size sz) {
    final s = sz.width;
    final r = s * 0.18; // corner radius

    // ── Outer frame (subtle border) ─────────────────────────────────────────
    final framePaint = Paint()
      ..color = const Color(0xFF0E1642).withOpacity(0.12)
      ..style = PaintingStyle.stroke
      ..strokeWidth = s * 0.04;
    canvas.drawRRect(
      RRect.fromRectAndRadius(Rect.fromLTWH(s*0.02, s*0.02, s*0.96, s*0.96), Radius.circular(r + s*0.04)),
      framePaint,
    );

    // ── Navy background square ──────────────────────────────────────────────
    final bgPaint = Paint()
      ..color = const Color(0xFF0E1642)
      ..style = PaintingStyle.fill;
    canvas.drawRRect(
      RRect.fromRectAndRadius(Rect.fromLTWH(s*0.08, s*0.08, s*0.84, s*0.84), Radius.circular(r)),
      bgPaint,
    );

    // ── White V letter ──────────────────────────────────────────────────────
    final vPaint = Paint()
      ..color = Colors.white
      ..style = PaintingStyle.stroke
      ..strokeCap = StrokeCap.round
      ..strokeJoin = StrokeJoin.round
      ..strokeWidth = s * 0.09;

    final vPath = Path()
      ..moveTo(s * 0.25, s * 0.28)
      ..lineTo(s * 0.50, s * 0.65)
      ..lineTo(s * 0.75, s * 0.28);
    canvas.drawPath(vPath, vPaint);

    // ── Orange accent bar ────────────────────────────────────────────────────
    final barPaint = Paint()
      ..color = const Color(0xFFF2701C)
      ..style = PaintingStyle.fill;
    final barH = s * 0.065;
    canvas.drawRRect(
      RRect.fromRectAndRadius(
        Rect.fromLTWH(s * 0.22, s * 0.73, s * 0.56, barH),
        Radius.circular(barH / 2),
      ),
      barPaint,
    );
  }

  @override
  bool shouldRepaint(covariant _VixorPainter old) => old.size != size;
}
