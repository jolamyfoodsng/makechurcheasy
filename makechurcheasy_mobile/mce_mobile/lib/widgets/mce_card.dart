import 'package:flutter/material.dart';
import '../theme/mce_theme.dart';

class MCECard extends StatelessWidget {
  final Widget child;
  final EdgeInsetsGeometry? padding;
  final bool highlighted;
  final VoidCallback? onTap;

  const MCECard({
    super.key,
    required this.child,
    this.padding,
    this.highlighted = false,
    this.onTap,
  });

  @override
  Widget build(BuildContext context) {
    return GestureDetector(
      onTap: onTap,
      child: Container(
        padding: padding ?? const EdgeInsets.all(MCESpacing.lg),
        decoration: BoxDecoration(
          color: MCEColors.surface.withValues(alpha: 0.6),
          borderRadius: BorderRadius.circular(MCERadius.lg),
          border: Border.all(
            color: highlighted ? MCEColors.primaryBlue : MCEColors.border,
            width: 1,
          ),
        ),
        child: child,
      ),
    );
  }
}
