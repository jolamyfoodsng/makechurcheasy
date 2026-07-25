import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import '../theme/app_theme.dart';
import '../services/websocket_service.dart';

class WorshipScreen extends ConsumerStatefulWidget {
  const WorshipScreen({super.key});

  @override
  ConsumerState<WorshipScreen> createState() => _WorshipScreenState();
}

class _WorshipScreenState extends ConsumerState<WorshipScreen> {
  final _slideIndexController = TextEditingController();

  @override
  void dispose() {
    _slideIndexController.dispose();
    super.dispose();
  }

  void _showSlide(int index) {
    final currentSong = ref.read(wsServiceProvider).value?.currentSong ?? '';
    ref.read(wsServiceProvider.notifier).showSlide(currentSong, index);
  }

  void _nextSlide() {
    ref.read(wsServiceProvider.notifier).nextSlide();
  }

  void _prevSlide() {
    ref.read(wsServiceProvider.notifier).prevSlide();
  }

  void _clearWorship() {
    ref.read(wsServiceProvider.notifier).clearWorship();
  }

  @override
  Widget build(BuildContext context) {
    final wsState = ref.watch(wsServiceProvider);
    final currentSong = wsState.value?.currentSong;
    final currentSlide = wsState.value?.currentSlide;

    return Scaffold(
      appBar: AppBar(title: const Text('Worship')),
      body: ListView(
        padding: const EdgeInsets.all(16),
        children: [
          // Current status
          Card(
            child: Padding(
              padding: const EdgeInsets.all(24),
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Row(
                    children: [
                      const Icon(Icons.music_note, size: 20, color: AppTheme.primaryBlue),
                      const SizedBox(width: 10),
                      Text('Now Playing', style: Theme.of(context).textTheme.titleLarge),
                    ],
                  ),
                  const SizedBox(height: 12),
                  Text(
                    currentSong ?? 'No lyrics on screen',
                    style: TextStyle(
                      fontSize: 14,
                      color: currentSong != null ? AppTheme.textSecondary : AppTheme.textMuted,
                      fontStyle: currentSong == null ? FontStyle.italic : FontStyle.normal,
                    ),
                  ),
                  if (currentSlide != null)
                    Padding(
                      padding: const EdgeInsets.only(top: 6),
                      child: Text(
                        'Slide ${currentSlide + 1}',
                        style: const TextStyle(fontSize: 12, color: AppTheme.textMuted),
                      ),
                    ),
                ],
              ),
            ),
          ),
          const SizedBox(height: 24),

          // Navigation controls — 56px touch targets, outcome-based copy
          Text('Slide Controls', style: Theme.of(context).textTheme.titleLarge),
          const SizedBox(height: 12),
          Row(
            children: [
              Expanded(
                child: SizedBox(
                  height: 56,
                  child: OutlinedButton.icon(
                    onPressed: _prevSlide,
                    icon: const Icon(Icons.skip_previous, size: 20),
                    label: const Text('Previous Slide'),
                  ),
                ),
              ),
              const SizedBox(width: 12),
              Expanded(
                child: SizedBox(
                  height: 56,
                  child: ElevatedButton.icon(
                    onPressed: _nextSlide,
                    icon: const Icon(Icons.skip_next, size: 20),
                    label: const Text('Next Slide'),
                  ),
                ),
              ),
            ],
          ),
          const SizedBox(height: 16),

          // Jump to slide
          Row(
            children: [
              Expanded(
                child: TextField(
                  controller: _slideIndexController,
                  decoration: const InputDecoration(hintText: 'Slide number'),
                  keyboardType: TextInputType.number,
                ),
              ),
              const SizedBox(width: 12),
              SizedBox(
                height: 44,
                child: ElevatedButton(
                  onPressed: () {
                    final idx = int.tryParse(_slideIndexController.text.trim());
                    if (idx != null && idx > 0) _showSlide(idx - 1);
                  },
                  child: const Text('Go'),
                ),
              ),
            ],
          ),
          const SizedBox(height: 16),

          // Clear — danger button, outcome-based copy
          SizedBox(
            height: 56,
            width: double.infinity,
            child: OutlinedButton.icon(
              onPressed: _clearWorship,
              icon: const Icon(Icons.clear, size: 20),
              label: const Text('Remove Lyrics from Screen'),
              style: OutlinedButton.styleFrom(
                foregroundColor: AppTheme.error,
                side: const BorderSide(color: AppTheme.error),
              ),
            ),
          ),
        ],
      ),
    );
  }
}
