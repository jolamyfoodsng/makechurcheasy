import 'package:flutter/material.dart';
import '../theme/mce_theme.dart';

class MCEBadge extends StatelessWidget {
  final String label;
  final Color backgroundColor;
  final Color textColor;

  const MCEBadge({
    super.key,
    required this.label,
    this.backgroundColor = MCEColors.primaryBlue,
    this.textColor = Colors.white,
  });

  const MCEBadge.preview({super.key})
      : label = 'PREVIEW',
        backgroundColor = MCEColors.secondaryBlue,
        textColor = Colors.white;

  const MCEBadge.live({super.key})
      : label = 'LIVE',
        backgroundColor = MCEColors.success,
        textColor = Colors.white;

  @override
  Widget build(BuildContext context) {
    return Container(
      padding: const EdgeInsets.symmetric(
        horizontal: 6,
        vertical: 2,
      ),
      decoration: BoxDecoration(
        color: backgroundColor,
        borderRadius: BorderRadius.circular(MCERadius.sm),
      ),
      child: Text(
        label,
        style: TextStyle(
          fontSize: 9,
          fontWeight: FontWeight.w700,
          letterSpacing: 1,
          color: textColor,
        ),
      ),
    );
  }
}
