import 'package:flutter/material.dart';
import 'package:google_fonts/google_fonts.dart';

/// Shared design tokens — mirrors admin-panel/src/index.css so the mobile
/// client and the admin console read as the same product.
class AppColors {
  static const bg = Color(0xFFF3F5F1);
  static const surface = Color(0xFFFFFFFF);
  static const surfaceMuted = Color(0xFFECEFE9);
  static const border = Color(0xFFDCE1D9);
  static const ink = Color(0xFF15191C);
  static const inkSoft = Color(0xFF5C665F);
  static const primary = Color(0xFF1D3557);
  static const primarySoft = Color(0xFF2C4A73);
  static const primaryWash = Color(0xFFE8EDF3);
  static const stamp = Color(0xFFB5471B);
  static const stampWash = Color(0xFFF7E9E2);
  static const success = Color(0xFF2F6F4E);
}

ThemeData buildAppTheme() {
  final base = ThemeData(useMaterial3: true, brightness: Brightness.light);
  final bodyText = GoogleFonts.interTextTheme(base.textTheme);

  return base.copyWith(
    scaffoldBackgroundColor: AppColors.bg,
    colorScheme: base.colorScheme.copyWith(
      primary: AppColors.primary,
      secondary: AppColors.stamp,
      surface: AppColors.surface,
      error: AppColors.stamp,
    ),
    textTheme: bodyText.copyWith(
      headlineSmall: GoogleFonts.fraunces(
        fontSize: 24, fontWeight: FontWeight.w600, letterSpacing: -0.2, color: AppColors.ink,
      ),
      titleLarge: GoogleFonts.fraunces(
        fontSize: 20, fontWeight: FontWeight.w600, letterSpacing: -0.2, color: AppColors.ink,
      ),
      titleMedium: bodyText.titleMedium?.copyWith(fontWeight: FontWeight.w600, color: AppColors.ink),
      bodyMedium: bodyText.bodyMedium?.copyWith(color: AppColors.ink),
      bodySmall: bodyText.bodySmall?.copyWith(color: AppColors.inkSoft),
      labelLarge: bodyText.labelLarge?.copyWith(fontWeight: FontWeight.w600),
    ),
    appBarTheme: AppBarTheme(
      backgroundColor: AppColors.bg,
      foregroundColor: AppColors.ink,
      elevation: 0,
      surfaceTintColor: Colors.transparent,
      titleTextStyle: GoogleFonts.fraunces(
        fontSize: 19, fontWeight: FontWeight.w600, color: AppColors.ink,
      ),
    ),
    inputDecorationTheme: InputDecorationTheme(
      filled: true,
      fillColor: AppColors.surface,
      contentPadding: const EdgeInsets.symmetric(horizontal: 14, vertical: 14),
      border: OutlineInputBorder(
        borderRadius: BorderRadius.circular(10),
        borderSide: const BorderSide(color: AppColors.border),
      ),
      enabledBorder: OutlineInputBorder(
        borderRadius: BorderRadius.circular(10),
        borderSide: const BorderSide(color: AppColors.border),
      ),
      focusedBorder: OutlineInputBorder(
        borderRadius: BorderRadius.circular(10),
        borderSide: const BorderSide(color: AppColors.primarySoft, width: 1.5),
      ),
      labelStyle: const TextStyle(color: AppColors.inkSoft),
    ),
    filledButtonTheme: FilledButtonThemeData(
      style: FilledButton.styleFrom(
        backgroundColor: AppColors.primary,
        foregroundColor: Colors.white,
        padding: const EdgeInsets.symmetric(vertical: 15),
        shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(10)),
        textStyle: const TextStyle(fontWeight: FontWeight.w600, fontSize: 15),
      ),
    ),
    outlinedButtonTheme: OutlinedButtonThemeData(
      style: OutlinedButton.styleFrom(
        foregroundColor: AppColors.primary,
        side: const BorderSide(color: AppColors.border),
        padding: const EdgeInsets.symmetric(vertical: 14),
        shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(10)),
      ),
    ),
    segmentedButtonTheme: SegmentedButtonThemeData(
      style: SegmentedButton.styleFrom(
        selectedBackgroundColor: AppColors.primary,
        selectedForegroundColor: Colors.white,
        foregroundColor: AppColors.ink,
        side: const BorderSide(color: AppColors.border),
      ),
    ),
    navigationBarTheme: NavigationBarThemeData(
      backgroundColor: AppColors.surface,
      indicatorColor: AppColors.primaryWash,
      elevation: 0,
      // Font size 10 + no wrap ensures all 6 labels fit on one line
      // even on iPhone SE (375pt wide → ~62pt per tab)
      labelTextStyle: WidgetStateProperty.resolveWith((states) => TextStyle(
        fontSize: 10,
        fontWeight: states.contains(WidgetState.selected)
            ? FontWeight.w700
            : FontWeight.w500,
        overflow: TextOverflow.ellipsis,
        height: 1.0,
      )),
    ),
    cardTheme: CardThemeData(
      color: AppColors.surface,
      elevation: 0,
      shape: RoundedRectangleBorder(
        borderRadius: BorderRadius.circular(12),
        side: const BorderSide(color: AppColors.border),
      ),
    ),
    dividerColor: AppColors.surfaceMuted,
  );
}
