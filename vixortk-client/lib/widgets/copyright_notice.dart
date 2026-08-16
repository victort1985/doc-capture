import 'package:flutter/material.dart';
import '../app/theme.dart';

/// Pinned bottom-left, always English/LTR regardless of the active app
/// locale — a fixed brand mark rather than localized UI copy.
class CopyrightNotice extends StatelessWidget {
  const CopyrightNotice({super.key, this.light = false});

  /// Use [light]=true on dark backgrounds (e.g. the login screen).
  final bool light;

  @override
  Widget build(BuildContext context) {
    return Positioned(
      left: 16,
      bottom: 12,
      child: Directionality(
        textDirection: TextDirection.ltr,
        child: Text(
          'Created by Viktor Tykhonov · © 2026 All rights reserved.',
          style: TextStyle(
            fontSize: 10.5,
            letterSpacing: 0.1,
            color: light ? Colors.white.withOpacity(0.6) : AppColors.inkSoft.withOpacity(0.7),
          ),
        ),
      ),
    );
  }
}
