import 'package:flutter/material.dart';

/// Compact VIXOR ERP wordmark — white "VIXOR" + orange "ERP".
/// Used in AppBar titles and header areas.
class VixorWordmark extends StatelessWidget {
  const VixorWordmark({super.key, this.fontSize = 16});
  final double fontSize;

  @override
  Widget build(BuildContext context) {
    return RichText(
      text: TextSpan(children: [
        TextSpan(
          text: 'VIXOR',
          style: TextStyle(
            fontWeight: FontWeight.w800,
            fontSize: fontSize,
            letterSpacing: 2.5,
            color: Colors.white,
          ),
        ),
        TextSpan(
          text: ' ERP',
          style: TextStyle(
            fontWeight: FontWeight.w300,
            fontSize: fontSize * 0.85,
            letterSpacing: 1.5,
            color: const Color(0xFFF2701C),
          ),
        ),
      ]),
    );
  }
}

/// Square icon + wordmark side-by-side for larger header areas.
class VixorLogo extends StatelessWidget {
  const VixorLogo({super.key, this.size = 32, this.fontSize = 18});
  final double size;
  final double fontSize;

  @override
  Widget build(BuildContext context) {
    return Row(mainAxisSize: MainAxisSize.min, children: [
      ClipRRect(
        borderRadius: BorderRadius.circular(size * 0.22),
        child: Image.asset('assets/icons/app_icon.png', width: size, height: size),
      ),
      const SizedBox(width: 10),
      VixorWordmark(fontSize: fontSize),
    ]);
  }
}
