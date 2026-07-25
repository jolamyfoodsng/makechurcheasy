import 'package:flutter/material.dart';
import '../theme/mce_theme.dart';
import '../services/mce_provider.dart';
import 'login_screen.dart';
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
      duration: const Duration(milliseconds: 1200),
      vsync: this,
    );
    _scaleAnimation = Tween<double>(begin: 0.7, end: 1.0).animate(
      CurvedAnimation(parent: _controller, curve: Curves.elasticOut),
    );
    _fadeAnimation = Tween<double>(begin: 0.0, end: 1.0).animate(
      CurvedAnimation(
        parent: _controller,
        curve: const Interval(0.0, 0.4, curve: Curves.easeIn),
      ),
    );
    _controller.forward();
    _navigateAfterSplash();
  }

  Future<void> _navigateAfterSplash() async {
    await Future.delayed(const Duration(milliseconds: 2500));
    if (!mounted) return;

    final auth = context.authService;
    final desktop = context.desktopService;

    final hasAuth = await auth.hasStoredAuth();
    if (!hasAuth) {
      _navigateTo(const LoginScreen());
      return;
    }

    final hasConnection = await desktop.restoreConnection();
    if (!hasConnection) {
      _navigateTo(const ConnectionWizardScreen());
      return;
    }

    _navigateTo(const AppShell());
  }

  void _navigateTo(Widget screen) {
    Navigator.of(context).pushReplacement(
      MaterialPageRoute(builder: (_) => screen),
    );
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
                      child: const Icon(
                        Icons.play_arrow_rounded,
                        size: 52,
                        color: Colors.white,
                      ),
                    ),
                    const SizedBox(height: MCESpacing.lg),
                    const Text(
                      'MakeChurchEasy',
                      style: MCETypography.sectionTitle,
                    ),
                    const SizedBox(height: MCESpacing.sm),
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
