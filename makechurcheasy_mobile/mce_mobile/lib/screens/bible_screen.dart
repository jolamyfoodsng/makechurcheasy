import 'package:flutter/material.dart';
import '../theme/mce_theme.dart';
import '../models/sample_data.dart';
import '../widgets/mce_button.dart';

class BibleScreen extends StatefulWidget {
  const BibleScreen({super.key});

  @override
  State<BibleScreen> createState() => _BibleScreenState();
}

class _BibleScreenState extends State<BibleScreen> {
  int _currentTab = 0;
  static const _tabs = ['Reading', 'VerseAI', 'History'];
  String _searchQuery = '';
  bool _aiListening = false;
  String _outputMode = 'Full'; // Full or LT

  @override
  Widget build(BuildContext context) {
    return Column(
      children: [
        Expanded(
          child: ListView(
            padding: const EdgeInsets.all(MCESpacing.lg),
            children: [
              // Search bar
              _buildSearchBar(),
              const SizedBox(height: MCESpacing.md),
              // Tabs
              _buildTabs(),
              const SizedBox(height: MCESpacing.md),
              // Content
              if (_currentTab == 0) _buildReadingTab(),
              if (_currentTab == 1) _buildVerseAITab(),
              if (_currentTab == 2) _buildHistoryTab(),
              const SizedBox(height: MCESpacing.xxl),
            ],
          ),
        ),
        _buildBottomToolbar(),
      ],
    );
  }

  Widget _buildSearchBar() {
    return Row(
      children: [
        Expanded(
          child: Container(
            height: 44,
            padding: const EdgeInsets.symmetric(horizontal: 12),
            decoration: BoxDecoration(
              color: MCEColors.surface.withValues(alpha: 0.6),
              borderRadius: BorderRadius.circular(MCERadius.pill),
              border: Border.all(color: MCEColors.border),
            ),
            child: Row(
              children: [
                const Icon(Icons.search, color: MCEColors.textSecondary, size: 20),
                const SizedBox(width: 8),
                Expanded(
                  child: TextField(
                    onChanged: (v) => setState(() => _searchQuery = v),
                    style: MCETypography.body.copyWith(fontSize: 14),
                    decoration: InputDecoration(
                      hintText: 'Search verses...',
                      hintStyle: MCETypography.body.copyWith(
                        color: MCEColors.textTertiary,
                      ),
                      border: InputBorder.none,
                      contentPadding: EdgeInsets.zero,
                    ),
                  ),
                ),
              ],
            ),
          ),
        ),
        const SizedBox(width: MCESpacing.sm),
        Container(
          height: 44,
          padding: const EdgeInsets.symmetric(horizontal: 12),
          decoration: BoxDecoration(
            color: MCEColors.surface.withValues(alpha: 0.6),
            borderRadius: BorderRadius.circular(MCERadius.pill),
            border: Border.all(color: MCEColors.border),
          ),
          child: const Row(
            mainAxisSize: MainAxisSize.min,
            children: [
              Text('KJV', style: TextStyle(
                fontSize: 13,
                fontWeight: FontWeight.w600,
                color: MCEColors.textPrimary,
              )),
              SizedBox(width: 4),
              Icon(Icons.unfold_more, color: MCEColors.textSecondary, size: 14),
            ],
          ),
        ),
      ],
    );
  }

  Widget _buildTabs() {
    return Container(
      padding: const EdgeInsets.all(4),
      decoration: BoxDecoration(
        color: MCEColors.elevated,
        borderRadius: BorderRadius.circular(10),
        border: Border.all(color: MCEColors.border),
      ),
      child: Row(
        children: List.generate(3, (i) {
          final isActive = _currentTab == i;
          return Expanded(
            child: GestureDetector(
              onTap: () => setState(() => _currentTab = i),
              child: Container(
                padding: const EdgeInsets.symmetric(vertical: 8),
                decoration: BoxDecoration(
                  color: isActive ? MCEColors.primaryBlue : Colors.transparent,
                  borderRadius: BorderRadius.circular(6),
                ),
                child: Text(
                  _tabs[i],
                  textAlign: TextAlign.center,
                  style: TextStyle(
                    fontSize: 13,
                    fontWeight: FontWeight.w600,
                    color: isActive ? Colors.white : MCEColors.textSecondary,
                  ),
                ),
              ),
            ),
          );
        }),
      ),
    );
  }

  Widget _buildReadingTab() {
    final filtered = _searchQuery.isEmpty
        ? sampleVerses
        : sampleVerses
            .where((v) =>
                v.reference.toLowerCase().contains(_searchQuery.toLowerCase()) ||
                v.text.toLowerCase().contains(_searchQuery.toLowerCase()))
            .toList();

    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        const Text('Bible Verses', style: MCETypography.sectionTitle),
        const SizedBox(height: MCESpacing.md),
        ...filtered.map((verse) => _verseItem(verse)),
      ],
    );
  }

  Widget _verseItem(BibleVerse verse) {
    final isSelected = verse.selected;
    return GestureDetector(
      onTap: () {
        setState(() {
          for (final v in sampleVerses) {
            v.selected = false;
          }
          verse.selected = true;
        });
      },
      child: Container(
        padding: const EdgeInsets.all(MCESpacing.sm),
        margin: const EdgeInsets.only(bottom: MCESpacing.sm),
        decoration: BoxDecoration(
          color: isSelected
              ? MCEColors.primaryPurple.withValues(alpha: 0.15)
              : Colors.transparent,
          borderRadius: BorderRadius.circular(MCERadius.md),
          border: isSelected
              ? Border.all(color: MCEColors.primaryPurple.withValues(alpha: 0.3))
              : null,
        ),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Text(
              verse.reference,
              style: TextStyle(
                fontSize: 14,
                fontWeight: FontWeight.w600,
                color: isSelected ? MCEColors.primaryPurple : MCEColors.textPrimary,
              ),
            ),
            const SizedBox(height: 4),
            Text(
              verse.text,
              style: MCETypography.caption.copyWith(
                color: MCEColors.textSecondary,
              ),
              maxLines: 2,
              overflow: TextOverflow.ellipsis,
            ),
          ],
        ),
      ),
    );
  }

  Widget _buildVerseAITab() {
    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        const Text('Verse AI', style: MCETypography.sectionTitle),
        const SizedBox(height: MCESpacing.md),
        // AI Visualizer
        Container(
          width: double.infinity,
          padding: const EdgeInsets.all(MCESpacing.xl),
          decoration: BoxDecoration(
            color: MCEColors.surface.withValues(alpha: 0.6),
            borderRadius: BorderRadius.circular(MCERadius.lg),
            border: Border.all(color: MCEColors.border),
          ),
          child: Column(
            children: [
              GestureDetector(
                onTap: () => setState(() => _aiListening = !_aiListening),
                child: Container(
                  width: 64,
                  height: 64,
                  decoration: BoxDecoration(
                    color: _aiListening
                        ? MCEColors.primaryBlue.withValues(alpha: 0.2)
                        : MCEColors.elevated,
                    shape: BoxShape.circle,
                    border: Border.all(
                      color: _aiListening
                          ? MCEColors.primaryBlue
                          : MCEColors.border,
                    ),
                  ),
                  child: Icon(
                    _aiListening ? Icons.mic : Icons.mic_none,
                    color: _aiListening
                        ? MCEColors.primaryBlue
                        : MCEColors.textSecondary,
                    size: 28,
                  ),
                ),
              ),
              const SizedBox(height: MCESpacing.md),
              if (_aiListening) _buildAIVisualizer(),
              if (!_aiListening)
                Text(
                  'Tap to start listening',
                  style: MCETypography.caption,
                ),
            ],
          ),
        ),
        const SizedBox(height: MCESpacing.xl),
        // Suggested verses
        const Text('Suggested', style: MCETypography.cardTitle),
        const SizedBox(height: MCESpacing.md),
        ...sampleVerseAI.map((item) => Container(
          padding: const EdgeInsets.all(MCESpacing.md),
          margin: const EdgeInsets.only(bottom: MCESpacing.sm),
          decoration: BoxDecoration(
            color: MCEColors.surface.withValues(alpha: 0.6),
            borderRadius: BorderRadius.circular(MCERadius.md),
            border: Border.all(color: MCEColors.border),
          ),
          child: Row(
            children: [
              const Icon(Icons.auto_awesome, color: MCEColors.primaryPurple, size: 16),
              const SizedBox(width: MCESpacing.sm),
              Expanded(
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Text(item.verse, style: MCETypography.bodyBold),
                    Text(item.preview, style: MCETypography.caption),
                  ],
                ),
              ),
            ],
          ),
        )),
      ],
    );
  }

  Widget _buildAIVisualizer() {
    return SizedBox(
      height: 60,
      child: Row(
        mainAxisAlignment: MainAxisAlignment.center,
        children: List.generate(12, (i) {
          return AnimatedContainer(
            duration: Duration(milliseconds: 500 + (i * 100)),
            margin: const EdgeInsets.symmetric(horizontal: 2),
            width: 4,
            height: _aiListening ? 40 : 12,
            decoration: BoxDecoration(
              color: MCEColors.primaryBlue,
              borderRadius: BorderRadius.circular(2),
            ),
          );
        }),
      ),
    );
  }

  Widget _buildHistoryTab() {
    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        const Text('History', style: MCETypography.sectionTitle),
        const SizedBox(height: MCESpacing.md),
        ...sampleVerseHistory.map((item) => Container(
          padding: const EdgeInsets.all(MCESpacing.md),
          margin: const EdgeInsets.only(bottom: MCESpacing.sm),
          decoration: BoxDecoration(
            color: MCEColors.surface.withValues(alpha: 0.6),
            borderRadius: BorderRadius.circular(MCERadius.md),
            border: Border.all(color: MCEColors.border),
          ),
          child: Row(
            children: [
              Icon(
                item.action == 'Pushed to Live'
                    ? Icons.live_tv
                    : Icons.preview,
                color: item.action == 'Pushed to Live'
                    ? MCEColors.success
                    : MCEColors.secondaryBlue,
                size: 20,
              ),
              const SizedBox(width: MCESpacing.md),
              Expanded(
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Text(item.reference, style: MCETypography.bodyBold),
                    Text(
                      '${item.action} • ${item.time}',
                      style: MCETypography.tiny,
                    ),
                  ],
                ),
              ),
            ],
          ),
        )),
      ],
    );
  }

  Widget _buildBottomToolbar() {
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: MCESpacing.lg, vertical: MCESpacing.md),
      decoration: const BoxDecoration(
        color: MCEColors.surface,
        border: Border(top: BorderSide(color: MCEColors.border)),
      ),
      child: SafeArea(
        top: false,
        child: Row(
          children: [
            // Full/LT toggle
            Container(
              padding: const EdgeInsets.all(2),
              decoration: BoxDecoration(
                color: MCEColors.elevated,
                borderRadius: BorderRadius.circular(6),
                border: Border.all(color: MCEColors.border),
              ),
              child: Row(
                children: ['Full', 'LT'].map((mode) {
                  final isActive = _outputMode == mode;
                  return GestureDetector(
                    onTap: () => setState(() => _outputMode = mode),
                    child: Container(
                      padding: const EdgeInsets.symmetric(
                        horizontal: 12,
                        vertical: 6,
                      ),
                      decoration: BoxDecoration(
                        color: isActive ? MCEColors.primaryBlue : Colors.transparent,
                        borderRadius: BorderRadius.circular(4),
                      ),
                      child: Text(
                        mode,
                        style: TextStyle(
                          fontSize: 12,
                          fontWeight: FontWeight.w600,
                          color: isActive ? Colors.white : MCEColors.textSecondary,
                        ),
                      ),
                    ),
                  );
                }).toList(),
              ),
            ),
            const Spacer(),
            // Control buttons
            MCEButton(icon: Icons.visibility_outlined),
            const SizedBox(width: MCESpacing.sm),
            MCEButton.primary(label: 'Push Live', icon: Icons.broadcast_on_home),
            const SizedBox(width: MCESpacing.sm),
            MCEButton.danger(label: 'Stop', icon: Icons.stop),
          ],
        ),
      ),
    );
  }
}
