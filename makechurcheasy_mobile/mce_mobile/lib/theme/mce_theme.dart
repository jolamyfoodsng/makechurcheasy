import 'package:flutter/material.dart';

class MCEColors {
  MCEColors._();

  /// The active palette is set once per app rebuild by MCEApp. Keeping the
  /// palette here lets the existing Dock-aligned widgets use the same tokens
  /// in both light and dark mode without each page inventing its own colors.
  static bool isDarkMode = true;

  // Core brand
  static const primaryBlue = Color(0xFF1D4ED8);
  static const primaryPurple = Color(0xFF7C3AED);
  static const secondaryBlue = Color(0xFF2563EB);
  static const accentOrange = Color(0xFFF97316);

  // Semantic
  static const success = Color(0xFF22C55E);
  static const danger = Color(0xFFEF4444);
  static const warning = Color(0xFFF59E0B);

  // Design-system palettes
  static const darkBackground = Color(0xFF0F172A);
  static const darkSurface = Color(0xFF111827);
  static const darkElevated = Color(0xFF1F2937);
  static const darkBorder = Color(0xFF334155);
  static const darkTextPrimary = Color(0xFFF8FAFC);
  static const darkTextSecondary = Color(0xFFCBD5E1);
  static const darkTextTertiary = Color(0xFF94A3B8);

  static const lightBackground = Color(0xFFF8FAFC);
  static const lightSurface = Color(0xFFFFFFFF);
  static const lightElevated = Color(0xFFF1F5F9);
  static const lightBorder = Color(0xFFCBD5E1);
  static const lightTextPrimary = Color(0xFF0F172A);
  static const lightTextSecondary = Color(0xFF334155);
  static const lightTextTertiary = Color(0xFF64748B);

  static Color get background => isDarkMode ? darkBackground : lightBackground;
  static Color get surface => isDarkMode ? darkSurface : lightSurface;
  static Color get elevated => isDarkMode ? darkElevated : lightElevated;

  // Text
  static Color get textPrimary =>
      isDarkMode ? darkTextPrimary : lightTextPrimary;
  static Color get textSecondary =>
      isDarkMode ? darkTextSecondary : lightTextSecondary;
  static Color get textTertiary =>
      isDarkMode ? darkTextTertiary : lightTextTertiary;

  // Border
  static Color get border => isDarkMode ? darkBorder : lightBorder;
  static Color get borderLight =>
      isDarkMode ? const Color(0x1AFFFFFF) : const Color(0x1A0F172A);

  // Overlay
  static Color get cardBg => surface;
  static const overlay = Color(0x80000000);

  // Tinted backgrounds for buttons
  static Color get successBg => success.withValues(alpha: 0.12);
  static Color get dangerBg => danger.withValues(alpha: 0.12);
  static Color get primaryBg => primaryBlue.withValues(alpha: 0.12);
}

enum MCEThemePreference { dark, light, system }

class MCETypography {
  MCETypography._();

  static const String _fontFamily = 'Inter';

  static TextStyle get pageTitle => TextStyle(
    fontFamily: _fontFamily,
    fontSize: 40,
    fontWeight: FontWeight.w700,
    color: MCEColors.textPrimary,
  );

  static TextStyle get sectionTitle => TextStyle(
    fontFamily: _fontFamily,
    fontSize: 24,
    fontWeight: FontWeight.w600,
    color: MCEColors.textPrimary,
  );

  static TextStyle get sectionSubtitle => TextStyle(
    fontFamily: _fontFamily,
    fontSize: 13,
    fontWeight: FontWeight.w400,
    color: MCEColors.textSecondary,
  );

  static TextStyle get cardTitle => TextStyle(
    fontFamily: _fontFamily,
    fontSize: 18,
    fontWeight: FontWeight.w600,
    color: MCEColors.textPrimary,
  );

  static TextStyle get body => TextStyle(
    fontFamily: _fontFamily,
    fontSize: 14,
    fontWeight: FontWeight.w400,
    color: MCEColors.textPrimary,
  );

  static TextStyle get bodyBold => TextStyle(
    fontFamily: _fontFamily,
    fontSize: 14,
    fontWeight: FontWeight.w600,
    color: MCEColors.textPrimary,
  );

  static TextStyle get caption => TextStyle(
    fontFamily: _fontFamily,
    fontSize: 12,
    fontWeight: FontWeight.w400,
    color: MCEColors.textSecondary,
  );

  static TextStyle get captionBold => TextStyle(
    fontFamily: _fontFamily,
    fontSize: 12,
    fontWeight: FontWeight.w700,
    color: MCEColors.textSecondary,
  );

  static TextStyle get small => TextStyle(
    fontFamily: _fontFamily,
    fontSize: 11,
    fontWeight: FontWeight.w600,
    color: MCEColors.textSecondary,
  );

  static TextStyle get tiny => TextStyle(
    fontFamily: _fontFamily,
    fontSize: 9,
    fontWeight: FontWeight.w700,
    color: MCEColors.textSecondary,
    letterSpacing: 0.5,
  );

  static TextStyle get navLabel => TextStyle(
    fontFamily: _fontFamily,
    fontSize: 11,
    fontWeight: FontWeight.w500,
  );
}

class MCESpacing {
  MCESpacing._();

  static const double xs = 4;
  static const double sm = 8;
  static const double md = 12;
  static const double lg = 16;
  static const double xl = 20;
  static const double xxl = 24;
}

class MCERadius {
  MCERadius._();

  static const double sm = 4;
  static const double md = 8;
  static const double lg = 12;
  static const double xl = 16;
  static const double pill = 999;
}

class MCETheme {
  MCETheme._();

  static ThemeData get darkTheme => _buildTheme(dark: true);

  static ThemeData get lightTheme => _buildTheme(dark: false);

  static ThemeData _buildTheme({required bool dark}) {
    final background = dark
        ? MCEColors.darkBackground
        : MCEColors.lightBackground;
    final surface = dark ? MCEColors.darkSurface : MCEColors.lightSurface;
    final elevated = dark ? MCEColors.darkElevated : MCEColors.lightElevated;
    final border = dark ? MCEColors.darkBorder : MCEColors.lightBorder;
    final textPrimary = dark
        ? MCEColors.darkTextPrimary
        : MCEColors.lightTextPrimary;
    final textSecondary = dark
        ? MCEColors.darkTextSecondary
        : MCEColors.lightTextSecondary;

    return ThemeData(
      brightness: dark ? Brightness.dark : Brightness.light,
      useMaterial3: true,
      fontFamily: 'Inter',
      scaffoldBackgroundColor: background,
      canvasColor: background,
      colorScheme: (dark ? const ColorScheme.dark() : const ColorScheme.light())
          .copyWith(
            primary: MCEColors.primaryBlue,
            secondary: MCEColors.secondaryBlue,
            surface: surface,
            error: MCEColors.danger,
            onPrimary: Colors.white,
            onSecondary: Colors.white,
            onSurface: textPrimary,
            onSurfaceVariant: textSecondary,
            onError: Colors.white,
          ),
      appBarTheme: AppBarTheme(
        backgroundColor: surface,
        foregroundColor: textPrimary,
        surfaceTintColor: Colors.transparent,
        elevation: 0,
        scrolledUnderElevation: 0,
      ),
      drawerTheme: DrawerThemeData(
        backgroundColor: surface,
        surfaceTintColor: Colors.transparent,
      ),
      cardTheme: CardThemeData(
        color: surface,
        surfaceTintColor: Colors.transparent,
        elevation: 0,
        shape: RoundedRectangleBorder(
          borderRadius: BorderRadius.circular(MCERadius.md),
          side: BorderSide(color: border),
        ),
      ),
      inputDecorationTheme: InputDecorationTheme(
        filled: true,
        fillColor: elevated,
        constraints: const BoxConstraints(minHeight: 44),
        contentPadding: const EdgeInsets.symmetric(
          horizontal: 12,
          vertical: 10,
        ),
        border: OutlineInputBorder(
          borderRadius: BorderRadius.circular(MCERadius.md),
          borderSide: BorderSide(color: border),
        ),
        enabledBorder: OutlineInputBorder(
          borderRadius: BorderRadius.circular(MCERadius.md),
          borderSide: BorderSide(color: border),
        ),
        focusedBorder: OutlineInputBorder(
          borderRadius: BorderRadius.circular(MCERadius.md),
          borderSide: const BorderSide(color: MCEColors.primaryBlue, width: 2),
        ),
        labelStyle: TextStyle(color: textSecondary),
        hintStyle: TextStyle(color: textSecondary),
      ),
      dialogTheme: DialogThemeData(
        backgroundColor: surface,
        surfaceTintColor: Colors.transparent,
        titleTextStyle: MCETypography.cardTitle,
        contentTextStyle: MCETypography.body,
        shape: RoundedRectangleBorder(
          borderRadius: BorderRadius.circular(MCERadius.lg),
          side: BorderSide(color: border),
        ),
      ),
      snackBarTheme: SnackBarThemeData(
        backgroundColor: elevated,
        contentTextStyle: TextStyle(color: textPrimary, fontFamily: 'Inter'),
        actionTextColor: MCEColors.primaryBlue,
        behavior: SnackBarBehavior.floating,
        shape: RoundedRectangleBorder(
          borderRadius: BorderRadius.circular(MCERadius.md),
        ),
      ),
      navigationBarTheme: NavigationBarThemeData(
        backgroundColor: surface,
        indicatorColor: MCEColors.primaryBlue.withValues(alpha: 0.2),
        labelTextStyle: WidgetStateProperty.resolveWith((states) {
          if (states.contains(WidgetState.selected)) {
            return MCETypography.navLabel.copyWith(
              color: MCEColors.primaryBlue,
              fontWeight: FontWeight.w600,
            );
          }
          return MCETypography.navLabel.copyWith(
            color: MCEColors.textSecondary,
          );
        }),
        iconTheme: WidgetStateProperty.resolveWith((states) {
          if (states.contains(WidgetState.selected)) {
            return IconThemeData(color: MCEColors.primaryBlue, size: 24);
          }
          return IconThemeData(color: MCEColors.textSecondary, size: 24);
        }),
        surfaceTintColor: Colors.transparent,
        elevation: 0,
        height: 72,
      ),
      dividerColor: border,
      dividerTheme: DividerThemeData(color: border, thickness: 1, space: 1),
      progressIndicatorTheme: const ProgressIndicatorThemeData(
        color: MCEColors.primaryBlue,
      ),
    );
  }
}
