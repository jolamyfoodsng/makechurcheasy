import 'package:flutter/material.dart';

class MCEColors {
  MCEColors._();

  // Core brand
  static const primaryBlue = Color(0xFF1D4ED8);
  static const primaryPurple = Color(0xFF7C3AED);
  static const secondaryBlue = Color(0xFF2563EB);
  static const accentOrange = Color(0xFFF97316);

  // Semantic
  static const success = Color(0xFF22C55E);
  static const danger = Color(0xFFEF4444);
  static const warning = Color(0xFFEAB308);

  // Dark mode backgrounds
  static const background = Color(0xFF0F172A);
  static const surface = Color(0xFF111827);
  static const elevated = Color(0xFF1F2937);

  // Text
  static const textPrimary = Color(0xFFF8FAFC);
  static const textSecondary = Color(0xFF94A3B8);
  static const textTertiary = Color(0xFF64748B);

  // Border
  static const border = Color(0xFF334155);
  static const borderLight = Color(0x1AFFFFFF); // rgba(255,255,255,0.1)

  // Overlay
  static const cardBg = Color(0x990F1726); // rgba(15,23,42,0.6)
  static const overlay = Color(0x80000000);

  // Tinted backgrounds for buttons
  static const successBg = Color(0x2622C55E);
  static const dangerBg = Color(0x26EF4444);
  static const primaryBg = Color(0x261D4ED8);
}

class MCETypography {
  MCETypography._();

  static const String _fontFamily = 'Inter';

  static const TextStyle pageTitle = TextStyle(
    fontFamily: _fontFamily,
    fontSize: 40,
    fontWeight: FontWeight.w700,
    color: MCEColors.textPrimary,
  );

  static const TextStyle sectionTitle = TextStyle(
    fontFamily: _fontFamily,
    fontSize: 24,
    fontWeight: FontWeight.w700,
    color: MCEColors.textPrimary,
  );

  static const TextStyle sectionSubtitle = TextStyle(
    fontFamily: _fontFamily,
    fontSize: 13,
    fontWeight: FontWeight.w400,
    color: MCEColors.textSecondary,
  );

  static const TextStyle cardTitle = TextStyle(
    fontFamily: _fontFamily,
    fontSize: 18,
    fontWeight: FontWeight.w600,
    color: MCEColors.textPrimary,
  );

  static const TextStyle body = TextStyle(
    fontFamily: _fontFamily,
    fontSize: 14,
    fontWeight: FontWeight.w400,
    color: MCEColors.textPrimary,
  );

  static const TextStyle bodyBold = TextStyle(
    fontFamily: _fontFamily,
    fontSize: 14,
    fontWeight: FontWeight.w600,
    color: MCEColors.textPrimary,
  );

  static const TextStyle caption = TextStyle(
    fontFamily: _fontFamily,
    fontSize: 12,
    fontWeight: FontWeight.w400,
    color: MCEColors.textSecondary,
  );

  static const TextStyle captionBold = TextStyle(
    fontFamily: _fontFamily,
    fontSize: 12,
    fontWeight: FontWeight.w700,
    color: MCEColors.textSecondary,
  );

  static const TextStyle small = TextStyle(
    fontFamily: _fontFamily,
    fontSize: 11,
    fontWeight: FontWeight.w600,
    color: MCEColors.textSecondary,
  );

  static const TextStyle tiny = TextStyle(
    fontFamily: _fontFamily,
    fontSize: 9,
    fontWeight: FontWeight.w700,
    color: MCEColors.textSecondary,
    letterSpacing: 0.5,
  );

  static const TextStyle navLabel = TextStyle(
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

  static ThemeData get darkTheme {
    return ThemeData(
      brightness: Brightness.dark,
      scaffoldBackgroundColor: MCEColors.background,
      colorScheme: const ColorScheme.dark(
        primary: MCEColors.primaryBlue,
        secondary: MCEColors.secondaryBlue,
        surface: MCEColors.surface,
        error: MCEColors.danger,
        onPrimary: Colors.white,
        onSecondary: Colors.white,
        onSurface: MCEColors.textPrimary,
        onError: Colors.white,
      ),
      navigationBarTheme: NavigationBarThemeData(
        backgroundColor: MCEColors.surface,
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
            return const IconThemeData(color: MCEColors.primaryBlue, size: 24);
          }
          return const IconThemeData(color: MCEColors.textSecondary, size: 24);
        }),
        surfaceTintColor: Colors.transparent,
        elevation: 0,
        height: 72,
      ),
      dividerColor: MCEColors.border,
      dividerTheme: const DividerThemeData(
        color: MCEColors.border,
        thickness: 1,
        space: 1,
      ),
    );
  }
}
