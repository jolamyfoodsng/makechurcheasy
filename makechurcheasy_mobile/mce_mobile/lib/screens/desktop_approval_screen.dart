import 'dart:async';
import 'package:flutter/material.dart';
import '../theme/mce_theme.dart';
import '../services/mce_provider.dart';
import '../services/websocket_service.dart';
import 'connection_success_screen.dart';
import 'connection_wizard_screen.dart';

class DesktopApprovalScreen extends StatefulWidget {
  const DesktopApprovalScreen({super.key});

  @override
  State<DesktopApprovalScreen> createState() => _DesktopApprovalScreenState();
}

class _DesktopApprovalScreenState extends State<DesktopApprovalScreen> {
  StreamSubscription<WebSocketEvent>? _sub;
  Timer? _timeout;

  @override
  void initState() {
    super.initState();

    _sub = context.webSocketService.events.listen((event) {
      if (!mounted) return;

      if (event.type == WebSocketEventType.authenticated) {
        _cleanup();
        Navigator.of(context).pushReplacement(
          MaterialPageRoute(builder: (_) => ConnectionSuccessScreen()),
        );
      } else if (event.type == WebSocketEventType.authFailed) {
        _cleanup();
        _showFailed(event.data['reason'] as String? ?? 'Authentication failed');
      }
    });

    // 15-second safety timeout — if nothing happens, let user retry.
    _timeout = Timer(Duration(seconds: 15), () {
      if (!mounted) return;
      _showFailed('Timed out waiting for desktop response.');
    });
  }

  void _cleanup() {
    _sub?.cancel();
    _sub = null;
    _timeout?.cancel();
    _timeout = null;
  }

  void _showFailed(String reason) {
    showDialog(
      context: context,
      barrierDismissible: false,
      builder: (_) => AlertDialog(
        backgroundColor: MCEColors.surface,
        shape: RoundedRectangleBorder(
          borderRadius: BorderRadius.circular(MCERadius.lg),
        ),
        title: Text('Authentication Failed', style: MCETypography.bodyBold),
        content: Text(
          reason,
          style: MCETypography.body.copyWith(color: MCEColors.textSecondary),
        ),
        actions: [
          ElevatedButton(
            onPressed: () {
              Navigator.of(context).pop();
              Navigator.of(context).pushReplacement(
                MaterialPageRoute(builder: (_) => ConnectionWizardScreen()),
              );
            },
            style: ElevatedButton.styleFrom(
              backgroundColor: MCEColors.primaryBlue,
              foregroundColor: Colors.white,
            ),
            child: Text('Try Again'),
          ),
        ],
      ),
    );
  }

  @override
  void dispose() {
    _cleanup();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    final desktop = context.desktopService;
    final desktopInfo = desktop.currentDesktop;

    return Scaffold(
      backgroundColor: MCEColors.background,
      body: SafeArea(
        child: Padding(
          padding: const EdgeInsets.symmetric(horizontal: MCESpacing.xxl),
          child: Column(
            children: [
              Spacer(flex: 2),

              // Pulsing indicator
              SizedBox(
                width: 120,
                height: 120,
                child: Stack(
                  alignment: Alignment.center,
                  children: [
                    TweenAnimationBuilder<double>(
                      tween: Tween(begin: 0.8, end: 1.2),
                      duration: Duration(seconds: 2),
                      builder: (context, value, child) {
                        return Transform.scale(
                          scale: value,
                          child: Container(
                            width: 120,
                            height: 120,
                            decoration: BoxDecoration(
                              shape: BoxShape.circle,
                              border: Border.all(
                                color: MCEColors.primaryBlue.withValues(
                                  alpha: 0.3,
                                ),
                                width: 2,
                              ),
                            ),
                          ),
                        );
                      },
                    ),
                    Container(
                      width: 80,
                      height: 80,
                      decoration: BoxDecoration(
                        color: MCEColors.primaryBlue.withValues(alpha: 0.15),
                        shape: BoxShape.circle,
                        border: Border.all(
                          color: MCEColors.primaryBlue.withValues(alpha: 0.3),
                          width: 2,
                        ),
                      ),
                      child: Icon(
                        Icons.link_rounded,
                        size: 40,
                        color: MCEColors.primaryBlue,
                      ),
                    ),
                  ],
                ),
              ),
              SizedBox(height: MCESpacing.xxl),

              Text('Authenticating...', style: MCETypography.sectionTitle),
              SizedBox(height: MCESpacing.sm),
              Text(
                'Establishing secure WebSocket connection\nto your desktop.',
                style: MCETypography.body.copyWith(
                  color: MCEColors.textSecondary,
                  height: 1.5,
                ),
                textAlign: TextAlign.center,
              ),

              SizedBox(height: MCESpacing.xxl * 2),

              // Desktop info card
              if (desktopInfo != null)
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
                        label: 'Desktop',
                        value:
                            desktopInfo.computerName ??
                            desktopInfo.name ??
                            'Desktop',
                      ),
                      SizedBox(height: MCESpacing.md),
                      _InfoRow(
                        label: 'Address',
                        value:
                            '${desktopInfo.ip}:${desktopInfo.wsPort ?? 8765}',
                      ),
                    ],
                  ),
                ),

              Spacer(flex: 2),

              // Cancel button
              SizedBox(
                width: double.infinity,
                height: 52,
                child: OutlinedButton.icon(
                  onPressed: () {
                    context.webSocketService.disconnect();
                    Navigator.of(context).pushReplacement(
                      MaterialPageRoute(
                        builder: (_) => ConnectionWizardScreen(),
                      ),
                    );
                  },
                  icon: Icon(Icons.close, size: 18),
                  label: Text(
                    'Cancel',
                    style: TextStyle(fontSize: 16, fontWeight: FontWeight.w600),
                  ),
                  style: OutlinedButton.styleFrom(
                    foregroundColor: MCEColors.textSecondary,
                    side: BorderSide(color: MCEColors.border),
                    shape: RoundedRectangleBorder(
                      borderRadius: BorderRadius.circular(MCERadius.md),
                    ),
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
