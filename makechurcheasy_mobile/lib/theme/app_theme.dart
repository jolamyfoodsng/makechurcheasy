import 'package:flutter/material.dart';

/// MakeChurchEasy Design System — Dark Mode
/// Colors from STYLE_DESIGN.md, sizing from COMPONENT_LIBRARY.md.
class AppTheme {
  AppTheme._();

  // ── Design System Colors (STYLE_DESIGN.md §Dark Mode) ──
  static const background = Color(0xFF0F172A);
  static const surface = Color(0xFF111827);
  static const elevated = Color(0xFF1F2937);
  static const border = Color(0xFF334155);

  // ── Text (STYLE_DESIGN.md §Dark Mode) ──
  static const textPrimary = Color(0xFFF8FAFC);
  static const textSecondary = Color(0xFFCBD5E1);
  static const textMuted = Color(0xFF94A3B8);

  // ── Brand (STYLE_DESIGN.md §Brand Colors) ──
  static const primaryBlue = Color(0xFF1D4ED8);
  static const primaryPurple = Color(0xFF7C3AED);
  static const accentOrange = Color(0xFFF97316);
  static const success = Color(0xFF22C55E);
  static const warning = Color(0xFFF59E0B);
  static const error = Color(0xFFEF4444);

  static ThemeData get dark => ThemeData(
    useMaterial3: true,
    brightness: Brightness.dark,
    fontFamily: 'Inter',
    colorScheme: ColorScheme.dark(
      primary: primaryBlue,
      secondary: primaryPurple,
      surface: surface,
      onSurface: textPrimary,
      outline: border,
      error: error,
    ),
    scaffoldBackgroundColor: background,
    appBarTheme: const AppBarTheme(
      backgroundColor: surface,
      foregroundColor: textPrimary,
      elevation: 0,
      centerTitle: false,
      titleTextStyle: TextStyle(
        fontFamily: 'Inter',
        fontSize: 24,
        fontWeight: FontWeight.w600,
        color: textPrimary,
      ),
    ),
    // Cards: radius 12px, padding 24px, border 1px (STYLE_DESIGN.md §Card System)
    cardTheme: CardThemeData(
      color: surface,
      elevation: 0,
      margin: EdgeInsets.zero,
      shape: RoundedRectangleBorder(
        borderRadius: BorderRadius.circular(12),
        side: const BorderSide(color: border),
      ),
    ),
    // Navigation bar
    navigationBarTheme: NavigationBarThemeData(
      backgroundColor: surface,
      indicatorColor: primaryBlue.withAlpha(30),
      height: 72,
      labelTextStyle: WidgetStateProperty.resolveWith((states) {
        final selected = states.contains(WidgetState.selected);
        return TextStyle(
          fontFamily: 'Inter',
          fontSize: 11,
          fontWeight: selected ? FontWeight.w600 : FontWeight.w400,
          color: selected ? primaryBlue : textMuted,
        );
      }),
      iconTheme: WidgetStateProperty.resolveWith((states) {
        final selected = states.contains(WidgetState.selected);
        return IconThemeData(
          size: 22,
          color: selected ? primaryBlue : textMuted,
        );
      }),
    ),
    // Inputs: height 44px, radius 12px (COMPONENT_LIBRARY.md §Inputs)
    inputDecorationTheme: InputDecorationTheme(
      filled: true,
      fillColor: background,
      border: OutlineInputBorder(
        borderRadius: BorderRadius.circular(12),
        borderSide: const BorderSide(color: border),
      ),
      enabledBorder: OutlineInputBorder(
        borderRadius: BorderRadius.circular(12),
        borderSide: const BorderSide(color: border),
      ),
      focusedBorder: OutlineInputBorder(
        borderRadius: BorderRadius.circular(12),
        borderSide: const BorderSide(color: primaryBlue, width: 1.5),
      ),
      contentPadding: const EdgeInsets.symmetric(horizontal: 12, vertical: 12),
      hintStyle: const TextStyle(color: textMuted, fontSize: 14, fontFamily: 'Inter'),
    ),
    // Buttons
    elevatedButtonTheme: ElevatedButtonThemeData(
      style: ElevatedButton.styleFrom(
        backgroundColor: primaryBlue,
        foregroundColor: Colors.white,
        minimumSize: const Size.fromHeight(44),
        shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(12)),
        textStyle: const TextStyle(
          fontFamily: 'Inter',
          fontWeight: FontWeight.w600,
          fontSize: 15,
        ),
      ),
    ),
    outlinedButtonTheme: OutlinedButtonThemeData(
      style: OutlinedButton.styleFrom(
        foregroundColor: textPrimary,
        minimumSize: const Size.fromHeight(44),
        shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(12)),
        side: const BorderSide(color: border),
        textStyle: const TextStyle(
          fontFamily: 'Inter',
          fontWeight: FontWeight.w600,
          fontSize: 15,
        ),
      ),
    ),
    // Text hierarchy (STYLE_DESIGN.md §Text Hierarchy)
    textTheme: const TextTheme(
      // Page Title: 40px/700
      headlineLarge: TextStyle(
        fontFamily: 'Inter', fontSize: 40, fontWeight: FontWeight.w700, color: textPrimary,
      ),
      // Section Title: 24px/600
      headlineMedium: TextStyle(
        fontFamily: 'Inter', fontSize: 24, fontWeight: FontWeight.w600, color: textPrimary,
      ),
      // Card Title: 18px/600
      titleLarge: TextStyle(
        fontFamily: 'Inter', fontSize: 18, fontWeight: FontWeight.w600, color: textPrimary,
      ),
      titleMedium: TextStyle(
        fontFamily: 'Inter', fontSize: 16, fontWeight: FontWeight.w600, color: textPrimary,
      ),
      // Body: 14px/400
      bodyLarge: TextStyle(
        fontFamily: 'Inter', fontSize: 14, fontWeight: FontWeight.w400, color: textPrimary,
      ),
      bodyMedium: TextStyle(
        fontFamily: 'Inter', fontSize: 14, fontWeight: FontWeight.w400, color: textSecondary,
      ),
      // Caption: 12px/400
      bodySmall: TextStyle(
        fontFamily: 'Inter', fontSize: 12, fontWeight: FontWeight.w400, color: textMuted,
      ),
      labelLarge: TextStyle(
        fontFamily: 'Inter', fontSize: 14, fontWeight: FontWeight.w600, color: textPrimary,
      ),
    ),
    dividerTheme: const DividerThemeData(color: border, thickness: 1),
  );
}
