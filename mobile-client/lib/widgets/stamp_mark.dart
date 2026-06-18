import 'package:flutter/material.dart';
import 'theme.dart';

/// The brand mark, drawn in code so it matches the admin-panel's inline SVG
/// pixel-for-pixel without needing an image asset: a circular ink-stamp
/// impression around a folded-document glyph with a checkmark.
class StampMark extends StatelessWidget {
  const StampMark({super.key, this.size = 40, this.color = AppColors.stamp});

  final double size;
  final Color color;

  @override
  Widget build(BuildContext context) {
    return SizedBox(
      width: size,
      height: size,
      child: CustomPaint(painter: _StampPainter(color)),
    );
  }
}

class _StampPainter extends CustomPainter {
  _StampPainter(this.color);
  final Color color;

  @override
  void paint(Canvas canvas, Size size) {
    final scale = size.width / 48;
    final stroke = Paint()
      ..color = color
      ..style = PaintingStyle.stroke
      ..strokeCap = StrokeCap.round
      ..strokeJoin = StrokeJoin.round;

    final center = Offset(size.width / 2, size.height / 2);

    canvas.drawCircle(center, 21 * scale, stroke..strokeWidth = 2.5 * scale);

    final dashPaint = Paint()
      ..color = color.withOpacity(0.6)
      ..style = PaintingStyle.stroke
      ..strokeWidth = 1 * scale;
    _drawDashedCircle(canvas, center, 15.5 * scale, dashPaint);

    final docPath = Path()
      ..moveTo(17 * scale, 15 * scale)
      ..lineTo(27 * scale, 15 * scale)
      ..lineTo(31 * scale, 19 * scale)
      ..lineTo(31 * scale, 33 * scale)
      ..arcToPoint(Offset(30 * scale, 34 * scale), radius: Radius.circular(1 * scale))
      ..lineTo(17 * scale, 34 * scale)
      ..arcToPoint(Offset(16 * scale, 33 * scale), radius: Radius.circular(1 * scale))
      ..lineTo(16 * scale, 16 * scale)
      ..arcToPoint(Offset(17 * scale, 15 * scale), radius: Radius.circular(1 * scale));
    canvas.drawPath(docPath, stroke..strokeWidth = 2 * scale);

    final fold = Path()
      ..moveTo(27 * scale, 15 * scale)
      ..lineTo(27 * scale, 19 * scale)
      ..lineTo(31 * scale, 19 * scale);
    canvas.drawPath(fold, stroke..strokeWidth = 2 * scale);

    final check = Path()
      ..moveTo(19.5 * scale, 25.5 * scale)
      ..lineTo(22.5 * scale, 28.5 * scale)
      ..lineTo(28.5 * scale, 22 * scale);
    canvas.drawPath(check, stroke..strokeWidth = 2 * scale);
  }

  void _drawDashedCircle(Canvas canvas, Offset center, double radius, Paint paint) {
    const dashLength = 2.0, gapLength = 3.0;
    final circumference = 2 * 3.14159265 * radius;
    final dashCount = (circumference / (dashLength + gapLength)).floor();
    final angleStep = (2 * 3.14159265) / dashCount;
    for (int i = 0; i < dashCount; i++) {
      final start = i * angleStep;
      final end = start + (dashLength / radius);
      canvas.drawArc(
        Rect.fromCircle(center: center, radius: radius),
        start, end - start, false, paint,
      );
    }
  }

  @override
  bool shouldRepaint(covariant _StampPainter oldDelegate) => oldDelegate.color != color;
}
