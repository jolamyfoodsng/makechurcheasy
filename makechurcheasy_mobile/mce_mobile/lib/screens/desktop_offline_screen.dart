import 'package:flutter/material.dart';
import '../theme/mce_theme.dart';
import '../widgets/mce_button.dart';
import '../services/mce_provider.dart';
import 'connection_wizard_screen.dart';
import 'connection_success_screen.dart';

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
              Spacer(flex: 2),

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
                child: Icon(
                  Icons.wifi_off_rounded,
                  size: 48,
                  color: MCEColors.danger,
                ),
              ),
              SizedBox(height: MCESpacing.xxl),

              Text('Desktop Offline', style: MCETypography.sectionTitle),
              SizedBox(height: MCESpacing.sm),
              Text(
                'Lost connection to your church computer.\nMake sure the desktop app is running and\non the same network.',
                style: MCETypography.body.copyWith(
                  color: MCEColors.textSecondary,
                  height: 1.5,
                ),
                textAlign: TextAlign.center,
              ),

              Spacer(flex: 2),

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
                      context.webSocketService.connect();
                      Navigator.of(context).pushReplacement(
                        MaterialPageRoute(
                          builder: (_) => ConnectionSuccessScreen(),
                        ),
                      );
                    } else {
                      Navigator.of(context).pushReplacement(
                        MaterialPageRoute(
                          builder: (_) => ConnectionWizardScreen(),
                        ),
                      );
                    }
                  },
                ),
              ),
              SizedBox(height: MCESpacing.md),

              SizedBox(
                width: double.infinity,
                height: 52,
                child: OutlinedButton(
                  onPressed: () async {
                    context.webSocketService.disconnect();
                    await context.desktopService.disconnect();
                    if (!context.mounted) return;
                    Navigator.of(context).pushReplacement(
                      MaterialPageRoute(
                        builder: (_) => ConnectionWizardScreen(),
                      ),
                    );
                  },
                  style: OutlinedButton.styleFrom(
                    foregroundColor: MCEColors.textSecondary,
                    side: BorderSide(color: MCEColors.border),
                    shape: RoundedRectangleBorder(
                      borderRadius: BorderRadius.circular(MCERadius.md),
                    ),
                  ),
                  child: Text(
                    'Pair Another Desktop',
                    style: TextStyle(fontSize: 16, fontWeight: FontWeight.w600),
                  ),
                ),
              ),

              SizedBox(height: MCESpacing.xxl),
            ],
          ),
        ),
      ),
    );
  }
}
