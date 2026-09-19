import 'package:flutter/material.dart';
import '../theme/mce_theme.dart';
import '../widgets/mce_button.dart';

class DockPlaceholderScreen extends StatelessWidget {
  final IconData icon;
  final String title;
  final String subtitle;
  final VoidCallback? onRefresh;

  const DockPlaceholderScreen({
    super.key,
    required this.icon,
    required this.title,
    required this.subtitle,
    this.onRefresh,
  });

  @override
  Widget build(BuildContext context) {
    return ListView(
      padding: const EdgeInsets.all(MCESpacing.lg),
      children: [
        Text(title, style: MCETypography.sectionTitle),
        SizedBox(height: MCESpacing.sm),
        Text(subtitle, style: MCETypography.sectionSubtitle),
        SizedBox(height: MCESpacing.xl),
        Container(
          width: double.infinity,
          padding: const EdgeInsets.all(MCESpacing.xxl),
          decoration: BoxDecoration(
            color: MCEColors.surface.withValues(alpha: 0.6),
            borderRadius: BorderRadius.circular(MCERadius.lg),
            border: Border.all(color: MCEColors.border),
          ),
          child: Column(
            children: [
              Container(
                width: 72,
                height: 72,
                decoration: BoxDecoration(
                  color: MCEColors.primaryBg,
                  borderRadius: BorderRadius.circular(MCERadius.lg),
                ),
                child: Icon(icon, color: MCEColors.primaryBlue, size: 34),
              ),
              SizedBox(height: MCESpacing.xl),
              Text(
                title,
                style: MCETypography.cardTitle,
                textAlign: TextAlign.center,
              ),
              SizedBox(height: MCESpacing.sm),
              Text(
                subtitle,
                style: MCETypography.caption.copyWith(
                  color: MCEColors.textSecondary,
                  height: 1.45,
                ),
                textAlign: TextAlign.center,
              ),
              if (onRefresh != null) ...[
                SizedBox(height: MCESpacing.xl),
                MCEButton(
                  label: 'Refresh From Desktop',
                  icon: Icons.refresh,
                  onPressed: onRefresh,
                ),
              ],
            ],
          ),
        ),
      ],
    );
  }
}
