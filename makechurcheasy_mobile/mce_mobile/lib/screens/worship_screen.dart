import 'package:flutter/material.dart';
import '../theme/mce_theme.dart';
import '../models/sample_data.dart';

class WorshipScreen extends StatefulWidget {
  const WorshipScreen({super.key});

  @override
  State<WorshipScreen> createState() => _WorshipScreenState();
}

class _WorshipScreenState extends State<WorshipScreen> {
  String _searchQuery = '';
  String _selectedMode = 'Browse'; // Browse or Perform

  // Setlist
  final List<SongData> _setlist = [];

  // Perform mode state
  SongData? _performingSong;
  int _currentSlideIndex = 0;
  String _outputMode = 'Full';

  @override
  Widget build(BuildContext context) {
    if (_selectedMode == 'Perform' && _performingSong != null) {
      return _buildPerformMode();
    }
    return _buildBrowseMode();
  }

  // ── BROWSE MODE ──────────────────────────────────────────────

  Widget _buildBrowseMode() {
    final filtered = _searchQuery.isEmpty
        ? sampleWorshipLibrary
        : sampleWorshipLibrary
            .where((s) =>
                s.title.toLowerCase().contains(_searchQuery.toLowerCase()) ||
                s.artist.toLowerCase().contains(_searchQuery.toLowerCase()))
            .toList();

    return Column(
      children: [
        Expanded(
          child: ListView(
            padding: const EdgeInsets.all(MCESpacing.lg),
            children: [
              // Search
              Container(
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
                          hintText: 'Search songs...',
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
              const SizedBox(height: MCESpacing.xl),

              // Library list
              Row(
                children: [
                  const Expanded(
                    child: Text('Library', style: MCETypography.sectionTitle),
                  ),
                  if (_setlist.isNotEmpty)
                    Text(
                      '${_setlist.length} in setlist',
                      style: MCETypography.caption.copyWith(
                        color: MCEColors.primaryPurple,
                      ),
                    ),
                ],
              ),
              const SizedBox(height: MCESpacing.md),
              ...filtered.map((song) {
                final inSetlist = _setlist.contains(song);
                return _songCard(song, inSetlist: inSetlist);
              }),
            ],
          ),
        ),

        // Bottom bar with setlist + start button
        _buildBrowseBottomBar(),
      ],
    );
  }

  Widget _songCard(SongData song, {required bool inSetlist}) {
    return Container(
      margin: const EdgeInsets.only(bottom: MCESpacing.sm),
      decoration: BoxDecoration(
        color: MCEColors.surface.withValues(alpha: 0.6),
        borderRadius: BorderRadius.circular(MCERadius.md),
        border: Border.all(
          color: inSetlist
              ? MCEColors.primaryPurple.withValues(alpha: 0.4)
              : MCEColors.border,
        ),
      ),
      child: Row(
        children: [
          // Purple music icon
          Container(
            width: 44,
            height: 44,
            margin: const EdgeInsets.all(MCESpacing.md),
            decoration: BoxDecoration(
              color: MCEColors.primaryPurple.withValues(alpha: 0.2),
              borderRadius: BorderRadius.circular(MCERadius.md),
            ),
            child: const Icon(Icons.music_note, color: MCEColors.primaryPurple, size: 24),
          ),
          // Song info
          Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text(song.title, style: MCETypography.bodyBold),
                Text(song.artist, style: MCETypography.caption),
              ],
            ),
          ),
          // Add / Remove button
          GestureDetector(
            onTap: () => setState(() {
              if (inSetlist) {
                _setlist.remove(song);
              } else {
                _setlist.add(song);
              }
            }),
            child: Container(
              margin: const EdgeInsets.all(MCESpacing.md),
              padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 6),
              decoration: BoxDecoration(
                color: inSetlist
                    ? MCEColors.danger.withValues(alpha: 0.15)
                    : MCEColors.primaryPurple.withValues(alpha: 0.15),
                borderRadius: BorderRadius.circular(6),
              ),
              child: Row(
                mainAxisSize: MainAxisSize.min,
                children: [
                  Icon(
                    inSetlist ? Icons.remove : Icons.add,
                    size: 14,
                    color: inSetlist ? MCEColors.danger : MCEColors.primaryPurple,
                  ),
                  const SizedBox(width: 4),
                  Text(
                    inSetlist ? 'Remove' : 'Add',
                    style: TextStyle(
                      fontSize: 11,
                      fontWeight: FontWeight.w600,
                      color: inSetlist ? MCEColors.danger : MCEColors.primaryPurple,
                    ),
                  ),
                ],
              ),
            ),
          ),
        ],
      ),
    );
  }

  Widget _buildBrowseBottomBar() {
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
            // Setlist summary
            Expanded(
              child: _setlist.isEmpty
                  ? Text(
                      'Add songs to start',
                      style: MCETypography.body.copyWith(
                        color: MCEColors.textTertiary,
                      ),
                    )
                  : Column(
                      crossAxisAlignment: CrossAxisAlignment.start,
                      mainAxisSize: MainAxisSize.min,
                      children: [
                        Text(
                          '${_setlist.length} songs in setlist',
                          style: MCETypography.bodyBold.copyWith(fontSize: 13),
                        ),
                        Text(
                          _setlist.map((s) => s.title).join(' • '),
                          style: MCETypography.caption.copyWith(
                            color: MCEColors.textSecondary,
                          ),
                          maxLines: 1,
                          overflow: TextOverflow.ellipsis,
                        ),
                      ],
                    ),
            ),
            // Start Session button
            ElevatedButton(
              onPressed: _setlist.isNotEmpty
                  ? () => setState(() {
                      _performingSong = _setlist.first;
                      _currentSlideIndex = 0;
                      _selectedMode = 'Perform';
                    })
                  : null,
              style: ElevatedButton.styleFrom(
                backgroundColor: MCEColors.primaryBlue,
                foregroundColor: Colors.white,
                disabledBackgroundColor: MCEColors.elevated,
                disabledForegroundColor: MCEColors.textTertiary,
                padding: const EdgeInsets.symmetric(horizontal: 20, vertical: 12),
                shape: RoundedRectangleBorder(
                  borderRadius: BorderRadius.circular(MCERadius.md),
                ),
                elevation: 0,
              ),
              child: const Text(
                'Start Session',
                style: TextStyle(fontSize: 14, fontWeight: FontWeight.w600),
              ),
            ),
          ],
        ),
      ),
    );
  }

  // ── PERFORM MODE ─────────────────────────────────────────────

  Widget _buildPerformMode() {
    final song = _performingSong!;
    final currentSlide = song.slides[_currentSlideIndex];

    return Column(
      children: [
        // Top bar
        _buildPerformTopBar(),

        Expanded(
          child: ListView(
            padding: const EdgeInsets.all(MCESpacing.lg),
            children: [
              // Slide preview
              Container(
                width: double.infinity,
                padding: const EdgeInsets.all(MCESpacing.xxl),
                decoration: BoxDecoration(
                  gradient: const LinearGradient(
                    colors: [Color(0xFF1E1B4B), Color(0xFF312E81)],
                    begin: Alignment.topLeft,
                    end: Alignment.bottomRight,
                  ),
                  borderRadius: BorderRadius.circular(MCERadius.lg),
                  border: Border.all(color: MCEColors.borderLight),
                ),
                child: Column(
                  children: [
                    Text(
                      currentSlide.text,
                      textAlign: TextAlign.center,
                      style: const TextStyle(
                        fontSize: 18,
                        fontWeight: FontWeight.w700,
                        color: Colors.white,
                        height: 1.4,
                        shadows: [
                          Shadow(
                            color: Colors.black54,
                            blurRadius: 12,
                            offset: Offset(0, 4),
                          ),
                        ],
                      ),
                    ),
                    const SizedBox(height: MCESpacing.md),
                    Text(
                      'Slide ${currentSlide.number} of ${song.slides.length}',
                      style: MCETypography.caption.copyWith(
                        color: MCEColors.textSecondary,
                      ),
                    ),
                  ],
                ),
              ),
              const SizedBox(height: MCESpacing.lg),

              // Slide navigator
              SizedBox(
                height: 72,
                child: ListView.separated(
                  scrollDirection: Axis.horizontal,
                  itemCount: song.slides.length,
                  separatorBuilder: (_, _) => const SizedBox(width: MCESpacing.sm),
                  itemBuilder: (context, i) {
                    final isActive = i == _currentSlideIndex;
                    return GestureDetector(
                      onTap: () => setState(() => _currentSlideIndex = i),
                      child: Container(
                        width: 60,
                        decoration: BoxDecoration(
                          color: isActive
                              ? MCEColors.primaryBlue.withValues(alpha: 0.2)
                              : MCEColors.surface.withValues(alpha: 0.6),
                          borderRadius: BorderRadius.circular(MCERadius.sm),
                          border: Border.all(
                            color: isActive
                                ? MCEColors.primaryBlue
                                : MCEColors.border,
                            width: isActive ? 2 : 1,
                          ),
                        ),
                        child: Center(
                          child: Text(
                            '${i + 1}',
                            style: TextStyle(
                              fontSize: 14,
                              fontWeight: FontWeight.w700,
                              color: isActive
                                  ? MCEColors.primaryBlue
                                  : MCEColors.textSecondary,
                            ),
                          ),
                        ),
                      ),
                    );
                  },
                ),
              ),
              const SizedBox(height: MCESpacing.lg),

              // Song list within session
              ..._setlist.map((s) {
                final isCurrent = s == _performingSong;
                return GestureDetector(
                  onTap: () => setState(() {
                    _performingSong = s;
                    _currentSlideIndex = 0;
                  }),
                  child: Container(
                    padding: const EdgeInsets.all(MCESpacing.md),
                    margin: const EdgeInsets.only(bottom: MCESpacing.sm),
                    decoration: BoxDecoration(
                      color: isCurrent
                          ? MCEColors.primaryPurple.withValues(alpha: 0.15)
                          : MCEColors.surface.withValues(alpha: 0.4),
                      borderRadius: BorderRadius.circular(MCERadius.md),
                      border: Border.all(
                        color: isCurrent
                            ? MCEColors.primaryPurple.withValues(alpha: 0.3)
                            : MCEColors.border,
                      ),
                    ),
                    child: Row(
                      children: [
                        Container(
                          width: 28,
                          height: 28,
                          decoration: BoxDecoration(
                            color: isCurrent
                                ? MCEColors.primaryPurple
                                : MCEColors.elevated,
                            borderRadius: BorderRadius.circular(6),
                          ),
                          child: Center(
                            child: Text(
                              '${_setlist.indexOf(s) + 1}',
                              style: TextStyle(
                                fontSize: 12,
                                fontWeight: FontWeight.w600,
                                color: isCurrent ? Colors.white : MCEColors.textSecondary,
                              ),
                            ),
                          ),
                        ),
                        const SizedBox(width: MCESpacing.md),
                        Expanded(
                          child: Column(
                            crossAxisAlignment: CrossAxisAlignment.start,
                            children: [
                              Text(
                                s.title,
                                style: TextStyle(
                                  fontSize: 13,
                                  fontWeight: FontWeight.w600,
                                  color: isCurrent
                                      ? MCEColors.textPrimary
                                      : MCEColors.textSecondary,
                                ),
                              ),
                              Text(
                                s.artist,
                                style: MCETypography.caption.copyWith(
                                  color: MCEColors.textTertiary,
                                ),
                              ),
                            ],
                          ),
                        ),
                        if (isCurrent)
                          Container(
                            padding: const EdgeInsets.symmetric(
                              horizontal: 8,
                              vertical: 3,
                            ),
                            decoration: BoxDecoration(
                              color: MCEColors.primaryPurple.withValues(alpha: 0.2),
                              borderRadius: BorderRadius.circular(4),
                            ),
                            child: const Text(
                              'NOW',
                              style: TextStyle(
                                fontSize: 9,
                                fontWeight: FontWeight.w700,
                                color: MCEColors.primaryPurple,
                                letterSpacing: 0.5,
                              ),
                            ),
                          ),
                      ],
                    ),
                  ),
                );
              }),
              const SizedBox(height: MCESpacing.xxl),
            ],
          ),
        ),

        // Bottom toolbar
        _buildPerformBottomToolbar(),
      ],
    );
  }

  Widget _buildPerformTopBar() {
    return Container(
      padding: const EdgeInsets.symmetric(
        horizontal: MCESpacing.lg,
        vertical: MCESpacing.md,
      ),
      decoration: const BoxDecoration(
        color: MCEColors.surface,
        border: Border(bottom: BorderSide(color: MCEColors.border)),
      ),
      child: SafeArea(
        bottom: false,
        child: Row(
          children: [
            GestureDetector(
              onTap: () => setState(() {
                _performingSong = null;
                _selectedMode = 'Browse';
              }),
              child: const Icon(Icons.arrow_back, color: MCEColors.textSecondary, size: 24),
            ),
            const SizedBox(width: MCESpacing.md),
            const Expanded(
              child: Text(
                'Worship Session',
                style: TextStyle(
                  fontSize: 16,
                  fontWeight: FontWeight.w600,
                  color: MCEColors.textPrimary,
                ),
              ),
            ),
            Container(
              padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 4),
              decoration: BoxDecoration(
                color: MCEColors.success.withValues(alpha: 0.15),
                borderRadius: BorderRadius.circular(6),
              ),
              child: const Text(
                'LIVE',
                style: TextStyle(
                  fontSize: 10,
                  fontWeight: FontWeight.w700,
                  color: MCEColors.success,
                  letterSpacing: 0.5,
                ),
              ),
            ),
          ],
        ),
      ),
    );
  }

  Widget _buildPerformBottomToolbar() {
    final song = _performingSong!;

    return Container(
      padding: const EdgeInsets.symmetric(
        horizontal: MCESpacing.lg,
        vertical: MCESpacing.md,
      ),
      decoration: const BoxDecoration(
        color: MCEColors.surface,
        border: Border(top: BorderSide(color: MCEColors.border)),
      ),
      child: SafeArea(
        top: false,
        child: Column(
          mainAxisSize: MainAxisSize.min,
          children: [
            // Navigation: prev / push / next
            Row(
              children: [
                // Previous slide
                Expanded(
                  child: GestureDetector(
                    onTap: _currentSlideIndex > 0
                        ? () => setState(() => _currentSlideIndex--)
                        : null,
                    child: Container(
                      padding: const EdgeInsets.symmetric(vertical: 12),
                      decoration: BoxDecoration(
                        color: _currentSlideIndex > 0
                            ? MCEColors.elevated
                            : MCEColors.surface,
                        borderRadius: BorderRadius.circular(MCERadius.md),
                        border: Border.all(
                          color: _currentSlideIndex > 0
                              ? MCEColors.border
                              : MCEColors.border.withValues(alpha: 0.3),
                        ),
                      ),
                      child: Row(
                        mainAxisAlignment: MainAxisAlignment.center,
                        children: [
                          Icon(
                            Icons.skip_previous,
                            size: 18,
                            color: _currentSlideIndex > 0
                                ? MCEColors.textPrimary
                                : MCEColors.textTertiary,
                          ),
                          const SizedBox(width: 4),
                          Text(
                            'Prev',
                            style: TextStyle(
                              fontSize: 13,
                              fontWeight: FontWeight.w600,
                              color: _currentSlideIndex > 0
                                  ? MCEColors.textPrimary
                                  : MCEColors.textTertiary,
                            ),
                          ),
                        ],
                      ),
                    ),
                  ),
                ),
                const SizedBox(width: MCESpacing.sm),
                // Push Live (wide)
                Expanded(
                  flex: 2,
                  child: ElevatedButton(
                    onPressed: () {},
                    style: ElevatedButton.styleFrom(
                      backgroundColor: MCEColors.primaryBlue,
                      foregroundColor: Colors.white,
                      padding: const EdgeInsets.symmetric(vertical: 12),
                      shape: RoundedRectangleBorder(
                        borderRadius: BorderRadius.circular(MCERadius.md),
                      ),
                      elevation: 0,
                    ),
                    child: const Row(
                      mainAxisAlignment: MainAxisAlignment.center,
                      children: [
                        Icon(Icons.broadcast_on_home, size: 18),
                        SizedBox(width: 6),
                        Text(
                          'Push Live',
                          style: TextStyle(
                            fontSize: 13,
                            fontWeight: FontWeight.w700,
                          ),
                        ),
                      ],
                    ),
                  ),
                ),
                const SizedBox(width: MCESpacing.sm),
                // Next slide
                Expanded(
                  child: GestureDetector(
                    onTap: _currentSlideIndex < song.slides.length - 1
                        ? () => setState(() => _currentSlideIndex++)
                        : null,
                    child: Container(
                      padding: const EdgeInsets.symmetric(vertical: 12),
                      decoration: BoxDecoration(
                        color: _currentSlideIndex < song.slides.length - 1
                            ? MCEColors.elevated
                            : MCEColors.surface,
                        borderRadius: BorderRadius.circular(MCERadius.md),
                        border: Border.all(
                          color: _currentSlideIndex < song.slides.length - 1
                              ? MCEColors.border
                              : MCEColors.border.withValues(alpha: 0.3),
                        ),
                      ),
                      child: Row(
                        mainAxisAlignment: MainAxisAlignment.center,
                        children: [
                          Text(
                            'Next',
                            style: TextStyle(
                              fontSize: 13,
                              fontWeight: FontWeight.w600,
                              color: _currentSlideIndex < song.slides.length - 1
                                  ? MCEColors.textPrimary
                                  : MCEColors.textTertiary,
                            ),
                          ),
                          const SizedBox(width: 4),
                          Icon(
                            Icons.skip_next,
                            size: 18,
                            color: _currentSlideIndex < song.slides.length - 1
                                ? MCEColors.textPrimary
                                : MCEColors.textTertiary,
                          ),
                        ],
                      ),
                    ),
                  ),
                ),
              ],
            ),
            const SizedBox(height: MCESpacing.sm),
            // Bottom row: mode toggle + stop
            Row(
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
                            horizontal: 10,
                            vertical: 5,
                          ),
                          decoration: BoxDecoration(
                            color: isActive
                                ? MCEColors.primaryBlue
                                : Colors.transparent,
                            borderRadius: BorderRadius.circular(4),
                          ),
                          child: Text(
                            mode,
                            style: TextStyle(
                              fontSize: 11,
                              fontWeight: FontWeight.w600,
                              color: isActive
                                  ? Colors.white
                                  : MCEColors.textSecondary,
                            ),
                          ),
                        ),
                      );
                    }).toList(),
                  ),
                ),
                const Spacer(),
                // Clear Output
                GestureDetector(
                  child: Container(
                    padding: const EdgeInsets.symmetric(
                      horizontal: 12,
                      vertical: 8,
                    ),
                    decoration: BoxDecoration(
                      color: MCEColors.danger.withValues(alpha: 0.15),
                      borderRadius: BorderRadius.circular(6),
                    ),
                    child: const Row(
                      mainAxisSize: MainAxisSize.min,
                      children: [
                        Icon(Icons.stop, size: 14, color: MCEColors.danger),
                        SizedBox(width: 4),
                        Text(
                          'Clear',
                          style: TextStyle(
                            fontSize: 11,
                            fontWeight: FontWeight.w600,
                            color: MCEColors.danger,
                          ),
                        ),
                      ],
                    ),
                  ),
                ),
              ],
            ),
          ],
        ),
      ),
    );
  }
}
