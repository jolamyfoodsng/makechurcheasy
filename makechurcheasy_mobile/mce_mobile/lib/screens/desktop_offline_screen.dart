import 'package:flutter/material.dart';
import '../theme/mce_theme.dart';
import '../widgets/mce_button.dart';
import '../services/mce_provider.dart';
import 'connection_wizard_screen.dart';
import 'connection_success_screen.dart';
import 'login_screen.dart';

class DesktopOfflineScreen extends StatelessWidget {
  const DesktopOfflineScreen({super.key});

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      backgroundColor: MCEColors.background,
      body: SafeArea(
        child: Padding(
          padding: const EdgeInsets.symmetric(horizontal: MCESpacing.xxl),
          child: Column(
            children: [
              const Spacer(flex: 2),

              // Disconnected icon
              Container(
                width: 100,
                height: 100,
                decoration: BoxDecoration(
                  color: MCEColors.danger.withValues(alpha: 0.15),
                  shape: BoxShape.circle,
                  border: Border.all(
                    color: MCEColors.danger.withValues(alpha: 0.3),
                    width: 2,
                  ),
                ),
                child: const Icon(
                  Icons.wifi_off_rounded,
                  size: 48,
                  color: MCEColors.danger,
                ),
              ),
              const SizedBox(height: MCESpacing.xxl),

              const Text(
                'Desktop Offline',
                style: MCETypography.sectionTitle,
              ),
              const SizedBox(height: MCESpacing.sm),
              Text(
                'Lost connection to your church computer.\nMake sure the desktop app is running and\non the same network.',
                style: MCETypography.body.copyWith(
                  color: MCEColors.textSecondary,
                  height: 1.5,
                ),
                textAlign: TextAlign.center,
              ),

              const Spacer(flex: 2),

              // Reconnect button
              SizedBox(
                width: double.infinity,
                height: 52,
                child: MCEButton.primary(
                  label: 'Reconnect',
                  icon: Icons.refresh,
                  onPressed: () async {
                    final desktop = context.desktopService;
                    final restored = await desktop.restoreConnection();
                    if (!context.mounted) return;

                    if (restored) {
                      Navigator.of(context).pushReplacement(
                        MaterialPageRoute(
                          builder: (_) => const ConnectionSuccessScreen(),
                        ),
                      );
                    } else {
                      Navigator.of(context).pushReplacement(
                        MaterialPageRoute(
                          builder: (_) => const ConnectionWizardScreen(),
                        ),
                      );
                    }
                  },
                ),
              ),
              const SizedBox(height: MCESpacing.md),

              // Switch account
              SizedBox(
                width: double.infinity,
                height: 52,
                child: OutlinedButton(
                  onPressed: () async {
                    await context.authService.clearAuth();
                    await context.desktopService.disconnect();
                    if (!context.mounted) return;
                    Navigator.of(context).pushReplacement(
                      MaterialPageRoute(builder: (_) => const LoginScreen()),
                    );
                  },
                  style: OutlinedButton.styleFrom(
                    foregroundColor: MCEColors.textSecondary,
                    side: const BorderSide(color: MCEColors.border),
                    shape: RoundedRectangleBorder(
                      borderRadius: BorderRadius.circular(MCERadius.md),
                    ),
                  ),
                  child: const Text(
                    'Sign Out',
                    style: TextStyle(fontSize: 16, fontWeight: FontWeight.w600),
                  ),
                ),
              ),

              const SizedBox(height: MCESpacing.xxl),
            ],
          ),
        ),
      ),
    );
  }
}
