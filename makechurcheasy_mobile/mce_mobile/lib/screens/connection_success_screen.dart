import 'package:flutter/material.dart';
import '../theme/mce_theme.dart';
import '../services/mce_provider.dart';
import 'app_shell.dart';

class ConnectionSuccessScreen extends StatefulWidget {
  const ConnectionSuccessScreen({super.key});

  @override
  State<ConnectionSuccessScreen> createState() => _ConnectionSuccessScreenState();
}

class _ConnectionSuccessScreenState extends State<ConnectionSuccessScreen>
    with SingleTickerProviderStateMixin {
  late AnimationController _controller;
  late Animation<double> _scaleAnimation;
  late Animation<double> _fadeAnimation;

  @override
  void initState() {
    super.initState();
    _controller = AnimationController(
      duration: const Duration(milliseconds: 800),
      vsync: this,
    );
    _scaleAnimation = Tween<double>(begin: 0.5, end: 1.0).animate(
      CurvedAnimation(parent: _controller, curve: Curves.elasticOut),
    );
    _fadeAnimation = Tween<double>(begin: 0.0, end: 1.0).animate(
      CurvedAnimation(
        parent: _controller,
        curve: const Interval(0.0, 0.5, curve: Curves.easeIn),
      ),
    );
    _controller.forward();
  }

  @override
  void dispose() {
    _controller.dispose();
    super.dispose();
  }

  void _openDashboard() {
    Navigator.of(context).pushReplacement(
      MaterialPageRoute(builder: (_) => const AppShell()),
    );
  }

  @override
  Widget build(BuildContext context) {
    final desktop = context.desktopService;
    final desktopInfo = desktop.currentDesktop;
    final user = context.authService.user;

    return Scaffold(
      backgroundColor: MCEColors.background,
      body: SafeArea(
        child: Padding(
          padding: const EdgeInsets.symmetric(horizontal: MCESpacing.xxl),
          child: Column(
            children: [
              const Spacer(flex: 2),

              // Animated check
              AnimatedBuilder(
                animation: _controller,
                builder: (context, child) {
                  return Transform.scale(
                    scale: _scaleAnimation.value,
                    child: Opacity(
                      opacity: _fadeAnimation.value,
                      child: Container(
                        width: 120,
                        height: 120,
                        decoration: BoxDecoration(
                          color: MCEColors.success.withValues(alpha: 0.15),
                          shape: BoxShape.circle,
                          border: Border.all(
                            color: MCEColors.success.withValues(alpha: 0.3),
                            width: 3,
                          ),
                        ),
                        child: const Icon(
                          Icons.check_rounded,
                          size: 64,
                          color: MCEColors.success,
                        ),
                      ),
                    ),
                  );
                },
              ),
              const SizedBox(height: MCESpacing.xxl),

              const Text(
                'Connected!',
                style: MCETypography.sectionTitle,
              ),
              const SizedBox(height: MCESpacing.sm),
              Text(
                'Successfully connected to your church computer',
                style: MCETypography.body.copyWith(
                  color: MCEColors.textSecondary,
                ),
                textAlign: TextAlign.center,
              ),

              const SizedBox(height: MCESpacing.xxl * 2),

              // Connection info
              Container(
                width: double.infinity,
                padding: const EdgeInsets.all(MCESpacing.lg),
                decoration: BoxDecoration(
                  color: MCEColors.surface,
                  borderRadius: BorderRadius.circular(MCERadius.lg),
                  border: Border.all(color: MCEColors.border),
                ),
                child: Column(
                  children: [
                    _InfoRow(
                      label: 'Church',
                      value: desktopInfo?.church ?? user?.church ?? 'Not set',
                    ),
                    const SizedBox(height: MCESpacing.md),
                    _InfoRow(
                      label: 'OBS Version',
                      value: desktopInfo?.obsVersion ?? 'Unknown',
                    ),
                    const SizedBox(height: MCESpacing.md),
                    _InfoRow(
                      label: 'Computer',
                      value: desktopInfo?.computerName ?? desktopInfo?.name ?? 'Desktop',
                    ),
                  ],
                ),
              ),

              const Spacer(flex: 2),

              // Button
              SizedBox(
                width: double.infinity,
                height: 56,
                child: ElevatedButton(
                  onPressed: _openDashboard,
                  style: ElevatedButton.styleFrom(
                    backgroundColor: MCEColors.primaryBlue,
                    foregroundColor: Colors.white,
                    shape: RoundedRectangleBorder(
                      borderRadius: BorderRadius.circular(MCERadius.md),
                    ),
                    elevation: 0,
                  ),
                  child: const Text(
                    'Open Dashboard',
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

class _InfoRow extends StatelessWidget {
  final String label;
  final String value;

  const _InfoRow({required this.label, required this.value});

  @override
  Widget build(BuildContext context) {
    return Row(
      mainAxisAlignment: MainAxisAlignment.spaceBetween,
      children: [
        Text(
          label,
          style: MCETypography.body.copyWith(color: MCEColors.textSecondary),
        ),
        Text(value, style: MCETypography.bodyBold),
      ],
    );
  }
}
