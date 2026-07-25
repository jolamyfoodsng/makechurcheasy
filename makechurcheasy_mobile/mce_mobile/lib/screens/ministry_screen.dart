import 'package:flutter/material.dart';
import '../theme/mce_theme.dart';
import '../models/sample_data.dart';
import '../widgets/mce_button.dart';

class MinistryScreen extends StatefulWidget {
  const MinistryScreen({super.key});

  @override
  State<MinistryScreen> createState() => _MinistryScreenState();
}

class _MinistryScreenState extends State<MinistryScreen> {
  int _currentTab = 0;
  static const _tabs = ['Ticker', 'Lower Thirds', 'Congregation'];

  // Ticker state
  double _scrollSpeed = 3;
  bool _showTicker = false;

  // Congregation engagement state
  final int _connectedCount = 47;
  final int _reactionCount = 128;
  final int _prayerCount = 3;

  @override
  Widget build(BuildContext context) {
    return Column(
      children: [
        Expanded(
          child: ListView(
            padding: const EdgeInsets.all(MCESpacing.lg),
            children: [
              // Tabs
              _buildTabs(),
              const SizedBox(height: MCESpacing.lg),
              if (_currentTab == 0) _buildTickerTab(),
              if (_currentTab == 1) _buildLowerThirdsTab(),
              if (_currentTab == 2) _buildCongregationTab(),
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
        children: List.generate(_tabs.length, (i) {
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
                    fontSize: 12,
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

  Widget _buildTickerTab() {
    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        const Text('Ticker Items', style: MCETypography.sectionTitle),
        const SizedBox(height: MCESpacing.md),

        // Ticker dropdown
        Container(
          padding: const EdgeInsets.symmetric(horizontal: 12),
          height: 44,
          decoration: BoxDecoration(
            color: MCEColors.surface.withValues(alpha: 0.6),
            borderRadius: BorderRadius.circular(MCERadius.md),
            border: Border.all(color: MCEColors.border),
          ),
          child: const Row(
            mainAxisAlignment: MainAxisAlignment.spaceBetween,
            children: [
              Text('Select Ticker', style: TextStyle(
                fontSize: 14,
                color: MCEColors.textSecondary,
              )),
              Icon(Icons.unfold_more, color: MCEColors.textSecondary, size: 16),
            ],
          ),
        ),
        // Ticker preview
        if (_showTicker)
          Container(
            width: double.infinity,
            padding: const EdgeInsets.symmetric(
              horizontal: MCESpacing.lg,
              vertical: MCESpacing.sm,
            ),
            margin: const EdgeInsets.only(bottom: MCESpacing.lg, top: MCESpacing.lg),
            decoration: BoxDecoration(
              color: MCEColors.primaryBlue.withValues(alpha: 0.15),
              borderRadius: BorderRadius.circular(MCERadius.sm),
              border: Border.all(
                color: MCEColors.primaryBlue.withValues(alpha: 0.3),
              ),
            ),
            child: const Text(
              'Welcome to Grace Community Church!',
              style: TextStyle(
                fontSize: 13,
                fontWeight: FontWeight.w600,
                color: MCEColors.primaryBlue,
              ),
              textAlign: TextAlign.center,
            ),
          ),
        const SizedBox(height: MCESpacing.lg),

        // Speed slider
        Row(
          mainAxisAlignment: MainAxisAlignment.spaceBetween,
          children: [
            const Text('Scroll Speed', style: MCETypography.bodyBold),
            Text(_scrollSpeed.toInt().toString(), style: MCETypography.caption),
          ],
        ),
        SliderTheme(
          data: SliderThemeData(
            activeTrackColor: MCEColors.primaryBlue,
            inactiveTrackColor: MCEColors.elevated,
            thumbColor: MCEColors.primaryBlue,
            overlayColor: MCEColors.primaryBlue.withValues(alpha: 0.1),
            trackHeight: 4,
            thumbShape: const RoundSliderThumbShape(enabledThumbRadius: 8),
          ),
          child: Slider(
            value: _scrollSpeed,
            min: 1,
            max: 5,
            divisions: 4,
            onChanged: (v) => setState(() => _scrollSpeed = v),
          ),
        ),
        const SizedBox(height: MCESpacing.lg),

        // Checkbox items
        ...sampleTickerItems.map((item) {
          return Container(
            padding: const EdgeInsets.symmetric(
              horizontal: MCESpacing.md,
              vertical: MCESpacing.sm,
            ),
            margin: const EdgeInsets.only(bottom: MCESpacing.sm),
            decoration: BoxDecoration(
              color: MCEColors.surface.withValues(alpha: 0.6),
              borderRadius: BorderRadius.circular(MCERadius.md),
              border: Border.all(color: MCEColors.border),
            ),
            child: Row(
              children: [
                SizedBox(
                  width: 24,
                  height: 24,
                  child: Checkbox(
                    value: item.selected,
                    onChanged: (v) {
                      setState(() => item.selected = v ?? false);
                    },
                    activeColor: MCEColors.primaryBlue,
                    checkColor: Colors.white,
                    side: const BorderSide(color: MCEColors.border),
                    shape: RoundedRectangleBorder(
                      borderRadius: BorderRadius.circular(4),
                    ),
                  ),
                ),
                const SizedBox(width: MCESpacing.md),
                Expanded(
                  child: Text(
                    item.text,
                    style: MCETypography.body.copyWith(fontSize: 13),
                  ),
                ),
              ],
            ),
          );
        }),
        const SizedBox(height: MCESpacing.lg),

        // Show / Clear buttons
        Row(
          children: [
            Expanded(
              child: MCEButton.success(
                label: 'Show Ticker',
                icon: Icons.visibility,
                onPressed: () => setState(() => _showTicker = true),
              ),
            ),
            const SizedBox(width: MCESpacing.md),
            Expanded(
              child: MCEButton.danger(
                label: 'Clear Ticker',
                icon: Icons.clear,
                onPressed: () => setState(() => _showTicker = false),
              ),
            ),
          ],
        ),
      ],
    );
  }

  Widget _buildLowerThirdsTab() {
    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        const Text('Lower Thirds', style: MCETypography.sectionTitle),
        const SizedBox(height: MCESpacing.md),

        ...sampleLowerThirdSlots.map((slot) {
          return Container(
            padding: const EdgeInsets.all(MCESpacing.md),
            margin: const EdgeInsets.only(bottom: MCESpacing.sm),
            decoration: BoxDecoration(
              color: MCEColors.surface.withValues(alpha: 0.6),
              borderRadius: BorderRadius.circular(MCERadius.md),
              border: Border.all(
                color: slot.active
                    ? MCEColors.primaryBlue.withValues(alpha: 0.3)
                    : MCEColors.border,
              ),
            ),
            child: Row(
              children: [
                Container(
                  width: 48,
                  height: 48,
                  decoration: BoxDecoration(
                    color: slot.active
                        ? MCEColors.primaryBlue.withValues(alpha: 0.2)
                        : MCEColors.elevated,
                    borderRadius: BorderRadius.circular(MCERadius.md),
                  ),
                  child: Icon(
                    Icons.person,
                    color: slot.active ? MCEColors.primaryBlue : MCEColors.textSecondary,
                    size: 24,
                  ),
                ),
                const SizedBox(width: MCESpacing.md),
                Expanded(
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      Text(slot.title, style: MCETypography.bodyBold),
                      if (slot.subtitle.isNotEmpty)
                        Text(slot.subtitle, style: MCETypography.caption),
                    ],
                  ),
                ),
                MCEButton.primary(
                  label: slot.active ? 'Active' : 'Push',
                  icon: slot.active ? Icons.check : Icons.broadcast_on_home,
                ),
              ],
            ),
          );
        }),
        const SizedBox(height: MCESpacing.lg),

        // Quick actions
        Row(
          children: [
            Expanded(
              child: MCEButton(
                label: 'Clear All',
                icon: Icons.clear_all,
              ),
            ),
            const SizedBox(width: MCESpacing.md),
            Expanded(
              child: MCEButton.primary(
                label: 'Edit Templates',
                icon: Icons.edit,
              ),
            ),
          ],
        ),
      ],
    );
  }

  Widget _buildCongregationTab() {
    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        const Text('Congregation Engagement', style: MCETypography.sectionTitle),
        const SizedBox(height: MCESpacing.md),

        // QR Code card
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
              // QR code placeholder
              Container(
                width: 180,
                height: 180,
                decoration: BoxDecoration(
                  color: Colors.white,
                  borderRadius: BorderRadius.circular(MCERadius.md),
                ),
                child: const Center(
                  child: Column(
                    mainAxisAlignment: MainAxisAlignment.center,
                    children: [
                      Icon(Icons.qr_code_2, size: 80, color: Color(0xFF1A1A1A)),
                      SizedBox(height: 4),
                      Text(
                        'Scan to Join',
                        style: TextStyle(
                          fontSize: 12,
                          fontWeight: FontWeight.w600,
                          color: Color(0xFF666666),
                        ),
                      ),
                    ],
                  ),
                ),
              ),
              const SizedBox(height: MCESpacing.lg),
              const Text(
                'church.makechurcheasy.com/join',
                style: TextStyle(
                  fontSize: 13,
                  fontWeight: FontWeight.w600,
                  color: MCEColors.textSecondary,
                ),
                textAlign: TextAlign.center,
              ),
              const SizedBox(height: MCESpacing.sm),
              Row(
                mainAxisAlignment: MainAxisAlignment.center,
                children: [
                  MCEButton(
                    label: 'Copy Link',
                    icon: Icons.copy,
                  ),
                  const SizedBox(width: MCESpacing.md),
                  MCEButton.primary(
                    label: 'Share',
                    icon: Icons.share,
                  ),
                ],
              ),
            ],
          ),
        ),
        const SizedBox(height: MCESpacing.lg),

        // Live engagement stats
        const Text('Live Stats', style: MCETypography.sectionTitle),
        const SizedBox(height: MCESpacing.md),

        Row(
          children: [
            Expanded(
              child: _EngagementStatCard(
                icon: Icons.people,
                value: '$_connectedCount',
                label: 'Connected',
                color: MCEColors.success,
              ),
            ),
            const SizedBox(width: MCESpacing.md),
            Expanded(
              child: _EngagementStatCard(
                icon: Icons.favorite,
                value: '$_reactionCount',
                label: 'Reactions',
                color: MCEColors.danger,
              ),
            ),
          ],
        ),
        const SizedBox(height: MCESpacing.md),
        Row(
          children: [
            Expanded(
              child: _EngagementStatCard(
                icon: Icons.question_answer,
                value: '$_prayerCount',
                label: 'Prayer Requests',
                color: MCEColors.primaryPurple,
              ),
            ),
            const SizedBox(width: MCESpacing.md),
            Expanded(
              child: _EngagementStatCard(
                icon: Icons.poll,
                value: '23',
                label: 'Poll Responses',
                color: MCEColors.primaryBlue,
              ),
            ),
          ],
        ),
        const SizedBox(height: MCESpacing.lg),

        // Quick engagement actions
        Row(
          children: [
            Expanded(
              child: _EngagementAction(
                icon: Icons.question_answer,
                label: 'Send Poll',
                color: MCEColors.primaryBlue,
              ),
            ),
            const SizedBox(width: MCESpacing.md),
            Expanded(
              child: _EngagementAction(
                icon: Icons.front_hand,
                label: 'Prayer Wall',
                color: MCEColors.primaryPurple,
              ),
            ),
          ],
        ),
        const SizedBox(height: MCESpacing.md),
        Row(
          children: [
            Expanded(
              child: _EngagementAction(
                icon: Icons.chat_bubble_outline,
                label: 'Live Chat',
                color: MCEColors.success,
              ),
            ),
            const SizedBox(width: MCESpacing.md),
            Expanded(
              child: _EngagementAction(
                icon: Icons.info_outline,
                label: 'Welcome Message',
                color: MCEColors.accentOrange,
              ),
            ),
          ],
        ),
      ],
    );
  }
}

class _EngagementStatCard extends StatelessWidget {
  final IconData icon;
  final String value;
  final String label;
  final Color color;

  const _EngagementStatCard({
    required this.icon,
    required this.value,
    required this.label,
    required this.color,
  });

  @override
  Widget build(BuildContext context) {
    return Container(
      padding: const EdgeInsets.all(MCESpacing.md),
      decoration: BoxDecoration(
        color: MCEColors.surface.withValues(alpha: 0.6),
        borderRadius: BorderRadius.circular(MCERadius.lg),
        border: Border.all(color: MCEColors.border),
      ),
      child: Column(
        children: [
          Icon(icon, color: color, size: 24),
          const SizedBox(height: MCESpacing.sm),
          Text(
            value,
            style: TextStyle(
              fontSize: 24,
              fontWeight: FontWeight.w700,
              color: color,
            ),
          ),
          const SizedBox(height: 2),
          Text(
            label,
            style: MCETypography.caption,
            textAlign: TextAlign.center,
          ),
        ],
      ),
    );
  }
}

class _EngagementAction extends StatelessWidget {
  final IconData icon;
  final String label;
  final Color color;

  const _EngagementAction({
    required this.icon,
    required this.label,
    required this.color,
  });

  @override
  Widget build(BuildContext context) {
    return Container(
      padding: const EdgeInsets.symmetric(vertical: MCESpacing.md),
      decoration: BoxDecoration(
        color: MCEColors.surface.withValues(alpha: 0.6),
        borderRadius: BorderRadius.circular(MCERadius.lg),
        border: Border.all(color: MCEColors.border),
      ),
      child: Row(
        mainAxisAlignment: MainAxisAlignment.center,
        children: [
          Icon(icon, color: color, size: 18),
          const SizedBox(width: MCESpacing.sm),
          Text(
            label,
            style: MCETypography.bodyBold.copyWith(fontSize: 13),
          ),
        ],
      ),
    );
  }
}
