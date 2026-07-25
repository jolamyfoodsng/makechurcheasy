import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import '../theme/app_theme.dart';
import '../services/websocket_service.dart';

class RemoteScreen extends ConsumerWidget {
  const RemoteScreen({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final wsState = ref.watch(wsServiceProvider);
    final desktop = wsState.value;

    return Scaffold(
      appBar: AppBar(title: const Text('Remote')),
      body: Padding(
        padding: const EdgeInsets.all(16),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.stretch,
          children: [
            // Status bar
            Card(
              child: Padding(
                padding: const EdgeInsets.all(24),
                child: Row(
                  children: [
                    Icon(
                      desktop?.obsConnected == true ? Icons.check_circle : Icons.error_outline,
                      color: desktop?.obsConnected == true ? AppTheme.success : AppTheme.error,
                      size: 20,
                    ),
                    const SizedBox(width: 10),
                    Text(
                      desktop?.obsConnected == true ? 'OBS Connected' : 'OBS Disconnected',
                      style: const TextStyle(fontSize: 14, fontWeight: FontWeight.w500),
                    ),
                  ],
                ),
              ),
            ),
            const SizedBox(height: 24),

            // Large remote buttons — 56px minimum, outcome-based copy
            Expanded(
              child: Column(
                children: [
                  _RemoteButton(
                    icon: Icons.skip_previous,
                    label: 'Go to Previous Slide',
                    color: AppTheme.primaryBlue,
                    onTap: () => ref.read(wsServiceProvider.notifier).prevSlide(),
                  ),
                  const SizedBox(height: 16),
                  _RemoteButton(
                    icon: Icons.skip_next,
                    label: 'Go to Next Slide',
                    color: AppTheme.primaryBlue,
                    onTap: () => ref.read(wsServiceProvider.notifier).nextSlide(),
                  ),
                  const SizedBox(height: 16),
                  _RemoteButton(
                    icon: Icons.clear,
                    label: 'Remove All from Screen',
                    color: AppTheme.error,
                    onTap: () {
                      ref.read(wsServiceProvider.notifier).clearScripture();
                      ref.read(wsServiceProvider.notifier).clearWorship();
                      ref.read(wsServiceProvider.notifier).clearLowerThird();
                    },
                  ),
                ],
              ),
            ),
          ],
        ),
      ),
    );
  }
}

class _RemoteButton extends StatelessWidget {
  final IconData icon;
  final String label;
  final Color color;
  final VoidCallback onTap;

  const _RemoteButton({
    required this.icon,
    required this.label,
    required this.color,
    required this.onTap,
  });

  @override
  Widget build(BuildContext context) {
    return SizedBox(
      width: double.infinity,
      // 56px minimum touch target (COMPONENT_LIBRARY.md §Mobile Control)
      height: 80,
      child: ElevatedButton(
        onPressed: onTap,
        style: ElevatedButton.styleFrom(
          backgroundColor: color.withAlpha(25),
          foregroundColor: color,
          elevation: 0,
          shape: RoundedRectangleBorder(
            borderRadius: BorderRadius.circular(16),
            side: BorderSide(color: color.withAlpha(50)),
          ),
        ),
        child: Column(
          mainAxisAlignment: MainAxisAlignment.center,
          children: [
            Icon(icon, size: 32),
            const SizedBox(height: 6),
            Text(
              label,
              style: const TextStyle(
                fontSize: 15,
                fontWeight: FontWeight.w600,
              ),
            ),
          ],
        ),
      ),
    );
  }
}
