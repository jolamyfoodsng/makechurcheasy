import 'package:flutter/material.dart';
import '../theme/mce_theme.dart';

enum MCEButtonVariant { primary, outline, success, danger, icon }

class MCEButton extends StatelessWidget {
  final String? label;
  final IconData? icon;
  final MCEButtonVariant variant;
  final VoidCallback? onPressed;
  final bool active;
  final double? height;

  const MCEButton({
    super.key,
    this.label,
    this.icon,
    this.variant = MCEButtonVariant.primary,
    this.onPressed,
    this.active = false,
    this.height,
  });

  const MCEButton.primary({
    super.key,
    required String this.label,
    this.icon,
    this.onPressed,
    this.height,
  }) : variant = MCEButtonVariant.primary, active = false;

  const MCEButton.outline({
    super.key,
    required String this.label,
    this.icon,
    this.onPressed,
    this.height,
  }) : variant = MCEButtonVariant.outline, active = false;

  const MCEButton.success({
    super.key,
    required String this.label,
    this.icon,
    this.onPressed,
    this.height,
  }) : variant = MCEButtonVariant.success, active = false;

  const MCEButton.danger({
    super.key,
    required String this.label,
    this.icon,
    this.onPressed,
    this.height,
  }) : variant = MCEButtonVariant.danger, active = false;

  const MCEButton.icon({
    super.key,
    required IconData this.icon,
    this.onPressed,
    this.height,
  })  : label = null,
        variant = MCEButtonVariant.icon,
        active = false;

  @override
  Widget build(BuildContext context) {
    return GestureDetector(
      onTap: onPressed,
      child: Container(
        height: height ?? 44,
        padding: variant == MCEButtonVariant.icon
            ? const EdgeInsets.all(MCESpacing.sm)
            : const EdgeInsets.symmetric(
                horizontal: MCESpacing.lg, vertical: MCESpacing.sm),
        decoration: BoxDecoration(
          color: _bgColor,
          borderRadius: BorderRadius.circular(
              variant == MCEButtonVariant.icon ? 24 : MCERadius.md),
          border: _border,
        ),
        child: Row(
          mainAxisSize: MainAxisSize.min,
          mainAxisAlignment: MainAxisAlignment.center,
          children: [
            if (icon != null) ...[
              Icon(icon, size: 16, color: _fgColor),
              if (label != null) const SizedBox(width: MCESpacing.sm),
            ],
            if (label != null)
              Text(
                label!,
                style: TextStyle(
                  fontSize: 14,
                  fontWeight: FontWeight.w600,
                  color: _fgColor,
                ),
              ),
          ],
        ),
      ),
    );
  }

  Color get _bgColor {
    if (active) return MCEColors.primaryBlue;
    return switch (variant) {
      MCEButtonVariant.primary => MCEColors.primaryBlue,
      MCEButtonVariant.outline => Colors.transparent,
      MCEButtonVariant.success => MCEColors.successBg,
      MCEButtonVariant.danger => MCEColors.dangerBg,
      MCEButtonVariant.icon => MCEColors.elevated,
    };
  }

  Color get _fgColor {
    if (active) return Colors.white;
    return switch (variant) {
      MCEButtonVariant.primary => Colors.white,
      MCEButtonVariant.outline => MCEColors.textSecondary,
      MCEButtonVariant.success => MCEColors.success,
      MCEButtonVariant.danger => MCEColors.danger,
      MCEButtonVariant.icon => MCEColors.textSecondary,
    };
  }

  Border? get _border {
    if (active) return null;
    return switch (variant) {
      MCEButtonVariant.outline =>
        Border.all(color: MCEColors.border),
      MCEButtonVariant.success =>
        Border.all(color: MCEColors.success.withValues(alpha: 0.3)),
      MCEButtonVariant.danger =>
        Border.all(color: MCEColors.danger.withValues(alpha: 0.3)),
      _ => null,
    };
  }
}
