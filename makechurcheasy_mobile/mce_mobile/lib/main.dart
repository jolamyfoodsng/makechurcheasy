import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'theme/mce_theme.dart';
import 'services/mce_provider.dart';
import 'screens/splash_screen.dart';

void main() {
  WidgetsFlutterBinding.ensureInitialized();
  SystemChrome.setSystemUIOverlayStyle(const SystemUiOverlayStyle(
    statusBarColor: Colors.transparent,
    statusBarBrightness: Brightness.dark,
    statusBarIconBrightness: Brightness.light,
  ));
  runApp(const MCEApp());
}

class MCEApp extends StatelessWidget {
  const MCEApp({super.key});

  @override
  Widget build(BuildContext context) {
    return MCEProvider(
      child: MaterialApp(
        title: 'MakeChurchEasy',
        debugShowCheckedModeBanner: false,
        theme: MCETheme.darkTheme,
        home: const SplashScreen(),
      ),
    );
  }
}
