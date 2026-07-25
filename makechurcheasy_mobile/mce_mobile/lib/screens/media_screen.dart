import 'package:flutter/material.dart';
import '../theme/mce_theme.dart';
import '../models/sample_data.dart';

class MediaScreen extends StatefulWidget {
  const MediaScreen({super.key});

  @override
  State<MediaScreen> createState() => _MediaScreenState();
}

class _MediaScreenState extends State<MediaScreen> {
  String _searchQuery = '';
  String _selectedFilter = 'All';
  String? _nowPlaying;

  static const _filters = ['All', 'Images', 'Videos', 'Animations'];

  List<MediaItem> get _filteredItems {
    return sampleMediaItems.where((item) {
      final matchesSearch = _searchQuery.isEmpty ||
          item.name.toLowerCase().contains(_searchQuery.toLowerCase());
      final matchesFilter = _selectedFilter == 'All' ||
          (_selectedFilter == 'Images' && item.type == 'image') ||
          (_selectedFilter == 'Videos' && item.type == 'video') ||
          (_selectedFilter == 'Animations' && item.type == 'animation');
      return matchesSearch && matchesFilter;
    }).toList();
  }

  @override
  Widget build(BuildContext context) {
    return Column(
      children: [
        Expanded(
          child: ListView(
            padding: const EdgeInsets.all(MCESpacing.lg),
            children: [
              const Text('Media Library', style: MCETypography.sectionTitle),
              const SizedBox(height: MCESpacing.sm),
              Text(
                'Control media on your live output',
                style: MCETypography.caption.copyWith(
                  color: MCEColors.textTertiary,
                ),
              ),
              const SizedBox(height: MCESpacing.lg),

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
                          hintText: 'Search media...',
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
              const SizedBox(height: MCESpacing.md),

              // Filter chips
              SizedBox(
                height: 36,
                child: ListView.separated(
                  scrollDirection: Axis.horizontal,
                  itemCount: _filters.length,
                  separatorBuilder: (_, _) => const SizedBox(width: 8),
                  itemBuilder: (context, i) {
                    final isActive = _selectedFilter == _filters[i];
                    return GestureDetector(
                      onTap: () => setState(() => _selectedFilter = _filters[i]),
                      child: Container(
                        padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 8),
                        decoration: BoxDecoration(
                          color: isActive ? MCEColors.primaryBlue : MCEColors.elevated,
                          borderRadius: BorderRadius.circular(18),
                          border: Border.all(
                            color: isActive ? MCEColors.primaryBlue : MCEColors.border,
                          ),
                        ),
                        child: Text(
                          _filters[i],
                          style: TextStyle(
                            fontSize: 13,
                            fontWeight: FontWeight.w600,
                            color: isActive ? Colors.white : MCEColors.textSecondary,
                          ),
                        ),
                      ),
                    );
                  },
                ),
              ),
              const SizedBox(height: MCESpacing.lg),

              // Now Playing banner
              if (_nowPlaying != null)
                Container(
                  width: double.infinity,
                  padding: const EdgeInsets.all(MCESpacing.md),
                  margin: const EdgeInsets.only(bottom: MCESpacing.lg),
                  decoration: BoxDecoration(
                    color: MCEColors.success.withValues(alpha: 0.1),
                    borderRadius: BorderRadius.circular(MCERadius.lg),
                    border: Border.all(
                      color: MCEColors.success.withValues(alpha: 0.3),
                    ),
                  ),
                  child: Row(
                    children: [
                      Container(
                        width: 8,
                        height: 8,
                        decoration: const BoxDecoration(
                          color: MCEColors.success,
                          shape: BoxShape.circle,
                        ),
                      ),
                      const SizedBox(width: MCESpacing.sm),
                      Text(
                        'Now Playing: $_nowPlaying',
                        style: MCETypography.bodyBold.copyWith(
                          color: MCEColors.success,
                        ),
                      ),
                      const Spacer(),
                      GestureDetector(
                        onTap: () => setState(() => _nowPlaying = null),
                        child: const Icon(
                          Icons.close,
                          color: MCEColors.success,
                          size: 18,
                        ),
                      ),
                    ],
                  ),
                ),

              // Media list
              ..._filteredItems.map((item) => _mediaCard(item)),
              const SizedBox(height: MCESpacing.xxl),

              // Desktop-only note
              Container(
                width: double.infinity,
                padding: const EdgeInsets.all(MCESpacing.xl),
                decoration: BoxDecoration(
                  color: MCEColors.surface.withValues(alpha: 0.4),
                  borderRadius: BorderRadius.circular(MCERadius.lg),
                  border: Border.all(
                    color: MCEColors.border.withValues(alpha: 0.5),
                  ),
                ),
                child: Column(
                  children: [
                    Icon(
                      Icons.desktop_mac_outlined,
                      size: 36,
                      color: MCEColors.textTertiary,
                    ),
                    const SizedBox(height: MCESpacing.sm),
                    Text(
                      'Upload & manage media from the desktop app',
                      style: MCETypography.caption.copyWith(
                        color: MCEColors.textTertiary,
                      ),
                      textAlign: TextAlign.center,
                    ),
                  ],
                ),
              ),
            ],
          ),
        ),
      ],
    );
  }

  Widget _mediaCard(MediaItem item) {
    final typeColor = switch (item.type) {
      'image' => MCEColors.secondaryBlue,
      'video' => MCEColors.danger,
      'animation' => MCEColors.primaryPurple,
      _ => MCEColors.textSecondary,
    };

    final typeIcon = switch (item.type) {
      'image' => Icons.image_outlined,
      'video' => Icons.videocam_outlined,
      'animation' => Icons.animation,
      _ => Icons.file_present,
    };

    final isPlaying = _nowPlaying == item.name;

    return Container(
      margin: const EdgeInsets.only(bottom: MCESpacing.md),
      decoration: BoxDecoration(
        color: MCEColors.surface.withValues(alpha: 0.6),
        borderRadius: BorderRadius.circular(MCERadius.lg),
        border: Border.all(
          color: isPlaying
              ? MCEColors.success.withValues(alpha: 0.3)
              : MCEColors.border,
        ),
      ),
      child: Column(
        children: [
          // Thumbnail
          Container(
            width: double.infinity,
            height: 120,
            decoration: const BoxDecoration(
              color: Color(0xFF1A1A1A),
              borderRadius: BorderRadius.only(
                topLeft: Radius.circular(MCERadius.lg),
                topRight: Radius.circular(MCERadius.lg),
              ),
            ),
            child: Stack(
              children: [
                Center(
                  child: Icon(typeIcon, size: 40, color: typeColor.withValues(alpha: 0.3)),
                ),
                // Type badge
                Positioned(
                  top: 8,
                  left: 8,
                  child: Container(
                    padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 3),
                    decoration: BoxDecoration(
                      color: typeColor.withValues(alpha: 0.2),
                      borderRadius: BorderRadius.circular(4),
                    ),
                    child: Text(
                      item.type.toUpperCase(),
                      style: MCETypography.tiny.copyWith(
                        color: typeColor,
                        fontWeight: FontWeight.w700,
                      ),
                    ),
                  ),
                ),
                // Playing indicator
                if (isPlaying)
                  Positioned(
                    top: 8,
                    right: 8,
                    child: Container(
                      padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 3),
                      decoration: BoxDecoration(
                        color: MCEColors.success,
                        borderRadius: BorderRadius.circular(4),
                      ),
                      child: const Row(
                        mainAxisSize: MainAxisSize.min,
                        children: [
                          Icon(Icons.play_arrow, color: Colors.white, size: 12),
                          SizedBox(width: 2),
                          Text(
                            'LIVE',
                            style: TextStyle(
                              fontSize: 10,
                              fontWeight: FontWeight.w700,
                              color: Colors.white,
                            ),
                          ),
                        ],
                      ),
                    ),
                  ),
              ],
            ),
          ),
          // Info + controls
          Padding(
            padding: const EdgeInsets.all(MCESpacing.md),
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text(item.name, style: MCETypography.bodyBold),
                const SizedBox(height: MCESpacing.sm),
                // Control buttons
                Row(
                  children: [
                    _ControlButton(
                      icon: Icons.visibility,
                      label: 'Show',
                      color: MCEColors.secondaryBlue,
                      onTap: () {},
                    ),
                    const SizedBox(width: MCESpacing.sm),
                    _ControlButton(
                      icon: Icons.broadcast_on_home,
                      label: 'Push',
                      color: MCEColors.success,
                      onTap: () => setState(() => _nowPlaying = item.name),
                    ),
                    const SizedBox(width: MCESpacing.sm),
                    _ControlButton(
                      icon: Icons.repeat,
                      label: 'Loop',
                      color: MCEColors.primaryPurple,
                      onTap: () {},
                    ),
                    const SizedBox(width: MCESpacing.sm),
                    _ControlButton(
                      icon: Icons.delete_outline,
                      label: 'Delete',
                      color: MCEColors.danger,
                      onTap: () {},
                    ),
                  ],
                ),
              ],
            ),
          ),
        ],
      ),
    );
  }
}

class _ControlButton extends StatelessWidget {
  final IconData icon;
  final String label;
  final Color color;
  final VoidCallback? onTap;

  const _ControlButton({
    required this.icon,
    required this.label,
    required this.color,
    this.onTap,
  });

  @override
  Widget build(BuildContext context) {
    return GestureDetector(
      onTap: onTap,
      child: Container(
        padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 6),
        decoration: BoxDecoration(
          color: color.withValues(alpha: 0.1),
          borderRadius: BorderRadius.circular(6),
          border: Border.all(
            color: color.withValues(alpha: 0.3),
          ),
        ),
        child: Row(
          mainAxisSize: MainAxisSize.min,
          children: [
            Icon(icon, color: color, size: 14),
            const SizedBox(width: 4),
            Text(
              label,
              style: TextStyle(
                fontSize: 11,
                fontWeight: FontWeight.w600,
                color: color,
              ),
            ),
          ],
        ),
      ),
    );
  }
}
