import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'theme/mce_theme.dart';
import 'services/mce_provider.dart';
import 'screens/splash_screen.dart';

void main() {
  WidgetsFlutterBinding.ensureInitialized();
  SystemChrome.setSystemUIOverlayStyle(
    const SystemUiOverlayStyle(
      statusBarColor: Colors.transparent,
      statusBarBrightness: Brightness.dark,
      statusBarIconBrightness: Brightness.light,
    ),
  );
  runApp(const MCEApp());
}

class MCEApp extends StatelessWidget {
  const MCEApp({super.key});

  @override
  Widget build(BuildContext context) {
    return MCEProvider(child: const _MCEAppView());
  }
}

class _MCEAppView extends StatelessWidget {
  const _MCEAppView();

  @override
  Widget build(BuildContext context) {
    final preferences = context.mobilePreferences;
    return AnimatedBuilder(
      animation: preferences,
      builder: (context, _) {
        final isDark = switch (preferences.themePreference) {
          MCEThemePreference.dark => true,
          MCEThemePreference.light => false,
          MCEThemePreference.system =>
            WidgetsBinding.instance.platformDispatcher.platformBrightness ==
                Brightness.dark,
        };
        MCEColors.isDarkMode = isDark;
        SystemChrome.setSystemUIOverlayStyle(
          SystemUiOverlayStyle(
            statusBarColor: Colors.transparent,
            statusBarBrightness: isDark ? Brightness.dark : Brightness.light,
            statusBarIconBrightness: isDark
                ? Brightness.light
                : Brightness.dark,
            systemNavigationBarColor: isDark
                ? MCEColors.background
                : MCEColors.surface,
            systemNavigationBarIconBrightness: isDark
                ? Brightness.light
                : Brightness.dark,
          ),
        );

        return MaterialApp(
          title: 'MakeChurchEasy',
          debugShowCheckedModeBanner: false,
          theme: MCETheme.lightTheme,
          darkTheme: MCETheme.darkTheme,
          themeMode: preferences.themePreference == MCEThemePreference.dark
              ? ThemeMode.dark
              : preferences.themePreference == MCEThemePreference.light
              ? ThemeMode.light
              : ThemeMode.system,
          home: const SplashScreen(),
        );
      },
    );
  }
}
