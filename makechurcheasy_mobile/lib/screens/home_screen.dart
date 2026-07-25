import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
import '../theme/app_theme.dart';
import '../services/websocket_service.dart';
import '../providers/connection_provider.dart';

class HomeScreen extends ConsumerWidget {
  const HomeScreen({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final wsState = ref.watch(wsServiceProvider);
    final conn = ref.watch(connectionProvider);

    return Scaffold(
      appBar: AppBar(
        title: const Text('MCE Companion'),
        actions: [
          IconButton(
            icon: const Icon(Icons.link_off),
            tooltip: 'Disconnect from desktop',
            onPressed: () {
              ref.read(wsServiceProvider.notifier).disconnect();
              ref.read(connectionProvider.notifier).disconnect();
              context.go('/');
            },
          ),
        ],
      ),
      body: wsState.when(
        loading: () => const Center(child: CircularProgressIndicator()),
        error: (e, _) => Center(child: Text('Error: $e')),
        data: (desktop) => RefreshIndicator(
          onRefresh: () async => ref.invalidate(wsServiceProvider),
          child: ListView(
            padding: const EdgeInsets.all(16),
            children: [
              // OBS Status
              _StatusCard(
                title: 'OBS Connection',
                icon: Icons.monitor_outlined,
                connected: desktop.obsConnected,
                label: desktop.obsConnected ? 'Connected' : 'Disconnected',
              ),
              const SizedBox(height: 12),

              // Current Song
              _InfoCard(
                title: 'Current Song',
                icon: Icons.music_note,
                value: desktop.currentSong,
              ),

              // Current Scripture
              _InfoCard(
                title: 'Scripture Display',
                icon: Icons.menu_book,
                value: desktop.currentScripture,
              ),

              // Current Lower Third
              _InfoCard(
                title: 'Lower Third',
                icon: Icons.subtitles,
                value: desktop.currentLowerThird,
              ),

              const SizedBox(height: 24),
              Text(
                'Connected to ${conn.serverUrl ?? "desktop"}',
                style: Theme.of(context).textTheme.bodySmall,
                textAlign: TextAlign.center,
              ),
            ],
          ),
        ),
      ),
    );
  }
}

class _StatusCard extends StatelessWidget {
  final String title;
  final IconData icon;
  final bool connected;
  final String label;

  const _StatusCard({
    required this.title,
    required this.icon,
    required this.connected,
    required this.label,
  });

  @override
  Widget build(BuildContext context) {
    return Card(
      child: Padding(
        padding: const EdgeInsets.all(24),
        child: Row(
          children: [
            Icon(
              icon,
              size: 28,
              color: connected ? AppTheme.success : AppTheme.error,
            ),
            const SizedBox(width: 14),
            Expanded(
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Text(title, style: Theme.of(context).textTheme.titleLarge),
                  const SizedBox(height: 4),
                  Text(
                    label,
                    style: TextStyle(
                      fontSize: 14,
                      color: connected ? AppTheme.success : AppTheme.error,
                      fontWeight: FontWeight.w500,
                    ),
                  ),
                ],
              ),
            ),
            Container(
              width: 10,
              height: 10,
              decoration: BoxDecoration(
                shape: BoxShape.circle,
                color: connected ? AppTheme.success : AppTheme.error,
              ),
            ),
          ],
        ),
      ),
    );
  }
}

class _InfoCard extends StatelessWidget {
  final String title;
  final IconData icon;
  final String? value;

  const _InfoCard({
    required this.title,
    required this.icon,
    required this.value,
  });

  @override
  Widget build(BuildContext context) {
    return Card(
      child: Padding(
        padding: const EdgeInsets.all(24),
        child: Row(
          children: [
            Icon(icon, size: 24, color: AppTheme.primaryBlue),
            const SizedBox(width: 14),
            Expanded(
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Text(title, style: Theme.of(context).textTheme.titleLarge),
                  const SizedBox(height: 4),
                  Text(
                    value ?? 'Nothing active',
                    style: TextStyle(
                      fontSize: 14,
                      color: value != null ? AppTheme.textSecondary : AppTheme.textMuted,
                      fontStyle: value == null ? FontStyle.italic : FontStyle.normal,
                    ),
                    maxLines: 2,
                    overflow: TextOverflow.ellipsis,
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
