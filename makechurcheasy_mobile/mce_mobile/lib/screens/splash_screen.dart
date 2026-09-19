import 'dart:async';

import 'package:flutter/material.dart';
import 'package:flutter/foundation.dart';
import '../models/desktop_models.dart';
import '../theme/mce_theme.dart';
import '../services/mce_provider.dart';
import '../widgets/mce_brand_logo.dart';
import 'connection_wizard_screen.dart';
import 'app_shell.dart';

class SplashScreen extends StatefulWidget {
  const SplashScreen({super.key});

  @override
  State<SplashScreen> createState() => _SplashScreenState();
}

class _SplashScreenState extends State<SplashScreen>
    with SingleTickerProviderStateMixin {
  late AnimationController _controller;
  late Animation<double> _scaleAnimation;
  late Animation<double> _fadeAnimation;

  @override
  void initState() {
    super.initState();
    _controller = AnimationController(
      duration: Duration(milliseconds: 1200),
      vsync: this,
    );
    _scaleAnimation = Tween<double>(
      begin: 0.7,
      end: 1.0,
    ).animate(CurvedAnimation(parent: _controller, curve: Curves.elasticOut));
    _fadeAnimation = Tween<double>(begin: 0.0, end: 1.0).animate(
      CurvedAnimation(
        parent: _controller,
        curve: Interval(0.0, 0.4, curve: Curves.easeIn),
      ),
    );
    _controller.forward();
    _navigateAfterSplash();
  }

  Future<void> _navigateAfterSplash() async {
    // Keep the brand animation, but do not hold the web app behind a fixed
    // multi-second splash before the first usable surface can render.
    await Future<void>.delayed(
      kIsWeb
          ? const Duration(milliseconds: 250)
          : const Duration(milliseconds: 700),
    );
    if (!mounted) return;

    final desktop = context.desktopService;
    final webSocket = context.webSocketService;

    final webPairingData = _pairingDataFromWebUrl();
    if (webPairingData != null) {
      // Pairing only persists local state. Start it without making the first
      // usable frame wait on the browser's secure-storage implementation.
      unawaited(desktop.startPairing(webPairingData));
      webSocket.connect();
      _navigateTo(AppShell());
      return;
    }

    const devDesktopIp = String.fromEnvironment('MCE_DEV_DESKTOP_IP');
    const devPairingToken = String.fromEnvironment(
      'MCE_DEV_DESKTOP_PAIRING_TOKEN',
    );
    if (kDebugMode && devDesktopIp.isNotEmpty && devPairingToken.isNotEmpty) {
      unawaited(
        desktop.startPairing(
          DesktopPairingData(
            ip: devDesktopIp,
            wsPort: 8765,
            apiPort: 45678,
            pairingToken: devPairingToken,
          ),
        ),
      );
      webSocket.connect();
      _navigateTo(AppShell());
      return;
    }

    final hasConnection = await desktop.restoreConnection().timeout(
      kIsWeb ? const Duration(milliseconds: 1500) : const Duration(seconds: 3),
      onTimeout: () => false,
    );
    if (!hasConnection) {
      _navigateTo(ConnectionWizardScreen());
      return;
    }

    webSocket.connect();
    _navigateTo(AppShell());
  }

  /// A desktop-generated local URL can open this Flutter web build directly
  /// in Safari. Its query parameters contain the same pairing data as the
  /// desktop QR code, so the PWA follows the normal saved-connection flow.
  DesktopPairingData? _pairingDataFromWebUrl() {
    if (!kIsWeb) return null;

    final uri = Uri.base;
    final query = uri.queryParameters;
    final ip = (query['ip'] ?? uri.host).trim();
    final token = (query['pairingToken'] ?? query['token'] ?? '').trim();
    if (ip.isEmpty || token.isEmpty) return null;

    return DesktopPairingData(
      ip: ip,
      wsPort: int.tryParse(query['wsPort'] ?? '') ?? 8765,
      apiPort: int.tryParse(query['apiPort'] ?? '') ?? 45678,
      pairingToken: token,
    );
  }

  void _navigateTo(Widget screen) {
    final route = kIsWeb
        ? PageRouteBuilder<void>(
            pageBuilder: (_, _, _) => screen,
            transitionDuration: Duration.zero,
            reverseTransitionDuration: Duration.zero,
          )
        : MaterialPageRoute<void>(builder: (_) => screen);
    Navigator.of(context).pushReplacement(route);
  }

  @override
  void dispose() {
    _controller.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      backgroundColor: MCEColors.background,
      body: Center(
        child: AnimatedBuilder(
          animation: _controller,
          builder: (context, child) {
            return Transform.scale(
              scale: _scaleAnimation.value,
              child: Opacity(
                opacity: _fadeAnimation.value,
                child: Column(
                  mainAxisSize: MainAxisSize.min,
                  children: [
                    Container(
                      width: 100,
                      height: 100,
                      decoration: BoxDecoration(
                        color: MCEColors.primaryBlue,
                        borderRadius: BorderRadius.circular(MCERadius.lg),
                      ),
                      child: Padding(
                        padding: EdgeInsets.all(22),
                        child: MCEBrandMark(size: 56),
                      ),
                    ),
                    SizedBox(height: MCESpacing.lg),
                    Text('MakeChurchEasy', style: MCETypography.sectionTitle),
                    SizedBox(height: MCESpacing.sm),
                    Text(
                      'Church Broadcast Control',
                      style: MCETypography.body.copyWith(
                        color: MCEColors.textSecondary,
                      ),
                    ),
                  ],
                ),
              ),
            );
          },
        ),
      ),
    );
  }
}
